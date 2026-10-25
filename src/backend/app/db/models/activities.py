from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import ActivityStatus, ActivityType, ReviewStatus
from app.db.base import Base
from app.db.models.common import Created, Json, JsonList, TextValue, Time, choices


class Activity(Created, Base):
    __tablename__ = "activities"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    activity_type: Mapped[str]
    status: Mapped[str] = mapped_column(default="draft", server_default="draft")
    human_review_status: Mapped[str] = mapped_column(default="pending", server_default="pending")
    student_safe_spec: Mapped[Json]
    spec_checksum: Mapped[str]
    generation_policy_version: Mapped[str]
    graph_version: Mapped[int] = mapped_column(ForeignKey("graph_versions.graph_version"))
    frozen_at: Mapped[Time | None]
    published_at: Mapped[Time | None]
    __table_args__ = (
        choices("activity_type", ActivityType),
        choices("status", ActivityStatus),
        choices("human_review_status", ReviewStatus),
        CheckConstraint("version >= 1", name="positive_version"),
        UniqueConstraint("id", "version", "student_id"),
        CheckConstraint(
            "status NOT IN ('verifying','verified','published') OR frozen_at IS NOT NULL",
            name="frozen_before_verification",
        ),
        CheckConstraint(
            "status <> 'published' OR human_review_status IN ('approved','not_required')",
            name="publication_review_gate",
        ),
    )


class ActivitySkill(Base):
    __tablename__ = "activity_skills"
    activity_id: Mapped[UUID] = mapped_column(primary_key=True)
    activity_version: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    __table_args__ = (
        ForeignKeyConstraint(["activity_id", "activity_version"], ["activities.id", "activities.version"]),
    )


class ActivityOutcome(Base):
    __tablename__ = "activity_outcomes"
    activity_id: Mapped[UUID] = mapped_column(primary_key=True)
    activity_version: Mapped[int] = mapped_column(primary_key=True)
    outcome_id: Mapped[str] = mapped_column(ForeignKey("learning_outcomes.outcome_id"), primary_key=True)
    outcome_role: Mapped[str]
    __table_args__ = (
        ForeignKeyConstraint(["activity_id", "activity_version"], ["activities.id", "activities.version"]),
        choices("outcome_role", ["target", "engineering"]),
    )


class Project(Base):
    __tablename__ = "projects"
    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    project_version: Mapped[int] = mapped_column(primary_key=True)
    project_policy_version: Mapped[str]
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "project_version"], ["activities.id", "activities.version"]),
    )


class ProjectMilestone(Base):
    __tablename__ = "project_milestones"
    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    project_version: Mapped[int] = mapped_column(primary_key=True)
    milestone_id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    assessment_method: Mapped[str]
    requirements: Mapped[JsonList]
    public_rubric: Mapped[JsonList]
    sequence: Mapped[int]
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "project_version"], ["projects.project_id", "projects.project_version"]
        ),
        choices("assessment_method", ["tests", "rubric", "mixed"]),
        CheckConstraint("sequence >= 1", name="positive_sequence"),
    )


class MilestoneDependency(Base):
    __tablename__ = "project_milestone_dependencies"
    project_id: Mapped[UUID] = mapped_column(primary_key=True)
    project_version: Mapped[int] = mapped_column(primary_key=True)
    milestone_id: Mapped[str] = mapped_column(primary_key=True)
    depends_on_milestone_id: Mapped[str] = mapped_column(primary_key=True)
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "project_version", "milestone_id"],
            [
                "project_milestones.project_id",
                "project_milestones.project_version",
                "project_milestones.milestone_id",
            ],
        ),
        ForeignKeyConstraint(
            ["project_id", "project_version", "depends_on_milestone_id"],
            [
                "project_milestones.project_id",
                "project_milestones.project_version",
                "project_milestones.milestone_id",
            ],
            name="fk_milestone_dependency_parent",
        ),
        CheckConstraint("milestone_id <> depends_on_milestone_id", name="not_self_dependency"),
    )


class GradingArtifact(Created, Base):
    __tablename__ = "grading_artifacts"
    artifact_id: Mapped[UUID] = mapped_column(primary_key=True)
    artifact_version: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[UUID]
    activity_version: Mapped[int]
    milestone_id: Mapped[str | None]
    reference_solution_ref: Mapped[TextValue | None]
    hidden_test_suite_ref: Mapped[TextValue | None]
    verification_report_ref: Mapped[TextValue]
    fingerprint: Mapped[str]
    __table_args__ = (
        ForeignKeyConstraint(["activity_id", "activity_version"], ["activities.id", "activities.version"]),
        ForeignKeyConstraint(
            ["activity_id", "activity_version", "milestone_id"],
            [
                "project_milestones.project_id",
                "project_milestones.project_version",
                "project_milestones.milestone_id",
            ],
        ),
        UniqueConstraint("artifact_id", "artifact_version", "activity_id", "activity_version"),
        CheckConstraint("artifact_version >= 1", name="positive_version"),
    )
