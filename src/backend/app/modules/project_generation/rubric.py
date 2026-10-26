
"""Private qualitative rubric candidates for project milestones."""

from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.modules.project_generation.spec import ProjectSpecSchema


class ProjectRubricError(RuntimeError):
    """A milestone rubric could not be generated safely."""


class RubricLevel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    level: Literal[1, 2, 3, 4]
    description: str = Field(min_length=1)


class RubricCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    requirement_id: str = Field(min_length=1)
    observable_evidence: str = Field(min_length=1)
    acceptable_alternatives: list[str] = Field(min_length=1)
    levels: list[RubricLevel] = Field(min_length=4, max_length=4)
    cannot_determine_when: str = Field(min_length=1)


class MilestoneRubricSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    criteria: list[RubricCriterion] = Field(min_length=1)


class ProjectRubricGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def generate_milestone_rubric(
    project: dict[str, Any],
    milestone_id: str,
    gateway: ProjectRubricGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate an unverified, private qualitative milestone rubric."""

    try:
        spec = ProjectSpecSchema.model_validate(project)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectRubricError(
            "Invalid project specification"
        ) from error

    milestone = next(
        (
            item for item in spec.milestones
            if item.milestone_id == milestone_id
        ),
        None,
    )

    if milestone is None:
        raise ProjectRubricError("Unknown milestone ID")

    if milestone.assessment_method not in {"rubric", "mixed"}:
        raise ProjectRubricError(
            "Milestone does not permit rubric assessment"
        )

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "project"
        / "rubric_v1.txt"
    )

    try:
        prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ProjectRubricError(
            "Project rubric prompt is unavailable"
        ) from error

    try:
        raw = await gateway.generate_json(
            operation="project_milestone_rubric_generation",
            model_alias=model_alias,
            system_prompt=prompt,
            payload={
                "project_spec": spec.model_dump(),
                "milestone_id": milestone_id,
                "requirement_ids": milestone.requirement_ids,
            },
            schema=MilestoneRubricSchema,
        )
    except Exception as error:
        raise ProjectRubricError(
            "AI gateway failed during rubric generation"
        ) from error

    try:
        rubric = MilestoneRubricSchema.model_validate(raw)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectRubricError(
            "Invalid milestone rubric candidate"
        ) from error

    expected = set(milestone.requirement_ids)
    criterion_ids = [
        criterion.requirement_id for criterion in rubric.criteria
    ]

    if set(criterion_ids) != expected:
        raise ProjectRubricError(
            "Rubric must cover exactly the milestone requirements"
        )

    if len(criterion_ids) != len(expected):
        raise ProjectRubricError(
            "Duplicate rubric requirement criteria"
        )

    for criterion in rubric.criteria:
        level_numbers = [level.level for level in criterion.levels]

        if sorted(level_numbers) != [1, 2, 3, 4]:
            raise ProjectRubricError(
                "Each criterion must have four distinct rubric levels"
            )

    return rubric.model_dump()
