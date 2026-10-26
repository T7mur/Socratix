
"""Private reference candidates for coding and non-coding exercises."""

from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.modules.exercise_generation.spec import FrozenTaskSpec


class ReferenceGenerationError(RuntimeError):
    """Reference generation could not complete successfully."""


class ReferenceCandidateSchema(BaseModel):
    """Private reference solution for a coding exercise."""

    model_config = ConfigDict(extra="forbid")

    source_code: str = Field(min_length=1)
    explanation: str = Field(min_length=1)


class ModelAnswerSchema(BaseModel):
    """Private model answer for a non-coding exercise."""

    model_config = ConfigDict(extra="forbid")

    answer_text: str = Field(min_length=1)
    explanation: str = Field(min_length=1)


class ReferenceLLMGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


def _load_prompt(filename: str) -> str:
    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / filename
    )

    try:
        return prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ReferenceGenerationError(
            "Reference generation prompt is unavailable"
        ) from error


async def generate_reference_candidate(
    frozen_task: FrozenTaskSpec,
    gateway: ReferenceLLMGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate a private Python reference for a coding exercise."""

    if not isinstance(frozen_task, FrozenTaskSpec):
        raise ReferenceGenerationError(
            "Reference generation requires a FrozenTaskSpec"
        )

    task = frozen_task.to_payload()

    if task.get("function_contract") is None:
        raise ReferenceGenerationError(
            "Coding reference requires a function contract"
        )

    prompt = _load_prompt("reference_v1.txt")

    try:
        result = await gateway.generate_json(
            operation="exercise_reference_generation",
            model_alias=model_alias,
            system_prompt=prompt,
            payload={"task_spec": task},
            schema=ReferenceCandidateSchema,
        )
    except Exception as error:
        raise ReferenceGenerationError(
            "AI gateway failed during reference generation"
        ) from error

    try:
        candidate = ReferenceCandidateSchema.model_validate(result)
    except ValueError as error:
        raise ReferenceGenerationError(
            "Invalid reference candidate returned by AI"
        ) from error

    return candidate.model_dump()


async def generate_model_answer_candidate(
    frozen_task: FrozenTaskSpec,
    gateway: ReferenceLLMGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate a private written model answer for a non-coding task."""

    if not isinstance(frozen_task, FrozenTaskSpec):
        raise ReferenceGenerationError(
            "Model-answer generation requires a FrozenTaskSpec"
        )

    task = frozen_task.to_payload()

    if task.get("function_contract") is not None:
        raise ReferenceGenerationError(
            "Model-answer generation requires a non-coding task"
        )

    prompt = _load_prompt("model_answer_v1.txt")

    payload = {
        "task_id": task["task_id"],
        "task_version": task["task_version"],
        "assessment_stage": task["assessment_stage"],
        "student_brief": task["student_brief"],
        "requirements": task["requirements"],
        "explanation_questions": task["explanation_questions"],
        "outcome_ids": task["outcome_ids"],
    }

    try:
        result = await gateway.generate_json(
            operation="exercise_model_answer_generation",
            model_alias=model_alias,
            system_prompt=prompt,
            payload=payload,
            schema=ModelAnswerSchema,
        )
    except Exception as error:
        raise ReferenceGenerationError(
            "AI gateway failed during model-answer generation"
        ) from error

    try:
        candidate = ModelAnswerSchema.model_validate(result)
    except ValueError as error:
        raise ReferenceGenerationError(
            "Invalid model answer returned by AI"
        ) from error

    return candidate.model_dump()
