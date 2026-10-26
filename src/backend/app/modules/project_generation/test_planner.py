
"""Private executable assessment candidates for project milestones."""

from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.modules.project_generation.spec import ProjectSpecSchema


class ProjectTestPlanningError(RuntimeError):
    """Milestone test planning could not complete safely."""


class MilestoneTestCase(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    requirement_id: str = Field(min_length=1)
    actions: list[str] = Field(min_length=1)
    expected_result: str = Field(min_length=1)
    category: Literal[
        "normal", "boundary", "invalid", "stateful", "regression"
    ]
    invariant: str | None = None


class MilestoneTestCandidateSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    test_cases: list[MilestoneTestCase] = Field(min_length=1)


class ProjectTestGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def generate_milestone_test_candidates(
    project: dict[str, Any],
    milestone_id: str,
    gateway: ProjectTestGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate private test specifications for one milestone.

    These are candidates, not verified executable tests.
    """
    try:
        spec = ProjectSpecSchema.model_validate(project)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectTestPlanningError(
            "Invalid project specification"
        ) from error

    milestone = next(
        (
            item
            for item in spec.milestones
            if item.milestone_id == milestone_id
        ),
        None,
    )

    if milestone is None:
        raise ProjectTestPlanningError("Unknown milestone ID")

    if milestone.assessment_method not in {"tests", "mixed"}:
        raise ProjectTestPlanningError(
            "Milestone does not permit executable tests"
        )

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "project"
        / "tests_v1.txt"
    )

    try:
        prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ProjectTestPlanningError(
            "Project test prompt is unavailable"
        ) from error

    try:
        raw = await gateway.generate_json(
            operation="project_milestone_test_generation",
            model_alias=model_alias,
            system_prompt=prompt,
            payload={
                "project_spec": spec.model_dump(),
                "milestone_id": milestone_id,
                "requirement_ids": milestone.requirement_ids,
            },
            schema=MilestoneTestCandidateSchema,
        )
    except Exception as error:
        raise ProjectTestPlanningError(
            "AI gateway failed during milestone test generation"
        ) from error

    try:
        candidate = MilestoneTestCandidateSchema.model_validate(raw)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectTestPlanningError(
            "Invalid milestone test candidate"
        ) from error

    required = set(milestone.requirement_ids)
    covered = {
        case.requirement_id
        for case in candidate.test_cases
    }

    if covered != required:
        raise ProjectTestPlanningError(
            "Test candidates must cover exactly the milestone requirements"
        )

    for case in candidate.test_cases:
        if case.category == "stateful" and not case.invariant:
            raise ProjectTestPlanningError(
                "Stateful tests must specify an invariant"
            )

    return candidate.model_dump()
