
import pytest


from app.modules.exercise_generation.spec import freeze_task_spec
from app.modules.exercise_generation.reference import (
    ReferenceGenerationError,
    generate_reference_candidate,
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
            {
                "requirement_id": "R1",
                "description": "0 returns sold_out",
            }
        ],
        "input_constraints": ["quantity is nonnegative"],
        "public_examples": [{"args": [0], "expected": "sold_out"}],
        "explanation_questions": ["Why does zero return sold_out?"],
        "verification_status": "draft",
        "human_review_status": "not_required",
    }

    return freeze_task_spec(task, brief)



@pytest.mark.asyncio
async def test_reference_generation_succeeds(frozen_task):
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
            assert operation == "exercise_reference_generation"
            assert model_alias == "test-model"
            assert payload["task_spec"]["title"] == "Stock classifier"

            return {
                "source_code": (
                    "def stock_status(quantity):\n"
                    "    return 'sold_out' if quantity == 0 else 'available'"
                ),
                "explanation": "Handles zero stock.",
            }

    result = await generate_reference_candidate(
        frozen_task,
        MockGateway(),
        model_alias="test-model",
    )

    assert "def stock_status" in result["source_code"]


@pytest.mark.asyncio
async def test_invalid_reference_candidate_fails(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {"source_code": ""}

    with pytest.raises(ReferenceGenerationError):
        await generate_reference_candidate(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_reference_provider_failure_is_handled(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            raise ConnectionError("Provider unavailable")

    with pytest.raises(ReferenceGenerationError):
        await generate_reference_candidate(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
        )



@pytest.mark.asyncio
async def test_reference_rejects_mutable_task():
    class MockGateway:
        async def generate_json(self, **kwargs):
            pytest.fail("AI must not be called for a mutable task")

    with pytest.raises(
        ReferenceGenerationError,
        match="requires a FrozenTaskSpec",
    ):
        await generate_reference_candidate(
            {"title": "Mutable exercise"},
            MockGateway(),
            model_alias="test-model",
        )
