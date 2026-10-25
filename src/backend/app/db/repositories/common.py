import hashlib
import json
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ForbiddenError, ValidationError
from app.db.models.identity import CourseEnrolment

PRIVATE_FIELDS = frozenset(
    {
        "reference_solution",
        "reference_solution_ref",
        "hidden_tests",
        "hidden_test_suite_ref",
        "verification_report_ref",
        "trace_ref",
        "sandbox_trace",
        "private_result",
        "elm_api_key",
        "database_url",
    }
)


def checksum(payload: dict | list) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def validate_public_payload(value) -> None:
    """Reject internal artifact fields at every nesting depth; not a general-purpose text sanitizer."""
    if isinstance(value, dict):
        if any(key.lower() in PRIVATE_FIELDS for key in value):
            raise ValidationError("Private grading fields cannot appear in a public payload")
        for nested in value.values():
            validate_public_payload(nested)
    elif isinstance(value, list):
        for nested in value:
            validate_public_payload(nested)


async def require_course_membership(session: AsyncSession, student_id: UUID, course_id: UUID) -> None:
    member = await session.scalar(
        select(CourseEnrolment).where(
            CourseEnrolment.user_id == student_id,
            CourseEnrolment.course_id == course_id,
            CourseEnrolment.status == "active",
        )
    )
    if member is None:
        raise ForbiddenError("Active course membership required")
