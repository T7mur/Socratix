"""Deterministic, evidence-preserving preparation; no model client dependency."""

from __future__ import annotations

import copy
import re
from dataclasses import asdict
from pathlib import Path

from .ingestion_models import (
    PAYLOAD_VERSION,
    CurriculumSection,
    GenerationInput,
    IngestionError,
    ParsedDocument,
    StructuralBlock,
    content_digest,
    json_bytes,
    stable_id,
)


def load_prompt() -> str:
    path = (
        Path(__file__).resolve().parents[4]
        / "shared/prompts/skill/prepare_input_v1.txt"
    )
    return path.read_text(encoding="utf-8")


def _span(
    document: ParsedDocument,
    section: CurriculumSection,
    block: StructuralBlock,
    start: int = 0,
    end: int | None = None,
) -> dict:
    end = len(block.text) if end is None else end
    return {
        "span_id": stable_id(
            document.checksum, document.parser_version, block.block_id, start, end
        ),
        "source_id": document.source.source_id,
        "section": " / ".join(section.path),
        "page": block.fragments[0].page,
        "text_excerpt": block.text[start:end],
        "rights_status": document.source.rights_status,
        "locator": {
            "uri": document.source.uri,
            "block_id": block.block_id,
            "normalized_text_range": [start, end],
            "fragments": [
                {"page": f.page, "bbox": f.bbox, "method": f.method}
                for f in block.fragments
            ],
        },
        "semantic_role": block.semantic_role,
        "layout_type": block.layout_type,
        "parent_block_id": block.parent_id,
        "core": block.core,
        "references": block.references,
        "continuation_of": block.block_id if start else None,
    }


def _request(document, section, primary, context, existing_skills, prompt):
    spans = list({span["span_id"]: span for span in primary + context}.values())
    data = GenerationInput(
        chunk_id=stable_id(
            document.checksum,
            PAYLOAD_VERSION,
            section.section_id,
            [s["span_id"] for s in primary],
            [s["span_id"] for s in context],
            content_digest(existing_skills),
            document.corrections_checksum,
        ),
        source={
            **asdict(document.source),
            "checksum": document.checksum,
            "parser_version": document.parser_version,
            "corrections_checksum": document.corrections_checksum,
        },
        section={
            "section_id": section.section_id,
            "source_code": section.source_code,
            "title": section.title,
            "path": section.path,
        },
        source_spans=spans,
        topic_blocks=[
            {"span_id": s["span_id"], "block_id": s["locator"]["block_id"]}
            for s in primary
            if s["semantic_role"] != "source_outcome"
        ],
        explicit_source_outcomes=[
            {
                "span_id": s["span_id"],
                "scope": "knowledge_unit",
                "usage": "primary" if s in primary else "context",
            }
            for s in spans
            if s["semantic_role"] == "source_outcome"
        ],
        context_blocks=[{"span_id": s["span_id"], "usage": "context"} for s in context],
        existing_skills=existing_skills,
    )
    return {
        "prompt_version": "prepare-input-v1",
        "system_prompt": prompt,
        "user_data": asdict(data),
        "primary_span_ids": [span["span_id"] for span in primary],
    }


def _split_span(span: dict, fits) -> list[dict]:
    """Split only at paragraph/sentence boundaries, retaining every character."""
    text = span["text_excerpt"]
    boundaries = [
        m.end() for m in re.finditer(r"\n\s*\n|(?<=[.!?])\s+(?=\S)", text)
    ] + [len(text)]
    result, start = [], 0
    original_start = span["locator"]["normalized_text_range"][0]
    while start < len(text):
        accepted = None
        for end in boundaries:
            if end <= start:
                continue
            candidate = copy.deepcopy(span)
            candidate["text_excerpt"] = text[start:end]
            candidate["locator"]["normalized_text_range"] = [
                original_start + start,
                original_start + end,
            ]
            candidate["span_id"] = stable_id(
                span["span_id"], original_start + start, original_start + end
            )
            candidate["continuation_of"] = span["locator"]["block_id"]
            if not fits(candidate):
                break
            accepted = candidate
        if accepted is None:
            raise IngestionError("unsplittable_block_exceeds_payload_limit")
        result.append(accepted)
        start = accepted["locator"]["normalized_text_range"][1] - original_start
    return result


