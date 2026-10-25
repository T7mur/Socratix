from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.contracts.enums import Role
from app.core.errors import NotFoundError, ValidationError
from app.db.models.identity import User, UserRoleEvent


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def ensure_student_profile(self, user_id: UUID, email: str, display_name: str) -> User:
        stmt = insert(User).values(
            id=user_id, email=email, display_name=display_name, role="student", is_active=True
        )
        stmt = stmt.on_conflict_do_update(index_elements=[User.id], set_={"email": stmt.excluded.email})
        await self.session.execute(stmt)
        return await self.get_user(user_id)

    async def get_user(self, user_id: UUID) -> User:
        user = await self.session.get(User, user_id, populate_existing=True)
        if user is None:
            raise NotFoundError("Application user not found")
        return user

    async def set_user_role(self, user_id: UUID, role: Role, actor_id: UUID, reason: str) -> None:
        """Privileged operator command only: requires migration-owner database credentials."""
        if not reason.strip():
            raise ValidationError("Role changes require an audit reason")
        user = await self.session.scalar(select(User).where(User.id == user_id).with_for_update())
        actor = await self.get_user(actor_id)
        if user is None:
            raise NotFoundError("User must sign in once before role provisioning")
        if not actor.is_active:
            raise ValidationError("Audit actor must be active")
        if user.role != role.value:
            self.session.add(
                UserRoleEvent(
                    user_id=user_id,
                    previous_role=user.role,
                    new_role=role.value,
                    changed_by=actor_id,
                    reason=reason,
                )
            )
            user.role = role.value
