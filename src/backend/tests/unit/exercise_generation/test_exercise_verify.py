
import pytest

from app.modules.exercise_generation.verify import check_verification_readiness
from app.modules.exercise_generation.verify import (
    VerificationError,
    verify_exercise,
)


@pytest.mark.asyncio
async def test_valid_verification_report():
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

    result = await verify_exercise(
        "private-task-ref",
        MockSandbox(),
    )

    assert result["verification_status"] == "verified"
    assert result["review_required"] is False



@pytest.mark.asyncio
async def test_invalid_verification_requires_review():
    class MockSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "invalid"}

    result = await verify_exercise(
        "private-task-ref",
        MockSandbox(),
    )

    assert result["review_required"] is True
    assert result["verification_status"] == "review_required"


@pytest.mark.asyncio
async def test_uncertain_verification_requires_review():
    class MockSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "uncertain"}

    result = await verify_exercise(
        "private-task-ref",
        MockSandbox(),
    )

    assert result["review_required"] is True


@pytest.mark.asyncio
async def test_invalid_task_reference_fails():
    class MockSandbox:
        async def verify_task(self, task_ref):
            pytest.fail("Sandbox should not be called")

    with pytest.raises(VerificationError, match="task_ref"):
        await verify_exercise("", MockSandbox())


@pytest.mark.asyncio
async def test_sandbox_failure_is_handled():
    class MockSandbox:
        async def verify_task(self, task_ref):
            raise ConnectionError("Worker unavailable")

    with pytest.raises(VerificationError, match="Sandbox unavailable"):
        await verify_exercise(
            "private-task-ref",
            MockSandbox(),
        )


@pytest.mark.asyncio
async def test_unknown_verification_result_fails():
    class MockSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "unknown"}

    with pytest.raises(VerificationError, match="task_validity"):
        await verify_exercise(
            "private-task-ref",
            MockSandbox(),
        )


def test_complete_verification_evidence_is_ready():
    report = {
        "task_validity": "valid",
        "reference_passed": True,
        "boundary_coverage_passed": True,
        "invalid_input_coverage_passed": True,
        "mutation_checks_passed": True,
        "requirements_alignment_passed": True,
    }

    assert check_verification_readiness(report) is True


def test_incomplete_verification_evidence_is_not_ready():
    report = {"task_validity": "valid"}

    assert check_verification_readiness(report) is False


def test_failed_verification_evidence_is_not_ready():
    report = {
        "task_validity": "valid",
        "reference_passed": True,
        "boundary_coverage_passed": True,
        "invalid_input_coverage_passed": True,
        "mutation_checks_passed": False,
        "requirements_alignment_passed": True,
    }

    assert check_verification_readiness(report) is False


@pytest.mark.asyncio
async def test_valid_label_without_evidence_requires_review():
    class MockSandbox:
        async def verify_task(self, task_ref):
            return {"task_validity": "valid"}

    result = await verify_exercise(
        "private-task-ref",
        MockSandbox(),
    )

    assert result["verification_status"] == "review_required"
    assert result["review_required"] is True
