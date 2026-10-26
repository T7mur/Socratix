
"""Internal coordination for Component B exercise generation.

This prepares candidate artifacts only.
It does not persist, verify, approve, or publish exercises.
"""

from dataclasses import dataclass
from typing import Any

from app.modules.exercise_generation.reference import (
    generate_model_answer_candidate,
)
from app.modules.exercise_generation.tests import generate_rubric_candidate
from app.modules.exercise_generation.spec import (
    FrozenTaskSpec,
    generate_task_spec_async,
    freeze_task_spec,
    is_duplicate_task,
)
from app.modules.exercise_generation.review import review_exercise_spec
import hashlib
import json
from app.modules.exercise_generation.brief import validate_eligibility
from app.modules.exercise_generation.spec import (
    FrozenTaskSpec,
    generate_task_spec_async,
    freeze_task_spec,
)
from app.modules.exercise_generation.reference import (
    generate_reference_candidate,
)
from app.modules.exercise_generation.tests import (
    generate_test_candidates,
)


class SemanticReviewBlocked(RuntimeError):
    """An exercise cannot advance automatically after semantic review."""

    def __init__(self, review_report: dict[str, Any]):
        self.review_report = review_report
        super().__init__(
            f"Semantic review blocked: {review_report['decision']}"
        )

class DuplicateExerciseError(RuntimeError):
    """An identical exercise already exists."""

@dataclass
class PreparedExercise:
    """Private worker-side result. Never return from a public API."""

    frozen_task: FrozenTaskSpec
    reference_candidate: dict[str, Any]
    test_candidates: dict[str, Any]
    semantic_review_report: dict[str, Any] | None = None
    rubric_candidate: dict[str, Any] | None = None


async def prepare_exercise_candidates(
    *,
    brief: dict[str, Any],
    approved_skills: dict[str, Any],
    approved_outcomes: dict[str, Any],
    trusted_allowed_skill_ids: set[str],
    prerequisites_by_skill: dict[str, list[str]],
    integration_outcome_skills: dict[str, Any],
    gateway: Any,
    model_alias: str,
    existing_tasks: tuple[FrozenTaskSpec, ...],
) -> PreparedExercise:
    """Prepare exercise artifacts using approved curriculum inputs.

    Trusted curriculum inputs must originate from the backend,
    not directly from the student request.
    """

    # 1. Deterministic curriculum eligibility.
    validate_eligibility(
        brief,
        approved_skills,
        approved_outcomes,
        trusted_allowed_skill_ids=trusted_allowed_skill_ids,
        prerequisites_by_skill=prerequisites_by_skill,
        integration_outcome_skills=integration_outcome_skills,
    )


    # 2. Generate the student-facing specification.
    task = await generate_task_spec_async(
        brief,
        approved_outcome_context=approved_outcomes,
        gateway=gateway,
        model_alias=model_alias,
    )

    # 3. Freeze the validated specification.
    frozen_task = freeze_task_spec(task, brief)

    # 4. Check exact duplicates before further AI generation.
    if existing_tasks and is_duplicate_task(
        frozen_task, list(existing_tasks)
    ):
        raise DuplicateExerciseError(
            "An identical exercise already exists"
        )

    # 5. Independently review the frozen exercise.
    semantic_review_report = await review_exercise_spec(
        frozen_task,
        gateway,
        model_alias=model_alias,
        approved_outcome_context=approved_outcomes,
    )

    if semantic_review_report["decision"] != "approved":
        raise SemanticReviewBlocked(semantic_review_report)


    # 6. Select the appropriate private reference and assessment path.
    if task.get("function_contract") is None:
        # Written-answer exercise: model answer and grading rubric.
        reference_candidate = await generate_model_answer_candidate(
            frozen_task,
            gateway,
            model_alias=model_alias,
        )

        test_candidates = {}

        rubric_candidate = await generate_rubric_candidate(
            frozen_task,
            gateway,
            model_alias=model_alias,
        )
    else:
        # Coding exercise: Python reference and independent hidden tests.
        reference_candidate = await generate_reference_candidate(
            frozen_task,
            gateway,
            model_alias=model_alias,
        )

        test_candidates = await generate_test_candidates(
            frozen_task,
            gateway,
            model_alias=model_alias,
        )

        rubric_candidate = None



    return PreparedExercise(
        frozen_task=frozen_task,
        reference_candidate=reference_candidate,
        test_candidates=test_candidates,
        semantic_review_report=semantic_review_report,
        rubric_candidate=rubric_candidate,
    )



def build_artifact_manifest(prepared: PreparedExercise) -> dict[str, Any]:
    """Build a private, version-specific artifact manifest.

    This records which TaskSpec and candidate artifacts belong
    together. It does not persist or verify them.
    """

    if not isinstance(prepared, PreparedExercise):
        raise TypeError("Expected PreparedExercise")

    if not isinstance(prepared.frozen_task, FrozenTaskSpec):
        raise ValueError("Expected a frozen TaskSpec")

    task = prepared.frozen_task.to_payload()

    def fingerprint(value: Any) -> str:
        encoded = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")

        return hashlib.sha256(encoded).hexdigest()

    task_id = task["task_id"]
    task_version = task["task_version"]

    if not isinstance(task_id, str) or not task_id:
        raise ValueError("Invalid task_id")

    if (
        isinstance(task_version, bool)
        or not isinstance(task_version, int)
        or task_version < 1
    ):
        raise ValueError("Invalid task_version")

    return {
        "task_id": task_id,
        "task_version": task_version,
        "task_spec_hash": fingerprint(task),
        "reference_candidate_hash": fingerprint(
            prepared.reference_candidate
        ),
        "test_candidates_hash": fingerprint(
            prepared.test_candidates
        ),
        "rubric_candidate_hash": (
            fingerprint(prepared.rubric_candidate)
            if prepared.rubric_candidate is not None
            else None
        ),
    }
