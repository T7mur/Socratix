
import pytest

from app.modules.exercise_generation import worker
from app.modules.exercise_generation.worker import (
    PreparedExercise,
    build_artifact_manifest,
)
from app.modules.exercise_generation.spec import freeze_task_spec

@pytest.fixture
def worker_inputs():
    return {
        "brief": {
            "request_id": "test-request",
            "target_skill_ids": ["python.conditionals"],
        },
        "approved_skills": {},
        "approved_outcomes": {},
        "trusted_allowed_skill_ids": set(),
        "prerequisites_by_skill": {},
        "integration_outcome_skills": {},
        "gateway": object(),
        "model_alias": "test-model",
    }


@pytest.mark.asyncio
async def test_worker_prepares_artifacts_in_order(
    monkeypatch, worker_inputs
):
    calls = []
    frozen = object()

    def fake_validate(*args, **kwargs):
        calls.append("validate")

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return {"title": "Exercise"}

    def fake_freeze(task, brief):
        calls.append("freeze")
        assert task["title"] == "Exercise"
        return frozen

    async def fake_reference(task, gateway, *, model_alias):
        calls.append("reference")
        assert task is frozen
        return {"source_code": "private code"}

    async def fake_tests(task, gateway, *, model_alias):
        calls.append("tests")
        assert task is frozen
        return {"test_cases": [{"expected": 1}]}

    monkeypatch.setattr(
        worker, "validate_eligibility", fake_validate
    )
    monkeypatch.setattr(
        worker, "generate_task_spec_async", fake_generate
    )
    monkeypatch.setattr(
        worker, "freeze_task_spec", fake_freeze
    )
    monkeypatch.setattr(
        worker, "generate_reference_candidate", fake_reference
    )
    monkeypatch.setattr(
        worker, "generate_test_candidates", fake_tests
    )

    result = await worker.prepare_exercise_candidates(
        **worker_inputs
    )

    assert calls == [
        "validate",
        "generate",
        "freeze",
        "reference",
        "tests",
    ]

    assert result.frozen_task is frozen
    assert result.reference_candidate["source_code"] == "private code"
    assert len(result.test_candidates["test_cases"]) == 1


@pytest.mark.asyncio
async def test_worker_stops_when_eligibility_fails(
    monkeypatch, worker_inputs
):
    def fake_validate(*args, **kwargs):
        raise ValueError("Unapproved curriculum skill")

    async def fake_generate(*args, **kwargs):
        pytest.fail("AI must not run after failed preflight")

    monkeypatch.setattr(
        worker, "validate_eligibility", fake_validate
    )
    monkeypatch.setattr(
        worker, "generate_task_spec_async", fake_generate
    )

    with pytest.raises(ValueError, match="Unapproved curriculum"):
        await worker.prepare_exercise_candidates(**worker_inputs)


@pytest.mark.asyncio
async def test_worker_stops_when_reference_generation_fails(
    monkeypatch, worker_inputs
):
    calls = []
    frozen = object()

    def fake_validate(*args, **kwargs):
        calls.append("validate")

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return {"title": "Exercise"}

    def fake_freeze(task, brief):
        calls.append("freeze")
        return frozen

    async def fake_reference(task, gateway, *, model_alias):
        calls.append("reference")
        raise RuntimeError("Reference provider failed")

    async def fake_tests(task, gateway, *, model_alias):
        pytest.fail("Tests must not run after reference failure")

    monkeypatch.setattr(worker, "validate_eligibility", fake_validate)
    monkeypatch.setattr(worker, "generate_task_spec_async", fake_generate)
    monkeypatch.setattr(worker, "freeze_task_spec", fake_freeze)
    monkeypatch.setattr(worker, "generate_reference_candidate", fake_reference)
    monkeypatch.setattr(worker, "generate_test_candidates", fake_tests)

    with pytest.raises(RuntimeError, match="Reference provider failed"):
        await worker.prepare_exercise_candidates(**worker_inputs)

    assert calls == ["validate", "generate", "freeze", "reference"]


