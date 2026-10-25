"""Exercise orchestration with an in-memory boundary; PostgreSQL semantics have separate tests."""
import copy
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.core.errors import ValidationError
from app.integrations.elm import LLMProviderError
from app.modules.skill_generation import importer
from app.modules.skill_generation.import_artifacts import PreparedImport


@pytest.fixture
def boundary(monkeypatch, settings):
    run_id, span_id, source_id, actor = [uuid4() for _ in range(4)]
    requests = []
    for _ in range(2):
        span = {"span_id": str(span_id), "section": "AI / Demo", "page": 1,
                "locator": {"uri": "https://example.invalid"}}
        requests.append({"primary_span_ids": [str(span_id)], "user_data": {
            "chunk_id": str(uuid4()), "source_spans": [span], "existing_skills": []}})
    prepared = PreparedImport({"source_id": str(source_id)}, "a"*64, {"AI-Demo": requests}, {}, {})
    state = SimpleNamespace(rows={}, persisted=[], active=0, calls=0, fail=None, summary={}, status="queued")

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        @asynccontextmanager
        async def begin(self):
            snapshot = copy.deepcopy((state.rows, state.persisted))
            state.active += 1
            try:
                yield
            except Exception:
                state.rows, state.persisted = snapshot
                raise
            finally:
                state.active -= 1

    class Repo:
        def __init__(self, session):
            pass

        async def require_admin(self, actor):
            pass

        async def check_source(self, source):
            pass

        async def validation_graph(self):
            return {"skills": [], "relationships": []}

        async def start(self, prepared, *args):
            for request in requests:
                key = request["user_data"]["chunk_id"]
                state.rows.setdefault(key, SimpleNamespace(chunk_id=key, status="queued", result=None))
            return run_id

        async def chunks(self, run):
            return list(state.rows.values())

        async def checkpoint(self, run, key, *, status, result=None, error_code=None, preserve_result=False):
            row = state.rows[key]
            if preserve_result and row.result:
                return
            row.status = status
            if result is not None:
                row.result = result

        async def persist_unit(self, run, actor, source, spans, resources, chunk_ids):
            state.persisted = resources
            for key in chunk_ids:
                state.rows[key].status = "succeeded"

        async def finish(self, run, status, summary):
            state.status, state.summary = status, summary

        async def report(self, run):
            return {"run_id": str(run_id), "status": state.status, **state.summary}

    class Catalogue:
        def __init__(self, session):
            pass

        async def get_graph_snapshot(self):
            return {"skills": [], "relationships": []}

    @asynccontextmanager
    async def lock(*args):
        yield

    async def preflight(*args):
        pass

    class Gateway:
        async def generate_json(self, **kwargs):
            assert state.active == 0, "A model call must not hold a transaction"
            state.calls += 1
            if state.fail == state.calls:
                raise LLMProviderError("Synthetic interruption")
            span = kwargs["payload"]["user_data"]["source_spans"][0]
            return {"skills": [{"skill_id": "cs2023.ai.demo.compare", "name": "Compare examples",
                "description": "Compare examples using evidence", "source_kind": "cs2023",
                "source_refs": [{"uri": span["locator"]["uri"], "section": span["section"], "page": span["page"]}]}],
                "evidence": [{"resource_type": "skill", "resource_id": "cs2023.ai.demo.compare",
                    "span_ids": [span["span_id"]], "evidence_kind": "direct_source", "rationale": "Synthetic topic"}]}

    monkeypatch.setattr(importer, "SkillImportRepository", Repo)
    monkeypatch.setattr(importer, "CatalogueRepository", Catalogue)
    monkeypatch.setattr(importer, "import_lock", lock)
    monkeypatch.setattr(importer, "preflight", preflight)
    return SimpleNamespace(sessions=Session, engine=None), Gateway(), settings, prepared, actor, state


async def execute(boundary, **kwargs):
    database, gateway, settings, prepared, actor, _ = boundary
    return await importer.import_prepared(database, gateway, settings, prepared, actor, "permission:test", **kwargs)


async def test_resumes_checkpoints_without_transaction_during_provider_calls(boundary):
    state = boundary[-1]
    state.fail = 2
    _, code = await execute(boundary)
    assert code == 1 and state.calls == 2
    assert [r.status for r in state.rows.values()] == ["running", "failed"]
    state.fail = None
    report, code = await execute(boundary)
    assert code == 0 and state.calls == 3 and report["processed_units"] == ["AI-Demo"]
    report, code = await execute(boundary)
    assert code == 0 and state.calls == 3 and report["skipped_units"] == ["AI-Demo"]


async def test_dry_run_does_not_start_run_or_call_provider(boundary):
    report, code = await execute(boundary, dry_run=True)
    state = boundary[-1]
    assert report["dry_run"] and code == 0 and not state.rows and state.calls == 0


async def test_rejected_unit_never_reaches_candidate_persistence(boundary, monkeypatch):
    def reject(*args):
        raise ValidationError("Unsupported source citation")
    monkeypatch.setattr(importer, "validate_batches", reject)
    report, code = await execute(boundary)
    state = boundary[-1]
    assert code == 2 and not state.persisted
    assert report["failures"] == {"AI-Demo": "unit_validation_failed"}
    assert all(r.status == "review_required" for r in state.rows.values())
