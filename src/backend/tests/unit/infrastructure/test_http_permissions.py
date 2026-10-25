from uuid import uuid4

from httpx import ASGITransport, AsyncClient

from app.core.security import get_current_user
from app.db.models.identity import User
from app.db.session import get_db_session
from app.main import create_app


async def test_students_cannot_access_any_review_route():
    app = create_app()

    async def student():
        return User(
            id=uuid4(),
            email="student@example.invalid",
            display_name="Student",
            role="student",
            is_active=True,
        )

    async def unused_session():
        yield None

    app.dependency_overrides[get_current_user] = student
    app.dependency_overrides[get_db_session] = unused_session
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        for path in [
            "/api/v1/reviews",
            "/api/v1/reviews/skill/python.test?resource_version=1",
            "/api/v1/reviews/skill/python.test/history",
        ]:
            assert (await client.get(path)).status_code == 403
        assert (
            await client.post(
                "/api/v1/reviews/skill/python.test",
                json={"resource_version": 1, "decision": "approved", "reason": "Trying"},
            )
        ).status_code == 403


async def test_unauthenticated_requests_rejected_before_database_access():
    app = create_app()

    async def unused_session():
        yield None

    app.dependency_overrides[get_db_session] = unused_session
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/api/v1/me")).status_code == 401
        assert (await client.get("/api/v1/reviews")).status_code == 401
