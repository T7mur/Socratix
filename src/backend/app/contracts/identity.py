from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.contracts.enums import Role


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)
    contract_version: Literal["1.0"] = "1.0"


class UserProfile(Contract):
    id: UUID
    email: str
    display_name: str
    role: Role
    is_active: bool
    created_at: datetime
