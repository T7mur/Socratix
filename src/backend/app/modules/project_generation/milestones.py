
"""Deterministic milestone-plan checks for Component C."""

from collections.abc import Mapping
from typing import Any

from pydantic import ValidationError

from app.modules.project_generation.spec import (
    ProjectSpecSchema,
    ProjectValidationError,
)


def validate_milestone_plan(
    project: Mapping[str, Any],
) -> dict[str, Any]:
    """Check structural evidence of a staged engineering project.

    This does not claim to verify educational quality, correctness
    of student-facing requirements, or the meaning of a milestone.
    """
    try:
        spec = ProjectSpecSchema.model_validate(project)
    except (ValidationError, ValueError, TypeError) as error:
        raise ProjectValidationError(
            "Invalid milestone plan structure"
        ) from error

    milestones = spec.milestones

    # A design/planning milestone must be assessable qualitatively.
    # Whether it actually asks for a student plan needs semantic review.
    if milestones[0].assessment_method not in {"rubric", "mixed"}:
        raise ProjectValidationError(
            "First milestone must support design-plan rubric assessment"
        )

    if milestones[0].depends_on:
        raise ProjectValidationError(
            "First milestone cannot have dependencies"
        )

    # Projects must have an executable assessment checkpoint
    # after their initial planning milestone.
    if not any(
        milestone.assessment_method in {"tests", "mixed"}
        for milestone in milestones[1:]
    ):
        raise ProjectValidationError(
            "Project needs a later executable testing checkpoint"
        )

    # Project requirements are currently referenced by ID.
    # Their complete definitions are not part of the canonical
    # public ProjectSpec example; do not invent definitions here.
    if not all(
        milestone.requirement_ids
        for milestone in milestones
    ):
        raise ProjectValidationError(
            "Every milestone needs requirement references"
        )

    return spec.model_dump()
