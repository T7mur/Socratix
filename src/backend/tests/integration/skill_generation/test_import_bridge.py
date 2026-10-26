"""Requires the explicit disposable PostgreSQL fixture; never targets the application project."""
import copy
from uuid import UUID, uuid4

import pytest
from app.contracts.enums import ResourceType
from app.contracts.reviews import ReviewDecisionCreate
from app.core.errors import ConflictError, ForbiddenError
from app.db.models.curriculum import CatalogueRevision, SourceSpan
from app.db.models.identity import User
from app.db.models.skill_imports import SkillCandidateEvidence, SkillImportRun
from app.db.repositories.catalogue import CatalogueRepository
from app.db.repositories.skill_imports import SkillImportRepository, import_lock
from app.db.session import Database
from app.integrations.elm import LLMProviderError
from app.modules.skill_generation.import_artifacts import PreparedImport
from app.modules.skill_generation.importer import import_prepared
from app.modules.skill_generation.reviewer import review_candidate
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError


@pytest.fixture
async def scenario(db):
    actor, student, source_id, chunk_id, span_id = [uuid4() for _ in range(5)]
    async with db() as session, session.begin():
        session.add_all([User(id=actor, email="admin@example.invalid", display_name="Admin", role="admin"),
                        User(id=student, email="student@example.invalid", display_name="Student", role="student")])
    source = {"source_id": str(source_id), "uri": "https://example.invalid/synthetic",
              "edition": "synthetic-v1", "rights_status": "permitted", "source_kind": "cs2023", "checksum": "a"*64}
    span = {"span_id": str(span_id), "source_id": str(source_id), "section": "AI / Demo", "page": 1,
            "text_excerpt": "Compare two examples.", "rights_status": "permitted",
            "locator": {"uri": source["uri"], "block_id": str(uuid4()), "normalized_text_range": [0, 21]}}
    request = {"primary_span_ids": [str(span_id)], "user_data": {
        "chunk_id": str(chunk_id), "source_spans": [span], "existing_skills": []}}
    prepared = PreparedImport(source, "b"*64, {"AI-Demo": [request]}, {}, {str(span_id): span})
    payload = {"skills": [{"skill_id": "cs2023.ai.demo.compare", "name": "Comparison",
        "description": "Compare examples", "source_kind": "cs2023", "source_refs": [
            {"uri": source["uri"], "section": span["section"], "page": 1}]}], "evidence": [{
        "resource_type": "skill", "resource_id": "cs2023.ai.demo.compare", "span_ids": [str(span_id)],
        "evidence_kind": "direct_source", "rationale": "Explicit source topic"}]}

    class Gateway:
        calls = 0
        fail_call = None

        async def generate_json(self, **kwargs):
            self.calls += 1
            if self.calls == self.fail_call:
                raise LLMProviderError("Synthetic provider failure")
            return copy.deepcopy(payload)

    return Database(db.kw["bind"], db), actor, student, prepared, Gateway(), payload


async def test_dry_run_no_writes_and_student_cannot_import(scenario, settings):
    database, actor, student, prepared, gateway, _ = scenario
    with pytest.raises(ForbiddenError):
        await import_prepared(database, gateway, settings, prepared, student, "permission:test")
    report, code = await import_prepared(database, gateway, settings, prepared, actor,
                                         "permission:test", dry_run=True)
    assert code == 0 and report["dry_run"] and gateway.calls == 0
    async with database.sessions() as session:
        assert await session.scalar(select(func.count()).select_from(SkillImportRun)) == 0


async def test_import_resume_evidence_and_human_approval(scenario, settings):
    database, actor, _, prepared, gateway, _ = scenario
    report, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 0 and report["pending_review_count"] == 1 and gateway.calls == 1
    assert all(chunk["checkpointed"] for chunk in report["chunks"])
    async with database.sessions() as session:
        assert await SkillImportRepository(session).latest_run(actor) == UUID(report["run_id"])
    again, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 0 and again["run_id"] == report["run_id"] and gateway.calls == 1
    assert again["skipped_units"] == ["AI-Demo"]
    async with database.sessions() as session, session.begin():
        repo = CatalogueRepository(session)
        assert (await repo.get_graph_snapshot())["skills"] == []
        assert await session.scalar(select(func.count()).select_from(SourceSpan)) == 1
        assert await session.scalar(select(func.count()).select_from(SkillCandidateEvidence)) == 1
        await review_candidate(session, actor, ResourceType.skill, "cs2023.ai.demo.compare",
                               ReviewDecisionCreate(resource_version=1, decision="approved", reason="Synthetic review"))
    async with database.sessions() as session:
        assert len((await CatalogueRepository(session).get_graph_snapshot())["skills"]) == 1
    again, _ = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert again["pending_review_count"] == 0 and gateway.calls == 1
    async with import_lock(database.engine, report["fingerprint"]):
        with pytest.raises(ConflictError):
            await import_prepared(database, gateway, settings, prepared, actor, "permission:test")


async def test_provider_interruption_keeps_completed_chunk(scenario, settings):
    database, actor, _, prepared, gateway, _ = scenario
    second = copy.deepcopy(prepared.requests["AI-Demo"][0])
    second["user_data"]["chunk_id"] = str(uuid4())
    prepared.requests["AI-Demo"].append(second)
    gateway.fail_call = 2
    report, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 1 and not report["candidates"]
    async with database.sessions() as session:
        assert await session.scalar(select(func.count()).select_from(CatalogueRevision)) == 0
    gateway.fail_call = None
    report, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 0 and gateway.calls == 3


async def test_bad_unit_writes_no_spans_or_candidates(scenario, settings):
    database, actor, _, prepared, gateway, payload = scenario
    payload["skills"][0]["source_refs"][0]["page"] = 100
    report, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 2 and report["failures"] == {"AI-Demo": "unit_validation_failed"}
    async with database.sessions() as session:
        assert await session.scalar(select(func.count()).select_from(CatalogueRevision)) == 0
        assert await session.scalar(select(func.count()).select_from(SourceSpan)) == 0


async def test_changed_model_creates_run_and_audit_is_immutable(scenario, settings):
    database, actor, _, prepared, gateway, _ = scenario
    report, _ = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    settings.elm_model = "new-model"
    other, code = await import_prepared(database, gateway, settings, prepared, actor, "permission:test")
    assert code == 0 and other["run_id"] != report["run_id"]
    assert other["candidates"] == report["candidates"]
    with pytest.raises(IntegrityError):
        async with database.sessions() as session, session.begin():
            await session.execute(text("UPDATE socratix.skill_import_runs SET permission_ref='changed'"))
    with pytest.raises(IntegrityError):
        async with database.sessions() as session, session.begin():
            await session.execute(text("DELETE FROM socratix.skill_candidate_evidence"))
    with pytest.raises(IntegrityError):
        async with database.sessions() as session, session.begin():
            await session.execute(text("UPDATE socratix.source_spans SET permitted_excerpt='changed'"))
