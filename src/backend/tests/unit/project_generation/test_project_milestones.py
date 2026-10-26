
import copy

import pytest

from app.modules.project_generation.milestones import (
    validate_milestone_plan,
)
from app.modules.project_generation.spec import ProjectValidationError


@pytest.fixture
def project():
    return {
        "contract_version": "1.0",
        "project_id": "550e8400-e29b-41d4-a716-446655440010",
        "project_version": 1,
        "title": "Cafe ordering system",
        "target_skill_ids": [
            "python.loops",
            "python.conditionals",
        ],
        "engineering_outcome_ids": [
            "engineering.requirements.v1",
            "engineering.testing.v1",
        ],
        "student_brief": "Create a cafe ordering system.",
        "milestones": [
            {
                "milestone_id": "M1",
                "title": "Requirements and design",
                "depends_on": [],
                "assessment_method": "rubric",
                "requirement_ids": ["PR1"],
            },
            {
                "milestone_id": "M2",
                "title": "Implementation and testing",
                "depends_on": ["M1"],
                "assessment_method": "mixed",
                "requirement_ids": ["PR2"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


def test_valid_milestone_plan(project):
    result = validate_milestone_plan(project)
    assert len(result["milestones"]) == 2


def test_first_milestone_requires_rubric(project):
    modified = copy.deepcopy(project)
    modified["milestones"][0]["assessment_method"] = "tests"

    with pytest.raises(
        ProjectValidationError,
        match="design-plan rubric",
    ):
        validate_milestone_plan(modified)


def test_project_requires_executable_checkpoint(project):
    modified = copy.deepcopy(project)
    modified["milestones"][1]["assessment_method"] = "rubric"

    with pytest.raises(
        ProjectValidationError,
        match="executable testing checkpoint",
    ):
        validate_milestone_plan(modified)


def test_first_milestone_cannot_depend_on_another(project):
    modified = copy.deepcopy(project)
    modified["milestones"][0]["depends_on"] = ["M2"]

    with pytest.raises(
        ProjectValidationError,
        match="First milestone cannot have dependencies",
    ):
        validate_milestone_plan(modified)
