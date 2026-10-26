
import pytest

from app.modules.project_generation.publishing import (
    ProjectPublishingError,
    transition_project_status,
)


def test_draft_can_enter_verification():
    assert transition_project_status(
        "draft", "verifying"
    ) == "verifying"


def test_cannot_publish_unverified_project():
    with pytest.raises(
        ProjectPublishingError,
        match="Invalid project transition",
    ):
        transition_project_status(
            "draft",
            "published",
            sandbox_verification_confirmed=True,
            human_review_status="approved",
        )


def test_cannot_claim_verification_without_trusted_confirmation():
    with pytest.raises(
        ProjectPublishingError,
        match="Trusted verification",
    ):
        transition_project_status(
            "verifying",
            "verified",
        )


def test_verified_project_still_needs_human_approval():
    with pytest.raises(
        ProjectPublishingError,
        match="Instructor approval",
    ):
        transition_project_status(
            "verified",
            "published",
            sandbox_verification_confirmed=True,
            human_review_status="pending",
        )


def test_verified_and_approved_project_can_publish():
    assert transition_project_status(
        "verified",
        "published",
        sandbox_verification_confirmed=True,
        human_review_status="approved",
    ) == "published"


def test_rejected_project_cannot_be_published():
    with pytest.raises(
        ProjectPublishingError,
        match="Invalid project transition",
    ):
        transition_project_status(
            "rejected",
            "published",
            sandbox_verification_confirmed=True,
            human_review_status="approved",
        )
