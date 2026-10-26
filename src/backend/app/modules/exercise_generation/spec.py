
"""Validation of student-facing exercise specifications."""

from collections.abc import Mapping
from typing import Any
from uuid import UUID, uuid4

from dataclasses import dataclass
from collections.abc import Mapping as AbstractMapping
from copy import deepcopy
from types import MappingProxyType
from typing import Protocol
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
import hashlib
import json
from collections.abc import Callable
from pathlib import Path


SUPPORTED_ACTIVITY_TYPES = {
    "single_skill_exercise",
    "multi_skill_exercise",
}

SUPPORTED_STAGES = {
    "recall",
    "understanding",
    "transfer",
}

SUPPORTED_REVIEW_STATUSES = {
    "not_required",
    "pending",
    "approved",
    "rejected",
}

SUPPORTED_VERIFICATION_STATUSES = {
    "draft",
    "verifying",
    "review_required",
    "verified",
    "published",
    "rejected",
    "archived",
}


# Fields defined by the public TaskSpec v1.0 contract.
ALLOWED_TASK_FIELDS = {
    "contract_version",
    "task_id",
    "task_version",
    "activity_type",
    "title",
    "target_skill_ids",
    "outcome_ids",
    "assessment_stage",
    "language",
    "student_brief",
    "function_contract",
    "requirements",
    "input_constraints",
    "public_examples",
    "explanation_questions",
    "verification_status",
    "human_review_status",
}


class GeneratedTaskSchema(BaseModel):
    """Internal response schema until Member F supplies canonical DTOs."""

    model_config = ConfigDict(extra="forbid")

    contract_version: Literal["1.0"]
    task_id: str
    task_version: int = Field(ge=1)
    activity_type: Literal[
        "single_skill_exercise",
        "multi_skill_exercise",
    ]
    title: str
    target_skill_ids: list[str]
    outcome_ids: list[str]
    assessment_stage: Literal["recall", "understanding", "transfer"]
    language: Literal["python"]
    student_brief: str
    function_contract: dict[str, Any] | None
    requirements: list[dict[str, Any]]
    input_constraints: list[str]
    public_examples: list[dict[str, Any]]
    explanation_questions: list[str]
    verification_status: Literal["draft"]
    human_review_status: Literal["not_required"]



class TaskSpecValidationError(ValueError):
    """A generated exercise violates the TaskSpec contract."""


