from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import ApprovalStatus, AssessmentStage, ResourceType
from app.db.base import Base, utcnow
from app.db.models.common import Created, Id, Json, JsonList, TextValue, Time, Updated, choices


class CurriculumSource(Created, Base):
    __tablename__ = "curriculum_sources"
    id: Mapped[Id]
    source_kind: Mapped[str]
    uri: Mapped[TextValue]
    section: Mapped[str | None]
    edition: Mapped[str | None]
    checksum: Mapped[str] = mapped_column(unique=True)
    rights_status: Mapped[str]
    extraction_model: Mapped[str | None]
    fetched_at: Mapped[Time] = mapped_column(default=utcnow)
    __table_args__ = (
        choices("source_kind", ["cs2023", "course_material", "exercise", "instructor", "ai_proposed"]),
        choices("rights_status", ["pending", "permitted", "restricted"]),
    )


class SourceSpan(Created, Base):
    __tablename__ = "source_spans"
    id: Mapped[Id]
    source_id: Mapped[UUID] = mapped_column(ForeignKey("curriculum_sources.id"))
    section: Mapped[str | None]
    page: Mapped[int | None]
    locator: Mapped[Json]
    permitted_excerpt: Mapped[TextValue | None]
    checksum: Mapped[str]
    __table_args__ = (
        UniqueConstraint("source_id", "checksum"),
        CheckConstraint("page IS NULL OR page >= 1", name="positive_page"),
    )


class Skill(Updated, Base):
    __tablename__ = "skills"
    skill_id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    description: Mapped[TextValue]
    source_id: Mapped[UUID] = mapped_column(ForeignKey("curriculum_sources.id"))
    source_refs: Mapped[JsonList]
    approval_status: Mapped[str]
    resource_version: Mapped[int]
    __table_args__ = (
        choices("approval_status", ApprovalStatus),
        CheckConstraint("resource_version >= 1", name="positive_version"),
    )


class SkillRelation(Updated, Base):
    __tablename__ = "skill_relations"
    relation_id: Mapped[Id]
    from_skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    to_skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    relation: Mapped[str]
    approval_status: Mapped[str]
    resource_version: Mapped[int]
    evidence_ref: Mapped[str | None]
    __table_args__ = (
        choices("relation", ["requires", "part_of", "related_to"]),
        choices("approval_status", ApprovalStatus),
        CheckConstraint("from_skill_id <> to_skill_id", name="not_self_relation"),
        CheckConstraint("resource_version >= 1", name="positive_version"),
        UniqueConstraint("from_skill_id", "to_skill_id", "relation"),
        Index("ix_relations_source_type", "from_skill_id", "relation", "approval_status"),
    )


class LearningOutcome(Updated, Base):
    __tablename__ = "learning_outcomes"
    outcome_id: Mapped[str] = mapped_column(primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    assessment_stage: Mapped[str]
    observable_action: Mapped[TextValue]
    success_criteria: Mapped[JsonList]
    source_refs: Mapped[JsonList]
    approval_status: Mapped[str]
    resource_version: Mapped[int]
    __table_args__ = (
        choices("assessment_stage", AssessmentStage),
        choices("approval_status", ApprovalStatus),
        CheckConstraint("resource_version >= 1", name="positive_version"),
        UniqueConstraint("outcome_id", "skill_id"),
    )


class SkillAlias(Created, Base):
    __tablename__ = "skill_aliases"
    id: Mapped[Id]
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"))
    alias: Mapped[str]
    source_id: Mapped[UUID | None] = mapped_column(ForeignKey("curriculum_sources.id"))
    approval_status: Mapped[str]
    __table_args__ = (UniqueConstraint("skill_id", "alias"), choices("approval_status", ApprovalStatus))


class CourseSkill(Base):
    __tablename__ = "course_skills"
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    skill_id: Mapped[str] = mapped_column(ForeignKey("skills.skill_id"), primary_key=True)
    taught_week: Mapped[int | None]
    availability: Mapped[str]
    approval_status: Mapped[str]
    __table_args__ = (
        choices("availability", ["available", "planned", "unavailable"]),
        choices("approval_status", ApprovalStatus),
        CheckConstraint("taught_week IS NULL OR taught_week >= 1", name="positive_week"),
    )


class CatalogueRevision(Created, Base):
    __tablename__ = "catalogue_revisions"
    resource_type: Mapped[str] = mapped_column(primary_key=True)
    resource_id: Mapped[str] = mapped_column(primary_key=True)
    resource_version: Mapped[int] = mapped_column(primary_key=True)
    approval_status: Mapped[str]
    payload: Mapped[Json]
    checksum: Mapped[str]
    source_id: Mapped[UUID] = mapped_column(ForeignKey("curriculum_sources.id"))
    created_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    __table_args__ = (
        choices("resource_type", ResourceType),
        choices("approval_status", ApprovalStatus),
        CheckConstraint("resource_version >= 1", name="positive_version"),
        Index("ix_catalogue_pending", "approval_status", "created_at", "resource_id"),
    )


class GraphVersion(Base):
    __tablename__ = "graph_versions"
    graph_version: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    checksum: Mapped[str]
    published_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[Time] = mapped_column(default=utcnow)


class GraphMember(Base):
    __tablename__ = "graph_members"
    graph_version: Mapped[int] = mapped_column(ForeignKey("graph_versions.graph_version"), primary_key=True)
    resource_type: Mapped[str] = mapped_column(primary_key=True)
    resource_id: Mapped[str] = mapped_column(primary_key=True)
    resource_version: Mapped[int]
    __table_args__ = (
        ForeignKeyConstraint(
            ["resource_type", "resource_id", "resource_version"],
            [
                "catalogue_revisions.resource_type",
                "catalogue_revisions.resource_id",
                "catalogue_revisions.resource_version",
            ],
        ),
    )


class ReviewDecision(Base):
    __tablename__ = "review_decisions"
    review_id: Mapped[Id]
    resource_type: Mapped[str]
    resource_id: Mapped[str]
    resource_version: Mapped[int]
    reviewer_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str]
    reason: Mapped[TextValue]
    evidence_refs: Mapped[JsonList] = mapped_column(default=list)
    decided_at: Mapped[Time] = mapped_column(default=utcnow)
    __table_args__ = (
        ForeignKeyConstraint(
            ["resource_type", "resource_id", "resource_version"],
            [
                "catalogue_revisions.resource_type",
                "catalogue_revisions.resource_id",
                "catalogue_revisions.resource_version",
            ],
        ),
        UniqueConstraint("resource_type", "resource_id", "resource_version"),
        choices("decision", ["approved", "rejected"]),
    )
