"""Validate exported artifacts by rebuilding their deterministic request envelopes."""
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import ValidationError
from app.modules.skill_generation.ingestion_models import (
    PARSER_VERSION,
    CurriculumSection,
    Fragment,
    ParsedDocument,
    SourceMetadata,
    StructuralBlock,
    content_digest,
)
from app.modules.skill_generation.payload_builder import build_generation_inputs


@dataclass
class PreparedImport:
    source: dict
    artifact_digest: str
    requests: dict[str, list[dict]]
    blocked: dict[str, list[str]]
    spans: dict[str, dict]


def _read(path: Path):
    if path.is_symlink() or path.stat().st_size > 256_000_000:
        raise ValidationError("Artifact is a symlink or exceeds the size limit")
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda _: _bad_json())


def _bad_json():
    raise ValidationError("Non-finite artifact JSON")


def load_artifacts(path: Path, selected: list[str] | None = None) -> PreparedImport:
    """Read-only consistency validation. Does not establish source copyright permission."""
    path = path.resolve()
    try:
        metadata = _read(path / "document.json")
        manifest = _read(path / "manifest.json")
        sections_data = _read(path / "sections.json")
        source = metadata["source"]
        SourceMetadata(**source)
        if (metadata["parser_version"] != PARSER_VERSION
                or manifest["parser_version"] != PARSER_VERSION
                or manifest["source_checksum"] != metadata["checksum"]
                or manifest["rights_status"] != source["rights_status"]
                or manifest["corrections_checksum"] != metadata["corrections_checksum"]):
            raise ValidationError("Artifact versions or source identity disagree")
        digest = metadata["checksum"]
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValidationError("Invalid source checksum")
        source = {**source, "checksum": digest}
        reports = {s["source_code"]: s for s in manifest["sections"]}
        if len(reports) != len(manifest["sections"]):
            raise ValidationError("Duplicate section codes")
        selection = sorted(set(selected or [k for k, v in reports.items() if v["status"] != "excluded"]))
        if not selection or set(selection) - reports.keys():
            raise ValidationError("Select at least one known knowledge unit")
        blocked = {k: reports[k]["reasons"] or ["unit_not_ready"]
                   for k in selection if reports[k]["status"] != "ready"}
        files = [path / name for name in ("document.json", "manifest.json", "sections.json", "blocks.jsonl")]
        chunk_files = sorted((path / "requests").glob("*.json"))
        files += chunk_files
        file_digests = {}
        for file in files:
            if file.is_symlink() or file.stat().st_size > 256_000_000:
                raise ValidationError("Unsafe or oversized artifact")
            file_digests[str(file.relative_to(path))] = hashlib.sha256(file.read_bytes()).hexdigest()
        if source["rights_status"] != "permitted":
            if chunk_files or metadata["text_exported"]:
                raise ValidationError("Non-permitted artifacts contain exported requests")
            return PreparedImport(source, content_digest(file_digests), {},
                                  {k: ["source_rights_not_permitted"] for k in selection}, {})
        if not metadata["text_exported"]:
            raise ValidationError("Permitted input has no exported evidence")
        blocks = []
        for line in (path / "blocks.jsonl").read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            item["fragments"] = [Fragment(**f) for f in item["fragments"]]
            blocks.append(StructuralBlock(**item))
        if len({b.block_id for b in blocks}) != len(blocks):
            raise ValidationError("Duplicate block IDs")
        document = ParsedDocument(
            source=SourceMetadata(**metadata["source"]), checksum=digest, parser_version=PARSER_VERSION,
            pages=metadata["pages"], blocks=blocks,
            sections=[CurriculumSection(**s) for s in sections_data], tools=metadata["tools"],
            settings=metadata["settings"], diagnostics=metadata["diagnostics"],
            corrections_checksum=metadata["corrections_checksum"],
        )
        requests = [_read(p) for p in chunk_files]
        if any(p.stem != r["user_data"]["chunk_id"] for p, r in zip(chunk_files, requests, strict=True)):
            raise ValidationError("Request filenames must match chunk IDs")
        if {r["user_data"]["chunk_id"] for r in requests} != {c["chunk_id"] for c in manifest["chunks"]}:
            raise ValidationError("Manifest request inventory differs from files")
        existing = requests[0]["user_data"]["existing_skills"] if requests else []
        if any(r["user_data"]["existing_skills"] != existing for r in requests):
            raise ValidationError("Existing-skill context differs across chunks")
        expected, rebuilt = build_generation_inputs(document, section_codes=selection,
                                                   existing_skills=existing,
                                                   max_bytes=manifest["max_payload_bytes"])
        expected_by_id = {r["user_data"]["chunk_id"]: r for r in expected}
        actual_selected = {r["user_data"]["chunk_id"]: r for r in requests
                           if r["user_data"]["section"]["source_code"] in selection}
        if actual_selected != expected_by_id:
            raise ValidationError("Request evidence differs from reconstructed coverage")
        rebuilt_sections = {s["source_code"]: s for s in rebuilt["sections"]}
        for code in selection:
            if reports[code] != rebuilt_sections[code]:
                raise ValidationError("Manifest readiness or coverage differs from evidence")
        rebuilt_chunks = {c["chunk_id"]: c for c in rebuilt["chunks"]}
        for chunk in manifest["chunks"]:
            if chunk["chunk_id"] in rebuilt_chunks and chunk != rebuilt_chunks[chunk["chunk_id"]]:
                raise ValidationError("Chunk sizes or context ranges disagree")
        units, spans = {}, {}
        for request in expected:
            code = request["user_data"]["section"]["source_code"]
            units.setdefault(code, []).append(request)
            for span in request["user_data"]["source_spans"]:
                previous = spans.setdefault(span["span_id"], span)
                if previous != span:
                    raise ValidationError("A span ID has inconsistent contents")
        for code in selection:
            if code not in units and code not in blocked:
                blocked[code] = ["empty_unit"]
        return PreparedImport(source, content_digest(file_digests), units, blocked, spans)
    except ValidationError:
        raise
    except (OSError, KeyError, TypeError, ValueError, AttributeError):
        raise ValidationError("Invalid, incomplete or incompatible PDF artifacts") from None
