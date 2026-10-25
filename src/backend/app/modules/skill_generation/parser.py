"""Offline, layout-aware CS2023 extraction. Never imported by an HTTP handler."""

from __future__ import annotations

import copy
import csv
import hashlib
import io
import re
import subprocess
import tempfile
from collections import Counter
from dataclasses import asdict
from importlib.metadata import version
from itertools import pairwise
from pathlib import Path
from statistics import median

from .ingestion_models import (
    PARSER_VERSION,
    CurriculumSection,
    Fragment,
    IngestionError,
    ParsedDocument,
    ParseOptions,
    SourceMetadata,
    StructuralBlock,
    content_digest,
    stable_id,
)

AREA = re.compile(r"^(.+?)\s+\(([A-Z]{2,4})\)$")
AREA_CODES = {
    "AI",
    "AL",
    "AR",
    "DM",
    "FPL",
    "GIT",
    "HCI",
    "MSF",
    "NC",
    "OS",
    "PDC",
    "SDF",
    "SE",
    "SEC",
    "SEP",
    "SF",
    "SPD",
}
AREA_NAMES = {
    "AI": "Artificial Intelligence",
    "AL": "Algorithmic Foundations",
    "AR": "Architecture and Organization",
    "DM": "Data Management",
    "FPL": "Foundations of Programming Languages",
    "GIT": "Graphics and Interactive Techniques",
    "HCI": "Human-Computer Interaction",
    "MSF": "Mathematical and Statistical Foundations",
    "NC": "Networking and Communication",
    "OS": "Operating Systems",
    "PDC": "Parallel and Distributed Computing",
    "SDF": "Software Development Fundamentals",
    "SE": "Software Engineering",
    "SEC": "Security",
    "SEP": "Society, Ethics, and the Profession",
    "SF": "Systems Fundamentals",
    "SPD": "Specialized Platform Development",
}
UNIT = re.compile(r"^([A-Z]{2,4}-[A-Za-z][A-Za-z0-9/-]*)\s*:\s*(.+)$")
BARE_UNITS = {
    "MSF-Calculus",
    "SPD-SEP/Mobile",
    "SPD-SEP/Web",
    "SPD-SEP/Game",
    "SPD-SEP/Robotics",
    "SPD-SEP/Interactive",
}
MARKER = re.compile(r"^(\d+\.|[a-z]\.|[ivxlcdm]+\.|[•●○▪–-])\s+(.+)$")
CORE = {
    "cs core": "cs_core",
    "ka core": "ka_core",
    "non-core": "non_core",
}
ANCILLARY = {
    "Professional Dispositions",
    "Mathematics Requirements",
    "Course Packaging Suggestions",
    "Committee",
    "References",
}
BODY_END = {
    "Core Topics Table",
    "Curricular Packaging",
    "Competency Framework",
    "The Competency Framework",
    "Competency Model",
    "Pedagogical Considerations",
    "Curricular Practices",
}


def _text(value: str) -> str:
    # Do not remove hyphens, operators or mathematical symbols.
    return re.sub(
        r"[ \t]+", " ", value.replace("\ufb01", "fi").replace("\ufb02", "fl")
    ).strip()


def ocr_words(
    image, width: float, height: float, options: ParseOptions
) -> tuple[list[dict], str]:
    """Run a fixed local OCR executable on an image; no shell or document commands."""
    if image.width * image.height > options.max_image_pixels:
        raise IngestionError("ocr_image_limit")
    with tempfile.TemporaryDirectory(prefix="socratix-ocr-") as directory:
        image_path = Path(directory) / "page.png"
        image.save(image_path)
        try:
            result = subprocess.run(
                [
                    options.tesseract,
                    str(image_path),
                    "stdout",
                    "-l",
                    options.ocr_language,
                    "--psm",
                    "3",
                    "tsv",
                ],
                capture_output=True,
                timeout=options.ocr_timeout,
                check=False,
                shell=False,
                encoding="utf-8",
                errors="replace",
            )
        except FileNotFoundError as exc:
            raise IngestionError("ocr_unavailable") from exc
        except subprocess.TimeoutExpired as exc:
            raise IngestionError("ocr_timeout") from exc
        except OSError as exc:
            raise IngestionError("ocr_unavailable") from exc
        if result.returncode:
            raise IngestionError("ocr_failed")
    words = []
    try:
        for row in csv.DictReader(io.StringIO(result.stdout), delimiter="\t"):
            if row["level"] != "5" or not row["text"].strip():
                continue
            left, top, box_width, box_height = (
                float(row[key]) for key in ("left", "top", "width", "height")
            )
            confidence = float(row["conf"])
            if not 0 <= confidence <= 100:
                raise ValueError("Invalid OCR confidence")
            if not (
                0 <= left < left + box_width <= image.width + 1
                and 0 <= top < top + box_height <= image.height + 1
            ):
                raise ValueError("Invalid OCR coordinates")
            words.append(
                {
                    "text": row["text"],
                    "x0": left * width / image.width,
                    "x1": (left + box_width) * width / image.width,
                    "top": top * height / image.height,
                    "bottom": (top + box_height) * height / image.height,
                    "fontname": None,
                    "size": box_height * height / image.height,
                    "confidence": confidence,
                }
            )
    except (KeyError, TypeError, ValueError) as exc:
        raise IngestionError("ocr_invalid_output") from exc
    return words, "tesseract-tsv"