def validate_task_spec(
    task: Mapping[str, Any],
    brief: Mapping[str, Any],
) -> None:
    """Validate a generated TaskSpec against its GenerationBrief.

    This checks structure and consistency, not whether the
    exercise is pedagogically correct or its tests are valid.
    """
    
    # Reject any unexpected fields in the public task specification.
    unexpected_fields = set(task) - ALLOWED_TASK_FIELDS

    if unexpected_fields:
        raise TaskSpecValidationError(
            "TaskSpec contains unexpected fields: "
            + ", ".join(sorted(unexpected_fields))
        )

    if task.get("contract_version") != "1.0":
        raise TaskSpecValidationError(
            "Unsupported TaskSpec contract version"
        )

    # Validate task identity.
    task_id = task.get("task_id")

    try:
        if not isinstance(task_id, str):
            raise ValueError("Task ID must be a string")

        UUID(task_id)

    except ValueError as error:
        raise TaskSpecValidationError(
            "task_id must be a valid UUID"
        ) from error

    task_version = task.get("task_version")

    if type(task_version) is not int or task_version < 1:
        raise TaskSpecValidationError(
            "task_version must be a positive integer"
        )

    # Validate activity type and assessment stage.
    activity_type = task.get("activity_type")

    if activity_type not in SUPPORTED_ACTIVITY_TYPES:
        raise TaskSpecValidationError(
            "Unsupported exercise activity type"
        )

    if activity_type != brief.get("activity_type"):
        raise TaskSpecValidationError(
            "Task activity type does not match GenerationBrief"
        )

    stage = task.get("assessment_stage")

    if stage not in SUPPORTED_STAGES:
        raise TaskSpecValidationError(
            "Unsupported assessment stage"
        )

    if stage != brief.get("assessment_stage"):
        raise TaskSpecValidationError(
            "Task assessment stage does not match GenerationBrief"
        )

    # Check skill and outcome alignment.
    for field in ("target_skill_ids", "outcome_ids"):
        value = task.get(field)

        if (
            not isinstance(value, list)
            or not value
            or not all(isinstance(item, str) and item for item in value)
            or len(value) != len(set(value))
        ):
            raise TaskSpecValidationError(
                f"{field} must contain unique IDs"
            )

        if set(value) != set(brief.get(field, [])):
            raise TaskSpecValidationError(
                f"{field} does not match GenerationBrief"
            )

    # Check language.
    language = task.get("language")
    constraints = brief.get("constraints", {})

    if language != "python":
        raise TaskSpecValidationError(
            "Only Python exercises are supported"
        )

    if language != constraints.get("language"):
        raise TaskSpecValidationError(
            "Task language does not match GenerationBrief"
        )

    # Check student-facing text.
    for field in ("title", "student_brief"):
        value = task.get(field)

        if not isinstance(value, str) or not value.strip():
            raise TaskSpecValidationError(
                f"{field} must be a non-empty string"
            )

    # Check requirements.
    requirements = task.get("requirements")

    if not isinstance(requirements, list) or not requirements:
        raise TaskSpecValidationError(
            "Task must contain at least one requirement"
        )

    requirement_ids = set()

    for requirement in requirements:
        if not isinstance(requirement, Mapping):
            raise TaskSpecValidationError(
                "Each requirement must be an object"
            )

        requirement_id = requirement.get("requirement_id")
        description = requirement.get("description")

        if not isinstance(requirement_id, str) or not requirement_id.strip():
            raise TaskSpecValidationError(
                "Invalid requirement_id"
            )

        if not isinstance(description, str) or not description.strip():
            raise TaskSpecValidationError(
                "Requirement description cannot be empty"
            )

        if requirement_id in requirement_ids:
            raise TaskSpecValidationError(
                "Duplicate requirement IDs"
            )

        requirement_ids.add(requirement_id)

    # Function contracts are optional for non-coding assessments.
    function_contract = task.get("function_contract")

    if function_contract is not None:
        if not isinstance(function_contract, Mapping):
            raise TaskSpecValidationError(
                "function_contract must be an object"
            )

        name = function_contract.get("name")
        parameters = function_contract.get("parameters")
        returns = function_contract.get("returns")

        if not isinstance(name, str) or not name.strip():
            raise TaskSpecValidationError(
                "Function name is required"
            )

        if not isinstance(parameters, list):
            raise TaskSpecValidationError(
                "Function parameters must be a list"
            )

        if not isinstance(returns, str) or not returns.strip():
            raise TaskSpecValidationError(
                "Function return type is required"
            )

        for parameter in parameters:
            if not isinstance(parameter, Mapping):
                raise TaskSpecValidationError(
                    "Invalid function parameter"
                )

            if not all(
                isinstance(parameter.get(field), str)
                and parameter[field].strip()
                for field in ("name", "type")
            ):
                raise TaskSpecValidationError(
                    "Function parameters require names and types"
                )

    # Check student-facing arrays.
    for field in (
        "input_constraints",
        "public_examples",
        "explanation_questions",
    ):
        if not isinstance(task.get(field), list):
            raise TaskSpecValidationError(
                f"{field} must be a list"
            )

    for field in ("input_constraints", "explanation_questions"):
        if not all(
            isinstance(item, str) and item.strip()
            for item in task[field]
        ):
            raise TaskSpecValidationError(
                f"{field} must contain valid text"
            )

    for example in task["public_examples"]:
        if (
            not isinstance(example, Mapping)
            or not isinstance(example.get("args"), list)
            or "expected" not in example
        ):
            raise TaskSpecValidationError(
                "Invalid public example"
            )

    # Check review and verification status.
    if task.get("verification_status") not in SUPPORTED_VERIFICATION_STATUSES:
        raise TaskSpecValidationError(
            "Invalid verification status"
        )

    if task.get("human_review_status") not in SUPPORTED_REVIEW_STATUSES:
        raise TaskSpecValidationError(
            "Invalid human review status"
        )

    # Private grading materials must never appear in TaskSpec.
    private_fields = {
        "reference_solution",
        "reference_solution_ref",
        "hidden_tests",
        "hidden_test_suite_ref",
        "grading_artifact",
        "verification_report_ref",
    }

    exposed_fields = private_fields.intersection(task)

    if exposed_fields:
        raise TaskSpecValidationError(
            "Student-facing TaskSpec contains private grading fields"
        )

