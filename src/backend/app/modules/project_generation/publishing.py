
"""Project lifecycle safeguards for Component C.

This module validates proposed state transitions only.
Actual verification, authorisation, persistence and audit records
must be supplied by the responsible backend services.
"""

from typing import Literal


ProjectStatus = Literal[
    "draft",
    "verifying",
    "review_required",
    "verified",
    "published",
    "rejected",
    "archived",
]


class ProjectPublishingError(ValueError):
    """Project lifecycle transition is not permitted."""


ALLOWED_TRANSITIONS = {
    "draft": {"verifying", "review_required", "rejected"},
    "verifying": {"verified", "review_required", "rejected"},
    "review_required": {"verifying", "rejected"},
    "verified": {"published", "review_required", "rejected"},
    "published": {"archived"},
    "rejected": set(),
    "archived": set(),
}


def transition_project_status(
    current_status: str,
    next_status: str,
    *,
    sandbox_verification_confirmed: bool = False,
    human_review_status: str = "pending",
) -> str:
    """Validate a proposed transition without changing stored state.

    sandbox_verification_confirmed must come from trusted backend QA.
    It must never be derived from an AI claim or student input.

    For this MVP, publication conservatively requires human approval.
    """

    if current_status not in ALLOWED_TRANSITIONS:
        raise ProjectPublishingError(
            "Unknown current project status"
        )

    if next_status not in ALLOWED_TRANSITIONS:
        raise ProjectPublishingError(
            "Unknown target project status"
        )

    if next_status not in ALLOWED_TRANSITIONS[current_status]:
        raise ProjectPublishingError(
            f"Invalid project transition: "
            f"{current_status} -> {next_status}"
        )

    if next_status in {"verified", "published"}:
        if sandbox_verification_confirmed is not True:
            raise ProjectPublishingError(
                "Trusted verification confirmation is required"
            )

    if next_status == "published":
        if human_review_status != "approved":
            raise ProjectPublishingError(
                "Instructor approval is required for publication"
            )

    return next_status
