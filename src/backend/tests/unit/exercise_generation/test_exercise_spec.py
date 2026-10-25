
import copy

import pytest
from app.modules.exercise_generation.spec import generate_task_spec_async
from uuid import UUID
from app.modules.exercise_generation.spec import (
    TaskSpecValidationError,
    validate_task_spec,
    validate_generated_task_spec,
    TaskProviderError,
    TaskOutputError,
)

from app.modules.exercise_generation.spec import (
    TaskGenerationError,
    generate_task_spec,
)


@pytest.fixture
def valid_spec_data():
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
            "parameters": [
                {"name": "quantity", "type": "int"}
            ],
            "returns": "str",
        },
        "requirements": [
            {
                "requirement_id": "R1",
                "description": "0 returns sold_out",
            },
            {
                "requirement_id": "R2",
                "description": "1-3 returns low",
            },
            {
                "requirement_id": "R3",
                "description": "4+ returns available",
            },
        ],
        "input_constraints": ["quantity is nonnegative"],
        "public_examples": [
            {"args": [3], "expected": "low"}
        ],
        "explanation_questions": [
            "Why is the result for 3 different from 4?"
        ],
        "verification_status": "draft",
        "human_review_status": "not_required",
    }

    return task, brief


def test_valid_task_spec_passes(valid_spec_data):
    task, brief = valid_spec_data
    validate_task_spec(task, brief)


def test_mismatched_skill_fails(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)
    task["target_skill_ids"] = ["python.loops"]

    with pytest.raises(TaskSpecValidationError):
        validate_task_spec(task, brief)


def test_missing_requirements_fails(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)
    task["requirements"] = []

    with pytest.raises(TaskSpecValidationError):
        validate_task_spec(task, brief)


def test_duplicate_requirement_ids_fail(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)
    task["requirements"][1]["requirement_id"] = "R1"

    with pytest.raises(TaskSpecValidationError):
        validate_task_spec(task, brief)


def test_hidden_tests_cannot_be_exposed(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)
    task["hidden_tests"] = ["assert stock_status(3) == 'low'"]

    with pytest.raises(TaskSpecValidationError):
        validate_task_spec(task, brief)


def test_invalid_function_contract_fails(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)
    task["function_contract"]["name"] = ""

    with pytest.raises(TaskSpecValidationError):
        validate_task_spec(task, brief)


