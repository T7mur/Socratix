
import pytest

from app.modules.exercise_generation import worker
from app.modules.exercise_generation.spec import (
    freeze_task_spec,
    is_duplicate_task,
    task_content_fingerprint,
)
from app.modules.exercise_generation.worker import (
    PreparedExercise,
    build_artifact_manifest,
)

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
        "existing_tasks": (),
    }


@pytest.fixture(autouse=True)
def mock_semantic_review(monkeypatch):
    """Keep existing worker tests independent of the real AI reviewer."""

    async def approved_review(
        frozen_task, gateway, *, model_alias, approved_outcome_context
    ):
        return {
            "decision": "approved",
            "findings": ["No semantic issues detected."],
            "requirements_aligned": True,
            "outcomes_aligned": True,
            "scope_respected": True,
            "examples_consistent": True,

        }

    monkeypatch.setattr(
        worker,
        "review_exercise_spec",
        approved_review,
    )



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
        return {
            "title": "Exercise",
            "function_contract": {"name": "stock_status"},
        }

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


    async def fake_review(
        task, gateway, *, model_alias, approved_outcome_context
    ):
        calls.append("review")
        assert task is frozen
        return {
            "decision": "approved",
            "findings": ["Exercise is consistent."],
            "requirements_aligned": True,
            "outcomes_aligned": True,
            "scope_respected": True,
            "examples_consistent": True,
        }



    monkeypatch.setattr(
        worker, "validate_eligibility", fake_validate
    )
    monkeypatch.setattr(
        worker, "review_exercise_spec", fake_review
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
        "review",
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
        return {
    "title": "Exercise",
    "function_contract": {"name": "stock_status"},
}

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
        return {
    "title": "Exercise",
    "function_contract": {"name": "stock_status"},
}

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
        "rubric_candidate_hash",
    }

    # Coding exercises do not have a non-coding grading rubric.
    assert manifest["rubric_candidate_hash"] is None


def test_identical_task_has_same_content_fingerprint():
    first = make_prepared_exercise().frozen_task
    second = make_prepared_exercise().frozen_task

    assert (
        task_content_fingerprint(first)
        == task_content_fingerprint(second)
    )


def test_duplicate_task_is_detected():
    candidate = make_prepared_exercise().frozen_task
    existing = make_prepared_exercise().frozen_task

    assert is_duplicate_task(candidate, [existing]) is True


def test_no_duplicate_when_existing_list_is_empty():
    candidate = make_prepared_exercise().frozen_task

    assert is_duplicate_task(candidate, []) is False


def test_mutable_task_cannot_be_fingerprinted():
    with pytest.raises(TypeError, match="FrozenTaskSpec"):
        task_content_fingerprint(
            {"title": "Unfrozen task"}
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "decision",
    ["review_required", "rejected"],
)
async def test_worker_stops_when_semantic_review_blocks(
    monkeypatch, worker_inputs, decision
):
    calls = []
    frozen = object()

    def fake_validate(*args, **kwargs):
        calls.append("validate")

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return {
    "title": "Exercise",
    "function_contract": {"name": "stock_status"},
}

    def fake_freeze(task, brief):
        calls.append("freeze")
        return frozen

    async def fake_review(
        task, gateway, *, model_alias, approved_outcome_context
    ):
        calls.append("review")
        assert task is frozen
        return {
            "decision": decision,
            "findings": ["Exercise requires further examination."],
            "requirements_aligned": False,
            "outcomes_aligned": False,
            "scope_respected": True,
            "examples_consistent": True,
        }

    async def fake_reference(*args, **kwargs):
        pytest.fail(
            "Reference generation must not run after blocked review"
        )

    async def fake_tests(*args, **kwargs):
        pytest.fail(
            "Hidden-test generation must not run after blocked review"
        )

    monkeypatch.setattr(worker, "validate_eligibility", fake_validate)
    monkeypatch.setattr(worker, "generate_task_spec_async", fake_generate)
    monkeypatch.setattr(worker, "freeze_task_spec", fake_freeze)
    monkeypatch.setattr(worker, "review_exercise_spec", fake_review)
    monkeypatch.setattr(
        worker, "generate_reference_candidate", fake_reference
    )
    monkeypatch.setattr(
        worker, "generate_test_candidates", fake_tests
    )

    with pytest.raises(
        worker.SemanticReviewBlocked,
        match="Semantic review blocked",
    ) as error:
        await worker.prepare_exercise_candidates(**worker_inputs)

    assert error.value.review_report["decision"] == decision

    assert calls == [
        "validate",
        "generate",
        "freeze",
        "review",
    ]


