
"""Mock integration test for the Component B exercise pipeline."""

import pytest
from uuid import UUID

from app.modules.exercise_generation.publishing import PublishingError
from app.modules.exercise_generation.spec import TaskOutputError
from app.modules.exercise_generation.brief import validate_eligibility
from app.modules.exercise_generation.spec import (
    freeze_task_spec,
    generate_task_spec_async,
)
from app.modules.exercise_generation.reference import (
    generate_reference_candidate,
)
from app.modules.exercise_generation.tests import (
    generate_test_candidates,
)
from app.modules.exercise_generation.verify import verify_exercise
from app.modules.exercise_generation.publishing import (
    transition_exercise_status,
)


@pytest.mark.asyncio
async def test_complete_exercise_generation_pipeline():
    # STEP 1: Prepare a GenerationBrief.
    brief = {
        "contract_version": "1.0",
        "request_id": "550e8400-e29b-41d4-a716-446655440001",
        "student_id": "550e8400-e29b-41d4-a716-446655440002",
        "course_id": "550e8400-e29b-41d4-a716-446655440003",
        "activity_type": "single_skill_exercise",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "allowed_skill_ids": [
            "python.variables",
            "python.conditionals",
        ],
        "excluded_skill_ids": ["python.classes"],
        "assessment_stage": "transfer",
        "difficulty_level": 2,
        "preferred_context": "cafe",
        "constraints": {
            "language": "python",
            "max_minutes": 25,
        },
        "generation_policy_version": "generation-v1",
    }

    skills = {
        "python.variables": {"approval_status": "approved"},
        "python.conditionals": {"approval_status": "approved"},
    }

    outcomes = {
        "python.conditionals.transfer.v1": {
            "approval_status": "approved",
            "skill_id": "python.conditionals",
            "stage": "transfer",
        }
    }

    validate_eligibility(
        brief,
        skills,
        outcomes,
        trusted_allowed_skill_ids={
            "python.variables",
            "python.conditionals",
        },
        prerequisites_by_skill={
            "python.variables": [],
            "python.conditionals": ["python.variables"],
        },
        integration_outcome_skills={},
    )

    # STEP 2: Mock AI generation for three independent operations.
    class MockGateway:
        def __init__(self):
            self.operations = []

        async def generate_json(
            self,
            *,
            operation,
            model_alias,
            system_prompt,
            payload,
            schema,
        ):
            self.operations.append(operation)

            assert model_alias == "test-model"
            assert system_prompt

            if operation == "exercise_spec_generation":
                return {
                    "contract_version": "1.0",
                    "task_id": "550e8400-e29b-41d4-a716-446655440099",
                    "task_version": 1,
                    "activity_type": "single_skill_exercise",
                    "title": "Stock classifier",
                    "target_skill_ids": ["python.conditionals"],
                    "outcome_ids": [
                        "python.conditionals.transfer.v1"
                    ],
                    "assessment_stage": "transfer",
                    "language": "python",
                    "student_brief": (
                        "Classify nonnegative stock quantities."
                    ),
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
                    "input_constraints": [
                        "quantity is nonnegative"
                    ],
                    "public_examples": [
                        {"args": [3], "expected": "low"}
                    ],
                    "explanation_questions": [
                        "Why does 3 differ from 4?"
                    ],
                    "verification_status": "draft",
                    "human_review_status": "not_required",
                }

            if operation == "exercise_reference_generation":
                assert "task_spec" in payload

                return {
                    "source_code": (
                        "def stock_status(quantity):\n"
                        "    if quantity == 0:\n"
                        "        return 'sold_out'\n"
                        "    if quantity <= 3:\n"
                        "        return 'low'\n"
                        "    return 'available'\n"
                    ),
                    "explanation": (
                        "Uses the specified stock boundaries."
                    ),
                }

            if operation == "exercise_test_generation":
                # The test generator must not see the reference.
                assert "source_code" not in str(payload)
                assert "reference_solution" not in str(payload)

                return {
                    "test_cases": [
                        {
                            "requirement_id": "R1",
                            "args": [0],
                            "expected": "sold_out",
                            "category": "boundary",
                        },
                        {
                            "requirement_id": "R2",
                            "args": [3],
                            "expected": "low",
                            "category": "boundary",
                        },
                        {
                            "requirement_id": "R3",
                            "args": [4],
                            "expected": "available",
                            "category": "boundary",
                        },
                    ]
                }

            raise AssertionError(
                f"Unexpected AI operation: {operation}"
            )

    gateway = MockGateway()

    task = await generate_task_spec_async(
        brief,
        approved_outcome_context=outcomes,
        gateway=gateway,
        model_alias="test-model",
    )

    # The backend should replace the AI's proposed task ID.
    assert task["task_id"] != (
        "550e8400-e29b-41d4-a716-446655440099"
    )
    assert UUID(task["task_id"]).version == 4

    # STEP 3: Freeze the validated specification.
    frozen = freeze_task_spec(task, brief)

    assert frozen.data["title"] == "Stock classifier"
    assert len(frozen.data["requirements"]) == 3

    # STEP 4: Independently generate private artifacts.
    reference = await generate_reference_candidate(
        frozen,
        gateway,
        model_alias="test-model",
    )

    tests = await generate_test_candidates(
        frozen,
        gateway,
        model_alias="test-model",
    )

    assert "def stock_status" in reference["source_code"]
    assert len(tests["test_cases"]) == 3

    assert gateway.operations == [
        "exercise_spec_generation",
        "exercise_reference_generation",
        "exercise_test_generation",
    ]

    # Private reference code must not enter the public task.
    assert "source_code" not in frozen.to_payload()
    assert "test_cases" not in frozen.to_payload()

    # STEP 5: Mock sandbox verification.
    class MockSandbox:
        async def verify_task(self, task_ref):
            assert task_ref == "private-task-ref"

            return {
                "task_validity": "valid",
                "reference_passed": True,
                "boundary_coverage_passed": True,
                "invalid_input_coverage_passed": True,
                "mutation_checks_passed": True,
                "requirements_alignment_passed": True,
            }

    verification = await verify_exercise(
        "private-task-ref",
        MockSandbox(),
    )

    assert verification["verification_status"] == "verified"

    # STEP 6: Check publication workflow eligibility.
    verification_report = {
        "task_validity": "valid",
        "reference_passed": True,
        "boundary_coverage_passed": True,
        "invalid_input_coverage_passed": True,
        "mutation_checks_passed": True,
        "requirements_alignment_passed": True,
    }

    verified_status = transition_exercise_status(
        "verifying",
        "verified",
        verification_report=verification_report,
    )

    assert verified_status == "verified"

    published_status = transition_exercise_status(
        verified_status,
        "published",
        verification_report=verification_report,
        human_review_status="not_required",
    )

    assert published_status == "published"


