"""Internal ingestion records, not public skill/outcome DTOs."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from typing import Literal
from uuid import NAMESPACE_URL, uuid5

PARSER_VERSION = "cs2023-pdf-v1"
PAYLOAD_VERSION = "skill-input-v1"
RightsStatus = Literal["pending", "permitted", "restricted"]


class IngestionError(ValueError):
    """Actionable local ingestion failure (no provider or database payload)."""


def json_bytes(value: object) -> bytes:
    """Canonical UTF-8 artifact encoding; not a database checksum helper."""
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode()


def stable_id(*parts: object) -> str:
    return str(uuid5(NAMESPACE_URL, json_bytes(parts).decode()))


@dataclass
class ParseOptions:
    ocr_language: str = "eng"
    tesseract: str = "tesseract"
    max_file_bytes: int = 100_000_000
    max_pages: int = 1000
    max_image_pixels: int = 25_000_000
    ocr_timeout: int = 120
    ocr_min_confidence: float = 80
    min_native_characters: int = 30
    max_bad_character_ratio: float = 0.01

    def __post_init__(self):
        for name in (
            "max_file_bytes",
            "max_pages",
            "max_image_pixels",
            "ocr_timeout",
            "min_native_characters",
        ):
            if getattr(self, name) <= 0:
                raise IngestionError(f"{name} must be positive")
        if (
            not 0 <= self.ocr_min_confidence <= 100
            or not 0 <= self.max_bad_character_ratio <= 1
        ):
            raise IngestionError("Invalid extraction quality threshold")
        if not self.ocr_language or self.ocr_language.startswith("-"):
            raise IngestionError("An OCR language is required")


@dataclass
class SourceMetadata:
    source_id: str
    uri: str
    edition: str | None
    rights_status: RightsStatus = "pending"
    source_kind: str = "cs2023"

    def __post_init__(self):
        from uuid import UUID

        try:
            UUID(self.source_id)
        except (ValueError, TypeError, AttributeError) as exc:
            raise IngestionError("source_id must be a UUID") from exc
        if not isinstance(self.uri, str) or not self.uri.strip():
            raise IngestionError("Source URI must be a non-empty string")
        if self.edition is not None and (
            not isinstance(self.edition, str) or not self.edition.strip()
        ):
            raise IngestionError("Edition must be a non-empty string when supplied")
        if self.rights_status not in {"pending", "permitted", "restricted"}:
            raise IngestionError("Invalid source rights status")
        if self.source_kind != "cs2023":
            raise IngestionError("This parser profile supports cs2023 sources only")


@dataclass
class Fragment:
    page: int
    bbox: list[float]
    text: str
    method: str


@dataclass
class StructuralBlock:
    block_id: str
    layout_type: str
    semantic_role: str
    raw_text: str
    text: str
    fragments: list[Fragment]
    order: int
    parent_id: str | None = None
    section_id: str | None = None
    core: str | None = None
    list_marker: str | None = None
    level: int = 0
    warnings: list[str] = field(default_factory=list)
    excluded: bool = False
    continuation_of: str | None = None
    references: list[str] = field(default_factory=list)
    in_body: bool = False


@dataclass
class CurriculumSection:
    section_id: str
    kind: str
    source_code: str | None
    title: str
    parent_id: str | None
    path: list[str]
    block_ids: list[str] = field(default_factory=list)
    topic_ids: list[str] = field(default_factory=list)
    outcome_ids: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass
class ParsedDocument:
    source: SourceMetadata
    checksum: str
    parser_version: str
    pages: list[dict]
    blocks: list[StructuralBlock]
    sections: list[CurriculumSection]
    tools: dict
    settings: dict
    diagnostics: list[dict] = field(default_factory=list)
    corrections_checksum: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class GenerationInput:
    chunk_id: str
    source: dict
    section: dict
    source_spans: list[dict]
    topic_blocks: list[dict]
    explicit_source_outcomes: list[dict]
    context_blocks: list[dict]
    existing_skills: list[dict]
    payload_version: str = PAYLOAD_VERSION


def content_digest(value: object) -> str:
    return hashlib.sha256(json_bytes(value)).hexdigest()
