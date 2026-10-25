"""Proposed private import ledger; Member F/A review required before deployment."""
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import JobStatus, ResourceType
from app.db.base import Base
from app.db.models.common import Created, Id, Json, TextValue, Time, choices


class SkillImportRun(Created, Base):
    __tablename__ = "skill_import_runs"
    id: Mapped[Id]
    fingerprint: Mapped[str] = mapped_column(unique=True)
    source_id: Mapped[UUID] = mapped_column(ForeignKey("curriculum_sources.id"))
    actor_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    permission_ref: Mapped[TextValue]
    configuration: Mapped[Json]
    status: Mapped[str] = mapped_column(default="queued")
    summary: Mapped[Json] = mapped_column(default=dict)
    finished_at: Mapped[Time | None]
    __table_args__ = (choices("status", JobStatus),)


class SkillImportChunk(Created, Base):
    __tablename__ = "skill_import_chunks"
    run_id: Mapped[UUID] = mapped_column(ForeignKey("skill_import_runs.id"), primary_key=True)
    chunk_id: Mapped[UUID] = mapped_column(primary_key=True)
    section_code: Mapped[str]
    request_digest: Mapped[str]
    status: Mapped[str] = mapped_column(default="queued")
    result: Mapped[Json | None]
    error_code: Mapped[str | None]
    __table_args__ = (choices("status", JobStatus),
                     CheckConstraint("status <> 'succeeded' OR result IS NOT NULL", name="completed_result"))


class SkillCandidateEvidence(Created, Base):
    __tablename__ = "skill_candidate_evidence"
    id: Mapped[Id]
    run_id: Mapped[UUID]
    chunk_id: Mapped[UUID]
    resource_type: Mapped[str]
    resource_id: Mapped[str]
    resource_version: Mapped[int]
    span_id: Mapped[UUID] = mapped_column(ForeignKey("source_spans.id"))
    evidence_kind: Mapped[str]
    rationale: Mapped[TextValue]
    __table_args__ = (
        ForeignKeyConstraint(["run_id", "chunk_id"],
                             ["skill_import_chunks.run_id", "skill_import_chunks.chunk_id"]),
        ForeignKeyConstraint(["resource_type", "resource_id", "resource_version"],
                             ["catalogue_revisions.resource_type", "catalogue_revisions.resource_id",
                              "catalogue_revisions.resource_version"]),
        UniqueConstraint("run_id", "chunk_id", "resource_type", "resource_id", "resource_version", "span_id"),
        choices("resource_type", ResourceType),
        choices("evidence_kind", ["direct_source", "ai_inferred"]),
        CheckConstraint("resource_version >= 1", name="positive_version"),
    )
