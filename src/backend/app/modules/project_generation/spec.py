
"""ProjectSpec validation for Socratix Component C."""

from collections.abc import Collection, Mapping
from typing import Any
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
)


class ProjectValidationError(ValueError):
    """A project specification violates the agreed contract."""


class MilestoneSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    milestone_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    depends_on: list[str]
    assessment_method: str
    requirement_ids: list[str] = Field(min_length=1)


class ProjectSpecSchema(BaseModel):
    """The public ProjectSpec fields from shared_contracts.md v1.0."""

    model_config = ConfigDict(extra="forbid", strict=True)

    contract_version: str
    project_id: str
    project_version: int = Field(ge=1)
    title: str = Field(min_length=1)
    target_skill_ids: list[str] = Field(min_length=2)
    engineering_outcome_ids: list[str] = Field(min_length=1)
    student_brief: str = Field(min_length=1)
    milestones: list[MilestoneSchema] = Field(min_length=2)
    verification_status: str
    human_review_status: str


VALID_ASSESSMENT_METHODS = {"tests", "rubric", "mixed"}

VALID_VERIFICATION_STATUSES = {
    "draft",
    "verifying",
    "review_required",
    "verified",
    "published",
    "rejected",
    "archived",
}

VALID_REVIEW_STATUSES = {
    "not_required",
    "pending",
    "approved",
    "rejected",
}


def _check_unique(values: list[str], label: str) -> None:
    if len(values) != len(set(values)):
        raise ProjectValidationError(
            f"Duplicate {label} are not permitted"
        )


def validate_project_spec(
    project: Mapping[str, Any],
    *,
    approved_skill_ids: Collection[str],
    approved_engineering_outcome_ids: Collection[str],
) -> dict[str, Any]:
    """Validate a ProjectSpec against trusted approved identifiers.

    The approved identifier collections must come from the backend's
    curriculum services, never directly from student input.

    This checks the canonical DTO structure and milestone dependency
    rules. Semantic project quality is assessed separately.
    """

    try:
        spec = ProjectSpecSchema.model_validate(project)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectValidationError(
            "Invalid ProjectSpec structure"
        ) from error

    if spec.contract_version != "1.0":
        raise ProjectValidationError(
            "Unsupported contract version"
        )

    try:
        UUID(spec.project_id)
    except (ValueError, AttributeError) as error:
        raise ProjectValidationError(
            "project_id must be a UUID"
        ) from error

    if spec.verification_status not in VALID_VERIFICATION_STATUSES:
        raise ProjectValidationError(
            "Invalid verification status"
        )

    if spec.human_review_status not in VALID_REVIEW_STATUSES:
        raise ProjectValidationError(
            "Invalid human review status"
        )

    _check_unique(spec.target_skill_ids, "target skills")
    _check_unique(
        spec.engineering_outcome_ids,
        "engineering outcomes",
    )

    approved_skills = set(approved_skill_ids)
    approved_engineering = set(approved_engineering_outcome_ids)

    if not set(spec.target_skill_ids).issubset(approved_skills):
        raise ProjectValidationError(
            "Project contains unapproved target skills"
        )

    if not set(spec.engineering_outcome_ids).issubset(
        approved_engineering
    ):
        raise ProjectValidationError(
            "Project contains unapproved engineering outcomes"
        )

    milestone_ids = [
        milestone.milestone_id
        for milestone in spec.milestones
    ]

    _check_unique(milestone_ids, "milestone IDs")

    # Milestones must be provided in dependency order.
    # This also prevents cycles and forward references.
    seen_milestones: set[str] = set()

    for milestone in spec.milestones:
        if milestone.assessment_method not in VALID_ASSESSMENT_METHODS:
            raise ProjectValidationError(
                f"Invalid assessment method in {milestone.milestone_id}"
            )

        _check_unique(
            milestone.depends_on,
            f"dependencies for {milestone.milestone_id}",
        )

        _check_unique(
            milestone.requirement_ids,
            f"requirements for {milestone.milestone_id}",
        )

        if any(
            not requirement_id.strip()
            for requirement_id in milestone.requirement_ids
        ):
            raise ProjectValidationError(
                "Requirement IDs must not be empty"
            )

        for dependency in milestone.depends_on:
            if dependency not in seen_milestones:
                raise ProjectValidationError(
                    f"Invalid or forward dependency: {dependency}"
                )

        seen_milestones.add(milestone.milestone_id)

    return spec.model_dump()