def _lines(words: list[dict]) -> list[list[dict]]:
    lines: list[list[dict]] = []
    for word in sorted(words, key=lambda item: (round(item["top"], 1), item["x0"])):
        if not lines or abs(lines[-1][0]["top"] - word["top"]) > 3:
            lines.append([word])
        else:
            lines[-1].append(word)
    return [sorted(line, key=lambda item: item["x0"]) for line in lines]


def _bbox(words: list[dict]) -> list[float]:
    return [
        round(value, 3)
        for value in (
            min(w["x0"] for w in words),
            min(w["top"] for w in words),
            max(w["x1"] for w in words),
            max(w["bottom"] for w in words),
        )
    ]


def _role(text: str) -> tuple[str, str]:
    if re.search(r"\.{4,}\s*\d+\s*$", text):
        return "paragraph", "contents"
    if text == "Body of Knowledge":
        return "heading", "body_start"
    area = AREA.match(text)
    if (
        area
        and area[2] in AREA_CODES
        and area[1].casefold() == AREA_NAMES[area[2]].casefold()
    ):
        return "heading", "knowledge_area"
    if UNIT.match(text) or text in BARE_UNITS:
        return "heading", "knowledge_unit"
    label = text.rstrip(":").strip().casefold()
    if label in CORE:
        return "heading", "core_label"
    if label == "illustrative learning outcomes":
        return "heading", "outcome_heading"
    if (
        text in ANCILLARY
        or text in BODY_END
        or text in {"Preamble", "Knowledge Units", "Core Hours", "Changes since CS2013"}
    ):
        return "heading", "section_heading"
    if MARKER.match(text):
        return "list_item", "unclassified"
    if re.match(r"^(Figure|Table)\s+\d+[.: ]", text):
        return "caption", "context"
    return "paragraph", "unclassified"


def _make_block(
    checksum: str,
    page: int,
    ordinal: int,
    box: list[float],
    text: str,
    method: str,
    **kwargs,
):
    kind, role = _role(text)
    return StructuralBlock(
        block_id=stable_id(checksum, PARSER_VERSION, page, ordinal, box),
        layout_type=kind,
        semantic_role=role,
        raw_text=text,
        text=_text(text),
        fragments=[Fragment(page, box, text, method)],
        order=ordinal,
        **kwargs,
    )


