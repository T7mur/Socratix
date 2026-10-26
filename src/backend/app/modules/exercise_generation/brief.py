
"""Deterministic preflight validation for exercise generation."""

from uuid import UUID   
from collections.abc import Mapping
from typing import Any


SUPPORTED_ACTIVITY_TYPES = {
    "single_skill_exercise",
    "multi_skill_exercise",
}

SUPPORTED_STAGES = {"recall", "understanding", "transfer"}


class BriefValidationError(ValueError):
    """The generation request is ineligible or inconsistent."""


def validate_request_fields(brief: Mapping[str, Any]) -> None:
    """Validate required GenerationBrief identifiers and metadata."""

    for field in ("request_id", "student_id", "course_id"):
        value = brief.get(field)

        if not isinstance(value, str):
            raise BriefValidationError(
                f"{field} must be a valid UUID"
            )

        try:
            UUID(value)
        except ValueError as error:
            raise BriefValidationError(
                f"{field} must be a valid UUID"
            ) from error

    policy_version = brief.get("generation_policy_version")

    if (
        not isinstance(policy_version, str)
        or not policy_version.strip()
    ):
        raise BriefValidationError(
            "generation_policy_version is required"
        )

    preferred_context = brief.get("preferred_context")

    if preferred_context is not None and not isinstance(
        preferred_context, str
    ):
        raise BriefValidationError(
            "preferred_context must be a string or null"
        )


def validate_brief(
    brief: Mapping[str, Any],
    approved_skills: Mapping[str, Any],
    approved_outcomes: Mapping[str, Any],
    *,
    integration_outcome_skills: Mapping[str, set[str]] | None = None,
) -> None:
    """Validate the basic requirements of a GenerationBrief.

    Approval information must come from trusted course-scoped data,
    not from student-provided claims.
    """
    validate_request_fields(brief)
    if integration_outcome_skills is None:
        integration_outcome_skills = {}

    if brief.get("contract_version") != "1.0":
        raise BriefValidationError("Unsupported contract version")

    activity_type = brief.get("activity_type")
    if activity_type not in SUPPORTED_ACTIVITY_TYPES:
        raise BriefValidationError("Unsupported exercise activity type")

    stage = brief.get("assessment_stage")
    if stage not in SUPPORTED_STAGES:
        raise BriefValidationError("Unsupported assessment stage")

    targets = brief.get("target_skill_ids")
    outcomes = brief.get("outcome_ids")
    allowed = brief.get("allowed_skill_ids")
    excluded = brief.get("excluded_skill_ids")

    # Validate skill and outcome ID lists.
    for name, value in (
        ("target_skill_ids", targets),
        ("outcome_ids", outcomes),
        ("allowed_skill_ids", allowed),
        ("excluded_skill_ids", excluded),
    ):
        if not isinstance(value, list) or not all(
            isinstance(item, str) and item for item in value
        ):
            raise BriefValidationError(
                f"{name} must be a list of skill/outcome IDs"
            )

        if len(value) != len(set(value)):
            raise BriefValidationError(f"{name} contains duplicate IDs")

    if not targets or not outcomes:
        raise BriefValidationError("Targets and outcomes cannot be empty")

    # Validate exercise type.
    if activity_type == "single_skill_exercise" and len(targets) != 1:
        raise BriefValidationError(
            "Single-skill exercise requires one target"
        )

    if activity_type == "multi_skill_exercise" and len(targets) < 2:
        raise BriefValidationError(
            "Multi-skill exercise requires multiple targets"
        )

    # Check allowed and excluded skills.
    target_set = set(targets)
    allowed_set = set(allowed)
    excluded_set = set(excluded)

    if not target_set.issubset(allowed_set):
        raise BriefValidationError("Target skills must be allowed")

    if target_set & excluded_set:
        raise BriefValidationError("Target skills cannot be excluded")

    if allowed_set & excluded_set:
        raise BriefValidationError("Allowed and excluded skills overlap")

    # Verify that target skills have been approved.
    for skill_id in targets:
        skill = approved_skills.get(skill_id)

        if (
            not isinstance(skill, Mapping)
            or skill.get("approval_status") != "approved"
        ):
            raise BriefValidationError(
                f"Skill is not approved: {skill_id}"
            )

    # Verify that learning outcomes have been approved.
    for outcome_id in outcomes:
        outcome = approved_outcomes.get(outcome_id)

        if (
            not isinstance(outcome, Mapping)
            or outcome.get("approval_status") != "approved"
        ):
            raise BriefValidationError(
                f"Outcome is not approved: {outcome_id}"
            )

        # Integration outcomes represent multiple interacting skills.
        if outcome_id in integration_outcome_skills:
            if (
                activity_type != "multi_skill_exercise"
                or integration_outcome_skills[outcome_id] != target_set
            ):
                raise BriefValidationError(
                    f"Integration outcome does not match targets: {outcome_id}"
                )

        # Ordinary outcomes belong to one target skill.
        elif outcome.get("skill_id") not in target_set:
            raise BriefValidationError(
                f"Outcome does not match target skills: {outcome_id}"
            )

        if outcome.get("stage") != stage:
            raise BriefValidationError(
                f"Outcome stage does not match brief: {outcome_id}"
            )

    # Validate generation constraints.
    constraints = brief.get("constraints")

    if not isinstance(constraints, Mapping):
        raise BriefValidationError("Missing constraints")

    if constraints.get("language") != "python":
        raise BriefValidationError("Only Python exercises are supported")

    max_minutes = constraints.get("max_minutes")

    if type(max_minutes) is not int or max_minutes <= 0:
        raise BriefValidationError(
            "max_minutes must be a positive integer"
        )

    difficulty = brief.get("difficulty_level")

    if type(difficulty) is not int or difficulty <= 0:
        raise BriefValidationError(
            "difficulty_level must be a positive integer"
        )