async def generate_project_spec_async(
    brief: Mapping[str, Any],
    *,
    approved_skill_ids: Collection[str],
    approved_engineering_outcome_ids: Collection[str],
    gateway: Any,
    model_alias: str,
) -> dict[str, Any]:
    """Generate and validate a draft ProjectSpec.

    Approved IDs must come from trusted backend curriculum data.
    The result is only a candidate, not a verified or published project.
    """
    from pathlib import Path

    if brief.get("activity_type") != "project":
        raise ProjectValidationError(
            "GenerationBrief must request a project"
        )

    requested_skills = brief.get("target_skill_ids")
    allowed_skills = brief.get("allowed_skill_ids")
    excluded_skills = brief.get("excluded_skill_ids")

    if not isinstance(requested_skills, list) or not requested_skills:
        raise ProjectValidationError(
            "GenerationBrief requires target_skill_ids"
        )

    if not isinstance(allowed_skills, list):
        raise ProjectValidationError(
            "GenerationBrief requires allowed_skill_ids"
        )

    if not isinstance(excluded_skills, list):
        raise ProjectValidationError(
            "GenerationBrief requires excluded_skill_ids"
        )

    for values in (requested_skills, allowed_skills, excluded_skills):
        if not all(isinstance(value, str) for value in values):
            raise ProjectValidationError(
                "Skill identifiers must be strings"
            )

    approved = set(approved_skill_ids)
    allowed = set(allowed_skills)
    excluded = set(excluded_skills)
    requested = set(requested_skills)

    if not requested.issubset(approved):
        raise ProjectValidationError(
            "GenerationBrief contains unapproved target skills"
        )

    if not requested.issubset(allowed):
        raise ProjectValidationError(
            "Target skills must be allowed"
        )

    if requested & excluded:
        raise ProjectValidationError(
            "Target skills cannot be excluded"
        )

    # Student-provided allowed IDs do not grant curriculum approval.
    trusted_permitted = approved & allowed - excluded

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "project"
        / "spec_v1.txt"
    )

    try:
        prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ProjectValidationError(
            "Project specification prompt is unavailable"
        ) from error

    try:
        raw = await gateway.generate_json(
            operation="project_spec_generation",
            model_alias=model_alias,
            system_prompt=prompt,
            payload={
                "generation_brief": dict(brief),
                "approved_skill_ids": sorted(trusted_permitted),
                "approved_engineering_outcome_ids": sorted(
                    set(approved_engineering_outcome_ids)
                ),
            },
            schema=ProjectSpecSchema,
        )
    except Exception as error:
        raise ProjectValidationError(
            "AI gateway failed during project generation"
        ) from error

    project = validate_project_spec(
        raw,
        approved_skill_ids=trusted_permitted,
        approved_engineering_outcome_ids=(
            approved_engineering_outcome_ids
        ),
    )
    from app.modules.project_generation.milestones import (
        validate_milestone_plan,
    )

    validate_milestone_plan(project)
    generated_skills = set(project["target_skill_ids"])

    if not requested.issubset(generated_skills):
        raise ProjectValidationError(
            "Generated project omitted requested target skills"
        )

    if project["verification_status"] != "draft":
        raise ProjectValidationError(
            "Generated projects must start as drafts"
        )

    if project["human_review_status"] not in {
        "pending", "not_required"
    }:
        raise ProjectValidationError(
            "AI cannot approve human review"
        )

    return project
