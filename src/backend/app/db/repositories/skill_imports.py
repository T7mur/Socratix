"""Private import persistence. Caller owns transactions; provider work lives outside them."""
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import select, text

from app.contracts.enums import ResourceType
from app.core.errors import ConflictError, ForbiddenError, NotFoundError
from app.db.base import utcnow
from app.db.models.curriculum import CatalogueRevision, CurriculumSource, SourceSpan
from app.db.models.identity import User
from app.db.models.skill_imports import SkillCandidateEvidence, SkillImportChunk, SkillImportRun
from app.db.repositories.catalogue import CatalogueRepository, lock_catalogue
from app.db.repositories.common import checksum


@asynccontextmanager
async def import_lock(engine, fingerprint: str):
    """Session advisory lock on a dedicated connection; no transaction spans a model call."""
    key = int(fingerprint[:16], 16)
    if key >= 2**63:
        key -= 2**64
    async with engine.connect() as connection:
        locked = await connection.scalar(text("SELECT pg_try_advisory_lock(:key)"), {"key": key})
        try:
            await connection.commit()
            if not locked:
                raise ConflictError("This import is already running")
            yield
        finally:
            if locked:
                try:
                    await connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": key})
                    await connection.commit()
                except BaseException:
                    # Never return a connection with an unknown session-lock state to the pool.
                    await connection.invalidate()
                    raise


