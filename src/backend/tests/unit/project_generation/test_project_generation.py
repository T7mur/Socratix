
import copy
from uuid import uuid4

import pytest

from app.modules.project_generation.spec import (
    ProjectValidationError,
    generate_project_spec_async,
)


SKILLS = {
    "python.loops",
    "python.conditionals",
    "python.functions",
}

ENGINEERING = {
    "engineering.requirements.v1",
    "engineering.testing.v1",
}


@pytest.fixture
def brief():
    return {
        "contract_version": "1.0",
        "request_id": str(uuid4()),
        "activity_type": "project",
        "target_skill_ids": [
            "python.loops",
            "python.conditionals",
        ],
        "allowed_skill_ids": list(SKILLS),
        "excluded_skill_ids": [],
        "outcome_ids": [
            "python.loops.transfer.v1",
        ],
        "assessment_stage": "transfer",
        "difficulty_level": 2,
        "preferred_context": "Cafe",
        "constraints": {
            "max_minutes": 120,
            "language": "python",
        },
    }


@pytest.fixture
def project():
    return {
        "contract_version": "1.0",
        "project_id": str(uuid4()),
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
        "student_brief": "Build a cafe terminal.",
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
                "title": "Implementation",
                "depends_on": ["M1"],
                "assessment_method": "tests",
                "requirement_ids": ["PR2"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


class FakeGateway:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def generate_json(self, **kwargs):
        self.calls += 1
        assert kwargs["operation"] == "project_spec_generation"
        return copy.deepcopy(self.result)


async def generate(brief, gateway):
    return await generate_project_spec_async(
        brief,
        approved_skill_ids=SKILLS,
        approved_engineering_outcome_ids=ENGINEERING,
        gateway=gateway,
        model_alias="test-model",
    )


@pytest.mark.asyncio
async def test_valid_project_generation(brief, project):
    gateway = FakeGateway(project)

    result = await generate(brief, gateway)

    assert result["title"] == "Cafe ordering system"
    assert gateway.calls == 1


@pytest.mark.asyncio
async def test_unapproved_skill_is_rejected(brief, project):
    project["target_skill_ids"].append("python.classes")

    with pytest.raises(
        ProjectValidationError,
        match="unapproved target skills",
    ):
        await generate(brief, FakeGateway(project))


@pytest.mark.asyncio
async def test_missing_requested_skill_is_rejected(brief, project):
    project["target_skill_ids"] = [
        "python.loops",
        "python.functions",
    ]

    with pytest.raises(
        ProjectValidationError,
        match="omitted requested target skills",
    ):
        await generate(brief, FakeGateway(project))


@pytest.mark.asyncio
async def test_ai_cannot_mark_project_verified(brief, project):
    project["verification_status"] = "verified"

    with pytest.raises(
        ProjectValidationError,
        match="must start as drafts",
    ):
        await generate(brief, FakeGateway(project))


@pytest.mark.asyncio
async def test_invalid_brief_rejected_before_ai(brief, project):
    brief["activity_type"] = "single_skill_exercise"
    gateway = FakeGateway(project)

    with pytest.raises(
        ProjectValidationError,
        match="must request a project",
    ):
        await generate(brief, gateway)

    assert gateway.calls == 0
