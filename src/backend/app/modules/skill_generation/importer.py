"""Operator orchestration; no untrusted execution or automatic catalogue approval."""
import json
import os
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from app.core.errors import ConflictError, ForbiddenError, ValidationError
from app.db.repositories.catalogue import CatalogueRepository
from app.db.repositories.common import checksum
from app.db.repositories.skill_imports import SkillImportRepository, import_lock
from app.integrations.elm import LLMError
from app.modules.skill_generation.candidates import (
    PROMPT_VERSION,
    SCHEMA_VERSION,
    SkillCandidateBatch,
    validate_batches,
)
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError


@dataclass(frozen=True)
class ImportProgress:
    """Internal operator observation, never a student DTO or approval signal."""
    phase: str
    completed: int = 0
    total: int = 0
    unit: str | None = None
    chunk_index: int = 0
    unit_total: int = 0
    run_id: str | None = None


ProgressCallback = Callable[[ImportProgress], None]


def import_configuration(settings, permission_ref: str, sections: list[str]) -> dict:
    prompt = extraction_prompt()
    return {"prompt_version": PROMPT_VERSION, "schema_version": SCHEMA_VERSION,
            "prompt_digest": checksum({"prompt": prompt}),
            "schema_digest": checksum(SkillCandidateBatch.model_json_schema()),
            "base_url": settings.elm_base_url,
            "model": settings.elm_model_generation or settings.elm_model,
            "timeout_seconds": settings.elm_timeout_seconds, "max_attempts": settings.elm_max_attempts,
            "permission_ref": permission_ref, "sections": sorted(sections)}


def extraction_prompt() -> str:
    return (Path(__file__).resolve().parents[4] / "shared/prompts/skill/extract_v1.txt").read_text(encoding="utf-8")


async def preflight(database, actor_id, prepared):
    async with database.sessions() as session, session.begin():
        revision = await session.scalar(text("SELECT version_num FROM socratix.alembic_version"))
        if revision != "0006":
            raise ConflictError("Reviewed migration 0006 must be installed before importing")
        repo = SkillImportRepository(session)
        await repo.require_admin(actor_id)
        await repo.check_source(prepared.source)
        approved = await CatalogueRepository(session).get_graph_snapshot()
        known = {s["skill_id"]: s for s in approved["skills"]}
        for requests in prepared.requests.values():
            for request in requests:
                for skill in request["user_data"]["existing_skills"]:
                    if (not isinstance(skill, dict) or skill.get("skill_id") not in known
                            or any(skill[k] != known[skill["skill_id"]].get(k)
                                   for k in skill if k in {"name", "description"})):
                        raise ValidationError("Artifact existing-skills context is not approved catalogue content")


