
"""Independent semantic review of generated exercise specifications."""

from pathlib import Path
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.modules.exercise_generation.spec import FrozenTaskSpec


class SemanticReviewError(RuntimeError):
    """Semantic review could not be completed."""


class SemanticReviewReport(BaseModel):
    """Internal AI-review result, not a human approval decision."""

    model_config = ConfigDict(extra="forbid")

    decision: Literal["approved", "review_required", "rejected"]
    findings: list[str] = Field(min_length=1)
    requirements_aligned: bool
    outcomes_aligned: bool
    scope_respected: bool
    examples_consistent: bool


class ReviewGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def review_exercise_spec(
    frozen_task: FrozenTaskSpec,
    gateway: ReviewGateway,
    *,
    model_alias: str,
    approved_outcome_context: dict[str, Any],
) -> dict[str, Any]:
    """Ask an independent reviewer to critique a frozen exercise."""

    if not isinstance(frozen_task, FrozenTaskSpec):
        raise SemanticReviewError(
            "Semantic review requires a FrozenTaskSpec"
        )

    task = frozen_task.to_payload()

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / "review_v1.txt"
    )

    try:
        system_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise SemanticReviewError(
            "Semantic review prompt is unavailable"
        ) from error

    # Only student-safe specification content is reviewed.
    # No reference solutions or hidden tests are supplied.

    # Only trusted, backend-supplied outcomes may be used.
    required_outcome_ids = task.get("outcome_ids", [])

    if (
        not isinstance(required_outcome_ids, list)
        or not required_outcome_ids
        or any(
            outcome_id not in approved_outcome_context
            for outcome_id in required_outcome_ids
        )
    ):
        raise SemanticReviewError(
            "Trusted outcome context is missing"
        )

    payload = {
        "task_spec": task,
        "approved_outcomes": {
            outcome_id: approved_outcome_context[outcome_id]
            for outcome_id in required_outcome_ids
        },
    }


    try:
        raw = await gateway.generate_json(
            operation="exercise_semantic_review",
            model_alias=model_alias,
            system_prompt=system_prompt,
            payload=payload,
            schema=SemanticReviewReport,
        )
    except Exception as error:
        raise SemanticReviewError(
            "Semantic review provider failed"
        ) from error

    try:
        report = SemanticReviewReport.model_validate(raw)
    except ValueError as error:
        raise SemanticReviewError(
            "Invalid semantic review response"
        ) from error

    checks_passed = all(
        (
            report.requirements_aligned,
            report.outcomes_aligned,
            report.scope_respected,
            report.examples_consistent,
        )
    )

    # Fail closed if the AI reports approval but its own checks disagree.
    if report.decision == "approved" and not checks_passed:
        raise SemanticReviewError(
            "Review approval contradicts review findings"
        )

    return report.model_dump()