@pytest.mark.asyncio
async def test_worker_rejects_duplicate_before_private_generation(
    monkeypatch, worker_inputs
):
    existing = make_prepared_exercise().frozen_task

    def fake_validate(*args, **kwargs):
        pass

    async def fake_generate(*args, **kwargs):
        return {"title": "Duplicate"}

    def fake_freeze(task, brief):
        return existing

    async def forbidden(*args, **kwargs):
        pytest.fail("Pipeline must stop after duplicate detection")

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
        worker, "review_exercise_spec", forbidden
    )
    monkeypatch.setattr(
        worker, "generate_reference_candidate", forbidden
    )
    monkeypatch.setattr(
        worker, "generate_test_candidates", forbidden
    )

    with pytest.raises(
        worker.DuplicateExerciseError,
        match="identical exercise",
    ):
        await worker.prepare_exercise_candidates(
            **{
                **worker_inputs,
                "existing_tasks": (existing,),
            }
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("is_coding", [True, False])
async def test_worker_selects_correct_assessment_path(
    monkeypatch, worker_inputs, is_coding
):
    calls = []
    frozen = object()

    def fake_validate(*args, **kwargs):
        calls.append("validate")

    async def fake_generate(*args, **kwargs):
        calls.append("generate")
        return {
            "title": "Example exercise",
            "function_contract": (
                {"name": "solve"} if is_coding else None
            ),
        }

    def fake_freeze(task, brief):
        calls.append("freeze")
        return frozen

    async def fake_review(
        task, gateway, *, model_alias, approved_outcome_context
    ):
        calls.append("review")
        return {"decision": "approved"}

    async def fake_reference(*args, **kwargs):
        calls.append("coding_reference")
        return {"source_code": "def solve(): return 1"}

    async def fake_model_answer(*args, **kwargs):
        calls.append("model_answer")
        return {"answer_text": "Explanation of the concept."}

    async def fake_tests(*args, **kwargs):
        calls.append("hidden_tests")
        return {"test_cases": [{"args": [], "expected": 1}]}

    async def fake_rubric(*args, **kwargs):
        calls.append("rubric")
        return {
            "criteria": [
                {"requirement_id": "R1", "max_points": 5}
            ]
        }

    monkeypatch.setattr(worker, "validate_eligibility", fake_validate)
    monkeypatch.setattr(worker, "generate_task_spec_async", fake_generate)
    monkeypatch.setattr(worker, "freeze_task_spec", fake_freeze)
    monkeypatch.setattr(worker, "review_exercise_spec", fake_review)
    monkeypatch.setattr(
        worker, "generate_reference_candidate", fake_reference
    )
    monkeypatch.setattr(
        worker, "generate_model_answer_candidate", fake_model_answer
    )
    monkeypatch.setattr(
        worker, "generate_test_candidates", fake_tests
    )
    monkeypatch.setattr(
        worker, "generate_rubric_candidate", fake_rubric
    )

    result = await worker.prepare_exercise_candidates(**worker_inputs)

    if is_coding:
        assert calls == [
            "validate",
            "generate",
            "freeze",
            "review",
            "coding_reference",
            "hidden_tests",
        ]
        assert "source_code" in result.reference_candidate
        assert result.test_candidates["test_cases"]
        assert result.rubric_candidate is None

    else:
        assert calls == [
            "validate",
            "generate",
            "freeze",
            "review",
            "model_answer",
            "rubric",
        ]
        assert "answer_text" in result.reference_candidate
        assert result.test_candidates == {}
        assert result.rubric_candidate["criteria"]

def test_artifact_manifest_tracks_rubric_changes():
    from dataclasses import replace

    prepared = make_prepared_exercise()

    with_rubric = replace(
        prepared,
        rubric_candidate={
            "criteria": [
                {"requirement_id": "R1", "max_points": 5}
            ]
        },
    )

    changed_rubric = replace(
        prepared,
        rubric_candidate={
            "criteria": [
                {"requirement_id": "R1", "max_points": 10}
            ]
        },
    )

    first = worker.build_artifact_manifest(with_rubric)
    second = worker.build_artifact_manifest(changed_rubric)

    assert first["rubric_candidate_hash"] is not None
    assert first["rubric_candidate_hash"] != second["rubric_candidate_hash"]

    assert first["task_spec_hash"] == second["task_spec_hash"]
    assert first["reference_candidate_hash"] == second["reference_candidate_hash"]