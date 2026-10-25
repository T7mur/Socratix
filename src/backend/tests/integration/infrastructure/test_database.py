import asyncio
import json
from pathlib import Path
from uuid import uuid4

import pytest
from app.contracts.enums import ResourceType
from app.contracts.reviews import ReviewDecisionCreate
from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.core.security import get_current_user
from app.db.models.curriculum import CurriculumSource, ReviewDecision, Skill
from app.db.models.identity import User
from app.db.repositories.catalogue import CatalogueRepository
from app.db.repositories.users import UserRepository
from app.db.session import get_db_session
from app.main import create_app
from app.modules.skill_generation.reviewer import review_candidate
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError

ROOT = Path(__file__).resolve().parents[5]


async def seed(db):
    data = json.loads((ROOT / "src/shared/fixtures/catalogue_candidates.json").read_text())
    admin_id, student_id, source_id = uuid4(), uuid4(), uuid4()
    async with db() as session, session.begin():
        session.add_all(
            [
                User(id=admin_id, email="admin@example.invalid", display_name="Admin", role="admin"),
                User(id=student_id, email="student@example.invalid", display_name="Student", role="student"),
            ]
        )
        await session.flush()
        session.add(CurriculumSource(id=source_id, **data["source"], checksum=str(uuid4())))
        await session.flush()
        for item in data["candidates"]:
            await CatalogueRepository(session).create_candidate_revision(
                ResourceType(item["resource_type"]),
                item["resource_id"],
                item["payload"],
                source_id,
                student_id,
            )
    return admin_id, student_id, source_id, data


async def decision(db, admin_id, resource_type, key, action="approved", version=1):
    async with db() as session, session.begin():
        return await review_candidate(
            session,
            admin_id,
            ResourceType(resource_type),
            key,
            ReviewDecisionCreate(
                resource_version=version, decision=action, reason="Synthetic fixture reviewed"
            ),
        )


async def test_student_defaults_preserve_role_and_disabled_state(db):
    admin, student, _, _ = await seed(db)
    async with db() as session, session.begin():
        profile = await UserRepository(session).ensure_student_profile(
            admin, "updated@example.invalid", "Untrusted metadata"
        )
        assert profile.role == "admin"
        new_id = uuid4()
        first = await UserRepository(session).ensure_student_profile(new_id, "new@example.invalid", "New")
        again = await UserRepository(session).ensure_student_profile(new_id, "new@example.invalid", "New")
        assert first.id == again.id and first.role == "student"
        first.is_active = False
    async with db() as session, session.begin():
        assert not (
            await UserRepository(session).ensure_student_profile(new_id, "new@example.invalid", "New")
        ).is_active


async def test_review_is_atomic_audited_and_versioned(db):
    admin, student, source, data = await seed(db)
    with pytest.raises(ForbiddenError):
        await decision(db, student, "skill", "python.conditionals")
    await decision(db, admin, "skill", "python.conditionals")
    async with db() as session, session.begin():
        repo = CatalogueRepository(session)
        old = await repo.get_graph_snapshot()
        changed = {**data["candidates"][1]["payload"], "description": "A proposed edit"}
        await repo.create_candidate_revision(
            ResourceType.skill, "python.conditionals", changed, source, student
        )
        assert (await session.get(Skill, "python.conditionals")).description != "A proposed edit"
    await decision(db, admin, "skill", "python.conditionals", version=2)
    async with db() as session:
        assert (await CatalogueRepository(session).get_graph_snapshot(old["graph_version"])) == old
        assert (await session.get(Skill, "python.conditionals")).resource_version == 2
        assert await session.scalar(select(func.count()).select_from(ReviewDecision)) == 2


async def test_concurrent_review_has_one_decision(db):
    admin, _, _, _ = await seed(db)
    results = await asyncio.gather(
        decision(db, admin, "skill", "python.conditionals"),
        decision(db, admin, "skill", "python.conditionals", "rejected"),
        return_exceptions=True,
    )
    assert sum(isinstance(result, ConflictError) for result in results) == 1
    async with db() as session:
        assert await session.scalar(select(func.count()).select_from(ReviewDecision)) == 1


async def test_cycles_and_unapproved_endpoints_cannot_be_approved(db):
    admin, student, source, _ = await seed(db)
    relation_id = "00000000-0000-4000-8000-000000000030"
    with pytest.raises(ValidationError):
        await decision(db, admin, "relation", relation_id)
    for key in ["python.comparisons", "python.conditionals"]:
        await decision(db, admin, "skill", key)
    await decision(db, admin, "relation", relation_id)
    reverse = str(uuid4())
    async with db() as session, session.begin():
        await CatalogueRepository(session).create_candidate_revision(
            ResourceType.relation,
            reverse,
            {
                "from_skill_id": "python.comparisons",
                "to_skill_id": "python.conditionals",
                "relation": "requires",
            },
            source,
            student,
        )
    with pytest.raises(ValidationError):
        await decision(db, admin, "relation", reverse)


async def test_history_cannot_be_overwritten(db):
    admin, _, _, _ = await seed(db)
    await decision(db, admin, "skill", "python.conditionals")
    with pytest.raises(IntegrityError):
        async with db() as session, session.begin():
            await session.execute(text("UPDATE socratix.review_decisions SET reason='changed'"))


async def test_review_http_student_forbidden_and_admin_persists(db):
    admin, student, _, _ = await seed(db)
    app = create_app()
    current = [student]

    async def user():
        async with db() as session:
            return await session.get(User, current[0])

    async def sessions():
        async with db() as session:
            yield session

    app.dependency_overrides[get_current_user] = user
    app.dependency_overrides[get_db_session] = sessions
    async with AsyncClient(transport=ASGITransport(app), base_url="http://test") as client:
        assert (await client.get("/api/v1/reviews")).status_code == 403
        current[0] = admin
        queue = await client.get("/api/v1/reviews")
        assert queue.status_code == 200 and len(queue.json()["items"]) == 4
        response = await client.post(
            "/api/v1/reviews/skill/python.conditionals",
            json={
                "contract_version": "1.0",
                "resource_version": 1,
                "decision": "approved",
                "reason": "Verified source",
            },
        )
        assert response.status_code == 200
        assert (
            await client.post(
                "/api/v1/reviews/skill/python.conditionals",
                json={"resource_version": 1, "decision": "rejected", "reason": "Stale request"},
            )
        ).status_code == 409
