from math import isclose
from uuid import UUID

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import DEFAULT_SELECTOR_WEIGHTS
from app.core.errors import ValidationError
from app.db.base import utcnow
from app.db.models.evidence import ReassessmentSchedule, SkillEstimate
from app.db.models.selection import SelectorDecision
from app.db.repositories.common import require_course_membership


class SelectionRepository:
    def __init__(self, session: AsyncSession, weights: dict[str, float] | None = None):
        self.session = session
        self.weights = dict(DEFAULT_SELECTOR_WEIGHTS if weights is None else weights)
        if (
            set(self.weights) != set(DEFAULT_SELECTOR_WEIGHTS)
            or any(value < 0 for value in self.weights.values())
            or not isclose(sum(self.weights.values()), 1)
        ):
            raise ValidationError(
                "Configured heuristic weights must contain planning/gap/retention and sum to one"
            )

    async def save_skill_estimate(
        self, student_id: UUID, skill_id: str, policy_version: str, **values
    ) -> None:
        """Trusted gap-service output only; this adapter does not calculate educational indices."""
        values.setdefault("computed_at", utcnow())
        stmt = insert(SkillEstimate).values(
            student_id=student_id, skill_id=skill_id, policy_version=policy_version, **values
        )
        await self.session.execute(
            stmt.on_conflict_do_update(
                index_elements=["student_id", "skill_id", "policy_version"],
                set_={key: getattr(stmt.excluded, key) for key in values},
            )
        )

    async def save_reassessment_schedule(
        self, student_id: UUID, skill_id: str, policy_version: str, **values
    ) -> None:
        values.setdefault("updated_at", utcnow())
        stmt = insert(ReassessmentSchedule).values(
            student_id=student_id, skill_id=skill_id, policy_version=policy_version, **values
        )
        await self.session.execute(
            stmt.on_conflict_do_update(
                index_elements=["student_id", "skill_id", "policy_version"],
                set_={key: getattr(stmt.excluded, key) for key in values},
            )
        )

    async def record_selector_decision(self, student_id: UUID, course_id: UUID, **values) -> SelectorDecision:
        await require_course_membership(self.session, student_id, course_id)
        if values["weights"] != self.weights:
            raise ValidationError("Ranking records must match the configured heuristic weights")
        row = SelectorDecision(student_id=student_id, course_id=course_id, **values)
        self.session.add(row)
        await self.session.flush()
        return row
