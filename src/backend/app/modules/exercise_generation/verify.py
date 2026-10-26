
"""Coordinate exercise verification through the isolated sandbox."""

from collections.abc import Mapping
from typing import Any, Protocol


class VerificationError(RuntimeError):
    """Exercise verification failed or returned an invalid report."""


class ExerciseSandbox(Protocol):
    """The shared SandboxProtocol verification interface."""

    async def verify_task(self, task_ref: str) -> dict: ...


VALID_RESULTS = {"valid", "invalid", "uncertain"}


async def verify_exercise(
    task_ref: str,
    sandbox: ExerciseSandbox,
) -> dict[str, Any]:
    """Request verification without executing student or reference code.

    The caller must arrange secure storage of the frozen TaskSpec,
    private reference candidate and independent test candidates.

    The sandbox resolves the task reference and runs isolated QA.
    """

    if not isinstance(task_ref, str) or not task_ref.strip():
        raise VerificationError("task_ref must be a non-empty string")

    try:
        report = await sandbox.verify_task(task_ref)
    except Exception as error:
        raise VerificationError(
            "Sandbox unavailable or verification failed"
        ) from error

    if not isinstance(report, Mapping):
        raise VerificationError(
            "Sandbox returned an invalid verification report"
        )

    validity = report.get("task_validity")

    if validity not in VALID_RESULTS:
        raise VerificationError(
            "Sandbox report has invalid task_validity"
        )

    
    if check_verification_readiness(report):
        return {
            "task_ref": task_ref,
            "task_validity": "valid",
            "verification_status": "verified",
            "review_required": False,
        }

    return {
        "task_ref": task_ref,
        "task_validity": validity,
        "verification_status": "review_required",
        "review_required": True,
    }



def check_verification_readiness(report: Mapping[str, Any]) -> bool:
    """Conservatively check evidence needed before publication.

    This is a provisional internal gate, not the canonical sandbox
    report schema or a substitute for sandbox verification.
    """

    if not isinstance(report, Mapping):
        return False

    if report.get("task_validity") != "valid":
        return False

    required_checks = (
        "reference_passed",
        "boundary_coverage_passed",
        "invalid_input_coverage_passed",
        "mutation_checks_passed",
        "requirements_alignment_passed",
    )

    return all(report.get(check) is True for check in required_checks)
