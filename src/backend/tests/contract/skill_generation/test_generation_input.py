from app.modules.skill_generation.ingestion_models import json_bytes
from app.modules.skill_generation.parser import reconstruct_document
from app.modules.skill_generation.payload_builder import build_generation_inputs
from tests.unit.skill_generation.test_pdf_ingestion import raw_document


def test_every_evidence_reference_resolves_to_source_location_and_text():
    document = reconstruct_document(raw_document())
    blocks = {b.block_id: b for b in document.blocks}
    requests, manifest = build_generation_inputs(document)
    for request in requests:
        data = request["user_data"]
        spans = {s["span_id"]: s for s in data["source_spans"]}
        referenced = request["primary_span_ids"] + [
            b["span_id"] for b in data["context_blocks"]
        ]
        referenced += [
            b["span_id"]
            for b in data["topic_blocks"] + data["explicit_source_outcomes"]
        ]
        assert set(referenced) <= set(spans)
        for span in spans.values():
            block = blocks[span["locator"]["block_id"]]
            start, end = span["locator"]["normalized_text_range"]
            assert span["text_excerpt"] == block.text[start:end]
            assert span["page"] >= 1
            assert span["source_id"] == document.source.source_id
            assert span["rights_status"] == "permitted"
            assert span["locator"]["uri"] == document.source.uri
            assert span["locator"]["fragments"]
        assert len(json_bytes(request)) == next(
            c["bytes"] for c in manifest["chunks"] if c["chunk_id"] == data["chunk_id"]
        )
        assert (
            "skill_id" not in data
        )  # Internal source model, never a competing Skill DTO.
