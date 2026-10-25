from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import AssessmentStage, JobStatus
from app.db.base import Base, utcnow
from app.db.models.common import Created, Id, Json, JsonList, TextValue, Time, choices


class GenerationJob(Created, Base):
    __tablename__ = "generation_jobs"
    job_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    request_id: Mapped[UUID]
    kind: Mapped[str]
    status: Mapped[str] = mapped_column(default="queued", server_default="queued")
    request_payload: Mapped[Json]
    generation_policy_version: Mapped[str]
    model_version: Mapped[str | None]
    prompt_version: Mapped[str]
    attempt_count: Mapped[int] = mapped_column(default=0, server_default="0")
    cancel_requested_at: Mapped[Time | None]
    resource_id: Mapped[UUID | None]
    resource_version: Mapped[int | None]
    error_code: Mapped[str | None]
    review_reason: Mapped[str | None]
    started_at: Mapped[Time | None]
    finished_at: Mapped[Time | None]
    __table_args__ = (
        choices("status", JobStatus),
        UniqueConstraint("student_id", "request_id", "generation_policy_version"),
        ForeignKeyConstraint(["resource_id", "resource_version"], ["activities.id", "activities.version"]),
        CheckConstraint("(resource_id IS NULL) = (resource_version IS NULL)", name="resource_selector_pair"),
        CheckConstraint("attempt_count >= 0", name="nonnegative_attempts"),
        Index("ix_jobs_status_time", "status", "created_at"),
    )


class Submission(Created, Base):
    __tablename__ = "submissions"
    attempt_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    activity_id: Mapped[UUID]
    activity_version: Mapped[int]
    milestone_id: Mapped[str | None]
    assessment_stage: Mapped[str]
    source_code_ref: Mapped[TextValue | None]
    answer_text: Mapped[TextValue | None]
    explanation: Mapped[TextValue | None]
    idempotency_key: Mapped[str]
    __table_args__ = (
        ForeignKeyConstraint(
            ["activity_id", "activity_version", "student_id"],
            ["activities.id", "activities.version", "activities.student_id"],
        ),
        ForeignKeyConstraint(
            ["activity_id", "activity_version", "milestone_id"],
            [
                "project_milestones.project_id",
                "project_milestones.project_version",
                "project_milestones.milestone_id",
            ],
        ),
        UniqueConstraint("student_id", "idempotency_key"),
        UniqueConstraint("attempt_id", "activity_id", "activity_version"),
        UniqueConstraint("attempt_id", "student_id"),
        choices("assessment_stage", AssessmentStage),
        CheckConstraint("(source_code_ref IS NULL) <> (answer_text IS NULL)", name="one_response_mode"),
        CheckConstraint(
            "assessment_stage = 'transfer' OR source_code_ref IS NULL", name="code_only_for_transfer"
        ),
    )


class Evaluation(Created, Base):
    __tablename__ = "evaluations"
    evaluation_id: Mapped[Id]
    attempt_id: Mapped[UUID]
    evaluation_version: Mapped[int]
    # Repeated target keys let Postgres verify that the artifact belongs to this attempt's exact version.
    activity_id: Mapped[UUID]
    activity_version: Mapped[int]
    artifact_id: Mapped[UUID | None]
    artifact_version: Mapped[int | None]
    grader_identity: Mapped[str]
    grading_validity: Mapped[str]
    passed_count: Mapped[int | None]
    total_count: Mapped[int | None]
    private_result: Mapped[Json]
    student_safe_result: Mapped[Json]
    __table_args__ = (
        ForeignKeyConstraint(
            ["attempt_id", "activity_id", "activity_version"],
            ["submissions.attempt_id", "submissions.activity_id", "submissions.activity_version"],
        ),
        ForeignKeyConstraint(
            ["artifact_id", "artifact_version", "activity_id", "activity_version"],
            [
                "grading_artifacts.artifact_id",
                "grading_artifacts.artifact_version",
                "grading_artifacts.activity_id",
                "grading_artifacts.activity_version",
            ],
        ),
        UniqueConstraint("attempt_id", "evaluation_version"),
        UniqueConstraint("evaluation_id", "attempt_id"),
        choices("grading_validity", ["valid", "invalid", "uncertain"]),
        CheckConstraint("evaluation_version >= 1", name="positive_version"),
        CheckConstraint("(artifact_id IS NULL) = (artifact_version IS NULL)", name="artifact_pair"),
        CheckConstraint(
            "(passed_count IS NULL AND total_count IS NULL) OR (passed_count IS NOT NULL AND total_count IS NOT NULL AND passed_count >= 0 AND total_count >= passed_count)",
            name="test_counts",
        ),
    )


class HintEvent(Created, Base):
    __tablename__ = "hint_events"
    hint_id: Mapped[Id]
    attempt_id: Mapped[UUID] = mapped_column(ForeignKey("submissions.attempt_id"))
    level: Mapped[int]
    hint_text: Mapped[TextValue]
    student_action: Mapped[TextValue]
    grounded_failure_ids: Mapped[JsonList]
    quality_status: Mapped[str]
    solution_revealed: Mapped[bool]
    __table_args__ = (
        CheckConstraint("level BETWEEN 1 AND 4", name="hint_level"),
        CheckConstraint(
            "solution_revealed = (level = 4 AND quality_status = 'accepted')", name="reveal_at_level_four"
        ),
        choices("quality_status", ["accepted", "rejected", "review_required"]),
        Index("ix_hints_attempt_level", "attempt_id", "level"),
    )


class OutboxMessage(Created, Base):
    __tablename__ = "outbox_messages"
    id: Mapped[Id]
    event_type: Mapped[str]
    aggregate_id: Mapped[str]
    payload: Mapped[Json]
    deduplication_key: Mapped[str] = mapped_column(unique=True)
    available_at: Mapped[Time] = mapped_column(default=utcnow)
    claimed_at: Mapped[Time | None]
    processed_at: Mapped[Time | None]
    attempt_count: Mapped[int] = mapped_column(default=0, server_default="0")
    last_error_code: Mapped[str | None]
    __table_args__ = (Index("ix_outbox_pending", "processed_at", "available_at"),)
