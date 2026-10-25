"""Run only with an explicitly disposable PostgreSQL/Supabase target; see conftest guards."""

import asyncio
import json
import os
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import IntegrityError
from test_database import ROOT, decision, seed

from app.core.errors import NotFoundError
from app.db.models.activities import Activity, GradingArtifact
from app.db.models.evidence import AssessmentEvent
from app.db.models.identity import Course, CourseEnrolment
from app.db.models.jobs import Evaluation, OutboxMessage, Submission
from app.db.repositories.activities import ActivityRepository
from app.db.repositories.catalogue import CatalogueRepository
from app.db.repositories.evidence import EvidenceRepository


async def learning_setup(db):
    admin, student, _, data = await seed(db)
    for item in data["candidates"]:
        await decision(db, admin, item["resource_type"], item["resource_id"])
    course_id, artifact_id = uuid4(), uuid4()
    spec = json.loads((ROOT / "src/shared/fixtures/stock_status_task.json").read_text())
    spec.update(task_id=str(uuid4()), verification_status="draft")
    async with db() as session, session.begin():
        session.add(
            Course(id=course_id, code="synthetic-python", name="Synthetic Python", description="Test only")
        )
        await session.flush()
        session.add(CourseEnrolment(user_id=student, course_id=course_id, course_role="student"))
        await session.flush()
        graph = await CatalogueRepository(session).get_graph_snapshot()
        repo = ActivityRepository(session)
        row = await repo.create_activity_version(
            student_id=student,
            course_id=course_id,
            spec=spec,
            graph_version=graph["graph_version"],
            generation_policy_version="generation-v1",
        )
        await repo.transition(row.id, 1, "verifying")
        session.add(
            GradingArtifact(
                artifact_id=artifact_id,
                artifact_version=1,
                activity_id=row.id,
                activity_version=1,
                reference_solution_ref="private://synthetic-reference",
                hidden_test_suite_ref="private://synthetic-tests",
                verification_report_ref="private://synthetic-report",
                fingerprint="synthetic-fingerprint",
            )
        )
        await session.flush()
        await repo.transition(row.id, 1, "verified")
        await repo.transition(row.id, 1, "published")
        activity_id = row.id
    return student, course_id, activity_id, artifact_id


async def submit(db, student, activity, attempt=None):
    attempt = attempt or uuid4()
    async with db() as session, session.begin():
        row = await EvidenceRepository(session).create_submission(
            attempt_id=attempt,
            student_id=student,
            activity_id=activity,
            activity_version=1,
            assessment_stage="transfer",
            idempotency_key=str(attempt),
            source_code_ref=f"private://submission/{attempt}",
        )
        return row.attempt_id


def report(artifact, validity="valid"):
    return dict(
        artifact_id=artifact,
        artifact_version=1,
        grader_identity="synthetic-isolated-runner",
        grading_validity=validity,
        passed_count=3,
        total_count=4,
        private_result={"failures": [{"test_id": "T4", "requirement_id": "R2"}]},
        student_safe_result={"test_summary": {"passed": 3, "total": 4}},
    )


def evidence(student, attempt, validity="valid"):
    # Canonical AssessmentEvidence has no evaluation_id: repository resolves the latest durable revision.
    return dict(
        contract_version="1.0",
        student_id=str(student),
        attempt_id=str(attempt),
        skill_id="python.conditionals",
        outcome_id="python.conditionals.transfer.v1",
        stage="transfer",
        task_validity=validity,
        observed_correctness=0.75,
        independent=True,
    )


async def test_duplicate_submissions_and_owned_safe_reads(db):
    student, _, activity, _ = await learning_setup(db)
    attempt = uuid4()
    ids = await asyncio.gather(submit(db, student, activity, attempt), submit(db, student, activity, attempt))
    assert ids == [attempt, attempt]
    async with db() as session:
        assert await session.scalar(select(func.count()).select_from(Submission)) == 1
        safe = await ActivityRepository(session).get_student_safe_activity(student, activity, 1)
        assert "private://" not in json.dumps(safe)
        with pytest.raises(NotFoundError):
            await ActivityRepository(session).get_student_safe_activity(uuid4(), activity, 1)


