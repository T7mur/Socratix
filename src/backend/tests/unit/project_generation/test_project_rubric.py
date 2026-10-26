
import copy
from uuid import uuid4

import pytest

from app.modules.project_generation.rubric import (
    ProjectRubricError,
    generate_milestone_rubric,
)


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
        ],
        "student_brief": "Build a cafe ordering terminal.",
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


@pytest.fixture
def rubric():
    return {
        "criteria": [
            {
                "requirement_id": "PR1",
                "observable_evidence": "A clear design plan",
                "acceptable_alternatives": [
                    "Flowchart",
                    "Written component breakdown",
                ],
                "levels": [
                    {"level": 1, "description": "No usable plan"},
                    {"level": 2, "description": "Incomplete plan"},
                    {"level": 3, "description": "Workable plan"},
                    {"level": 4, "description": "Clear and justified plan"},
                ],
                "cannot_determine_when": (
                    "The submitted design is unreadable"
                ),
            }
        ]
    }


class FakeGateway:
    def __init__(self, response):
        self.response = response
        self.calls = 0

    async def generate_json(self, **kwargs):
        self.calls += 1
        assert kwargs["operation"] == (
            "project_milestone_rubric_generation"
        )
        return copy.deepcopy(self.response)


@pytest.mark.asyncio
async def test_valid_four_level_rubric(project, rubric):
    result = await generate_milestone_rubric(
        project, "M1", FakeGateway(rubric),
        model_alias="test-model",
    )

    assert len(result["criteria"]) == 1
    assert len(result["criteria"][0]["levels"]) == 4


@pytest.mark.asyncio
async def test_unknown_requirement_rejected(project, rubric):
    rubric["criteria"][0]["requirement_id"] = "PR999"

    with pytest.raises(
        ProjectRubricError,
        match="cover exactly",
    ):
        await generate_milestone_rubric(
            project, "M1", FakeGateway(rubric),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_duplicate_level_rejected(project, rubric):
    rubric["criteria"][0]["levels"][3]["level"] = 3

    with pytest.raises(
        ProjectRubricError,
        match="four distinct rubric levels",
    ):
        await generate_milestone_rubric(
            project, "M1", FakeGateway(rubric),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_tests_only_milestone_rejected(project, rubric):
    gateway = FakeGateway(rubric)

    with pytest.raises(
        ProjectRubricError,
        match="does not permit rubric assessment",
    ):
        await generate_milestone_rubric(
            project, "M2", gateway,
            model_alias="test-model",
        )

    assert gateway.calls == 0
