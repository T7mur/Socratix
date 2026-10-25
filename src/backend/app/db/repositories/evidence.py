from uuid import UUID

from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.db.models.activities import Activity, ActivityOutcome
from app.db.models.curriculum import LearningOutcome
from app.db.models.evidence import AssessmentEvent
from app.db.models.jobs import Evaluation, HintEvent, Submission
from app.db.repositories.common import require_course_membership, validate_public_payload
from app.db.repositories.jobs import JobRepository


class EvidenceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _lock_attempt(self, attempt_id: UUID) -> Submission:
        row = await self.session.scalar(
            select(Submission).where(Submission.attempt_id == attempt_id).with_for_update()
        )
        if row is None:
            raise NotFoundError("Attempt not found")
        await self.session.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:scope, 0))"),
            {"scope": f"assistance:{row.student_id}:{row.activity_id}"},
        )
        return row

    async def create_submission(
        self,
        *,
        attempt_id: UUID,
        student_id: UUID,
        activity_id: UUID,
        activity_version: int,
        assessment_stage: str,
        idempotency_key: str,
        milestone_id: str | None = None,
        source_code_ref: str | None = None,
        answer_text: str | None = None,
        explanation: str | None = None,
    ) -> Submission:
        activity = await self.session.scalar(
            select(Activity).where(
                Activity.id == activity_id,
                Activity.version == activity_version,
                Activity.student_id == student_id,
                Activity.status == "published",
            )
        )
        if activity is None:
            raise NotFoundError("Owned published activity not found")
        await require_course_membership(self.session, student_id, activity.course_id)
        if (activity.activity_type == "project") != (milestone_id is not None):
            raise ValidationError(
                "Project submissions require one milestone; exercises cannot specify a milestone"
            )
        if (
            activity.activity_type != "project"
            and activity.student_safe_spec["assessment_stage"] != assessment_stage
        ):
            raise ValidationError("Response stage must match the task")
        values = dict(
            attempt_id=attempt_id,
            student_id=student_id,
            activity_id=activity_id,
            activity_version=activity_version,
            assessment_stage=assessment_stage,
            idempotency_key=idempotency_key,
            milestone_id=milestone_id,
            source_code_ref=source_code_ref,
            answer_text=answer_text,
            explanation=explanation,
        )
        await self.session.execute(insert(Submission).values(**values).on_conflict_do_nothing())
        row = await self.session.scalar(
            select(Submission).where(
                Submission.student_id == student_id,
                or_(Submission.attempt_id == attempt_id, Submission.idempotency_key == idempotency_key),
            )
        )
        if row is None or any(getattr(row, key) != value for key, value in values.items()):
            raise ConflictError("A submission idempotency key cannot be reused with different content")
        return row

    async def _activity_hints(self, attempt: Submission) -> list[HintEvent]:
        return list(
            (
                await self.session.scalars(
                    select(HintEvent)
                    .join(Submission, HintEvent.attempt_id == Submission.attempt_id)
                    .where(
                        Submission.student_id == attempt.student_id,
                        Submission.activity_id == attempt.activity_id,
                        HintEvent.quality_status == "accepted",
                    )
                )
            ).all()
        )

    async def append(self, event: dict) -> str:
        """Internal evidence protocol. Ownership, validity and assistance are checked against durable records."""
        data = {key: value for key, value in event.items() if key != "contract_version"}
        data.setdefault("event_type", "assessment")
        if data["event_type"] != "assessment":
            raise ValidationError("Use the explicit self-report/correction/assistance methods")
        attempt = await self._lock_attempt(UUID(str(data["attempt_id"])))
        if attempt.student_id != UUID(str(data["student_id"])):
            raise ValidationError("Evidence owner does not match attempt")
        evaluation = (
            (await self.session.get(Evaluation, UUID(str(data["evaluation_id"]))))
            if data.get("evaluation_id")
            else await self.session.scalar(
                select(Evaluation)
                .where(Evaluation.attempt_id == attempt.attempt_id)
                .order_by(Evaluation.evaluation_version.desc())
                .limit(1)
            )
        )
        if evaluation is None or evaluation.attempt_id != attempt.attempt_id:
            raise ValidationError("Evaluation must belong to the attempt")
        data["evaluation_id"] = evaluation.evaluation_id
        if data["task_validity"] != evaluation.grading_validity:
            raise ValidationError("Evidence validity must match the stored evaluation")
        outcome = await self.session.get(LearningOutcome, data["outcome_id"])
        link = await self.session.get(
            ActivityOutcome, (attempt.activity_id, attempt.activity_version, data["outcome_id"])
        )
        if (
            outcome is None
            or link is None
            or outcome.skill_id != data["skill_id"]
            or data["stage"] != attempt.assessment_stage
        ):
            raise ValidationError("Evidence must match a frozen activity outcome and assessment stage")
        hints = await self._activity_hints(attempt)
        level = max((hint.level for hint in hints), default=0)
        revealed = any(hint.solution_revealed for hint in hints)
        data.update(
            max_hint_level_used=level,
            solution_revealed=revealed,
            independent=bool(data.get("independent", True)) and level == 0 and not revealed,
        )
        data["evidence_id"] = UUID(str(data["evidence_id"])) if data.get("evidence_id") else None
        if data["evidence_id"] is None:
            data.pop("evidence_id")
        for field in ("student_id", "attempt_id", "evaluation_id"):
            data[field] = UUID(str(data[field]))
        if isinstance(data.get("occurred_at"), str):
            from datetime import datetime

            data["occurred_at"] = datetime.fromisoformat(data["occurred_at"].replace("Z", "+00:00"))
        stmt = (
            insert(AssessmentEvent)
            .values(**data)
            .on_conflict_do_nothing(index_elements=["evaluation_id", "outcome_id"])
        )
        await self.session.execute(stmt)
        row = await self.session.scalar(
            select(AssessmentEvent).where(
                AssessmentEvent.evaluation_id == evaluation.evaluation_id,
                AssessmentEvent.outcome_id == data["outcome_id"],
            )
        )
        await JobRepository(self.session).append_outbox_message(
            event_type="recompute_skill",
            aggregate_id=str(attempt.student_id),
            payload={"student_id": str(attempt.student_id), "skill_id": data["skill_id"]},
            deduplication_key=f"evidence:{row.evidence_id}",
        )
        return str(row.evidence_id)

    async def list_for_skill(self, student_id: str, skill_id: str) -> list[dict]:
        correction = aliased(AssessmentEvent)
        stmt = select(AssessmentEvent).where(
            AssessmentEvent.student_id == UUID(student_id),
            AssessmentEvent.skill_id == skill_id,
            AssessmentEvent.event_type == "assessment",
            AssessmentEvent.task_validity == "valid",
            ~exists(
                select(correction.evidence_id).where(
                    correction.corrects_evidence_id == AssessmentEvent.evidence_id
                )
            ),
        )
        rows = (await self.session.scalars(stmt.order_by(AssessmentEvent.occurred_at))).all()
        results = []
        for row in rows:
            # Later assistance taints the original task even if an earlier assessment predated the reveal.
            attempt = await self.session.get(Submission, row.attempt_id)
            max_hint = max((hint.level for hint in await self._activity_hints(attempt)), default=0)
            results.append(
                {
                    "contract_version": "1.0",
                    **{col.name: getattr(row, col.name) for col in AssessmentEvent.__table__.columns},
                    "independent": bool(row.independent) and max_hint == 0,
                    "max_hint_level_used": max(row.max_hint_level_used, max_hint),
                    "solution_revealed": row.solution_revealed or max_hint == 4,
                }
            )
        return results

    async def save_evaluation_revision(
        self, attempt_id: UUID, version: int, report: dict, correction_reason: str | None = None
    ) -> Evaluation:
        attempt = await self._lock_attempt(attempt_id)
        validate_public_payload(report["student_safe_result"])
        existing = await self.session.scalar(
            select(Evaluation).where(
                Evaluation.attempt_id == attempt_id, Evaluation.evaluation_version == version
            )
        )
        if existing:
            if (
                existing.private_result != report["private_result"]
                or existing.student_safe_result != report["student_safe_result"]
            ):
                raise ConflictError("Evaluation revisions cannot be overwritten")
            return existing
        latest = (
            await self.session.scalar(
                select(func.max(Evaluation.evaluation_version)).where(Evaluation.attempt_id == attempt_id)
            )
            or 0
        )
        if version != latest + 1:
            raise ConflictError("Evaluation versions must be sequential")
        if latest:
            if not correction_reason or not correction_reason.strip():
                raise ValidationError("A grading revision requires an explicit correction reason")
            old_events = (
                await self.session.scalars(
                    select(AssessmentEvent).where(
                        AssessmentEvent.attempt_id == attempt_id, AssessmentEvent.event_type == "assessment"
                    )
                )
            ).all()
            for event in old_events:
                already = await self.session.scalar(
                    select(AssessmentEvent.evidence_id)
                    .where(AssessmentEvent.corrects_evidence_id == event.evidence_id)
                    .limit(1)
                )
                if already is None:
                    await self.append_correction(event.evidence_id, attempt.student_id, correction_reason)
        row = Evaluation(
            attempt_id=attempt_id,
            activity_id=attempt.activity_id,
            activity_version=attempt.activity_version,
            evaluation_version=version,
            **report,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def append_correction(self, evidence_id: UUID, student_id: UUID, reason: str) -> str:
        original = await self.session.get(AssessmentEvent, evidence_id)
        if original is None or original.student_id != student_id or not reason.strip():
            raise ValidationError("A correction needs owned evidence and a reason")
        row = AssessmentEvent(
            student_id=student_id,
            skill_id=original.skill_id,
            outcome_id=original.outcome_id,
            event_type="correction",
            corrects_evidence_id=evidence_id,
            feedback=reason,
        )
        self.session.add(row)
        await self.session.flush()
        await JobRepository(self.session).append_outbox_message(
            event_type="recompute_skill",
            aggregate_id=str(student_id),
            payload={"student_id": str(student_id), "skill_id": original.skill_id},
            deduplication_key=f"correction:{row.evidence_id}",
        )
        return str(row.evidence_id)

    async def record_hint_event(self, attempt_id: UUID, student_id: UUID, **hint) -> HintEvent:
        attempt = await self._lock_attempt(attempt_id)
        if attempt.student_id != student_id:
            raise ValidationError("Hint owner does not match attempt")
        previous = (
            await self.session.scalar(
                select(func.max(HintEvent.level)).where(
                    HintEvent.attempt_id == attempt_id, HintEvent.quality_status == "accepted"
                )
            )
            or 0
        )
        if hint["level"] != previous + 1 or hint["level"] > 4:
            raise ConflictError("Hints must progress one level at a time")
        if hint.get("solution_revealed", False) != (
            hint["level"] == 4 and hint["quality_status"] == "accepted"
        ):
            raise ValidationError("Stage four must explicitly record solution reveal")
        row = HintEvent(attempt_id=attempt_id, **hint)
        self.session.add(row)
        await self.session.flush()
        await JobRepository(self.session).append_outbox_message(
            event_type="recompute_attempt_skills",
            aggregate_id=str(student_id),
            payload={
                "attempt_id": str(attempt_id),
                "activity_id": str(attempt.activity_id),
                "student_id": str(student_id),
            },
            deduplication_key=f"hint:{row.hint_id}",
        )
        return row