class SkillImportRepository:
    def __init__(self, session):
        self.session = session

    async def require_admin(self, actor_id: UUID):
        user = await self.session.scalar(select(User).where(User.id == actor_id)
            .with_for_update(read=True).execution_options(populate_existing=True))
        if user is None or not user.is_active or user.role != "admin":
            raise ForbiddenError("An existing active admin actor is required")

    async def validation_graph(self):
        await lock_catalogue(self.session)
        return await CatalogueRepository(self.session).get_graph_snapshot()

    async def check_source(self, source: dict):
        by_id = await self.session.get(CurriculumSource, UUID(source["source_id"]))
        by_checksum = await self.session.scalar(
            select(CurriculumSource).where(CurriculumSource.checksum == source["checksum"])
        )
        for row in (by_id, by_checksum):
            if row and any(getattr(row, key) != value for key, value in {
                "id": UUID(source["source_id"]), "checksum": source["checksum"], "uri": source["uri"],
                "edition": source["edition"], "source_kind": source["source_kind"],
                "rights_status": source["rights_status"],
            }.items()):
                raise ConflictError("Source identity, permission or metadata conflicts with a registered source")
        return by_id

    async def start(self, prepared, fingerprint, actor_id, permission_ref, configuration):
        await self.require_admin(actor_id)
        await lock_catalogue(self.session)
        source = await self.check_source(prepared.source)
        if source is None:
            data = dict(prepared.source)
            data["id"] = UUID(data.pop("source_id"))
            self.session.add(CurriculumSource(**data))
            await self.session.flush()
        run = await self.session.scalar(select(SkillImportRun).where(SkillImportRun.fingerprint == fingerprint))
        if run is None:
            run = SkillImportRun(fingerprint=fingerprint, source_id=UUID(prepared.source["source_id"]),
                                 actor_id=actor_id, permission_ref=permission_ref, configuration=configuration)
            self.session.add(run)
            await self.session.flush()
        run.status = "running"
        run.finished_at = None
        for code, requests in prepared.requests.items():
            for request in requests:
                chunk_id = UUID(request["user_data"]["chunk_id"])
                chunk = await self.session.get(SkillImportChunk, (run.id, chunk_id))
                digest = checksum(request)
                if chunk and chunk.request_digest != digest:
                    raise ConflictError("Stored chunk request digest differs")
                if chunk is None:
                    self.session.add(SkillImportChunk(run_id=run.id, chunk_id=chunk_id,
                        section_code=code, request_digest=digest))
        await self.session.flush()
        return run.id

    async def chunks(self, run_id):
        return (await self.session.scalars(select(SkillImportChunk).where(
            SkillImportChunk.run_id == run_id
        ).order_by(SkillImportChunk.chunk_id))).all()

    async def checkpoint(self, run_id, chunk_id, *, status, result=None, error_code=None, preserve_result=False):
        row = await self.session.get(SkillImportChunk, (run_id, UUID(str(chunk_id))))
        if preserve_result and row.result:
            return
        row.status, row.error_code = status, error_code
        if result is not None:
            row.result = result

    async def persist_unit(self, run_id, actor_id, source_id, spans, resources, chunk_ids):
        await self.require_admin(actor_id)
        await lock_catalogue(self.session)
        source = await self.session.get(CurriculumSource, source_id)
        if source is None or source.rights_status != "permitted":
            raise ConflictError("Source permission changed during import")
        used = {e["span_id"] for r in resources for e in r["evidence"]}
        for span_id in sorted(used):
            span = spans[span_id]
            digest = checksum(span)
            row = await self.session.get(SourceSpan, UUID(span_id))
            if row and (row.source_id != source_id or row.checksum != digest):
                raise ConflictError("Stored source span identity conflicts")
            if row is None:
                self.session.add(SourceSpan(id=UUID(span_id), source_id=source_id, section=span["section"],
                    page=span["page"], locator=span["locator"], permitted_excerpt=span["text_excerpt"],
                    checksum=digest))
        await self.session.flush()
        repo = CatalogueRepository(self.session)
        stored = []
        for resource in resources:
            kind, key, payload = resource["resource_type"], resource["resource_id"], resource["payload"]
            latest = await self.session.scalar(select(CatalogueRevision).where(
                CatalogueRevision.resource_type == kind, CatalogueRevision.resource_id == key
            ).order_by(CatalogueRevision.resource_version.desc()).limit(1))
            # Reuse pending/accepted identical content, but never revive a rejected revision automatically.
            if (latest and latest.source_id == source_id and latest.checksum == checksum(payload)
                    and latest.approval_status in {"proposed", "under_review", "approved"}):
                revision = latest
            else:
                revision = await repo.create_candidate_revision(ResourceType(kind), key, payload, source_id, actor_id)
            for item in resource["evidence"]:
                chunk_id, span_id = UUID(item["chunk_id"]), UUID(item["span_id"])
                exists = await self.session.scalar(select(SkillCandidateEvidence.id).where(
                    SkillCandidateEvidence.run_id == run_id, SkillCandidateEvidence.chunk_id == chunk_id,
                    SkillCandidateEvidence.resource_type == kind, SkillCandidateEvidence.resource_id == key,
                    SkillCandidateEvidence.resource_version == revision.resource_version,
                    SkillCandidateEvidence.span_id == span_id,
                ))
                if exists is None:
                    self.session.add(SkillCandidateEvidence(run_id=run_id, chunk_id=chunk_id,
                        resource_type=kind, resource_id=key, resource_version=revision.resource_version,
                        span_id=span_id, evidence_kind=item["evidence_kind"], rationale=item["rationale"]))
            stored.append({"resource_type": kind, "resource_id": key,
                           "resource_version": revision.resource_version})
        for chunk_id in chunk_ids:
            row = await self.session.get(SkillImportChunk, (run_id, UUID(chunk_id)))
            row.status, row.error_code = "succeeded", None
            row.result = {**row.result, "resources": stored}
        await self.session.flush()
        return stored

    async def finish(self, run_id, status, summary):
        row = await self.session.get(SkillImportRun, run_id)
        row.status, row.summary, row.finished_at = status, summary, utcnow()

    async def report(self, run_id):
        run = await self.session.get(SkillImportRun, run_id)
        if run is None:
            raise NotFoundError("Import run not found")
        chunks = await self.chunks(run_id)
        resources = {(r["resource_type"], r["resource_id"], r["resource_version"]): r
                     for c in chunks for r in (c.result or {}).get("resources", [])}
        pending = 0
        for key in resources:
            row = await self.session.get(CatalogueRevision, key)
            pending += row.approval_status in {"proposed", "under_review"}
        return {"run_id": str(run_id), "status": run.status, "source_id": str(run.source_id),
                "fingerprint": run.fingerprint, **run.summary, "candidates": list(resources.values()),
                "pending_review_count": pending, "human_review_required": pending > 0,
                "chunks": [{"chunk_id": str(c.chunk_id), "section": c.section_code,
                            "status": c.status, "error_code": c.error_code,
                            "checkpointed": bool(c.result and c.status in {"running", "succeeded"})}
                           for c in chunks]}

    async def latest_run(self, actor_id):
        """Most recent active run for this actor, otherwise their most recent run. Read-only."""
        query = select(SkillImportRun.id).where(SkillImportRun.actor_id == actor_id).order_by(
            SkillImportRun.created_at.desc(), SkillImportRun.id.desc()).limit(1)
        run_id = await self.session.scalar(query.where(SkillImportRun.status.in_(["queued", "running"])))
        if run_id is None:
            run_id = await self.session.scalar(query)
        if run_id is None:
            raise NotFoundError("No import run found for this actor")
        return run_id

    async def recovery_snapshot(self, run_id, actor_id, prepared):
        """Read-only snapshot of inactive matching saved batches, including rejected results."""
        await self.require_admin(actor_id)
        run = await self.session.get(SkillImportRun, run_id)
        if run is None:
            raise NotFoundError("Source import run not found")
        if run.status in {"queued", "running"}:
            raise ConflictError("The source import must finish or stop before recovery")
        if run.source_id != UUID(prepared.source["source_id"]):
            raise ConflictError("Recovery artifacts belong to a different source")
        await self.check_source(prepared.source)
        chunks = {str(c.chunk_id): c for c in await self.chunks(run_id)}
        batches = {}
        for requests in prepared.requests.values():
            for request in requests:
                key = request["user_data"]["chunk_id"]
                chunk = chunks.get(key)
                if chunk is None or chunk.request_digest != checksum(request):
                    raise ConflictError("Recovery request identity differs from the saved import")
                if not chunk.result or "batch" not in chunk.result:
                    raise ConflictError("Recovery requires saved results for every selected chunk")
                batches[key] = chunk.result["batch"]
        return {"source_run_id": str(run.id), "configuration": run.configuration, "batches": batches}

    async def evidence(self, kind, key, version):
        # Keep pre-bridge catalogue review usable while proposed migration 0006 awaits review.
        if await self.session.scalar(text("SELECT to_regclass('socratix.skill_candidate_evidence')")) is None:
            return []
        rows = (await self.session.execute(select(SkillCandidateEvidence, SourceSpan, SkillImportChunk)
            .join(SourceSpan, SourceSpan.id == SkillCandidateEvidence.span_id)
            .join(SkillImportChunk, (SkillImportChunk.run_id == SkillCandidateEvidence.run_id)
                  & (SkillImportChunk.chunk_id == SkillCandidateEvidence.chunk_id))
            .where(SkillCandidateEvidence.resource_type == kind,
                   SkillCandidateEvidence.resource_id == key,
                   SkillCandidateEvidence.resource_version == version)
            .order_by(SkillCandidateEvidence.created_at, SkillCandidateEvidence.id))).all()
        return [{"run_id": e.run_id, "chunk_id": e.chunk_id, "span_id": e.span_id,
                 "evidence_kind": e.evidence_kind, "rationale": e.rationale,
                 "section": s.section, "page": s.page, "locator": s.locator,
                 "excerpt": s.permitted_excerpt,
                 "review_flags": (c.result or {}).get("batch", {}).get("review_flags", [])}
                for e, s, c in rows]