def extract_pdf(
    path: Path | str, source: SourceMetadata, options: ParseOptions | None = None
) -> ParsedDocument:
    """Extract raw page/line records; bounded local I/O, no model or database calls."""
    import pdfplumber

    path = Path(path)
    options = options or ParseOptions()
    try:
        if path.stat().st_size > options.max_file_bytes:
            raise IngestionError("PDF exceeds max_file_bytes")
        checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as exc:
        raise IngestionError("PDF cannot be read") from exc
    pages, blocks, diagnostics = [], [], []
    tools = {"pdfplumber": version("pdfplumber"), "tesseract": None}
    try:
        with pdfplumber.open(path) as pdf:
            if pdf.doc.encryption:
                raise IngestionError("Password-protected PDFs are not supported")
            if len(pdf.pages) > options.max_pages:
                raise IngestionError("PDF exceeds max_pages")
            for number, page in enumerate(pdf.pages, 1):
                words = page.extract_words(
                    extra_attrs=["fontname", "size"], x_tolerance=2, y_tolerance=3
                )
                native_words = words  # Replaced, never mutated, if OCR is needed.
                native_text = " ".join(w["text"] for w in words)
                meaningful = sum(ch.isalnum() for ch in native_text)
                damaged = (
                    native_text.count("\ufffd") / max(len(native_text), 1)
                    > options.max_bad_character_ratio
                )
                needs_ocr = damaged or (
                    meaningful < options.min_native_characters and bool(page.images)
                )
                page_warnings = []
                method = "native"
                if needs_ocr:
                    try:
                        pixels = (page.width * 300 / 72) * (page.height * 300 / 72)
                        if pixels > options.max_image_pixels:
                            raise IngestionError("ocr_image_limit")
                        image = page.to_image(resolution=300).original
                        words, method = ocr_words(
                            image, page.width, page.height, options
                        )
                        if tools["tesseract"] is None:
                            try:
                                info = subprocess.run(
                                    [options.tesseract, "--version"],
                                    capture_output=True,
                                    timeout=10,
                                    check=False,
                                    encoding="utf-8",
                                    errors="replace",
                                )
                                tools["tesseract"] = (
                                    info.stdout.splitlines()[0]
                                    if info.stdout
                                    else "unknown"
                                )
                            except (OSError, subprocess.TimeoutExpired):
                                tools["tesseract"] = "unknown"
                        if (
                            not words
                            or sum(w["confidence"] for w in words) / len(words)
                            < options.ocr_min_confidence
                        ):
                            page_warnings.append("low_ocr_confidence")
                    except IngestionError as exc:
                        words, method = [], "ocr_failed"
                        page_warnings.append(str(exc))
                elif damaged or (meaningful < options.min_native_characters and words):
                    page_warnings.append("insufficient_native_text")

                lines = _lines(words)
                body_size = (
                    median([w.get("size") or 11 for w in words]) if words else 11
                )
                printed_label = None
                page_blocks = []
                # Ruled tables only: uncertain borderless tables are retained as text.
                tables = [] if needs_ocr else page.find_tables()
                for ordinal, line in enumerate(lines):
                    box = _bbox(line)
                    if any(
                        t.bbox[0] <= box[0]
                        and t.bbox[1] <= box[1]
                        and t.bbox[2] >= box[2]
                        and t.bbox[3] >= box[3]
                        for t in tables
                    ):
                        continue
                    text = " ".join(w["text"] for w in line)
                    block = _make_block(
                        checksum,
                        number,
                        ordinal,
                        box,
                        text,
                        method,
                        warnings=list(page_warnings),
                    )
                    if (
                        block.semantic_role == "unclassified"
                        and block.layout_type == "paragraph"
                        and len(text) < 160
                    ):
                        bold = all(
                            "bold" in (w.get("fontname") or "").lower() for w in line
                        )
                        large = (
                            min(w.get("size") or body_size for w in line)
                            >= body_size * 1.2
                        )
                        if bold or large:
                            block.layout_type, block.semantic_role = (
                                "heading",
                                "section_heading",
                            )
                    if box[1] > page.height * 0.9 and re.fullmatch(
                        r"\d+|[ivxlcdm]+", text.strip(), re.IGNORECASE
                    ):
                        block.semantic_role, block.excluded = "footer", True
                        printed_label = text.strip()
                    gaps = [right["x0"] - left["x1"] for left, right in pairwise(line)]
                    if (
                        gaps
                        and max(gaps) > page.width * 0.16
                        and block.semantic_role != "contents"
                    ):
                        block.warnings.append("ambiguous_reading_order")
                    if (
                        box[1] > page.height * 0.83
                        and max(w.get("size") or 11 for w in line) < 9
                    ):
                        block.layout_type, block.semantic_role = "footnote", "context"
                    page_blocks.append(block)
                for index, table in enumerate(tables):
                    rows = table.extract()
                    block = _make_block(
                        checksum,
                        number,
                        len(lines) + index,
                        list(table.bbox),
                        "\n".join(
                            " | ".join(cell or "" for cell in row) for row in rows
                        ),
                        method,
                        warnings=list(page_warnings),
                    )
                    block.layout_type, block.semantic_role = "table", "context"
                    page_blocks.append(block)
                for index, item in enumerate(page.images):
                    area = (item["x1"] - item["x0"]) * (item["bottom"] - item["top"])
                    if area < page.width * page.height * 0.02 or needs_ocr:
                        continue
                    # Images with no native text may contain diagram labels; never silently omit them.
                    if not any(
                        item["x0"] <= w["x0"] <= item["x1"]
                        and item["top"] <= w["top"] <= item["bottom"]
                        for w in words
                    ):
                        block = _make_block(
                            checksum,
                            number,
                            len(lines) + len(tables) + index,
                            [item["x0"], item["top"], item["x1"], item["bottom"]],
                            "",
                            "native",
                            warnings=["unresolved_figure"],
                        )
                        block.layout_type, block.semantic_role = "figure", "context"
                        page_blocks.append(block)
                if page_warnings and not page_blocks:
                    block = _make_block(
                        checksum,
                        number,
                        0,
                        [0, 0, page.width, page.height],
                        "",
                        method,
                        warnings=page_warnings,
                    )
                    block.layout_type = "unknown"
                    page_blocks.append(block)
                page_blocks.sort(
                    key=lambda block: (
                        block.fragments[0].bbox[1],
                        block.fragments[0].bbox[0],
                    )
                )
                blocks.extend(page_blocks)
                pages.append(
                    {
                        "page": number,
                        "printed_label": printed_label,
                        "width": page.width,
                        "height": page.height,
                        "native_words": native_words,
                        "words": words,
                        "method": method,
                        "warnings": page_warnings,
                    }
                )
                diagnostics.extend(
                    {"page": number, "code": warning} for warning in page_warnings
                )
                page.close()  # Release cached character/layout objects for long reports.
    except IngestionError:
        raise
    except Exception as exc:
        raise IngestionError("PDF is corrupt, encrypted, or cannot be parsed") from exc
    if not pages:
        raise IngestionError("PDF has no pages")
    for index, block in enumerate(blocks):
        block.order = index
    return ParsedDocument(
        source,
        checksum,
        PARSER_VERSION,
        pages,
        blocks,
        [],
        tools,
        asdict(options),
        diagnostics,
    )