@pytest.mark.asyncio
async def test_worker_does_not_return_partial_artifacts_when_tests_fail(
    monkeypatch, worker_inputs
):
    calls = []
    frozen = object()

    def fake_validate(*args, **kwargs):
        calls.append("validate")

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return {"title": "Exercise"}

    def fake_freeze(task, brief):
        calls.append("freeze")
        return frozen

    async def fake_reference(task, gateway, *, model_alias):
        calls.append("reference")
        return {"source_code": "private reference"}

    async def fake_tests(task, gateway, *, model_alias):
        calls.append("tests")
        raise RuntimeError("Test generation failed")

    monkeypatch.setattr(worker, "validate_eligibility", fake_validate)
    monkeypatch.setattr(worker, "generate_task_spec_async", fake_generate)
    monkeypatch.setattr(worker, "freeze_task_spec", fake_freeze)
    monkeypatch.setattr(worker, "generate_reference_candidate", fake_reference)
    monkeypatch.setattr(worker, "generate_test_candidates", fake_tests)

    with pytest.raises(RuntimeError, match="Test generation failed"):
        await worker.prepare_exercise_candidates(**worker_inputs)

    assert calls == [
        "validate",
        "generate",
        "freeze",
        "reference",
        "tests",
    ]


def make_prepared_exercise():
    brief = {
        "activity_type": "single_skill_exercise",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "assessment_stage": "transfer",
        "constraints": {"language": "python"},
    }

    task = {
        "contract_version": "1.0",
        "task_id": "550e8400-e29b-41d4-a716-446655440004",
        "task_version": 1,
        "activity_type": "single_skill_exercise",
        "title": "Stock classifier",
        "target_skill_ids": ["python.conditionals"],
        "outcome_ids": ["python.conditionals.transfer.v1"],
        "assessment_stage": "transfer",
        "language": "python",
        "student_brief": "Classify stock quantities.",
        "function_contract": {
            "name": "stock_status",
            "parameters": [
                {"name": "quantity", "type": "int"}
            ],
            "returns": "str",
        },
        "requirements": [
            {
                "requirement_id": "R1",
                "description": "0 returns sold_out",
            }
        ],
        "input_constraints": ["quantity is nonnegative"],
        "public_examples": [
            {"args": [0], "expected": "sold_out"}
        ],
        "explanation_questions": [
            "Why does zero return sold_out?"
        ],
        "verification_status": "draft",
        "human_review_status": "not_required",
    }

    frozen = freeze_task_spec(task, brief)

    return PreparedExercise(
        frozen_task=frozen,
        reference_candidate={
            "source_code": "def stock_status(n): return 'sold_out'",
            "explanation": "Classifies zero.",
        },
        test_candidates={
            "test_cases": [
                {
                    "requirement_id": "R1",
                    "args": [0],
                    "expected": "sold_out",
                    "category": "boundary",
                }
            ]
        },
    )


def test_artifact_manifest_contains_matching_task_identity():
    prepared = make_prepared_exercise()

    manifest = build_artifact_manifest(prepared)

    assert manifest["task_id"] == (
        "550e8400-e29b-41d4-a716-446655440004"
    )
    assert manifest["task_version"] == 1

    assert len(manifest["task_spec_hash"]) == 64
    assert len(manifest["reference_candidate_hash"]) == 64
    assert len(manifest["test_candidates_hash"]) == 64


def test_artifact_manifest_detects_changed_reference():
    prepared = make_prepared_exercise()

    original = build_artifact_manifest(prepared)

    prepared.reference_candidate["source_code"] = (
        "def stock_status(n): return 'incorrect'"
    )

    changed = build_artifact_manifest(prepared)

    assert (
        original["reference_candidate_hash"]
        != changed["reference_candidate_hash"]
    )
    assert (
        original["task_spec_hash"]
        == changed["task_spec_hash"]
    )


def test_artifact_manifest_does_not_expose_private_content():
    prepared = make_prepared_exercise()

    manifest = build_artifact_manifest(prepared)

    assert "source_code" not in manifest
    assert "test_cases" not in manifest
    assert "reference_candidate" not in manifest
    assert "test_candidates" not in manifest

    assert set(manifest) == {
        "task_id",
        "task_version",
        "task_spec_hash",
        "reference_candidate_hash",
        "test_candidates_hash",
    }
