
import pytest

from app.modules.exercise_generation.publishing import (
    PublishingError,
    transition_exercise_status,
)


@pytest.fixture
def valid_report():
    return {
        "task_validity": "valid",
        "reference_passed": True,
        "boundary_coverage_passed": True,
        "invalid_input_coverage_passed": True,
        "mutation_checks_passed": True,
        "requirements_alignment_passed": True,
    }


def test_draft_can_start_verification():
    result = transition_exercise_status(
        "draft",
        "verifying",
    )

    assert result == "verifying"


def test_draft_cannot_publish_directly(valid_report):
    with pytest.raises(PublishingError, match="Invalid transition"):
        transition_exercise_status(
            "draft",
            "published",
            verification_report=valid_report,
            human_review_status="approved",
        )


def test_complete_verification_can_advance(valid_report):
    result = transition_exercise_status(
        "verifying",
        "verified",
        verification_report=valid_report,
    )

    assert result == "verified"


def test_incomplete_verification_cannot_advance():
    with pytest.raises(
        PublishingError,
        match="Complete verification evidence",
    ):
        transition_exercise_status(
            "verifying",
            "verified",
            verification_report={"task_validity": "valid"},
        )


def test_pending_review_blocks_publication(valid_report):
    with pytest.raises(
        PublishingError,
        match="Human review",
    ):
        transition_exercise_status(
            "verified",
            "published",
            verification_report=valid_report,
            human_review_status="pending",
        )


def test_approved_review_allows_publication(valid_report):
    result = transition_exercise_status(
        "verified",
        "published",
        verification_report=valid_report,
        human_review_status="approved",
    )

    assert result == "published"


def test_rejected_review_blocks_publication(valid_report):
    with pytest.raises(PublishingError, match="Human-rejected"):
        transition_exercise_status(
            "verified",
            "published",
            verification_report=valid_report,
            human_review_status="rejected",
        )


def test_published_exercise_can_be_archived():
    result = transition_exercise_status(
        "published",
        "archived",
    )

    assert result == "archived"


def test_archived_exercise_cannot_be_republished(valid_report):
    with pytest.raises(PublishingError, match="Invalid transition"):
        transition_exercise_status(
            "archived",
            "published",
            verification_report=valid_report,
            human_review_status="approved",
        )