def build_generation_inputs(
    document: ParsedDocument,
    *,
    section_codes: list[str] | None = None,
    existing_skills: list[dict] | None = None,
    max_bytes: int = 24_000,
    prompt: str | None = None,
) -> tuple[list[dict], dict]:
    """Build complete request envelopes and a coverage manifest; pure apart from prompt read."""
    if max_bytes < 1024:
        raise IngestionError("max_bytes must be at least 1024")
    existing_skills = existing_skills if existing_skills is not None else []
    if not isinstance(existing_skills, list) or not all(
        isinstance(s, dict) for s in existing_skills
    ):
        raise IngestionError("existing_skills must be a JSON array of objects")
    # Validate JSON before constructing requests, without accepting NaN/Infinity.
    try:
        json_bytes(existing_skills)
    except (ValueError, TypeError) as exc:
        raise IngestionError("existing_skills must contain finite JSON values") from exc
    prompt = load_prompt() if prompt is None else prompt
    units = [
        section for section in document.sections if section.kind == "knowledge_unit"
    ]
    selected = set(section_codes or [])
    if selected - {section.source_code for section in units}:
        raise IngestionError("Unknown section code in selection")
    by_id = {block.block_id: block for block in document.blocks}
    sections_by_id = {section.section_id: section for section in document.sections}
    unit_ids = {unit.section_id for unit in units}
    unassigned_issues = [
        {"block_id": b.block_id, "page": b.fragments[0].page, "warnings": b.warnings}
        for b in document.blocks
        if b.in_body and not b.excluded and b.warnings and b.section_id not in unit_ids
    ]
    requests = []
    manifest = {
        "payload_version": PAYLOAD_VERSION,
        "source_checksum": document.checksum,
        "parser_version": document.parser_version,
        "rights_status": document.source.rights_status,
        "corrections_checksum": document.corrections_checksum,
        "max_payload_bytes": max_bytes,
        "sections": [],
        "chunks": [],
        "excluded_blocks": [],
        "diagnostics": document.diagnostics,
        "unassigned_body_issues": unassigned_issues,
    }
    expected_ids = set()
    for section in units:
        selected_unit = not selected or section.source_code in selected
        content = [
            by_id[key]
            for key in section.block_ids
            if not by_id[key].excluded and by_id[key].layout_type != "heading"
        ]
        report = {
            "section_id": section.section_id,
            "source_code": section.source_code,
            "status": "ready",
            "reasons": [],
            "primary_blocks": [],
            "coverage": [],
        }
        manifest["sections"].append(report)
        if not selected_unit:
            report["status"], report["reasons"] = "excluded", ["not_selected"]
            continue
        expected_ids.update(b.block_id for b in content)
        reasons = sorted(
            set(
                section.warnings
                + [w for b in content for w in b.warnings]
                + [w for key in section.block_ids for w in by_id[key].warnings]
            )
        )
        if document.source.rights_status != "permitted":
            reasons.append("source_rights_not_permitted")
        if not content:
            reasons.append("empty_unit")
        if reasons:
            report["status"], report["reasons"] = "review_required", reasons
            continue
        headings = [
            by_id[key]
            for key in section.block_ids
            if by_id[key].layout_type == "heading"
            and by_id[key].semantic_role in {"knowledge_unit", "section_heading"}
        ]
        parent = sections_by_id.get(section.parent_id)
        if parent:
            headings = [
                by_id[key]
                for key in parent.block_ids
                if by_id[key].semantic_role == "knowledge_area"
            ] + headings
        heading_spans = [_span(document, section, b) for b in headings]
        outcome_spans = [
            _span(document, section, b)
            for b in content
            if b.semantic_role == "source_outcome"
        ]
        all_spans = [_span(document, section, b) for b in content]
        whole = _request(
            document, section, all_spans, heading_spans, existing_skills, prompt
        )
        section_requests = []
        if len(json_bytes(whole)) <= max_bytes:
            section_requests = [whole]
        else:
            # Each subtree is a preferred atomic group. Oversized trees degrade to blocks;
            # oversized blocks split at sentences, never arbitrary character truncation.
            groups: list[list[dict]] = []
            current_root = None
            for block, span in zip(content, all_spans):
                root = block
                visited = set()
                while root.parent_id and root.parent_id in by_id:
                    if root.block_id in visited:
                        raise IngestionError("Cyclic block hierarchy")
                    visited.add(root.block_id)
                    root = by_id[root.parent_id]
                if root.block_id != current_root:
                    groups.append([])
                    current_root = root.block_id
                groups[-1].append(span)

            def context_for(
                primary,
                _outcomes=outcome_spans,
                _headings=heading_spans,
                _section=section,
            ):
                ids = {s["span_id"] for s in primary}
                # Unit outcomes are repeated only in requests targeting topics.
                outcomes = (
                    _outcomes
                    if any(s["semantic_role"] != "source_outcome" for s in primary)
                    else []
                )
                # Parent list items are needed when a subtree has to be split.
                ancestors = []
                for span in primary:
                    block = by_id[span["locator"]["block_id"]]
                    parent_id = block.parent_id
                    while parent_id:
                        parent_block = by_id[parent_id]
                        ancestors.append(_span(document, _section, parent_block))
                        parent_id = parent_block.parent_id
                return list(
                    {
                        s["span_id"]: s
                        for s in _headings + ancestors + outcomes
                        if s["span_id"] not in ids
                    }.values()
                )

            def make(primary, _section=section):
                return _request(
                    document,
                    _section,
                    primary,
                    context_for(primary),
                    existing_skills,
                    prompt,
                )

            def fits(primary):
                return len(json_bytes(make(primary))) <= max_bytes

            try:
                pending = []
                for group in groups:
                    if fits(pending + group):
                        pending += group
                        continue
                    if pending:
                        section_requests.append(make(pending))
                        pending = []
                    if fits(group):
                        pending = group
                        continue
                    for span in group:
                        if fits(pending + [span]):
                            pending.append(span)
                            continue
                        if pending:
                            section_requests.append(make(pending))
                            pending = []
                        if fits([span]):
                            pending = [span]
                        else:
                            section_requests.extend(
                                make([part])
                                for part in _split_span(span, lambda s: fits([s]))
                            )
                if pending:
                    section_requests.append(make(pending))
            except IngestionError as exc:
                report["status"], report["reasons"] = "review_required", [str(exc)]
                continue
        coverage = []
        for request in section_requests:
            if len(json_bytes(request)) > max_bytes:
                raise IngestionError("Internal payload limit violation")
            primary_ids = set(request["primary_span_ids"])
            source_spans = request["user_data"]["source_spans"]
            coverage.extend(
                {
                    "block_id": s["locator"]["block_id"],
                    "range": s["locator"]["normalized_text_range"],
                    "span_id": s["span_id"],
                }
                for s in source_spans
                if s["span_id"] in primary_ids
            )
        for block in content:
            ranges = sorted(
                row["range"] for row in coverage if row["block_id"] == block.block_id
            )
            position = 0
            for start, end in ranges:
                if start != position or end < start:
                    raise IngestionError(
                        "Primary evidence coverage contains gaps or overlap"
                    )
                position = end
            if position != len(block.text):
                raise IngestionError("Primary evidence coverage is incomplete")
        report["coverage"] = coverage
        report["primary_blocks"] = [b.block_id for b in content]
        requests.extend(section_requests)
    for request in requests:
        manifest["chunks"].append(
            {
                "chunk_id": request["user_data"]["chunk_id"],
                "bytes": len(json_bytes(request)),
                "primary_span_ids": request["primary_span_ids"],
                "context_span_ids": [
                    b["span_id"] for b in request["user_data"]["context_blocks"]
                ],
            }
        )
    for block in document.blocks:
        if block.block_id not in expected_ids:
            manifest["excluded_blocks"].append(
                {
                    "block_id": block.block_id,
                    "reason": "excluded_source_block"
                    if block.excluded
                    else "context_or_outside_selected_units",
                }
            )
    manifest["status"] = (
        "review_required"
        if (
            any(s["status"] == "review_required" for s in manifest["sections"])
            or any(d.get("review_required") for d in document.diagnostics)
            or unassigned_issues
        )
        else "ready"
    )
    return requests, manifest
