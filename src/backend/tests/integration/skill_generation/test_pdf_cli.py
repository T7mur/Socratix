"""Local synthetic PDFs only. OCR fixtures fake the executable boundary deterministically."""

import json
import shutil

import pytest
from app.modules.skill_generation.cli import main
from app.modules.skill_generation.ingestion_models import (
    IngestionError,
    ParseOptions,
    SourceMetadata,
)
from app.modules.skill_generation.parser import extract_pdf, parse_pdf
from app.modules.skill_generation.payload_builder import build_generation_inputs
from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas


def make_pdf(path, scanned=False):
    canvas = Canvas(str(path), pagesize=(600, 800))
    lines = [
        "Body of Knowledge",
        "Artificial Intelligence (AI)",
        "AI-Demo: Synthetic Unit",
        "CS Core:",
        "1. Compare synthetic examples.",
        "a. Explain a difference.",
        "Illustrative Learning Outcomes:",
        "1. Explain a comparison using evidence.",
    ]
    for index, text in enumerate(lines):
        canvas.drawString(
            40 if not text.startswith("a.") else 60, 720 - index * 24, text
        )
    canvas.drawString(300, 30, "1")
    if scanned:
        canvas.showPage()
        canvas.drawImage(
            ImageReader(Image.new("RGB", (400, 600), "white")), 20, 40, 560, 720
        )
    canvas.save()


def source():
    return SourceMetadata(
        "11111111-1111-4111-8111-111111111111",
        "https://example.invalid/synthetic",
        "test",
        "permitted",
    )


def test_native_pdf_and_cli_round_trip(tmp_path, capsys):
    pdf = tmp_path / "source.pdf"
    make_pdf(pdf)
    output = tmp_path / "out"
    result = main(
        [
            str(pdf),
            "--source-id",
            source().source_id,
            "--uri",
            source().uri,
            "--edition",
            "test",
            "--rights-status",
            "permitted",
            "--output",
            str(output),
        ]
    )
    assert result == 0, capsys.readouterr()
    metadata = json.loads((output / "document.json").read_bytes())
    assert metadata["pages"][0]["printed_label"] == "1"
    assert metadata["pages"][0]["native_words"]
    blocks = [
        json.loads(line) for line in (output / "blocks.jsonl").read_text().splitlines()
    ]
    assert any(b["semantic_role"] == "source_outcome" for b in blocks)
    assert len(list((output / "requests").glob("*.json"))) == 1


def test_mixed_pdf_missing_ocr_blocks_affected_unit(tmp_path):
    pdf = tmp_path / "mixed.pdf"
    make_pdf(pdf, scanned=True)
    document = parse_pdf(
        pdf, source(), ParseOptions(tesseract="socratix-missing-tesseract")
    )
    assert document.pages[0]["method"] == "native"
    assert document.pages[1]["method"] == "ocr_failed"
    assert "ocr_unavailable" in document.pages[1]["warnings"]
    requests, manifest = build_generation_inputs(document)
    assert requests == []
    assert manifest["status"] == "review_required"


def test_mixed_pdf_ocr_quality_is_propagated(tmp_path, monkeypatch):
    pdf = tmp_path / "mixed.pdf"
    make_pdf(pdf, scanned=True)

    def fake_ocr(image, width, height, options):
        return [
            {
                "text": "2. Another source outcome.",
                "x0": 40,
                "x1": 350,
                "top": 80,
                "bottom": 92,
                "fontname": None,
                "size": 12,
                "confidence": 40,
            }
        ], "tesseract-tsv"

    monkeypatch.setattr("app.modules.skill_generation.parser.ocr_words", fake_ocr)
    document = parse_pdf(pdf, source())
    assert "low_ocr_confidence" in document.pages[1]["warnings"]
    assert build_generation_inputs(document)[1]["status"] == "review_required"


def test_file_limits_and_corrupt_pdf(tmp_path):
    pdf = tmp_path / "bad.pdf"
    pdf.write_bytes(b"Not a PDF")
    with pytest.raises(IngestionError, match="corrupt"):
        extract_pdf(pdf, source())
    with pytest.raises(IngestionError, match="max_file_bytes"):
        extract_pdf(pdf, source(), ParseOptions(max_file_bytes=1))
    make_pdf(pdf, scanned=True)
    with pytest.raises(IngestionError, match="max_pages"):
        extract_pdf(pdf, source(), ParseOptions(max_pages=1))


def test_password_protected_pdf(tmp_path):
    from reportlab.lib.pdfencrypt import StandardEncryption

    pdf = tmp_path / "encrypted.pdf"
    canvas = Canvas(str(pdf), encrypt=StandardEncryption("password"))
    canvas.drawString(40, 40, "Synthetic secret")
    canvas.save()
    with pytest.raises(IngestionError, match="encrypted|Password"):
        extract_pdf(pdf, source())


def test_ruled_table_and_ambiguous_columns(tmp_path):
    pdf = tmp_path / "table.pdf"
    canvas = Canvas(str(pdf), pagesize=(600, 800))
    for index, text in enumerate(
        ["Body of Knowledge", "Artificial Intelligence (AI)", "AI-Demo: Synthetic Unit"]
    ):
        canvas.drawString(40, 720 - index * 24, text)
    for y in [500, 530, 560]:
        canvas.line(40, y, 400, y)
    for x in [40, 200, 400]:
        canvas.line(x, 500, x, 560)
    canvas.drawString(50, 540, "Topic")
    canvas.drawString(210, 540, "Classification")
    canvas.drawString(50, 510, "Comparison")
    canvas.drawString(210, 510, "Core")
    canvas.drawString(40, 400, "A left column")
    canvas.drawString(350, 400, "A right column")
    canvas.save()
    document = parse_pdf(pdf, source())
    assert any(
        b.layout_type == "table" and "Comparison" in b.text for b in document.blocks
    )
    assert any("ambiguous_reading_order" in b.warnings for b in document.blocks)
    assert build_generation_inputs(document)[1]["status"] == "review_required"


