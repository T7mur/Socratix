
import pytest

from app.modules.exercise_generation.spec import freeze_task_spec
from app.modules.exercise_generation.tests import (
    TestGenerationError,
    generate_test_candidates,
)


@pytest.fixture
def frozen_task():
    brief = {
        "activity_type": "single_skill_exercise",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "assessment_stage": "transfer",
        "constraints": {"language": "python"},
    }

    task = {
        "contract_version": "1.0",
        "task_id": "550e8400-e29b-41d4-a716-446655440004",
        "task_version": 1,
        "activity_type": "single_skill_exercise",
        "title": "Stock classifier",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "assessment_stage": "transfer",
        "language": "python",
        "student_brief": "Classify stock quantities.",
        "function_contract": {
            "name": "stock_status",
            "parameters": [{"name": "quantity", "type": "int"}],
            "returns": "str",
        },
        "requirements": [
            {"requirement_id": "R1", "description": "0 returns sold_out"},
            {"requirement_id": "R2", "description": "1-3 returns low"},
            {"requirement_id": "R3", "description": "4+ returns available"},
        ],
        "input_constraints": ["quantity is nonnegative"],
        "public_examples": [{"args": [3], "expected": "low"}],
        "explanation_questions": [
            "Why is the result for 3 different from 4?"
        ],
        "verification_status": "draft",
        "human_review_status": "not_required",
    }

    return freeze_task_spec(task, brief)


@pytest.mark.asyncio
async def test_independent_test_generation_succeeds(frozen_task):
    class MockGateway:
        async def generate_json(
            self,
            *,
            operation,
            model_alias,
            system_prompt,
            payload,
            schema,
        ):
            assert operation == "exercise_test_generation"
            assert model_alias == "test-model"
            assert "reference_solution" not in payload
            assert "source_code" not in payload
            assert payload["requirements"][0]["requirement_id"] == "R1"

            return {
                "test_cases": [
                    {
                        "requirement_id": "R1",
                        "args": [0],
                        "expected": "sold_out",
                        "category": "boundary",
                    }
                ]
            }

    result = await generate_test_candidates(
        frozen_task,
        MockGateway(),
        model_alias="test-model",
    )

    assert len(result["test_cases"]) == 1


@pytest.mark.asyncio
async def test_unknown_requirement_fails(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {
                "test_cases": [
                    {
                        "requirement_id": "R999",
                        "args": [0],
                        "expected": "sold_out",
                        "category": "boundary",
                    }
                ]
            }

    with pytest.raises(TestGenerationError, match="unknown requirement"):
        await generate_test_candidates(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_invalid_suite_fails(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {"test_cases": []}

    with pytest.raises(TestGenerationError):
        await generate_test_candidates(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_mutable_task_is_rejected():
    class MockGateway:
        async def generate_json(self, **kwargs):
            pytest.fail("Gateway should not be called")

    with pytest.raises(TestGenerationError, match="FrozenTaskSpec"):
        await generate_test_candidates(
            {"title": "Mutable task"},
            MockGateway(),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_provider_failure_is_handled(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            raise ConnectionError("Provider unavailable")

    with pytest.raises(TestGenerationError, match="AI gateway failed"):
        await generate_test_candidates(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
        )