async def import_prepared(database, gateway, settings, prepared, actor_id: UUID, permission_ref: str,
                          *, dry_run=False, progress: ProgressCallback | None = None):
    total = sum(len(requests) for requests in prepared.requests.values())
    completed = 0
    run_id = None

    def notify(phase, unit=None, chunk_index=0, unit_total=0):
        if progress is not None:
            progress(ImportProgress(phase, completed, total, unit, chunk_index, unit_total,
                                    str(run_id) if run_id else None))

    if not permission_ref.strip():
        raise ValidationError("A permission record reference is required")
    notify("Checking database and permissions")
    await preflight(database, actor_id, prepared)
    config = import_configuration(settings, permission_ref, list(prepared.requests) + list(prepared.blocked))
    fingerprint = checksum({"artifacts": prepared.artifact_digest, "configuration": config,
                            "actor_id": str(actor_id)})
    if dry_run:
        notify("Dry run: review required" if prepared.blocked else "Dry run: ready")
        return {"dry_run": True, "fingerprint": fingerprint, "units": sorted(prepared.requests),
                "blocked_units": prepared.blocked, "status": "review_required" if prepared.blocked else "ready"}, (
                    2 if prepared.blocked else 0)
    if not prepared.requests:
        notify("No eligible units: review required")
        return {"status": "review_required", "blocked_units": prepared.blocked}, 2
    async with import_lock(database.engine, fingerprint):
        async with database.sessions() as session, session.begin():
            run_id = await SkillImportRepository(session).start(
                prepared, fingerprint, actor_id, permission_ref, config)
        notify("Import started")
        processed, skipped, failures = [], [], {}
        for code, requests in sorted(prepared.requests.items()):
            unit_total = len(requests)
            notify("Loading unit checkpoints", code, unit_total=unit_total)
            async with database.sessions() as session, session.begin():
                chunks = {str(c.chunk_id): c for c in await SkillImportRepository(session).chunks(run_id)}
            if all(chunks[r["user_data"]["chunk_id"]].status == "succeeded" for r in requests):
                skipped.append(code)
                completed += len(requests)
                notify("Unit already saved; skipped", code, unit_total, unit_total)
                continue
            batches = []
            try:
                for index, request in enumerate(requests, start=1):
                    chunk_id = request["user_data"]["chunk_id"]
                    chunk = chunks[chunk_id]
                    if chunk.result and chunk.status in {"running", "succeeded"}:
                        batch = SkillCandidateBatch.model_validate(chunk.result["batch"])
                        phase = "Reused saved checkpoint"
                    else:
                        async with database.sessions() as session, session.begin():
                            await SkillImportRepository(session).require_admin(actor_id)
                            await SkillImportRepository(session).check_source(prepared.source)
                            await SkillImportRepository(session).checkpoint(run_id, chunk_id, status="running")
                        notify("Waiting for model", code, index, unit_total)
                        value = await gateway.generate_json(
                            operation=PROMPT_VERSION, model_alias="generation", system_prompt=extraction_prompt(),
                            payload={"user_data": request["user_data"],
                                     "primary_span_ids": request["primary_span_ids"]}, schema=SkillCandidateBatch)
                        batch = SkillCandidateBatch.model_validate(value)
                        async with database.sessions() as session, session.begin():
                            await SkillImportRepository(session).checkpoint(run_id, chunk_id, status="running",
                                result={"batch": batch.model_dump(mode="json")})
                        phase = "Model result checkpointed"
                    batches.append((request, batch))
                    completed += 1
                    notify(phase, code, index, unit_total)
                notify("Validating and saving complete unit", code, unit_total, unit_total)
                async with database.sessions() as session, session.begin():
                    approved = await SkillImportRepository(session).validation_graph()
                    declared = {s["skill_id"] for r in requests for s in r["user_data"]["existing_skills"]}
                    approved["skills"] = [s for s in approved["skills"] if s["skill_id"] in declared]
                    resources = validate_batches(batches, approved)
                    await SkillImportRepository(session).persist_unit(
                        run_id, actor_id, UUID(prepared.source["source_id"]), prepared.spans, resources,
                        [r["user_data"]["chunk_id"] for r in requests])
                processed.append(code)
                notify("Unit saved; candidates await human review", code, unit_total, unit_total)
            except (ValidationError, ConflictError, ForbiddenError, LLMError, SQLAlchemyError) as exc:
                error = ("provider_failure" if isinstance(exc, LLMError) else
                         "persistence_failure" if isinstance(exc, SQLAlchemyError) else "unit_validation_failed")
                failures[code] = error
                if error == "unit_validation_failed":
                    completed -= len(batches)
                async with database.sessions() as session, session.begin():
                    repo = SkillImportRepository(session)
                    for request in requests:
                        # Keep valid checkpoints on a provider/persistence interruption.
                        # Semantic unit rejection requires fresh generation on the next run.
                        await repo.checkpoint(run_id, request["user_data"]["chunk_id"],
                            status="failed" if error != "unit_validation_failed" else "review_required", error_code=error,
                            preserve_result=error != "unit_validation_failed")
                notify(f"Unit stopped: {error}", code, len(batches), unit_total)
        status = ("failed" if any(e != "unit_validation_failed" for e in failures.values()) else
                  "review_required" if failures or prepared.blocked else "succeeded")
        async with database.sessions() as session, session.begin():
            repo = SkillImportRepository(session)
            await repo.finish(run_id, status, {"processed_units": processed, "skipped_units": skipped,
                "blocked_units": prepared.blocked, "failures": failures})
            report = await repo.report(run_id)
        notify(f"Import {status}")
        return report, 1 if status == "failed" else 2 if status == "review_required" else 0


def write_report(report: dict, root: Path) -> Path:
    """Atomically regenerate an operator-only report; never overwrite ingestion inputs."""
    target = root / report["run_id"] / "report.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, name = tempfile.mkstemp(prefix=".report-", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(report, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write("\n")
        os.replace(name, target)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    return target
