
"""Coordinate project generation and private milestone assessments."""

import hashlib
import json
from dataclasses import dataclass
from typing import Any
from app.modules.project_generation.review import (
    ProjectReviewBlocked,
    review_project_spec,
)

from app.modules.project_generation.spec import (
    generate_project_spec_async,
)
from app.modules.project_generation.milestones import (
    validate_milestone_plan,
)
from app.modules.project_generation.test_planner import (
    generate_milestone_test_candidates,
)
from app.modules.project_generation.rubric import (
    generate_milestone_rubric,
)


@dataclass(frozen=True)
class MilestoneAssessmentCandidates:
    """Private assessment candidates for one milestone."""

    milestone_id: str
    test_candidates: dict[str, Any] | None
    rubric_candidate: dict[str, Any] | None


@dataclass(frozen=True)
class PreparedProject:
    """A project draft and its separate private assessment candidates."""

    public_project_json: str
    project_fingerprint: str
    private_assessments: tuple[MilestoneAssessmentCandidates, ...]
    semantic_review_report: dict[str, Any] | None = None

    def public_project(self) -> dict[str, Any]:
        """Return only the public ProjectSpec, never private artifacts."""
        return json.loads(self.public_project_json)


async def prepare_project_candidates(
    *,
    brief: dict[str, Any],
    approved_skill_ids: set[str],
    approved_engineering_outcome_ids: set[str],
    gateway: Any,
    model_alias: str,
) -> PreparedProject:
    """Prepare a project draft without publishing or verifying it."""

    # 1. Generate and validate the public project specification.
    project = await generate_project_spec_async(
        brief,
        approved_skill_ids=approved_skill_ids,
        approved_engineering_outcome_ids=(
            approved_engineering_outcome_ids
        ),
        gateway=gateway,
        model_alias=model_alias,
    )

    # 2. Apply deterministic milestone-plan checks.
    project = validate_milestone_plan(project)

    # 3. Freeze an independent JSON snapshot before private generation.
    public_json = json.dumps(
        project,
        sort_keys=True,
        separators=(",", ":"),
    )

    frozen_project = json.loads(public_json)

    # Independently review before generating private assessments.
    review_report = await review_project_spec(
        frozen_project,
        gateway,
        model_alias=model_alias,
    )

    if review_report["decision"] != "approved":
        raise ProjectReviewBlocked(review_report)


    fingerprint = hashlib.sha256(
        public_json.encode("utf-8")
    ).hexdigest()

    # 4. Prepare private assessment candidates independently.
    assessments = []

    for milestone in frozen_project["milestones"]:
        milestone_id = milestone["milestone_id"]
        method = milestone["assessment_method"]

        test_candidates = None
        rubric_candidate = None

        if method in {"tests", "mixed"}:
            test_candidates = await generate_milestone_test_candidates(
                frozen_project,
                milestone_id,
                gateway,
                model_alias=model_alias,
            )

        if method in {"rubric", "mixed"}:
            rubric_candidate = await generate_milestone_rubric(
                frozen_project,
                milestone_id,
                gateway,
                model_alias=model_alias,
            )

        assessments.append(
            MilestoneAssessmentCandidates(
                milestone_id=milestone_id,
                test_candidates=test_candidates,
                rubric_candidate=rubric_candidate,
            )
        )

    return PreparedProject(
        public_project_json=public_json,
        project_fingerprint=fingerprint,
        private_assessments=tuple(assessments),
        semantic_review_report=review_report,
    )