@pytest.mark.asyncio
async def test_failed_sandbox_verification_cannot_publish():
    class FailedSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "invalid"}

    verification = await verify_exercise(
        "private-task-ref",
        FailedSandbox(),
    )

    assert verification["verification_status"] == "review_required"

    with pytest.raises(PublishingError):
        transition_exercise_status(
            "verifying",
            "verified",
            verification_report={"task_validity": "invalid"},
        )


@pytest.mark.asyncio
async def test_incomplete_sandbox_evidence_cannot_publish():
    class IncompleteSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "valid"}

    verification = await verify_exercise(
        "private-task-ref",
        IncompleteSandbox(),
    )

    assert verification["verification_status"] == "review_required"

    with pytest.raises(
        PublishingError,
        match="Complete verification evidence",
    ):
        transition_exercise_status(
            "verifying",
            "verified",
            verification_report={"task_validity": "valid"},
        )


def test_pending_human_review_cannot_publish():
    complete_report = {
        "task_validity": "valid",
        "reference_passed": True,
        "boundary_coverage_passed": True,
        "invalid_input_coverage_passed": True,
        "mutation_checks_passed": True,
        "requirements_alignment_passed": True,
    }

    with pytest.raises(PublishingError, match="Human review"):
        transition_exercise_status(
            "verified",
            "published",
            verification_report=complete_report,
            human_review_status="pending",
        )