def apply_corrections(raw: ParsedDocument, corrections: dict | None) -> ParsedDocument:
    """Copy raw extraction, validate corrections and apply before reconstruction."""
    document = copy.deepcopy(raw)
    if corrections is None:
        return document
    if not isinstance(corrections, dict):
        raise IngestionError("Corrections must be a JSON object")
    if (
        corrections.get("version") != 1
        or corrections.get("source_checksum") != raw.checksum
        or corrections.get("parser_version") != PARSER_VERSION
    ):
        raise IngestionError("Corrections do not match source checksum/parser version")
    if set(corrections) - {
        "version",
        "source_checksum",
        "parser_version",
        "blocks",
        "order",
        "sections",
    }:
        raise IngestionError("Unknown corrections fields")
    if not isinstance(corrections.get("blocks", {}), dict) or not isinstance(
        corrections.get("sections", {}), dict
    ):
        raise IngestionError("Correction blocks/sections must be objects")
    by_id = {block.block_id: block for block in document.blocks}
    allowed = {
        "layout_type",
        "semantic_role",
        "text",
        "excluded",
        "warnings",
        "parent_id",
    }
    for key, patch in corrections.get("blocks", {}).items():
        if key not in by_id or not isinstance(patch, dict) or set(patch) - allowed:
            raise IngestionError("Unknown correction block or field")
        for name, value in patch.items():
            if name == "layout_type" and value not in {
                "heading",
                "paragraph",
                "list_item",
                "table",
                "caption",
                "footnote",
                "figure",
                "unknown",
            }:
                raise IngestionError("Unknown corrected layout type")
            if name == "semantic_role" and value not in {
                "contents",
                "footer",
                "running_margin",
                "body_start",
                "knowledge_area",
                "knowledge_unit",
                "core_label",
                "outcome_heading",
                "section_heading",
                "unclassified",
                "topic",
                "source_outcome",
                "context",
            }:
                raise IngestionError("Unknown corrected semantic role")
            if name == "warnings" and (
                not isinstance(value, list)
                or not all(isinstance(v, str) for v in value)
            ):
                raise IngestionError("warnings must be a string list")
            if name == "excluded" and not isinstance(value, bool):
                raise IngestionError("excluded must be boolean")
            if name not in {"warnings", "excluded", "parent_id"} and not isinstance(
                value, str
            ):
                raise IngestionError("Block correction values must be strings")
            if name == "parent_id" and value is not None and value not in by_id:
                raise IngestionError("Unknown corrected parent block")
            setattr(by_id[key], name, value)
    order = corrections.get("order")
    if order is not None:
        if (
            not isinstance(order, list)
            or not all(isinstance(key, str) for key in order)
            or len(order) != len(by_id)
            or set(order) != set(by_id)
        ):
            raise IngestionError("Corrected order must list every block exactly once")
        document.blocks = [by_id[key] for key in order]
    document.corrections_checksum = content_digest(corrections)
    return document