def test_non_coding_task_without_function_passes(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    task["function_contract"] = None

    validate_task_spec(task, brief)


def test_unknown_public_field_fails(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    task["answer_code"] = "return 'low'"

    with pytest.raises(
        TaskSpecValidationError,
        match="unexpected fields",
    ):
        validate_task_spec(task, brief)


def test_generated_task_must_be_draft(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    task["verification_status"] = "verified"

    with pytest.raises(
        TaskSpecValidationError,
        match="draft status",
    ):
        validate_generated_task_spec(task, brief)


def test_generated_task_cannot_approve_itself(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    task["human_review_status"] = "approved"

    with pytest.raises(
        TaskSpecValidationError,
        match="human review",
    ):
        validate_generated_task_spec(task, brief)


def test_valid_generated_draft_passes(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    validate_generated_task_spec(task, brief)

from app.modules.exercise_generation.spec import (
    TaskGenerationError,
    generate_task_spec,
)


def test_ai_generation_returns_valid_task(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    # The generator expects a previously validated GenerationBrief.
    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    def mock_ai(prompt):
        assert "Generate ONE student-facing" in prompt
        assert "python.conditionals" in prompt
        return task

    result = generate_task_spec(
        brief,
        approved_outcome_context={
            "python.conditionals.transfer.v1": {
                "approval_status": "approved",
                "stage": "transfer",
            }
        },
        generate_json=mock_ai,
    )

    assert result["title"] == "Stock classifier"
    assert result["verification_status"] == "draft"


def test_ai_generation_rejects_invalid_response(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    task["verification_status"] = "published"

    def mock_ai(prompt):
        return task

    with pytest.raises(TaskGenerationError, match="failed validation"):
        generate_task_spec(
            brief,
            approved_outcome_context={},
            generate_json=mock_ai,
        )


def test_ai_provider_failure_is_handled(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    def broken_ai(prompt):
        raise ConnectionError("Provider unavailable")

    with pytest.raises(TaskGenerationError, match="AI provider failed"):
        generate_task_spec(
            brief,
            approved_outcome_context={},
            generate_json=broken_ai,
        )


def test_generation_retries_invalid_output(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    calls = 0

    def mock_ai(prompt):
        nonlocal calls
        calls += 1

        if calls == 1:
            return {"invalid": "response"}

        return task

    result = generate_task_spec(
        brief,
        approved_outcome_context={},
        generate_json=mock_ai,
    )

    assert calls == 2
    assert result["title"] == "Stock classifier"


def test_generation_stops_after_max_attempts(valid_spec_data):
    _, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    calls = 0

    def invalid_ai(prompt):
        nonlocal calls
        calls += 1
        return {"invalid": True}

    with pytest.raises(TaskOutputError, match="after 3 attempts"):
        generate_task_spec(
            brief,
            approved_outcome_context={},
            generate_json=invalid_ai,
            max_attempts=3,
        )

    assert calls == 3


def test_provider_failure_does_not_retry(valid_spec_data):
    _, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    calls = 0

    def unavailable_ai(prompt):
        nonlocal calls
        calls += 1
        raise ConnectionError("Provider unavailable")

    with pytest.raises(TaskProviderError):
        generate_task_spec(
            brief,
            approved_outcome_context={},
            generate_json=unavailable_ai,
        )

    assert calls == 1


@pytest.mark.parametrize("attempts", [0, -1, True, "three"])
def test_invalid_retry_limit_fails(valid_spec_data, attempts):
    _, brief = copy.deepcopy(valid_spec_data)

    with pytest.raises(ValueError, match="max_attempts"):
        generate_task_spec(
            brief,
            approved_outcome_context={},
            generate_json=lambda prompt: {},
            max_attempts=attempts,
        )


@pytest.mark.asyncio
async def test_async_generation_assigns_backend_task_id(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

    ai_task_id = task["task_id"]

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
            return task

    result = await generate_task_spec_async(
        brief,
        approved_outcome_context={},
        gateway=MockGateway(),
        model_alias="test-model",
    )

    assert result["task_id"] != ai_task_id
    assert UUID(result["task_id"]).version == 4
    assert result["task_version"] == 1
    assert result["verification_status"] == "draft"


@pytest.mark.asyncio
async def test_async_generation_assigns_unique_ids(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

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
            return copy.deepcopy(task)

    gateway = MockGateway()

    first = await generate_task_spec_async(
        brief,
        approved_outcome_context={},
        gateway=gateway,
        model_alias="test-model",
    )

    second = await generate_task_spec_async(
        brief,
        approved_outcome_context={},
        gateway=gateway,
        model_alias="test-model",
    )

    assert first["task_id"] != second["task_id"]


@pytest.mark.asyncio
async def test_async_gateway_generates_valid_task(valid_spec_data):
    task, brief = copy.deepcopy(valid_spec_data)

    brief.update({
        "contract_version": "1.0",
        "allowed_skill_ids": ["python.conditionals"],
        "excluded_skill_ids": [],
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
    })

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
            assert operation == "exercise_spec_generation"
            assert model_alias == "test-model"
            assert "python.conditionals" in payload["target_skill_ids"]
            assert schema.__name__ == "GeneratedTaskSchema"
            return task

    result = await generate_task_spec_async(
        brief,
        approved_outcome_context={},
        gateway=MockGateway(),
        model_alias="test-model",
    )

    assert result["title"] == "Stock classifier"
    assert result["verification_status"] == "draft"
