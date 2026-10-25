from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError
from app.db.models.activities import Activity
from app.db.models.jobs import GenerationJob, OutboxMessage
from app.db.repositories.common import checksum


class JobRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_generation_job(
        self,
        *,
        student_id: UUID,
        request_id: UUID,
        generation_policy_version: str,
        kind: str,
        request_payload: dict,
        prompt_version: str,
    ) -> GenerationJob:
        stmt = insert(GenerationJob).values(
            student_id=student_id,
            request_id=request_id,
            kind=kind,
            request_payload=request_payload,
            generation_policy_version=generation_policy_version,
            prompt_version=prompt_version,
        )
        await self.session.execute(
            stmt.on_conflict_do_nothing(
                index_elements=["student_id", "request_id", "generation_policy_version"]
            )
        )
        row = await self.session.scalar(
            select(GenerationJob).where(
                GenerationJob.student_id == student_id,
                GenerationJob.request_id == request_id,
                GenerationJob.generation_policy_version == generation_policy_version,
            )
        )
        if checksum(row.request_payload) != checksum(request_payload) or row.kind != kind:
            raise ConflictError("An idempotency key cannot be reused for a different generation request")
        return row

    async def get_owned_job(self, student_id: UUID, job_id: UUID) -> dict:
        row = await self.session.scalar(
            select(GenerationJob).where(
                GenerationJob.job_id == job_id, GenerationJob.student_id == student_id
            )
        )
        if row is None:
            raise NotFoundError("Job not found")
        result = {
            "contract_version": "1.0",
            "job_id": row.job_id,
            "status": row.status,
            "resource_id": None,
            "error_code": row.error_code,
            "review_reason": row.review_reason,
        }
        if row.resource_id:
            activity = await self.session.get(Activity, (row.resource_id, row.resource_version))
            if activity and activity.student_id == student_id and activity.status == "published":
                result["resource_id"] = row.resource_id
        return result

    async def append_outbox_message(
        self, *, event_type: str, aggregate_id: str, payload: dict, deduplication_key: str
    ) -> None:
        stmt = insert(OutboxMessage).values(
            event_type=event_type,
            aggregate_id=aggregate_id,
            payload=payload,
            deduplication_key=deduplication_key,
        )
        await self.session.execute(stmt.on_conflict_do_nothing(index_elements=["deduplication_key"]))
