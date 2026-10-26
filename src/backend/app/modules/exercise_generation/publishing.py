
"""Exercise lifecycle and publication eligibility rules."""

from collections.abc import Mapping
from typing import Any

from app.modules.exercise_generation.verify import (
    check_verification_readiness,
)


class PublishingError(ValueError):
    """An exercise cannot perform the requested status transition."""


ALLOWED_TRANSITIONS = {
    "draft": {"verifying", "rejected"},
    "verifying": {"verified", "review_required", "rejected"},
    "review_required": {"verifying", "verified", "rejected"},
    "verified": {"published", "review_required", "rejected"},
    "published": {"archived"},
    "rejected": set(),
    "archived": set(),
}

VALID_REVIEW_STATUSES = {
    "not_required",
    "pending",
    "approved",
    "rejected",
}


def transition_exercise_status(
    current_status: str,
    next_status: str,
    *,
    verification_report: Mapping[str, Any] | None = None,
    human_review_status: str = "pending",
) -> str:
    """Validate an exercise lifecycle transition.

    This checks workflow eligibility only. Database persistence,
    authenticated reviewer decisions, and audit records are handled
    by their owning services.
    """

    if current_status not in ALLOWED_TRANSITIONS:
        raise PublishingError(
            f"Unknown current status: {current_status}"
        )

    if next_status not in ALLOWED_TRANSITIONS[current_status]:
        raise PublishingError(
            f"Invalid transition: {current_status} -> {next_status}"
        )

    if human_review_status not in VALID_REVIEW_STATUSES:
        raise PublishingError("Invalid human review status")

    # An exercise cannot become verified or published without
    # sufficiently complete sandbox verification evidence.
    if next_status in {"verified", "published"}:
        if not check_verification_readiness(verification_report):
            raise PublishingError(
                "Complete verification evidence is required"
            )

        if human_review_status == "rejected":
            raise PublishingError(
                "Human-rejected exercise cannot advance"
            )

    # A pending human review cannot be bypassed during publication.
    if next_status == "published":
        if human_review_status not in {
            "not_required",
            "approved",
        }:
            raise PublishingError(
                "Human review must be completed before publication"
            )

    return next_status
