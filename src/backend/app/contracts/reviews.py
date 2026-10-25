from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.contracts.enums import ApprovalStatus, AssessmentStage, ResourceType
from app.contracts.identity import Contract

NamespacedId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$", max_length=200)]


class SourceRef(Contract):
    uri: str = Field(min_length=1, max_length=2048)
    section: str | None = None
    page: int | None = Field(default=None, ge=1)


class Outcome(Contract):
    outcome_id: NamespacedId
    skill_id: NamespacedId
    assessment_stage: AssessmentStage
    observable_action: str = Field(min_length=1, max_length=2000)
    success_criteria: list[str] = Field(min_length=1)
    source_refs: list[SourceRef] = Field(min_length=1)
    approval_status: ApprovalStatus = ApprovalStatus.proposed


class Skill(Contract):
    skill_id: NamespacedId
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=4000)
    source_kind: Literal["cs2023", "course_material", "exercise", "instructor", "ai_proposed"]
    source_refs: list[SourceRef] = Field(min_length=1)
    approval_status: ApprovalStatus = ApprovalStatus.proposed
    # Outcomes are separately reviewed resources, never implicitly approved with a skill.
    outcomes: list[Outcome] = Field(default_factory=list)


class SkillRelation(Contract):
    from_skill_id: NamespacedId
    to_skill_id: NamespacedId
    relation: Literal["requires", "part_of", "related_to"]
    approval_status: ApprovalStatus = ApprovalStatus.proposed
    evidence_ref: str | None = None


CANDIDATE_SCHEMAS = {
    ResourceType.skill: Skill,
    ResourceType.relation: SkillRelation,
    ResourceType.outcome: Outcome,
}


def validate_candidate(resource_type: ResourceType, resource_id: str, payload: dict) -> dict:
    candidate = CANDIDATE_SCHEMAS[resource_type].model_validate(payload)
    if resource_type == ResourceType.skill and candidate.outcomes:
        raise ValueError("Submit outcomes as separately reviewed resources")
    data = candidate.model_dump(mode="json")
    if resource_type == ResourceType.relation:
        UUID(resource_id)
    elif data[f"{resource_type.value}_id"] != resource_id:
        raise ValueError("Candidate ID does not match resource ID")
    return data


class ReviewDecisionCreate(Contract):
    resource_version: int = Field(ge=1)
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=1, max_length=4000, pattern=r"\S")


class ReviewDecision(Contract):
    review_id: UUID
    decision: Literal["approved", "rejected"]
    decided_at: datetime


class ReviewHistoryItem(ReviewDecision):
    resource_version: int
    reviewer_id: UUID
    reason: str


class ReviewQueueItem(Contract):
    resource_type: ResourceType
    resource_id: str
    resource_version: int
    approval_status: ApprovalStatus
    title: str
    created_at: datetime


class ReviewQueue(Contract):
    items: list[ReviewQueueItem]
    next_cursor: str | None


class ReviewDetail(ReviewQueueItem):
    payload: Skill | SkillRelation | Outcome
    source: dict
    validation_errors: list[str]
    evidence: list["ReviewEvidence"] = Field(default_factory=list)


class ReviewEvidence(Contract):
    run_id: UUID
    chunk_id: UUID
    span_id: UUID
    evidence_kind: Literal["direct_source", "ai_inferred"]
    rationale: str
    section: str | None
    page: int | None
    locator: dict
    excerpt: str | None
    review_flags: list[str] = Field(default_factory=list)


class ReviewHistory(Contract):
    items: list[ReviewHistoryItem]
