
import copy
from uuid import uuid4

import pytest

from app.modules.project_generation import worker


@pytest.fixture
def worker_inputs():
    return {
        "brief": {
            "activity_type": "project",
            "target_skill_ids": [
                "python.loops",
                "python.conditionals",
            ],
        },
        "approved_skill_ids": {
            "python.loops",
            "python.conditionals",
        },
        "approved_engineering_outcome_ids": {
            "engineering.requirements.v1",
            "engineering.testing.v1",
        },
        "gateway": object(),
        "model_alias": "test-model",
    }


@pytest.fixture(autouse=True)
def mock_project_review(monkeypatch):
    async def fake_review(project, gateway, *, model_alias):
        return {
            "decision": "approved",
            "findings": ["Project review checks passed."],
            "planning_present": True,
            "testing_present": True,
            "change_request_present": True,
            "reflection_present": True,
            "scope_respected": True,
            "engineering_outcomes_aligned": True,
            "ambiguity_free": True,
        }

    monkeypatch.setattr(
        worker, "review_project_spec", fake_review
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
            {
                "milestone_id": "M3",
                "title": "Modification",
                "depends_on": ["M2"],
                "assessment_method": "mixed",
                "requirement_ids": ["PR3"],
            },
        ],
        "verification_status": "draft",
        "human_review_status": "pending",
    }


@pytest.mark.asyncio
async def test_worker_selects_all_assessment_paths(
    monkeypatch, worker_inputs, project
):
    calls = []

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return copy.deepcopy(project)

    async def fake_tests(spec, milestone_id, *args, **kwargs):
        calls.append(("tests", milestone_id))
        return {"test_cases": [{"requirement_id": "PR2"}]}

    async def fake_rubric(spec, milestone_id, *args, **kwargs):
        calls.append(("rubric", milestone_id))
        return {"criteria": [{"requirement_id": "PR1"}]}

    monkeypatch.setattr(
        worker, "generate_project_spec_async", fake_generate
    )
    monkeypatch.setattr(
        worker, "generate_milestone_test_candidates", fake_tests
    )
    monkeypatch.setattr(
        worker, "generate_milestone_rubric", fake_rubric
    )

    result = await worker.prepare_project_candidates(
        **worker_inputs
    )

    assert calls == [
        "generate",
        ("rubric", "M1"),
        ("tests", "M2"),
        ("tests", "M3"),
        ("rubric", "M3"),
    ]

    assert len(result.private_assessments) == 3
    assert result.private_assessments[0].test_candidates is None
    assert result.private_assessments[1].rubric_candidate is None
    assert result.private_assessments[2].test_candidates is not None
    assert result.private_assessments[2].rubric_candidate is not None


@pytest.mark.asyncio
async def test_public_project_excludes_private_artifacts(
    monkeypatch, worker_inputs, project
):
    async def fake_generate(*args, **kwargs):
        return copy.deepcopy(project)

    async def fake_tests(*args, **kwargs):
        return {"secret_test": "PRIVATE_TEST_MARKER"}

    async def fake_rubric(*args, **kwargs):
        return {"secret_rubric": "PRIVATE_RUBRIC_MARKER"}

    monkeypatch.setattr(
        worker, "generate_project_spec_async", fake_generate
    )
    monkeypatch.setattr(
        worker, "generate_milestone_test_candidates", fake_tests
    )
    monkeypatch.setattr(
        worker, "generate_milestone_rubric", fake_rubric
    )

    result = await worker.prepare_project_candidates(
        **worker_inputs
    )

    public = result.public_project()

    assert "PRIVATE_TEST_MARKER" not in str(public)
    assert "PRIVATE_RUBRIC_MARKER" not in str(public)
    assert "private_assessments" not in public


@pytest.mark.asyncio
async def test_worker_stops_on_assessment_failure(
    monkeypatch, worker_inputs, project
):
    calls = []

    async def fake_generate(*args, **kwargs):
        return copy.deepcopy(project)

    async def fake_tests(*args, **kwargs):
        calls.append("tests")
        raise RuntimeError("Assessment provider failed")

    async def fake_rubric(*args, **kwargs):
        calls.append("rubric")
        return {"criteria": []}

    monkeypatch.setattr(
        worker, "generate_project_spec_async", fake_generate
    )
    monkeypatch.setattr(
        worker, "generate_milestone_test_candidates", fake_tests
    )
    monkeypatch.setattr(
        worker, "generate_milestone_rubric", fake_rubric
    )

    with pytest.raises(
        RuntimeError,
        match="Assessment provider failed",
    ):
        await worker.prepare_project_candidates(
            **worker_inputs
        )

    assert calls == ["rubric", "tests"]


@pytest.mark.asyncio
async def test_worker_stops_before_assessments_if_review_blocks(
    monkeypatch, worker_inputs, project
):
    async def fake_generate(*args, **kwargs):
        return copy.deepcopy(project)

    async def fake_review(*args, **kwargs):
        return {
            "decision": "review_required",
            "findings": ["Change request is unclear."],
        }

    async def forbidden(*args, **kwargs):
        pytest.fail(
            "Private assessments must not run after blocked review"
        )

    monkeypatch.setattr(
        worker, "generate_project_spec_async", fake_generate
    )
    monkeypatch.setattr(
        worker, "review_project_spec", fake_review
    )
    monkeypatch.setattr(
        worker, "generate_milestone_test_candidates", forbidden
    )
    monkeypatch.setattr(
        worker, "generate_milestone_rubric", forbidden
    )

    with pytest.raises(
        worker.ProjectReviewBlocked,
        match="review_required",
    ):
        await worker.prepare_project_candidates(
            **worker_inputs
        )
