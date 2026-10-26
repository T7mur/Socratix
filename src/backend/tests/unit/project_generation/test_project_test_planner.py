
import copy
from uuid import uuid4

import pytest

from app.modules.project_generation.test_planner import (
    ProjectTestPlanningError,
    generate_milestone_test_candidates,
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
                "title": "Order processing",
                "depends_on": ["M1"],
                "assessment_method": "tests",
                "requirement_ids": ["PR2", "PR3"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


@pytest.fixture
def cases():
    return {
        "test_cases": [
            {
                "requirement_id": "PR2",
                "actions": ["Select a valid menu item"],
                "expected_result": "Item added to order",
                "category": "normal",
                "invariant": None,
            },
            {
                "requirement_id": "PR3",
                "actions": [
                    "Set stock to 1",
                    "Purchase item",
                    "Attempt another purchase",
                ],
                "expected_result": "Second purchase is rejected",
                "category": "stateful",
                "invariant": "Stock cannot become negative",
            },
        ]
    }


class FakeGateway:
    def __init__(self, response):
        self.response = response
        self.calls = 0

    async def generate_json(self, **kwargs):
        self.calls += 1
        assert (
            kwargs["operation"]
            == "project_milestone_test_generation"
        )
        return copy.deepcopy(self.response)


@pytest.mark.asyncio
async def test_valid_milestone_tests(project, cases):
    result = await generate_milestone_test_candidates(
        project, "M2", FakeGateway(cases),
        model_alias="test-model",
    )

    assert len(result["test_cases"]) == 2


@pytest.mark.asyncio
async def test_unknown_requirement_fails(project, cases):
    cases["test_cases"][1]["requirement_id"] = "PR999"

    with pytest.raises(
        ProjectTestPlanningError,
        match="cover exactly",
    ):
        await generate_milestone_test_candidates(
            project, "M2", FakeGateway(cases),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_missing_requirement_fails(project, cases):
    cases["test_cases"].pop()

    with pytest.raises(
        ProjectTestPlanningError,
        match="cover exactly",
    ):
        await generate_milestone_test_candidates(
            project, "M2", FakeGateway(cases),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_stateful_test_requires_invariant(project, cases):
    cases["test_cases"][1]["invariant"] = None

    with pytest.raises(
        ProjectTestPlanningError,
        match="specify an invariant",
    ):
        await generate_milestone_test_candidates(
            project, "M2", FakeGateway(cases),
            model_alias="test-model",
        )


@pytest.mark.asyncio
async def test_rubric_only_milestone_rejected(project, cases):
    gateway = FakeGateway(cases)

    with pytest.raises(
        ProjectTestPlanningError,
        match="does not permit executable tests",
    ):
        await generate_milestone_test_candidates(
            project, "M1", gateway,
            model_alias="test-model",
        )

    assert gateway.calls == 0