async def test_atomic_evaluation_evidence_outbox_rollback(db):
    student, _, activity, artifact = await learning_setup(db)
    attempt = await submit(db, student, activity)
    with pytest.raises(RuntimeError):
        async with db() as session, session.begin():
            repo = EvidenceRepository(session)
            await repo.save_evaluation_revision(attempt, 1, report(artifact))
            await repo.append(evidence(student, attempt))
            raise RuntimeError("Simulated failure before commit")
    async with db() as session:
        for cls in (Evaluation, AssessmentEvent, OutboxMessage):
            assert await session.scalar(select(func.count()).select_from(cls)) == 0


async def test_invalid_evidence_correction_and_rerun(db):
    student, _, activity, artifact = await learning_setup(db)
    attempt = await submit(db, student, activity)
    async with db() as session, session.begin():
        repo = EvidenceRepository(session)
        await repo.save_evaluation_revision(attempt, 1, report(artifact, "uncertain"))
        await repo.append(evidence(student, attempt, "uncertain"))
        assert await repo.list_for_skill(str(student), "python.conditionals") == []
        await repo.save_evaluation_revision(
            attempt, 2, report(artifact), correction_reason="Synthetic grader repaired"
        )
        event_id = await repo.append(evidence(student, attempt))
        assert await repo.append(evidence(student, attempt)) == event_id
        assert len(await repo.list_for_skill(str(student), "python.conditionals")) == 1
        await repo.append_correction(__import__("uuid").UUID(event_id), student, "Synthetic task invalidated")
        assert await repo.list_for_skill(str(student), "python.conditionals") == []


async def test_reveal_taints_separate_retry_on_original_activity(db):
    student, _, activity, artifact = await learning_setup(db)
    first = await submit(db, student, activity)
    async with db() as session, session.begin():
        repo = EvidenceRepository(session)
        await repo.save_evaluation_revision(first, 1, report(artifact))
        for level in range(1, 5):
            await repo.record_hint_event(
                first,
                student,
                level=level,
                hint_text="Synthetic hint",
                student_action="Explain",
                grounded_failure_ids=["T4"],
                quality_status="accepted",
                solution_revealed=level == 4,
            )
    retry = await submit(db, student, activity)
    async with db() as session, session.begin():
        repo = EvidenceRepository(session)
        await repo.save_evaluation_revision(retry, 1, report(artifact))
        await repo.append(evidence(student, retry))
        events = await repo.list_for_skill(str(student), "python.conditionals")
        assert len(events) == 1 and not events[0]["independent"] and events[0]["solution_revealed"]


async def test_frozen_contract_rejects_mutation(db):
    student, _, activity, artifact = await learning_setup(db)
    with pytest.raises(IntegrityError):
        async with db() as session, session.begin():
            row = await session.get(Activity, (activity, 1))
            row.student_safe_spec = {**row.student_safe_spec, "student_brief": "Changed after publication"}


async def test_migrations_roundtrip_and_private_permissions(db):
    engine = create_engine(os.environ["TEST_DATABASE_URL"], hide_parameters=True)
    config = Config(str(ROOT / "src/backend/alembic.ini"))
    with engine.connect() as conn:
        config.attributes["connection"] = conn
        command.downgrade(config, "base")
        command.upgrade(config, "head")
        assert (
            conn.scalar(text("SELECT count(*) FROM information_schema.tables WHERE table_schema='socratix'"))
            == 39
        )
        conn.execute(text((ROOT / "src/deployment/database_roles.sql").read_text()))
        assert not conn.scalar(
            text("SELECT has_table_privilege('socratix_api','socratix.grading_artifacts','SELECT')")
        )
        assert not conn.scalar(
            text("SELECT has_column_privilege('socratix_api','socratix.users','role','UPDATE')")
        )
        conn.commit()
    engine.dispose()
