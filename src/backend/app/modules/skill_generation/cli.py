"""Run from src/backend: python -m app.modules.skill_generation.cli --help."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from .ingestion_models import (
    IngestionError,
    ParseOptions,
    SourceMetadata,
    json_bytes,
    stable_id,
)
from .parser import extract_pdf, reconstruct_document
from .payload_builder import build_generation_inputs


def export_artifacts(
    raw, document, requests: list[dict], manifest: dict, output: Path | str
) -> None:
    """Write a new artifact directory atomically; refuse stale or overlapping outputs."""
    output = Path(output).resolve()
    if output.exists():
        raise IngestionError(
            "Output directory already exists; choose a new directory to avoid stale artifacts"
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".pdf-ingestion-", dir=output.parent))
    try:
        permitted = document.source.rights_status == "permitted"
        metadata = {
            "source": asdict(document.source),
            "checksum": document.checksum,
            "parser_version": document.parser_version,
            "tools": document.tools,
            "settings": document.settings,
            "diagnostics": document.diagnostics,
            "corrections_checksum": document.corrections_checksum,
            "text_exported": permitted,
        }
        if permitted:
            metadata["pages"] = raw.pages
            metadata["raw_blocks"] = [asdict(b) for b in raw.blocks]
            blocks = [asdict(b) for b in document.blocks]
            sections = [asdict(s) for s in document.sections]
        else:
            if requests:
                raise IngestionError("Text export requires permitted source rights")
            metadata["pages"] = [
                {k: page[k] for k in ("page", "width", "height", "method", "warnings")}
                for page in raw.pages
            ]
            blocks = [
                {
                    "block_id": b.block_id,
                    "order": b.order,
                    "layout_type": b.layout_type,
                    "semantic_role": b.semantic_role,
                    "section_id": b.section_id,
                    "parent_id": b.parent_id,
                    "warnings": b.warnings,
                    "fragments": [
                        {"page": f.page, "bbox": f.bbox, "method": f.method}
                        for f in b.fragments
                    ],
                }
                for b in document.blocks
            ]
            sections = [
                {
                    "section_id": s.section_id,
                    "kind": s.kind,
                    "warnings": s.warnings,
                    "source_code": s.source_code,
                    "parent_id": s.parent_id,
                    "block_count": len(s.block_ids),
                    "topic_count": len(s.topic_ids),
                    "outcome_count": len(s.outcome_ids),
                }
                for s in document.sections
            ]
        (staging / "document.json").write_bytes(json_bytes(metadata))
        with (staging / "blocks.jsonl").open("wb") as stream:
            for block in blocks:
                stream.write(json_bytes(block) + b"\n")
        (staging / "sections.json").write_bytes(json_bytes(sections))
        request_dir = staging / "requests"
        request_dir.mkdir()
        for request in requests:
            name = request["user_data"]["chunk_id"] + ".json"
            (request_dir / name).write_bytes(json_bytes(request))
        (staging / "manifest.json").write_bytes(json_bytes(manifest))
        os.rename(staging, output)
    finally:
        # Only our known temporary directory is removed; never remove the user's output.
        if staging.exists():
            if staging.resolve().parent != output.parent or not staging.name.startswith(
                ".pdf-ingestion-"
            ):
                raise IngestionError(
                    "Refusing cleanup outside the artifact staging directory"
                )
            shutil.rmtree(staging)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract CS2023 PDF structure and prepare offline LLM inputs"
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--source-id",
        help="Source UUID; defaults to a stable UUID derived from PDF contents",
    )
    parser.add_argument(
        "--uri",
        help="Recorded source URI (never fetched); defaults to urn:sha256:<checksum>",
    )
    parser.add_argument(
        "--edition", help="Source edition; omitted editions are recorded as null"
    )
    parser.add_argument(
        "--rights-status",
        choices=["pending", "permitted", "restricted"],
        default="pending",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="New output directory; defaults to a fresh directory under ./outputs/",
    )
    parser.add_argument(
        "--section",
        action="append",
        dest="sections",
        help="Knowledge-unit code; repeat to select units",
    )
    parser.add_argument("--corrections", type=Path)
    parser.add_argument(
        "--existing-skills",
        type=Path,
        help="JSON array of supplied approved skill summaries",
    )
    parser.add_argument("--max-payload-bytes", type=int, default=24_000)
    defaults = ParseOptions()
    for name in (
        "max_file_bytes",
        "max_pages",
        "max_image_pixels",
        "ocr_timeout",
        "min_native_characters",
    ):
        parser.add_argument(
            "--" + name.replace("_", "-"), type=int, default=getattr(defaults, name)
        )
    parser.add_argument("--ocr-language", default=defaults.ocr_language)
    parser.add_argument("--tesseract", default=defaults.tesseract)
    parser.add_argument(
        "--ocr-min-confidence", type=float, default=defaults.ocr_min_confidence
    )
    parser.add_argument(
        "--max-bad-character-ratio",
        type=float,
        default=defaults.max_bad_character_ratio,
    )
    args = parser.parse_args(argv)
    try:
        options = ParseOptions(**{key: getattr(args, key) for key in asdict(defaults)})
        if args.output is not None and args.output.exists():
            raise IngestionError(
                "Output directory already exists; choose a new directory"
            )
        if args.pdf.stat().st_size > options.max_file_bytes:
            raise IngestionError("PDF exceeds max_file_bytes")
        digest = hashlib.sha256()
        with args.pdf.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        checksum = digest.hexdigest()
        source = SourceMetadata(
            args.source_id
            if args.source_id is not None
            else stable_id("curriculum-source", checksum),
            args.uri if args.uri is not None else f"urn:sha256:{checksum}",
            args.edition,
            args.rights_status,
        )
        if args.output is None:
            args.output = (
                Path("outputs") / f"{args.pdf.stem}-{checksum[:12]}-{uuid4().hex[:8]}"
            )
        corrections = (
            json.loads(args.corrections.read_text(encoding="utf-8"))
            if args.corrections
            else None
        )
        existing = (
            json.loads(args.existing_skills.read_text(encoding="utf-8"))
            if args.existing_skills
            else []
        )
        raw = extract_pdf(args.pdf, source, options)
        document = reconstruct_document(raw, corrections)
        requests, manifest = build_generation_inputs(
            document,
            section_codes=args.sections,
            existing_skills=existing,
            max_bytes=args.max_payload_bytes,
        )
        export_artifacts(raw, document, requests, manifest, args.output)
        print(
            json.dumps(
                {
                    "output": str(args.output.resolve()),
                    "status": manifest["status"],
                    "pages": len(document.pages),
                    "units": sum(s.kind == "knowledge_unit" for s in document.sections),
                    "requests": len(requests),
                    "review_required_sections": sum(
                        s["status"] == "review_required" for s in manifest["sections"]
                    ),
                }
            )
        )
        return 2 if manifest["status"] == "review_required" else 0
    except (IngestionError, OSError, ValueError, TypeError) as exc:
        print(f"Ingestion failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
