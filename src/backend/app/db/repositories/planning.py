from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models.curriculum import Skill
from app.db.models.evidence import AssessmentEvent
from app.db.models.planning import PlanSkillTag, Reflection, ReflectionSkillTag, StudentPlan
from app.db.repositories.common import require_course_membership


class PlanningRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def confirm_plan_tags(
        self, student_id: UUID, plan_id: UUID, confirmed: list[str], rejected: list[str]
    ) -> StudentPlan:
        row = await self.session.scalar(
            select(StudentPlan)
            .where(StudentPlan.plan_id == plan_id, StudentPlan.student_id == student_id)
            .with_for_update()
        )
        if row is None:
            raise NotFoundError("Plan not found")
        await require_course_membership(self.session, student_id, row.course_id)
        if set(confirmed) & set(rejected):
            raise ValidationError("Tags cannot be both confirmed and rejected")
        for skill_id, state in [(key, "confirmed") for key in confirmed] + [
            (key, "rejected") for key in rejected
        ]:
            tag = await self.session.get(PlanSkillTag, (plan_id, skill_id))
            skill = await self.session.get(Skill, skill_id)
            if tag is None or skill is None or skill.approval_status != "approved":
                raise ValidationError("Only approved, proposed plan tags may be confirmed")
            tag.confirmation_state, tag.confirmed_at = state, utcnow()
        row.confirmed_at = utcnow()
        return row

    async def save_reflection(self, student_id: UUID, **fields) -> Reflection:
        await require_course_membership(self.session, student_id, fields["course_id"])
        if fields.get("allow_use_as_learning_evidence"):
            raise ValidationError("Evidence consent is recorded at explicit reflection confirmation")
        row = Reflection(student_id=student_id, **fields)
        self.session.add(row)
        await self.session.flush()
        return row

    async def confirm_reflection(
        self,
        student_id: UUID,
        reflection_id: UUID,
        confirmed: list[str],
        dismissed: list[str],
        allow_use_as_learning_evidence: bool,
    ) -> list[str]:
        row = await self.session.scalar(
            select(Reflection)
            .where(Reflection.reflection_id == reflection_id, Reflection.student_id == student_id)
            .with_for_update()
        )
        if row is None:
            raise NotFoundError("Reflection not found")
        await require_course_membership(self.session, student_id, row.course_id)
        if row.confirmed_at or set(confirmed) & set(dismissed):
            raise ValidationError("Reflection already confirmed or conflicting tags")
        ids = []
        for key, state in [(key, "confirmed") for key in confirmed] + [
            (key, "rejected") for key in dismissed
        ]:
            tag = await self.session.get(ReflectionSkillTag, (reflection_id, key))
            skill = await self.session.get(Skill, key)
            if tag is None or skill is None or skill.approval_status != "approved":
                raise ValidationError("Only proposed, approved skills may be confirmed")
            tag.confirmation_state, tag.confirmed_at = state, utcnow()
            if state == "confirmed" and allow_use_as_learning_evidence:
                event = AssessmentEvent(
                    student_id=student_id,
                    attempt_id=row.attempt_id,
                    skill_id=key,
                    event_type="self_report",
                    student_confidence=row.reported_confidence,
                    feedback=row.reflection_text,
                )
                self.session.add(event)
                await self.session.flush()
                ids.append(str(event.evidence_id))
        row.allow_use_as_learning_evidence, row.confirmed_at = allow_use_as_learning_evidence, utcnow()
        return ids