def validate_eligibility(
    brief: Mapping[str, Any],
    approved_skills: Mapping[str, Any],
    approved_outcomes: Mapping[str, Any],
    *,
    trusted_allowed_skill_ids: set[str],
    prerequisites_by_skill: Mapping[str, list[str]],
    integration_outcome_skills: Mapping[str, set[str]],
) -> None:
    """Apply additional eligibility checks using trusted curriculum data.

    These mappings must be supplied by backend services, not directly
    by student requests.
    """

    # Run basic validation first.
    validate_brief(
        brief,
        approved_skills,
        approved_outcomes,
        integration_outcome_skills=integration_outcome_skills,
    )

    targets = set(brief["target_skill_ids"])
    allowed = set(brief["allowed_skill_ids"])
    excluded = set(brief["excluded_skill_ids"])

    # Ensure allowed skills match trusted curriculum permissions.
    if allowed != trusted_allowed_skill_ids:
        raise BriefValidationError(
            "Allowed skills do not match the trusted course/learner graph"
        )

    # Validate prerequisite chains and detect circular dependencies.
    visited: set[str] = set()
    visiting: set[str] = set()

    def check_prerequisites(skill_id: str) -> None:
        if skill_id in visiting:
            raise BriefValidationError(
                f"Circular skill prerequisite detected: {skill_id}"
            )

        if skill_id in visited:
            return

        skill = approved_skills.get(skill_id)

        if not isinstance(skill, Mapping):
            raise BriefValidationError(
                f"Skill is missing from approved graph: {skill_id}"
            )

        if skill.get("approval_status") != "approved":
            raise BriefValidationError(
                f"Prerequisite skill is not approved: {skill_id}"
            )

        if skill_id not in prerequisites_by_skill:
            raise BriefValidationError(
                f"Prerequisite data unavailable for: {skill_id}"
            )

        if skill_id not in allowed or skill_id in excluded:
            raise BriefValidationError(
                f"Required skill is unavailable: {skill_id}"
            )

        visiting.add(skill_id)

        for prerequisite_id in prerequisites_by_skill[skill_id]:
            check_prerequisites(prerequisite_id)

        visiting.remove(skill_id)
        visited.add(skill_id)

    for skill_id in targets:
        check_prerequisites(skill_id)

    # Multi-skill exercises require an approved integration outcome.
    if brief["activity_type"] == "multi_skill_exercise":
        matching_outcome = any(
            outcome_id in brief["outcome_ids"]
            and outcome_id in approved_outcomes
            and approved_outcomes[outcome_id].get("approval_status") == "approved"
            and integrated_skills == targets
            for outcome_id, integrated_skills in integration_outcome_skills.items()
        )

        if not matching_outcome:
            raise BriefValidationError(
                "Multi-skill exercise requires an approved integration outcome"
            )
