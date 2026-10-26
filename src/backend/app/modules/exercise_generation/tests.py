
"""Independent private assessment-test generation for exercises."""

from typing import Any, Protocol
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from app.modules.exercise_generation.spec import FrozenTaskSpec


class TestGenerationError(RuntimeError):
    """Assessment test generation failed."""

    __test__ = False


class AssessmentCase(BaseModel):
    """One proposed test case linked to a task requirement."""

    model_config = ConfigDict(extra="forbid")

    requirement_id: str = Field(min_length=1)
    args: list[Any]
    expected: Any
    category: str = Field(min_length=1)


class AssessmentSuite(BaseModel):
    """Private candidate tests for a frozen TaskSpec."""

    model_config = ConfigDict(extra="forbid")

    test_cases: list[AssessmentCase] = Field(min_length=1)


class TestLLMGateway(Protocol):
    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def generate_test_candidates(
    frozen_task: FrozenTaskSpec,
    gateway: TestLLMGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate private assessment tests from frozen requirements only.

    The reference solution is not an input to this function.
    Tests are candidates and must be verified independently.
    """

    if not isinstance(frozen_task, FrozenTaskSpec):
        raise TestGenerationError(
            "Test generation requires a FrozenTaskSpec"
        )

    task = frozen_task.to_payload()

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / "test_v1.txt"
    )

    try:
        system_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise TestGenerationError(
            "Assessment generation prompt is unavailable"
        ) from error

    # Only send the task requirements and public function contract.
    # Never send reference solutions or other private grading artifacts.
    payload = {
        "task_id": task["task_id"],
        "task_version": task["task_version"],
        "activity_type": task["activity_type"],
        "assessment_stage": task["assessment_stage"],
        "target_skill_ids": task["target_skill_ids"],
        "outcome_ids": task["outcome_ids"],
        "function_contract": task["function_contract"],
        "requirements": task["requirements"],
        "input_constraints": task["input_constraints"],
        "public_examples": task["public_examples"],
    }

    try:
        result = await gateway.generate_json(
            operation="exercise_test_generation",
            model_alias=model_alias,
            system_prompt=system_prompt,
            payload=payload,
            schema=AssessmentSuite,
        )
    except Exception as error:
        raise TestGenerationError(
            "AI gateway failed during assessment generation"
        ) from error

    try:
        suite = AssessmentSuite.model_validate(result)
    except ValueError as error:
        raise TestGenerationError(
            "Invalid assessment test specification"
        ) from error

    # Check that all generated tests refer to real requirements.
    valid_requirement_ids = {
        requirement["requirement_id"]
        for requirement in task["requirements"]
    }

    for case in suite.test_cases:
        if case.requirement_id not in valid_requirement_ids:
            raise TestGenerationError(
                f"Test references unknown requirement: {case.requirement_id}"
            )

    return suite.model_dump()