def test_image_only_pdf_uses_ocr_and_keeps_native_provenance(tmp_path, monkeypatch):
    pdf = tmp_path / "scanned.pdf"
    canvas = Canvas(str(pdf), pagesize=(600, 800))
    canvas.drawImage(
        ImageReader(Image.new("RGB", (400, 600), "white")), 20, 40, 560, 720
    )
    canvas.save()

    def fake_ocr(image, width, height, options):
        texts = [
            "Body of Knowledge",
            "Artificial Intelligence (AI)",
            "AI-Demo: Synthetic Unit",
            "CS Core:",
            "1. Explain a synthetic difference.",
            "Illustrative Learning Outcomes:",
            "1. Compare alternatives.",
        ]
        return [
            {
                "text": text,
                "x0": 40,
                "x1": 500,
                "top": 80 + i * 24,
                "bottom": 92 + i * 24,
                "fontname": None,
                "size": 12,
                "confidence": 95,
            }
            for i, text in enumerate(texts)
        ], "tesseract-tsv"

    monkeypatch.setattr("app.modules.skill_generation.parser.ocr_words", fake_ocr)
    document = parse_pdf(pdf, source())
    assert not document.pages[0]["native_words"]
    assert document.pages[0]["method"] == "tesseract-tsv"
    assert document.sections[1].outcome_ids
    assert build_generation_inputs(document)[1]["status"] == "ready"


@pytest.mark.skipif(
    shutil.which("tesseract") is None, reason="Local Tesseract executable not installed"
)
def test_real_tesseract_smoke_on_synthetic_scan(tmp_path):
    import pdfplumber

    native = tmp_path / "native.pdf"
    make_pdf(native)
    with pdfplumber.open(native) as pdf:
        image = pdf.pages[0].to_image(resolution=300).original
    scanned = tmp_path / "scanned.pdf"
    canvas = Canvas(str(scanned), pagesize=(600, 800))
    canvas.drawImage(ImageReader(image), 0, 0, 600, 800)
    canvas.save()
    document = parse_pdf(scanned, source())
    assert document.pages[0]["method"] == "tesseract-tsv"
    assert not document.pages[0]["native_words"]
    assert document.tools["tesseract"]
    assert any(s.source_code == "AI-Demo" for s in document.sections)


def test_cli_exit_codes_and_invalid_existing_skills(tmp_path):
    pdf = tmp_path / "source.pdf"
    make_pdf(pdf)
    args = [
        str(pdf),
        "--source-id",
        source().source_id,
        "--uri",
        source().uri,
        "--edition",
        "test",
    ]
    assert main(args + ["--output", str(tmp_path / "pending")]) == 2
    assert main(args + ["--output", str(tmp_path / "pending")]) == 1
    existing = tmp_path / "invalid-skills.json"
    existing.write_text('{"not": "an array"}')
    assert (
        main(
            args
            + [
                "--existing-skills",
                str(existing),
                "--output",
                str(tmp_path / "invalid"),
            ]
        )
        == 1
    )


def test_pdf_only_command_derives_stable_metadata_and_fresh_output(
    tmp_path, monkeypatch, capsys
):
    from uuid import UUID

    monkeypatch.chdir(tmp_path)
    make_pdf(tmp_path / "source.pdf")
    assert main(["source.pdf"]) == 2
    first = json.loads(capsys.readouterr().out)
    metadata = json.loads((tmp_path / first["output"] / "document.json").read_bytes())
    UUID(metadata["source"]["source_id"])
    assert metadata["source"]["uri"] == "urn:sha256:" + metadata["checksum"]
    assert metadata["source"]["edition"] is None
    assert metadata["source"]["rights_status"] == "pending"
    assert metadata["text_exported"] is False
    shutil.copyfile(tmp_path / "source.pdf", tmp_path / "renamed.pdf")
    assert main(["renamed.pdf"]) == 2
    second = json.loads(capsys.readouterr().out)
    copied = json.loads((tmp_path / second["output"] / "document.json").read_bytes())
    assert copied["source"] == metadata["source"]
    assert first["output"] != second["output"]
    assert (tmp_path / second["output"]).parent == tmp_path / "outputs"


def test_cli_explicit_metadata_overrides_defaults(tmp_path):
    make_pdf(tmp_path / "source.pdf")
    output = tmp_path / "chosen-output"
    assert (
        main(
            [
                str(tmp_path / "source.pdf"),
                "--source-id",
                source().source_id,
                "--uri",
                source().uri,
                "--edition",
                "custom-edition",
                "--output",
                str(output),
            ]
        )
        == 2
    )
    metadata = json.loads((output / "document.json").read_bytes())
    assert metadata["source"]["source_id"] == source().source_id
    assert metadata["source"]["uri"] == source().uri
    assert metadata["source"]["edition"] == "custom-edition"


def test_cli_invalid_uuid_reports_actionable_error(tmp_path, capsys):
    make_pdf(tmp_path / "source.pdf")
    assert main([str(tmp_path / "source.pdf"), "--source-id", "invalid"]) == 1
    assert "source_id must be a UUID" in capsys.readouterr().err


def test_model_missing_uuid_has_clear_error():
    with pytest.raises(IngestionError, match="source_id must be a UUID"):
        SourceMetadata(None, "urn:example:test", None)
