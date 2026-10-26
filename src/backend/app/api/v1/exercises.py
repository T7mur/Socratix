
"""Component B exercise-generation HTTP routes."""

from collections.abc import Mapping
from typing import Any, Protocol

from pydantic import ValidationError
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter(
    prefix="/api/v1/exercises",
    tags=["exercises"],
)


class JobRef(BaseModel):
    """Temporary local representation of the shared JobRef DTO."""

    model_config = ConfigDict(extra="forbid")

    contract_version: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    resource_type: str = Field(min_length=1)


class JobServiceUnavailable(RuntimeError):
    """The shared generation-job service is unavailable."""


class ExerciseJobSubmitter(Protocol):
    """Interface to the shared, persistent job submission service."""

    async def submit_generation_job(
        self,
        *,
        brief: dict[str, Any],
        authenticated_student_id: str,
    ) -> Mapping[str, Any]: ...


def get_authenticated_student_id() -> str:
    """To be replaced by the shared authenticated-session dependency."""

    raise HTTPException(
        status_code=503,
        detail="Authentication integration is not configured",
    )


def get_exercise_job_submitter() -> ExerciseJobSubmitter:
    """To be replaced by the shared persistent job service."""

    raise HTTPException(
        status_code=503,
        detail="Generation job service is not configured",
    )


def validate_generation_job_request(brief: dict[str, Any]) -> None:
    """Check job-identification fields before submission.

    Full GenerationBrief validation remains the responsibility
    of the canonical shared validation layer.
    """

    request_id = brief.get("request_id")
    policy_version = brief.get("generation_policy_version")

    if not isinstance(request_id, str):
        raise HTTPException(
            status_code=422,
            detail="request_id must be a UUID",
        )

    try:
        UUID(request_id)
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail="request_id must be a UUID",
        ) from error

    if (
        not isinstance(policy_version, str)
        or not policy_version.strip()
    ):
        raise HTTPException(
            status_code=422,
            detail="generation_policy_version is required",
        )


@router.post(
    "/generation-jobs",
    status_code=202,
    response_model=JobRef,
)
async def create_exercise_generation_job(
    brief: dict[str, Any],
    authenticated_student_id: str = Depends(
        get_authenticated_student_id
    ),
    
    job_submitter: ExerciseJobSubmitter = Depends(
        get_exercise_job_submitter
    ),
) -> JobRef:
    """Submit a generation job without running the AI pipeline inline."""

    supplied_student_id = brief.get("student_id")

    if not isinstance(supplied_student_id, str):
        raise HTTPException(
            status_code=422,
            detail="GenerationBrief requires student_id",
        )

    if supplied_student_id != authenticated_student_id:
        raise HTTPException(
            status_code=403,
            detail="Student identity does not match authenticated caller",
        )

    # The shared service must perform canonical brief validation,
    # curriculum eligibility, durable idempotency, and job creation.
    # It must use:
    # (authenticated_student_id, request_id,
    #  generation_policy_version)
    validate_generation_job_request(brief)
    try:
        result = await job_submitter.submit_generation_job(
            brief=brief,
            authenticated_student_id=authenticated_student_id,
        )
    except JobServiceUnavailable as error:
        raise HTTPException(
            status_code=503,
            detail="Generation job service is unavailable",
        ) from error


    try:
        job_ref = JobRef.model_validate(result)
    except ValidationError as error:
        raise HTTPException(
            status_code=503,
            detail="Generation job service returned an invalid response",
        ) from error

    if (
        job_ref.contract_version != "1.0"
        or job_ref.resource_type != "exercise"
        or job_ref.status not in {"queued", "pending"}
    ):
        raise HTTPException(
            status_code=503,
            detail="Generation job service returned an invalid response",
        )

    try:
        UUID(job_ref.job_id)
    except ValueError as error:
        raise HTTPException(
            status_code=503,
            detail="Generation job service returned an invalid response",
        ) from error

    return job_ref


