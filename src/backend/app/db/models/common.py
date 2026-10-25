from datetime import datetime
from typing import Annotated
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import new_id, utcnow

Id = Annotated[UUID, mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_id)]
Json = Annotated[dict, mapped_column(JSONB)]
JsonList = Annotated[list, mapped_column(JSONB)]
Time = Annotated[datetime, mapped_column(DateTime(timezone=True))]
TextValue = Annotated[str, mapped_column(Text)]


class Created:
    created_at: Mapped[Time] = mapped_column(default=utcnow, server_default=func.now())


class Updated(Created):
    updated_at: Mapped[Time] = mapped_column(default=utcnow, onupdate=utcnow, server_default=func.now())


def choices(column: str, values) -> CheckConstraint:
    values = [getattr(value, "value", value) for value in values]
    quoted = ",".join("'" + value + "'" for value in values)
    return CheckConstraint(f"{column} IN ({quoted})", name=f"{column}_values")
