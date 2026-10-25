from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.common import Created, Id, Json, JsonList


class SelectorDecision(Created, Base):
    __tablename__ = "selector_decisions"
    selection_id: Mapped[Id]
    student_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"))
    policy_version: Mapped[str]
    candidate_features: Mapped[JsonList]
    weights: Mapped[Json]
    ranked_targets: Mapped[JsonList]
    chosen_target: Mapped[Json | None]
    override: Mapped[Json | None]
