from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import AssessmentStage
from app.db.base import Base, utcnow
from app.db.models.common import Created, Id, TextValue, Time, Updated, choices


class AssessmentEvent(Base):
    __tablename__ = "assessment_events"
    evidence_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    attempt_id: Mapped[UUID | None]
    evaluation_id: Mapped[UUID | None]
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    outcome_id: Mapped[str | None]
    stage: Mapped[str | None]
    event_type: Mapped[str]
    task_validity: Mapped[str | None]
    observed_correctness: Mapped[float | None]
    independent: Mapped[bool | None]
    max_hint_level_used: Mapped[int] = mapped_column(default=0, server_default="0")
    solution_revealed: Mapped[bool] = mapped_column(default=False, server_default="false")
    student_confidence: Mapped[float | None]
    feedback: Mapped[TextValue | None]
    corrects_evidence_id: Mapped[UUID | None] = mapped_column(ForeignKey("assessment_events.evidence_id"))
    occurred_at: Mapped[Time] = mapped_column(default=utcnow)
    __table_args__ = (
        ForeignKeyConstraint(
            ["attempt_id", "student_id"], ["submissions.attempt_id", "submissions.student_id"]
        ),
        ForeignKeyConstraint(
            ["evaluation_id", "attempt_id"], ["evaluations.evaluation_id", "evaluations.attempt_id"]
        ),
        ForeignKeyConstraint(
            ["outcome_id", "skill_id"], ["learning_outcomes.outcome_id", "learning_outcomes.skill_id"]
        ),
        UniqueConstraint("evaluation_id", "outcome_id"),
        choices("stage", AssessmentStage),
        choices("task_validity", ["valid", "invalid", "uncertain"]),
        choices("event_type", ["assessment", "self_report", "assistance", "correction"]),
        CheckConstraint("observed_correctness BETWEEN 0 AND 1", name="correctness_range"),
        CheckConstraint("student_confidence BETWEEN 0 AND 1", name="confidence_range"),
        CheckConstraint("max_hint_level_used BETWEEN 0 AND 4", name="hint_range"),
        CheckConstraint(
            "independent IS NOT TRUE OR (solution_revealed = false AND max_hint_level_used = 0)",
            name="independent_unassisted",
        ),
        CheckConstraint(
            "event_type <> 'assessment' OR (evaluation_id IS NOT NULL AND attempt_id IS NOT NULL AND outcome_id IS NOT NULL AND stage IS NOT NULL AND task_validity IS NOT NULL)",
            name="objective_evidence_refs",
        ),
        CheckConstraint(
            "event_type = 'assessment' OR observed_correctness IS NULL", name="self_report_not_objective"
        ),
        CheckConstraint(
            "(event_type = 'correction') = (corrects_evidence_id IS NOT NULL)", name="correction_reference"
        ),
        Index("ix_assessment_student_skill_time", "student_id", "skill_id", "occurred_at"),
    )


class SkillEstimate(Base):
    __tablename__ = "skill_estimates"
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    policy_version: Mapped[str] = mapped_column(primary_key=True)
    recall_index: Mapped[float | None]
    understanding_index: Mapped[float | None]
    transfer_index: Mapped[float | None]
    gap_priority_index: Mapped[float | None]
    confidence_label: Mapped[str]
    evidence_count: Mapped[int]
    computed_at: Mapped[Time] = mapped_column(default=utcnow)
    __table_args__ = tuple(
        CheckConstraint(f"{col} BETWEEN 0 AND 1", name=f"{col}_range")
        for col in ["recall_index", "understanding_index", "transfer_index", "gap_priority_index"]
    ) + (
        CheckConstraint("evidence_count >= 0", name="nonnegative_evidence"),
        choices("confidence_label", ["insufficient", "low", "medium", "high"]),
    )


class GapHypothesis(Updated, Base):
    __tablename__ = "gap_hypotheses"
    id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    label: Mapped[TextValue]
    status: Mapped[str]
    policy_version: Mapped[str]
    __table_args__ = (choices("status", ["suspected", "supported", "disproven", "human_confirmed"]),)


class GapHypothesisEvidence(Base):
    __tablename__ = "gap_hypothesis_evidence"
    hypothesis_id: Mapped[UUID] = mapped_column(ForeignKey("gap_hypotheses.id"), primary_key=True)
    evidence_id: Mapped[UUID] = mapped_column(ForeignKey("assessment_events.evidence_id"), primary_key=True)
    relationship: Mapped[str]
    __table_args__ = (choices("relationship", ["supports", "disproves"]),)


class GapHypothesisHistory(Created, Base):
    __tablename__ = "gap_hypothesis_history"
    id: Mapped[Id]
    hypothesis_id: Mapped[UUID] = mapped_column(ForeignKey("gap_hypotheses.id"))
    previous_status: Mapped[str | None]
    new_status: Mapped[str]
    reason: Mapped[TextValue]
    reviewer_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (
        choices("previous_status", ["suspected", "supported", "disproven", "human_confirmed"]),
        choices("new_status", ["suspected", "supported", "disproven", "human_confirmed"]),
    )


class ReassessmentSchedule(Base):
    __tablename__ = "reassessment_schedules"
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    policy_version: Mapped[str] = mapped_column(primary_key=True)
    next_due_at: Mapped[Time | None]
    last_valid_independent_at: Mapped[Time | None]
    updated_at: Mapped[Time] = mapped_column(default=utcnow, onupdate=utcnow)
    __table_args__ = (
        Index("ix_reassess_due", "next_due_at", postgresql_where=text("next_due_at IS NOT NULL")),
    )
