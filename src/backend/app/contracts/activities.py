"""Student-safe task/project shapes from shared_contracts.md; private artifacts are separate."""

from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from app.contracts.enums import ActivityStatus, AssessmentStage, ReviewStatus
from app.contracts.identity import Contract
from app.contracts.reviews import NamespacedId


class Requirement(Contract):
    requirement_id: str
    description: str


class Parameter(Contract):
    name: str
    type: str


class FunctionContract(Contract):
    name: str
    parameters: list[Parameter]
    returns: str


class PublicExample(Contract):
    args: list
    expected: object


class TaskSpec(Contract):
    task_id: UUID
    task_version: int = Field(ge=1)
    activity_type: Literal["single_skill_exercise", "multi_skill_exercise"]
    title: str
    target_skill_ids: list[NamespacedId] = Field(min_length=1)
    outcome_ids: list[NamespacedId] = Field(min_length=1)
    assessment_stage: AssessmentStage
    language: Literal["python"] = "python"
    student_brief: str
    function_contract: FunctionContract | None = None
    requirements: list[Requirement] = Field(min_length=1)
    input_constraints: list[str] = Field(default_factory=list)
    public_examples: list[PublicExample] = Field(default_factory=list)
    explanation_questions: list[str] = Field(default_factory=list)
    verification_status: ActivityStatus
    human_review_status: ReviewStatus


class MilestoneSpec(Contract):
    milestone_id: str
    title: str
    depends_on: list[str]
    assessment_method: Literal["tests", "rubric", "mixed"]
    requirement_ids: list[str]
    public_rubric: list[dict] = Field(default_factory=list)


class ProjectSpec(Contract):
    project_id: UUID
    project_version: int = Field(ge=1)
    title: str
    target_skill_ids: list[NamespacedId] = Field(min_length=1)
    engineering_outcome_ids: list[NamespacedId] = Field(default_factory=list)
    student_brief: str
    milestones: list[MilestoneSpec] = Field(min_length=1)
    verification_status: ActivityStatus
    human_review_status: ReviewStatus

    @model_validator(mode="after")
    def check_milestones(self):
        from app.core.errors import ValidationError
        from app.modules.skill_generation.relation_validator import validate_acyclic

        ids = [item.milestone_id for item in self.milestones]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate milestone ID")
        edges = [(item.milestone_id, parent) for item in self.milestones for parent in item.depends_on]
        if any(parent not in ids for _, parent in edges):
            raise ValueError("Unknown milestone dependency")
        try:
            validate_acyclic(edges)
        except ValidationError as exc:
            raise ValueError(str(exc)) from exc
        return self