def reconstruct_document(
    raw: ParsedDocument, corrections: dict | None = None
) -> ParsedDocument:
    """Reconstruct hierarchy and wrapped blocks without modifying raw extraction."""
    document = apply_corrections(raw, corrections)
    blocks = []
    # Reassemble wrapped source headings before semantic state transitions. Raw lines remain
    # in the input document. Only adjacent typographic headings can be joined here.
    for block in document.blocks:
        if (
            blocks
            and block.layout_type == "heading"
            and blocks[-1].layout_type == "heading"
        ):
            previous_heading = blocks[-1]
            last, current = previous_heading.fragments[-1], block.fragments[0]
            combined = previous_heading.text + " " + block.text
            _, combined_role = _role(combined)
            adjacent = (
                last.page == current.page
                and 0 <= current.bbox[1] - last.bbox[3] < 12
                and abs(current.bbox[0] - last.bbox[0]) < 10
            )
            if (
                adjacent
                and combined_role in {"knowledge_area", "knowledge_unit"}
                and block.semantic_role == "section_heading"
            ):
                previous_heading.text = combined
                previous_heading.raw_text += "\n" + block.raw_text
                previous_heading.fragments += block.fragments
                previous_heading.warnings = sorted(
                    set(previous_heading.warnings + block.warnings)
                )
                previous_heading.semantic_role = combined_role
                continue
        blocks.append(block)
    # Only recurring margin text is removed; body repetitions remain distinct evidence.
    margin_counts = Counter()
    for page in document.pages:
        texts = {
            b.text
            for b in blocks
            if b.fragments[0].page == page["page"]
            and b.text
            and (
                b.fragments[0].bbox[1] < page["height"] * 0.08
                or b.fragments[0].bbox[1] > page["height"] * 0.93
            )
        }
        margin_counts.update(texts)
    sections = []
    area = unit = None
    body = False
    mode, core = "context", None
    stack: list[StructuralBlock] = []
    merged: list[StructuralBlock] = []
    previous = None
    for block in blocks:
        fragment = block.fragments[0]
        height = document.pages[fragment.page - 1]["height"]
        if margin_counts[block.text] >= 3 and (
            fragment.bbox[1] < height * 0.08 or fragment.bbox[1] > height * 0.93
        ):
            block.semantic_role, block.excluded = "running_margin", True
        if (
            block.semantic_role in {"contents", "footer", "running_margin"}
            or block.excluded
        ):
            block.excluded = True
            merged.append(block)
            continue
        role = block.semantic_role
        if role == "body_start":
            body = True
        if block.text in BODY_END:
            body, area, unit = False, None, None
        block.in_body = body
        if role == "knowledge_area" and body:
            match = AREA.match(block.text)
            if match is None:
                raise IngestionError(
                    "Corrected knowledge-area heading needs title (CODE)"
                )
            area = CurriculumSection(
                stable_id(block.block_id, "area"),
                "knowledge_area",
                match[2],
                match[1],
                None,
                [block.text],
            )
            sections.append(area)
            unit, mode, core, stack, previous = None, "context", None, [], None
        if role == "knowledge_unit" and body:
            match = UNIT.match(block.text)
            if match is None and block.text not in BARE_UNITS:
                raise IngestionError(
                    "Corrected knowledge-unit heading needs CODE: title"
                )
            code, title = (
                (match[1], match[2])
                if match
                else (block.text, block.text.split("/", 1)[-1].split("-", 1)[-1])
            )
            warnings = (
                []
                if area and code.split("-")[0] == area.source_code
                else ["missing_or_mismatched_area"]
            )
            unit = CurriculumSection(
                stable_id(block.block_id, "unit"),
                "knowledge_unit",
                code,
                title,
                area.section_id if area else None,
                (area.path if area else []) + [block.text],
                warnings=warnings,
            )
            sections.append(unit)
            mode, core, stack, previous = "topic", None, [], None
        elif role == "section_heading" and block.text in ANCILLARY | {
            "Preamble",
            "Core Hours",
            "Changes since CS2013",
        }:
            unit, mode, core, stack, previous = None, "context", None, [], None
        elif role == "core_label":
            core, stack, previous = (
                CORE.get(block.text.rstrip(":").strip().casefold()),
                [],
                None,
            )
        elif role == "outcome_heading":
            mode, stack, previous = "source_outcome", [], None
        current = unit or area
        block.section_id = current.section_id if current and body else None
        block.core = core if unit else None
        if unit and role == "unclassified":
            block.semantic_role = mode
        elif role == "unclassified":
            block.semantic_role = "context"
        marker = MARKER.match(block.text) if block.layout_type == "list_item" else None
        if marker:
            block.list_marker = marker[1]
            indent = fragment.bbox[0]
            while stack and (
                stack[-1].fragments[0].bbox[0] >= indent - 3
                or stack[-1].semantic_role != block.semantic_role
            ):
                stack.pop()
            block.parent_id = block.parent_id or (stack[-1].block_id if stack else None)
            block.level = len(stack)
            stack.append(block)
        # A wrapped continuation must be close, same semantic role/section, and indented to its text.
        can_join = (
            previous
            and block.layout_type == "paragraph"
            and previous.layout_type in {"paragraph", "list_item"}
            and block.semantic_role in {"topic", "source_outcome", "context"}
            and previous.semantic_role == block.semantic_role
            and previous.section_id == block.section_id
            and not previous.excluded
            and not previous.warnings
            and not block.warnings
        )
        if can_join:
            last = previous.fragments[-1]
            close = (
                fragment.page == last.page and 0 <= fragment.bbox[1] - last.bbox[3] < 12
            )
            next_page = (
                fragment.page == last.page + 1 and fragment.bbox[1] < height * 0.2
            )
            if (close or next_page) and fragment.bbox[0] >= previous.fragments[0].bbox[
                0
            ] - 3:
                previous.raw_text += "\n" + block.raw_text
                previous.text += " " + block.text
                previous.fragments.extend(block.fragments)
                continue
        block.references = re.findall(
            r"\b[A-Z]{2,4}[-/][A-Za-z][A-Za-z0-9/-]*", block.text
        )
        merged.append(block)
        previous = (
            block if block.layout_type not in {"heading", "figure", "table"} else None
        )

    document.blocks, document.sections = merged, sections
    by_section = {section.section_id: section for section in sections}
    by_block = {block.block_id: block for block in merged}
    if corrections:
        for section_id, patch in corrections.get("sections", {}).items():
            if (
                section_id not in by_section
                or not isinstance(patch, dict)
                or set(patch) - {"parent_id", "block_ids", "warnings"}
            ):
                raise IngestionError("Unknown section correction")
            section = by_section[section_id]
            if "parent_id" in patch:
                parent = by_section.get(patch["parent_id"])
                if (
                    section.kind != "knowledge_unit"
                    or parent is None
                    or parent.kind != "knowledge_area"
                ):
                    raise IngestionError(
                        "A knowledge unit must belong to a knowledge area"
                    )
                section.parent_id = parent.section_id
                section.path = parent.path + [f"{section.source_code}: {section.title}"]
            if not isinstance(patch.get("block_ids", []), list):
                raise IngestionError("Corrected block_ids must be a list")
            for block_id in patch.get("block_ids", []):
                if block_id not in by_block:
                    raise IngestionError("Unknown block in section correction")
                by_block[block_id].section_id = section_id
            if "warnings" in patch:
                if not isinstance(patch["warnings"], list) or not all(
                    isinstance(w, str) for w in patch["warnings"]
                ):
                    raise IngestionError("Section warnings must be strings")
                section.warnings = patch["warnings"]
    for index, block in enumerate(merged):
        block.order = index
        block.references = re.findall(
            r"\b[A-Z]{2,4}[-/][A-Za-z][A-Za-z0-9/-]*", block.text
        )
        section = by_section.get(block.section_id)
        if section:
            section.block_ids.append(block.block_id)
            if block.semantic_role == "topic":
                section.topic_ids.append(block.block_id)
            if block.semantic_role == "source_outcome":
                section.outcome_ids.append(block.block_id)
        if block.parent_id:
            seen, parent_id = {block.block_id}, block.parent_id
            while parent_id:
                if parent_id in seen or parent_id not in by_block:
                    raise IngestionError("Invalid or cyclic corrected block hierarchy")
                seen.add(parent_id)
                parent_id = by_block[parent_id].parent_id
    if not any(section.kind == "knowledge_unit" for section in sections):
        document.diagnostics.append(
            {"code": "no_knowledge_units", "review_required": True}
        )
    return document


def parse_pdf(
    path,
    source: SourceMetadata,
    options: ParseOptions | None = None,
    corrections: dict | None = None,
):
    """Convenience composition; raw extraction can be retained separately for replay."""
    return reconstruct_document(extract_pdf(path, source, options), corrections)
