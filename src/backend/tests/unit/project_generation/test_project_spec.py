
import copy

import pytest

from app.modules.project_generation.spec import (
    ProjectValidationError,
    validate_project_spec,
)


APPROVED_SKILLS = {
    "python.loops",
    "python.conditionals",
    "python.functions",
}

APPROVED_ENGINEERING = {
    "engineering.requirements.v1",
    "engineering.testing.v1",
}


@pytest.fixture
def valid_project():
    return {
        "contract_version": "1.0",
        "project_id": "550e8400-e29b-41d4-a716-446655440010",
        "project_version": 1,
        "title": "Cafe terminal ordering system",
        "target_skill_ids": [
            "python.loops",
            "python.conditionals",
            "python.functions",
        ],
        "engineering_outcome_ids": [
            "engineering.requirements.v1",
            "engineering.testing.v1",
        ],
        "student_brief": (
            "Build a cafe ordering system without classes."
        ),
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
                "title": "Order processing",
                "depends_on": ["M1"],
                "assessment_method": "mixed",
                "requirement_ids": ["PR2"],
            },
            {
                "milestone_id": "M3",
                "title": "Testing",
                "depends_on": ["M2"],
                "assessment_method": "tests",
                "requirement_ids": ["PR3"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


def validate(project):
    return validate_project_spec(
        project,
        approved_skill_ids=APPROVED_SKILLS,
        approved_engineering_outcome_ids=APPROVED_ENGINEERING,
    )


def test_valid_project_passes(valid_project):
    result = validate(valid_project)

    assert result["project_version"] == 1
    assert len(result["milestones"]) == 3


def test_unapproved_skill_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["target_skill_ids"].append("python.classes")

    with pytest.raises(
        ProjectValidationError,
        match="unapproved target skills",
    ):
        validate(project)


def test_missing_engineering_outcomes_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["engineering_outcome_ids"] = []

    with pytest.raises(ProjectValidationError):
        validate(project)


def test_duplicate_milestone_ids_fail(valid_project):
    project = copy.deepcopy(valid_project)
    project["milestones"][1]["milestone_id"] = "M1"

    with pytest.raises(
        ProjectValidationError,
        match="Duplicate milestone IDs",
    ):
        validate(project)


def test_forward_dependency_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["milestones"][0]["depends_on"] = ["M3"]

    with pytest.raises(
        ProjectValidationError,
        match="forward dependency",
    ):
        validate(project)


def test_unknown_dependency_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["milestones"][1]["depends_on"] = ["M999"]

    with pytest.raises(
        ProjectValidationError,
        match="Invalid or forward dependency",
    ):
        validate(project)


def test_invalid_assessment_method_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["milestones"][1]["assessment_method"] = "automatic"

    with pytest.raises(
        ProjectValidationError,
        match="Invalid assessment method",
    ):
        validate(project)


def test_unknown_public_field_fails(valid_project):
    project = copy.deepcopy(valid_project)
    project["private_reference_solution"] = "secret code"

    with pytest.raises(
        ProjectValidationError,
        match="Invalid ProjectSpec structure",
    ):
        validate(project)
