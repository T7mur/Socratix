
import copy

import pytest

from app.modules.exercise_generation.brief import (
    BriefValidationError,
    validate_brief,
)

from app.modules.exercise_generation.brief import (
    BriefValidationError,
    validate_brief,
    validate_eligibility,
)

@pytest.fixture
def valid_data():
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
            "max_minutes": 25,
            "language": "python",
        },
        "generation_policy_version": "generation-v1",
    }

    skills = {
        "python.conditionals": {
            "approval_status": "approved",
        }
    }

    outcomes = {
        "python.conditionals.transfer.v1": {
            "approval_status": "approved",
            "skill_id": "python.conditionals",
            "stage": "transfer",
        }
    }

    return brief, skills, outcomes


def test_valid_brief_passes(valid_data):
    brief, skills, outcomes = valid_data

    validate_brief(brief, skills, outcomes)


def test_unapproved_skill_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    skills["python.conditionals"]["approval_status"] = "proposed"

    with pytest.raises(BriefValidationError):
        validate_brief(brief, skills, outcomes)


def test_excluded_skill_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["excluded_skill_ids"].append("python.conditionals")

    with pytest.raises(BriefValidationError):
        validate_brief(brief, skills, outcomes)


def test_mismatched_outcome_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    outcomes["python.conditionals.transfer.v1"]["skill_id"] = "python.loops"

    with pytest.raises(BriefValidationError):
        validate_brief(brief, skills, outcomes)


def test_invalid_activity_type_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["activity_type"] = "project"

    with pytest.raises(BriefValidationError):
        validate_brief(brief, skills, outcomes)


def test_wrong_assessment_stage_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["assessment_stage"] = "recall"

    with pytest.raises(BriefValidationError):
        validate_brief(brief, skills, outcomes)


def test_valid_prerequisite_chain_passes(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    skills["python.variables"] = {"approval_status": "approved"}

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


def test_missing_prerequisite_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["allowed_skill_ids"] = ["python.conditionals"]
    skills["python.variables"] = {"approval_status": "approved"}

    with pytest.raises(BriefValidationError):
        validate_eligibility(
            brief,
            skills,
            outcomes,
            trusted_allowed_skill_ids={"python.conditionals"},
            prerequisites_by_skill={
                "python.variables": [],
                "python.conditionals": ["python.variables"],
            },
            integration_outcome_skills={},
        )


def test_untrusted_allowed_skills_fail(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    with pytest.raises(BriefValidationError):
        validate_eligibility(
            brief,
            skills,
            outcomes,
            trusted_allowed_skill_ids={"python.conditionals"},
            prerequisites_by_skill={
                "python.conditionals": [],
            },
            integration_outcome_skills={},
        )


def test_multi_skill_without_integration_outcome_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["activity_type"] = "multi_skill_exercise"
    brief["target_skill_ids"] = [
        "python.conditionals",
        "python.loops",
    ]
    brief["allowed_skill_ids"].append("python.loops")

    skills["python.loops"] = {"approval_status": "approved"}

    outcomes["python.loops.transfer.v1"] = {
        "approval_status": "approved",
        "skill_id": "python.loops",
        "stage": "transfer",
    }
    brief["outcome_ids"].append("python.loops.transfer.v1")

    with pytest.raises(BriefValidationError):
        validate_eligibility(
            brief,
            skills,
            outcomes,
            trusted_allowed_skill_ids={
                "python.variables",
                "python.conditionals",
                "python.loops",
            },
            prerequisites_by_skill={
                "python.variables": [],
                "python.conditionals": ["python.variables"],
                "python.loops": ["python.conditionals"],
            },
            integration_outcome_skills={},
        )

def test_circular_prerequisites_fail(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)
    skills["python.variables"] = {"approval_status": "approved"}

    with pytest.raises(BriefValidationError, match="Circular"):
        validate_eligibility(
            brief,
            skills,
            outcomes,
            trusted_allowed_skill_ids={
                "python.variables",
                "python.conditionals",
            },
            prerequisites_by_skill={
                "python.variables": ["python.conditionals"],
                "python.conditionals": ["python.variables"],
            },
            integration_outcome_skills={},
        )


def test_missing_prerequisite_graph_data_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    with pytest.raises(BriefValidationError, match="data unavailable"):
        validate_eligibility(
            brief,
            skills,
            outcomes,
            trusted_allowed_skill_ids={
                "python.variables",
                "python.conditionals",
            },
            prerequisites_by_skill={},
            integration_outcome_skills={},
        )


def test_unapproved_prerequisite_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)
    skills["python.variables"] = {"approval_status": "proposed"}

    with pytest.raises(BriefValidationError, match="not approved"):
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

def test_valid_multi_skill_integration_passes(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["activity_type"] = "multi_skill_exercise"
    brief["target_skill_ids"] = [
        "python.conditionals",
        "python.loops",
    ]
    brief["allowed_skill_ids"].append("python.loops")

    integration_id = "python.loops_conditionals.integration.v1"
    brief["outcome_ids"] = [integration_id]

    skills["python.variables"] = {"approval_status": "approved"}
    skills["python.loops"] = {"approval_status": "approved"}

    outcomes[integration_id] = {
        "approval_status": "approved",
        "stage": "transfer",
    }

    validate_eligibility(
        brief,
        skills,
        outcomes,
        trusted_allowed_skill_ids={
            "python.variables",
            "python.conditionals",
            "python.loops",
        },
        prerequisites_by_skill={
            "python.variables": [],
            "python.conditionals": ["python.variables"],
            "python.loops": ["python.conditionals"],
        },
        integration_outcome_skills={
            integration_id: {
                "python.conditionals",
                "python.loops",
            },
        },
    )

@pytest.mark.parametrize(
    "field",
    ["request_id", "student_id", "course_id"],
)
def test_missing_required_uuid_fails(valid_data, field):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    del brief[field]

    with pytest.raises(BriefValidationError, match=field):
        validate_brief(brief, skills, outcomes)


def test_invalid_uuid_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["request_id"] = "not-a-uuid"

    with pytest.raises(BriefValidationError, match="request_id"):
        validate_brief(brief, skills, outcomes)


def test_missing_generation_policy_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    del brief["generation_policy_version"]

    with pytest.raises(
        BriefValidationError,
        match="generation_policy_version",
    ):
        validate_brief(brief, skills, outcomes)


def test_invalid_preferred_context_fails(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    brief["preferred_context"] = 123

    with pytest.raises(
        BriefValidationError,
        match="preferred_context",
    ):
        validate_brief(brief, skills, outcomes)


def test_valid_request_identifiers_pass(valid_data):
    brief, skills, outcomes = copy.deepcopy(valid_data)

    validate_brief(brief, skills, outcomes)
