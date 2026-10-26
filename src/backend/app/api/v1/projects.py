
"""Component C project-generation HTTP routes."""

from collections.abc import Mapping
from typing import Any, Protocol
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError


router = APIRouter(
    prefix="/api/v1/projects",
    tags=["projects"],
)


class JobRef(BaseModel):
    """Temporary local representation of the shared JobRef DTO."""

    model_config = ConfigDict(extra="forbid")

    contract_version: str = Field(min_length=1)
    job_id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    resource_type: str = Field(min_length=1)


class JobServiceUnavailable(RuntimeError):
    """The shared persistent generation-job service is unavailable."""


class ProjectJobSubmitter(Protocol):
    """Shared job service interface; implementation is owned by F."""

    async def submit_generation_job(
        self,
        *,
        brief: dict[str, Any],
        authenticated_student_id: str,
    ) -> Mapping[str, Any]: ...


def get_authenticated_student_id() -> str:
    """Placeholder for the shared authenticated-session dependency."""

    raise HTTPException(
        status_code=503,
        detail="Authentication integration is not configured",
    )


def get_project_job_submitter() -> ProjectJobSubmitter:
    """Placeholder for the shared persistent generation-job service."""

    raise HTTPException(
        status_code=503,
        detail="Generation job service is not configured",
    )


def validate_project_generation_job_request(
    brief: dict[str, Any],
) -> None:
    """Validate essential fields before submitting a project job.

    Canonical GenerationBrief validation, approved curriculum checks
    and durable idempotency remain responsibilities of the shared
    backend service.
    """

    if brief.get("contract_version") != "1.0":
        raise HTTPException(
            status_code=422,
            detail="Unsupported GenerationBrief contract version",
        )

    if brief.get("activity_type") != "project":
        raise HTTPException(
            status_code=422,
            detail="GenerationBrief must request a project",
        )

    request_id = brief.get("request_id")

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

    policy_version = brief.get("generation_policy_version")

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
async def create_project_generation_job(
    brief: dict[str, Any],
    authenticated_student_id: str = Depends(
        get_authenticated_student_id
    ),
    job_submitter: ProjectJobSubmitter = Depends(
        get_project_job_submitter
    ),
) -> JobRef:
    """Queue a project-generation job without running AI inline."""

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

    validate_project_generation_job_request(brief)

    # The shared service must validate the full brief,
    # perform trusted curriculum checks, persist the job and
    # enforce idempotency using:
    # (authenticated_student_id, request_id,
    #  generation_policy_version).
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
        or job_ref.resource_type != "project"
        or job_ref.status != "queued"
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