def validate_generated_task_spec(
    task: Mapping[str, Any],
    brief: Mapping[str, Any],
) -> None:
    """Validate a newly generated task before verification begins.

    AI-generated tasks cannot declare themselves verified or published.
    """

    validate_task_spec(task, brief)

    if task["verification_status"] != "draft":
        raise TaskSpecValidationError(
            "Newly generated tasks must have draft status"
        )

    if task["human_review_status"] != "not_required":
        raise TaskSpecValidationError(
            "AI cannot assign its own human review decision"
        )

class TaskGenerationError(RuntimeError):
    """Exercise generation failed or returned an invalid specification."""



class TaskGenerationError(RuntimeError):
    """Base error for exercise generation failures."""


class TaskProviderError(TaskGenerationError):
    """The AI provider failed or was unavailable."""


class TaskOutputError(TaskGenerationError):
    """The AI provider repeatedly returned invalid exercise specifications."""


def generate_task_spec(
    brief: Mapping[str, Any],
    approved_outcome_context: Mapping[str, Any],
    generate_json: Callable[[str], Mapping[str, Any]],
    *,
    max_attempts: int = 3,
) -> dict[str, Any]:
    """Generate and validate a draft TaskSpec.

    The caller must validate the GenerationBrief and supply trusted
    curriculum context before calling this function.

    Invalid AI outputs may be retried. Provider failures are reported
    immediately. The returned specification is not yet frozen,
    independently verified or published.
    """

    if type(max_attempts) is not int or max_attempts < 1:
        raise ValueError("max_attempts must be a positive integer")

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / "spec_v1.txt"
    )

    try:
        prompt_template = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise TaskGenerationError(
            "Exercise specification prompt is unavailable"
        ) from error

    generation_context = {
        "contract_version": brief["contract_version"],
        "activity_type": brief["activity_type"],
        "target_skill_ids": brief["target_skill_ids"],
        "outcome_ids": brief["outcome_ids"],
        "allowed_skill_ids": brief["allowed_skill_ids"],
        "excluded_skill_ids": brief["excluded_skill_ids"],
        "assessment_stage": brief["assessment_stage"],
        "difficulty_level": brief["difficulty_level"],
        "preferred_context": brief.get("preferred_context"),
        "constraints": brief["constraints"],
        "approved_outcomes": approved_outcome_context,
    }

    prompt = (
        prompt_template
        + "\n\nGENERATION INPUT:\n"
        + json.dumps(generation_context, ensure_ascii=False)
    )

    last_validation_error = None

    for attempt in range(1, max_attempts + 1):
        try:
            generated = generate_json(prompt)
        except Exception as error:
            raise TaskProviderError(
                "AI provider failed during exercise generation"
            ) from error

        if not isinstance(generated, Mapping):
            last_validation_error = (
                "AI provider did not return a JSON object"
            )
        else:
            task = dict(generated)

            try:
                validate_generated_task_spec(task, brief)
            except TaskSpecValidationError as error:
                last_validation_error = str(error)
            else:
                return task

        # The next attempt uses the same approved inputs.
        # Do not add untrusted model output to the prompt.
        if attempt < max_attempts:
            continue

    raise TaskOutputError(
        f"Generated exercise failed validation after "
        f"{max_attempts} attempts: {last_validation_error}"
    )


class ExerciseLLMGateway(Protocol):
    """Structural typing for the shared LLMGatewayProtocol."""

    async def generate_json(
        self,
        *,
        operation: str,
        model_alias: str,
        system_prompt: str,
        payload: dict,
        schema: type,
    ) -> dict: ...


