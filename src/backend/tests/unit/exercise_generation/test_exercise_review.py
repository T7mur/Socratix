
import pytest

from app.modules.exercise_generation.review import (
    SemanticReviewError,
    review_exercise_spec,
)
from app.modules.exercise_generation.spec import FrozenTaskSpec


@pytest.fixture
def frozen_task():
    # This test isolates the review adapter.
    # Full TaskSpec validation is tested separately.
    from types import MappingProxyType

    return FrozenTaskSpec(
        data=MappingProxyType({
            "task_id": "550e8400-e29b-41d4-a716-446655440004",
            "task_version": 1,
            "title": "Stock classifier",
            "requirements": [
                {"requirement_id": "R1", "description": "0 returns sold_out"}
            ],
            "outcome_ids": ["python.conditionals.transfer.v1"],
            "target_skill_ids": ["python.conditionals"],
        })
    )


@pytest.mark.asyncio
async def test_semantic_review_approved(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            assert kwargs["operation"] == "exercise_semantic_review"
            assert "task_spec" in kwargs["payload"]

            return {
                "decision": "approved",
                "findings": ["Requirements appear internally consistent."],
                "requirements_aligned": True,
                "outcomes_aligned": True,
                "scope_respected": True,
                "examples_consistent": True,
            }

    result = await review_exercise_spec(
        frozen_task, MockGateway(), model_alias="test-model",
        approved_outcome_context={
            "python.conditionals.transfer.v1": {
                "approval_status": "approved",
                "skill_id": "python.conditionals",
                "stage": "transfer",
                "description": "Apply conditional logic to a new problem.",
            }
        }
    )

    assert result["decision"] == "approved"


@pytest.mark.asyncio
async def test_contradictory_approval_fails(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {
                "decision": "approved",
                "findings": ["An example contradicts a requirement."],
                "requirements_aligned": True,
                "outcomes_aligned": True,
                "scope_respected": True,
                "examples_consistent": False,
            }

    with pytest.raises(
        SemanticReviewError, match="contradicts"
    ):
        await review_exercise_spec(
            frozen_task, MockGateway(), model_alias="test-model",
            approved_outcome_context={
                "python.conditionals.transfer.v1": {
                    "approval_status": "approved",
                    "skill_id": "python.conditionals",
                    "stage": "transfer",
                    "description": "Apply conditional logic to a new problem.",
    }
},
        )


@pytest.mark.asyncio
async def test_review_required_is_preserved(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            return {
                "decision": "review_required",
                "findings": ["The boundary behaviour is ambiguous."],
                "requirements_aligned": True,
                "outcomes_aligned": True,
                "scope_respected": True,
                "examples_consistent": False,
            }

    result = await review_exercise_spec(
        frozen_task, MockGateway(), model_alias="test-model",
        approved_outcome_context={
          "python.conditionals.transfer.v1": {
                "approval_status": "approved",
                "skill_id": "python.conditionals",
                "stage": "transfer",
                "description": "Apply conditional logic to a new problem.",
    }
},
    )

    assert result["decision"] == "review_required"


@pytest.mark.asyncio
async def test_review_provider_failure(frozen_task):
    class MockGateway:
        async def generate_json(self, **kwargs):
            raise ConnectionError("Provider unavailable")

    with pytest.raises(
        SemanticReviewError, match="provider failed"
    ):
        await review_exercise_spec(
            frozen_task, MockGateway(), model_alias="test-model",
            approved_outcome_context={
    "python.conditionals.transfer.v1": {
        "approval_status": "approved",
        "skill_id": "python.conditionals",
        "stage": "transfer",
        "description": "Apply conditional logic to a new problem.",
    }
},
        )


@pytest.mark.asyncio
async def test_semantic_review_rejects_missing_outcome_context(
    frozen_task,
):
    class MockGateway:
        async def generate_json(self, **kwargs):
            pytest.fail("AI must not run without outcome context")

    with pytest.raises(
        SemanticReviewError,
        match="Trusted outcome context is missing",
    ):
        await review_exercise_spec(
            frozen_task,
            MockGateway(),
            model_alias="test-model",
            approved_outcome_context={},
        )
