from uuid import UUID

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.contracts.enums import Role
from app.db.base import Base, utcnow
from app.db.models.common import Created, Id, TextValue, Time, Updated, choices


class User(Updated, Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(primary_key=True)
    email: Mapped[str]
    display_name: Mapped[str]
    role: Mapped[str] = mapped_column(default="student", server_default="student")
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")
    __table_args__ = (choices("role", Role),)


class UserRoleEvent(Created, Base):
    __tablename__ = "user_role_events"
    id: Mapped[Id]
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    previous_role: Mapped[str]
    new_role: Mapped[str]
    changed_by: Mapped[UUID] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[TextValue]
    __table_args__ = (choices("previous_role", Role), choices("new_role", Role))


class Course(Updated, Base):
    __tablename__ = "courses"
    id: Mapped[Id]
    code: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    description: Mapped[TextValue]
    status: Mapped[str] = mapped_column(default="active", server_default="active")
    __table_args__ = (choices("status", ["active", "archived"]),)


class CourseEnrolment(Base):
    __tablename__ = "course_enrolments"
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    course_id: Mapped[UUID] = mapped_column(ForeignKey("courses.id"), primary_key=True)
    course_role: Mapped[str]
    status: Mapped[str] = mapped_column(default="active", server_default="active")
    enrolled_at: Mapped[Time] = mapped_column(default=utcnow)
    __table_args__ = (
        choices("course_role", ["student", "instructor"]),
        choices("status", ["active", "inactive"]),
    )
