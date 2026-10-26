
from types import MappingProxyType

import pytest

from app.modules.exercise_generation.spec import FrozenTaskSpec
from app.modules.exercise_generation.tests import (
    TestGenerationError,
    generate_rubric_candidate,
)


@pytest.fixture
def noncoding_task():
    return FrozenTaskSpec(
        data=MappingProxyType({
            "task_id": "550e8400-e29b-41d4-a716-446655440004",
            "task_version": 1,
            "assessment_stage": "understanding",
            "student_brief": "Explain how a Python if statement works.",
            "function_contract": None,
            "requirements": [
                {
                    "requirement_id": "R1",
                    "description": "Explain conditional execution",
                },
                {
                    "requirement_id": "R2",
                    "description": "Explain the Boolean condition",
                },
            ],
            "explanation_questions": [
                "When does an if block execute?"
            ],
            "outcome_ids": [
                "python.conditionals.understanding.v1"
            ],
        })
    )


@pytest.mark.asyncio
async def test_noncoding_rubric_generation(noncoding_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            assert kwargs["operation"] == "exercise_rubric_generation"
            assert kwargs["payload"]["assessment_stage"] == "understanding"

            return {
                "criteria": [
                    {
                        "requirement_id": "R1",
                        "description": "Conditional execution",
                        "evidence_expected": "Explains when the block runs",
                        "max_points": 5,
                    },
                    {
                        "requirement_id": "R2",
                        "description": "Boolean condition",
                        "evidence_expected": "Explains true and false",
                        "max_points": 5,
                    },
                ]
            }

    result = await generate_rubric_candidate(
        noncoding_task,
        MockGateway(),
        model_alias="test-model",
    )

    assert len(result["criteria"]) == 2
    assert sum(c["max_points"] for c in result["criteria"]) == 10


@pytest.mark.asyncio
async def test_rubric_rejects_missing_requirement(noncoding_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {
                "criteria": [
                    {
                        "requirement_id": "R1",
                        "description": "Conditional execution",
                        "evidence_expected": "Explains when the block runs",
                        "max_points": 5,
                    }
                ]
            }

    with pytest.raises(
        TestGenerationError,
        match="cover every requirement",
    ):
        await generate_rubric_candidate(
            noncoding_task,
            MockGateway(),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_rubric_rejects_coding_task(noncoding_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            pytest.fail("AI must not run for coding tasks")

    task_data = noncoding_task.to_payload()
    task_data["function_contract"] = {
        "name": "solve",
        "parameters": [],
        "returns": "str",
    }

    coding_task = FrozenTaskSpec(
        data=MappingProxyType(task_data)
    )

    with pytest.raises(
        TestGenerationError,
        match="non-coding task",
    ):
        await generate_rubric_candidate(
            coding_task,
            MockGateway(),
            model_alias="test-model",
        )
