
"""Private reference-solution candidate generation for exercises."""

from collections.abc import Mapping
from typing import Any, Protocol
from pathlib import Path

from app.modules.exercise_generation.spec import FrozenTaskSpec
from pydantic import BaseModel, ConfigDict, Field


class ReferenceGenerationError(RuntimeError):
    """Reference generation could not complete successfully."""


class ReferenceCandidateSchema(BaseModel):
    """Internal schema for private reference-solution candidates."""

    model_config = ConfigDict(extra="forbid")

    source_code: str = Field(min_length=1)
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


async def generate_reference_candidate(
    frozen_task: FrozenTaskSpec,
    gateway: ReferenceLLMGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate a private candidate for a frozen exercise.

    This function does not execute code, grade submissions,
    verify correctness, or publish private artifacts.
    """
    if not isinstance(frozen_task, FrozenTaskSpec):
        raise ReferenceGenerationError(
            "Reference generation requires a FrozenTaskSpec"
        )       

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / "reference_v1.txt"
    )

    try:
        system_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise ReferenceGenerationError(
            "Reference generation prompt is unavailable"
        ) from error

    # Convert the frozen mapping and nested tuples into JSON-safe data.
    def thaw(value: Any) -> Any:
        if isinstance(value, Mapping):
            return {key: thaw(item) for key, item in value.items()}
        if isinstance(value, tuple):
            return [thaw(item) for item in value]
        return value

    task_payload = frozen_task.to_payload()

    try:
        result = await gateway.generate_json(
            operation="exercise_reference_generation",
            model_alias=model_alias,
            system_prompt=system_prompt,
            payload={"task_spec": task_payload},
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