async def generate_task_spec_async(
    brief: Mapping[str, Any],
    approved_outcome_context: Mapping[str, Any],
    gateway: ExerciseLLMGateway,
    *,
    model_alias: str,
) -> dict[str, Any]:
    """Generate a TaskSpec through Socratix's shared async gateway.

    The caller must validate the brief and obtain trusted curriculum
    context before calling this function.
    """

    prompt_path = (
        Path(__file__).resolve().parents[4]
        / "shared"
        / "prompts"
        / "exercise"
        / "spec_v1.txt"
    )

    try:
        system_prompt = prompt_path.read_text(encoding="utf-8")
    except OSError as error:
        raise TaskGenerationError(
            "Exercise specification prompt is unavailable"
        ) from error

    payload = {
        "contract_version": brief["contract_version"],
        "activity_type": brief["activity_type"],
        "target_skill_ids": brief["target_skill_ids"],
        "outcome_ids": brief["outcome_ids"],
        "allowed_skill_ids": brief["allowed_skill_ids"],
        "excluded_skill_ids": brief["excluded_skill_ids"],
        "assessment_stage": brief["assessment_stage"],
        "difficulty_level": brief["difficulty_level"],
        "preferred_context": brief.get("preferred_context"),
        "constraints": brief["constraints"],
        "approved_outcomes": dict(approved_outcome_context),
    }

    try:
        result = await gateway.generate_json(
            operation="exercise_spec_generation",
            model_alias=model_alias,
            system_prompt=system_prompt,
            payload=payload,
            schema=GeneratedTaskSchema,
        )
    except Exception as error:
        raise TaskProviderError(
            "Shared AI gateway failed during exercise generation"
        ) from error

    if not isinstance(result, Mapping):
        raise TaskOutputError(
            "Shared AI gateway returned a non-object response"
        )

    try:
        parsed = GeneratedTaskSchema.model_validate(result)
        task = parsed.model_dump()

        # Assign new activity metadata within the trusted backend.
        # Never use an AI-selected task identifier.
        task["task_id"] = str(uuid4())
        task["task_version"] = 1

        # Verify the final student-facing draft.
        validate_generated_task_spec(task, brief)
    except (ValueError, TaskSpecValidationError) as error:
        raise TaskOutputError(
            f"Generated exercise failed validation: {error}"
        ) from error

    return task



@dataclass(frozen=True)
class FrozenTaskSpec:
    """A validated, immutable in-memory exercise specification."""

    data: AbstractMapping[str, Any]

    def to_payload(self) -> dict[str, Any]:
        """Return a separate JSON-compatible copy of the frozen data."""

        def thaw(value: Any) -> Any:
            if isinstance(value, Mapping):
                return {
                    key: thaw(item)
                    for key, item in value.items()
                }

            if isinstance(value, tuple):
                return [thaw(item) for item in value]

            return value

        return thaw(self.data)


def _freeze_value(value: Any) -> Any:
    """Recursively convert JSON structures into immutable values."""

    if isinstance(value, Mapping):
        return MappingProxyType({
            key: _freeze_value(item)
            for key, item in value.items()
        })

    if isinstance(value, list):
        return tuple(_freeze_value(item) for item in value)

    return value


def freeze_task_spec(
    task: Mapping[str, Any],
    brief: Mapping[str, Any],
) -> FrozenTaskSpec:
    """Validate and freeze a student-facing draft specification."""

    validate_generated_task_spec(task, brief)

    snapshot = deepcopy(dict(task))

    return FrozenTaskSpec(data=_freeze_value(snapshot))


def task_content_fingerprint(frozen_task: FrozenTaskSpec) -> str:
    """Fingerprint the meaningful content of a frozen exercise.

    Excludes identity and lifecycle metadata so two otherwise
    identical exercises receive the same fingerprint.
    """

    if not isinstance(frozen_task, FrozenTaskSpec):
        raise TypeError("Expected FrozenTaskSpec")

    task = frozen_task.to_payload()

    # These fields do not change the exercise's learning content.
    metadata_fields = {
        "task_id",
        "task_version",
        "verification_status",
        "human_review_status",
    }

    content = {
        key: value
        for key, value in task.items()
        if key not in metadata_fields
    }

    encoded = json.dumps(
        content,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")

    return hashlib.sha256(encoded).hexdigest()


def is_duplicate_task(
    candidate: FrozenTaskSpec,
    existing_tasks: list[FrozenTaskSpec],
) -> bool:
    """Detect exact-content duplicates among supplied exercises.

    The caller must obtain existing tasks from trusted storage.
    This is not semantic or similarity-based duplicate detection.
    """

    candidate_hash = task_content_fingerprint(candidate)

    for existing in existing_tasks:
        if task_content_fingerprint(existing) == candidate_hash:
            return True

    return False
