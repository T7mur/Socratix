from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import Created, Id, Json, TextValue, Time, choices


class StudentPlan(Created, Base):
    __tablename__ = "student_plans"
    plan_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    text: Mapped[TextValue]
    time_horizon: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True, server_default="true")
    confirmed_at: Mapped[Time | None]
    __table_args__ = (choices("time_horizon", ["day", "week", "month", "term"]),)


class PlanSkillTag(Base):
    __tablename__ = "plan_skill_tags"
    plan_id: Mapped[UUID] = mapped_column(ForeignKey("student_plans.plan_id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    confirmation_state: Mapped[str]
    confidence_label: Mapped[str | None]
    reason: Mapped[TextValue | None]
    provenance: Mapped[Json]
    confirmed_at: Mapped[Time | None]
    __table_args__ = (choices("confirmation_state", ["candidate", "confirmed", "rejected"]),)


class Reflection(Created, Base):
    __tablename__ = "reflections"
    reflection_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    activity_id: Mapped[UUID | None]
    activity_version: Mapped[int | None]
    attempt_id: Mapped[UUID | None]
    reflection_text: Mapped[TextValue]
    reported_confidence: Mapped[float | None]
    self_reported_difficulty: Mapped[str | None]
    privacy: Mapped[str] = mapped_column(default="private", server_default="private")
    allow_use_as_learning_evidence: Mapped[bool] = mapped_column(default=False, server_default="false")
    confirmed_at: Mapped[Time | None]
    __table_args__ = (
        ForeignKeyConstraint(
            ["activity_id", "activity_version", "student_id"],
            ["activities.id", "activities.version", "activities.student_id"],
        ),
        ForeignKeyConstraint(
            ["attempt_id", "student_id"], ["submissions.attempt_id", "submissions.student_id"]
        ),
        ForeignKeyConstraint(
            ["attempt_id", "activity_id", "activity_version"],
            ["submissions.attempt_id", "submissions.activity_id", "submissions.activity_version"],
        ),
        CheckConstraint("(activity_id IS NULL) = (activity_version IS NULL)", name="activity_pair"),
        CheckConstraint("attempt_id IS NULL OR activity_id IS NOT NULL", name="attempt_target"),
        CheckConstraint("reported_confidence BETWEEN 0 AND 1", name="confidence_range"),
        choices("privacy", ["private"]),
    )


class ReflectionSkillTag(Base):
    __tablename__ = "reflection_skill_tags"
    reflection_id: Mapped[UUID] = mapped_column(ForeignKey("reflections.reflection_id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    confirmation_state: Mapped[str]
    confidence_label: Mapped[str | None]
    reason: Mapped[TextValue | None]
    confirmed_at: Mapped[Time | None]
    __table_args__ = (choices("confirmation_state", ["candidate", "confirmed", "rejected"]),)
