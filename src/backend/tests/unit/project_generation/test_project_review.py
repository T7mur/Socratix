
import copy
from uuid import uuid4

import pytest

from app.modules.project_generation.review import (
    ProjectReviewError,
    review_project_spec,
)


@pytest.fixture
def project():
    return {
        "contract_version": "1.0",
        "project_id": str(uuid4()),
        "project_version": 1,
        "title": "Cafe terminal",
        "target_skill_ids": [
            "python.loops",
            "python.conditionals",
        ],
        "engineering_outcome_ids": [
            "engineering.requirements.v1",
            "engineering.testing.v1",
        ],
        "student_brief": "Build a cafe ordering system.",
        "milestones": [
            {
                "milestone_id": "M1",
                "title": "Design",
                "depends_on": [],
                "assessment_method": "rubric",
                "requirement_ids": ["PR1"],
            },
            {
                "milestone_id": "M2",
                "title": "Implement and test",
                "depends_on": ["M1"],
                "assessment_method": "mixed",
                "requirement_ids": ["PR2"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


@pytest.fixture
def approved_review():
    return {
        "decision": "approved",
        "findings": ["All seven aspects are supported."],
        "planning_present": True,
        "testing_present": True,
        "change_request_present": True,
        "reflection_present": True,
        "scope_respected": True,
        "engineering_outcomes_aligned": True,
        "ambiguity_free": True,
    }


class FakeGateway:
    def __init__(self, response):
        self.response = response

    async def generate_json(self, **kwargs):
        assert kwargs["operation"] == "project_semantic_review"
        return copy.deepcopy(self.response)


@pytest.mark.asyncio
async def test_valid_review(project, approved_review):
    result = await review_project_spec(
        project,
        FakeGateway(approved_review),
        model_alias="test-model",
    )

    assert result["decision"] == "approved"


@pytest.mark.asyncio
async def test_contradictory_approval_rejected(
    project, approved_review
):
    approved_review["change_request_present"] = False

    with pytest.raises(
        ProjectReviewError,
        match="Contradictory",
    ):
        await review_project_spec(
            project,
            FakeGateway(approved_review),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_review_required_is_preserved(
    project, approved_review
):
    approved_review["decision"] = "review_required"
    approved_review["reflection_present"] = False

    result = await review_project_spec(
        project,
        FakeGateway(approved_review),
        model_alias="test-model",
    )

    assert result["decision"] == "review_required"
