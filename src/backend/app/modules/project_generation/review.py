
"""Independent semantic review of generated project specifications."""

from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.modules.project_generation.spec import ProjectSpecSchema


class ProjectReviewError(RuntimeError):
    """Project semantic review failed."""


class ProjectReviewBlocked(ProjectReviewError):
    """Project needs correction or review before assessment generation."""

    def __init__(self, report: dict[str, Any]):
        self.report = report
        super().__init__(
            f"Project semantic review blocked: {report['decision']}"
        )


class ProjectReviewSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    decision: Literal["approved", "review_required", "rejected"]
    findings: list[str] = Field(min_length=1)
    planning_present: bool
    testing_present: bool
    change_request_present: bool
    reflection_present: bool
    scope_respected: bool
    engineering_outcomes_aligned: bool
    ambiguity_free: bool


class ProjectReviewGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def review_project_spec(
    project: dict[str, Any],
    gateway: ProjectReviewGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Request a separate, advisory semantic review.

    'approved' means only that the AI review found no stated blockers.
    It is NOT human approval, verification, or publication.
    """
    try:
        spec = ProjectSpecSchema.model_validate(project)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectReviewError(
            "Invalid project specification for review"
        ) from error

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "project"
        / "review_v1.txt"
    )

    try:
        prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ProjectReviewError(
            "Project review prompt is unavailable"
        ) from error

    try:
        raw = await gateway.generate_json(
            operation="project_semantic_review",
            model_alias=model_alias,
            system_prompt=prompt,
            payload={"project_spec": spec.model_dump()},
            schema=ProjectReviewSchema,
        )
    except Exception as error:
        raise ProjectReviewError(
            "AI gateway failed during project review"
        ) from error

    try:
        report = ProjectReviewSchema.model_validate(raw)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectReviewError(
            "Invalid project review response"
        ) from error

    checks = (
        report.planning_present,
        report.testing_present,
        report.change_request_present,
        report.reflection_present,
        report.scope_respected,
        report.engineering_outcomes_aligned,
        report.ambiguity_free,
    )

    if report.decision == "approved" and not all(checks):
        raise ProjectReviewError(
            "Contradictory project review approval"
        )

    return report.model_dump()
