import copy
import importlib
import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from app.core.errors import ValidationError
from app.modules.skill_generation.candidates import SkillCandidateBatch, validate_batches
from app.modules.skill_generation.import_artifacts import PreparedImport
from app.modules.skill_generation.recovery import (
    make_recovery_review,
    resolve_recovery_review,
    write_recovery_review,
)


@pytest.fixture
def recovery_case():
    requests, batches, spans = [], {}, {}
    for page, name in enumerate(["First interpretation", "Second interpretation"], start=1):
        chunk_id, span_id = str(uuid4()), str(uuid4())
        span = {"span_id": span_id, "section": "Demo", "page": page,
                "locator": {"uri": "https://example.invalid/synthetic"}}
        request = {"user_data": {"chunk_id": chunk_id, "source_spans": [span], "existing_skills": []},
                   "primary_span_ids": [span_id]}
        batch = SkillCandidateBatch.model_validate({"skills": [{"skill_id": "python.demo", "name": name,
            "description": "Assess this interpretation", "source_kind": "cs2023", "source_refs": [{
                "uri": span["locator"]["uri"], "section": span["section"], "page": page}]}],
            "evidence": [{"resource_type": "skill", "resource_id": "python.demo", "span_ids": [span_id],
                           "evidence_kind": "direct_source", "rationale": "Synthetic source evidence"}]}).model_dump(mode="json")
        requests.append(request)
        batches[chunk_id] = batch
        spans[span_id] = span
    prepared = PreparedImport({"source_id": str(uuid4())}, "a"*64, {"AI-Demo": requests}, {}, spans)
    snapshot = {"source_run_id": str(uuid4()), "configuration": {"model": "original-model"}, "batches": batches}
    approved = {"skills": [], "relationships": []}
    return prepared, snapshot, approved


def choose_first(review):
    key = "skill:python.demo"
    variant = next(v for v in review["conflicts"][key]["variants"]
                   if v["payload"]["name"] == "First interpretation")
    review["selections"][key] = {"variant_id": variant["variant_id"], "reason": "Synthetic operator decision"}


def test_conflicts_require_explicit_choice_and_originals_remain_intact(recovery_case):
    prepared, snapshot, approved = recovery_case
    original = copy.deepcopy(snapshot)
    review = make_recovery_review(prepared, snapshot, approved)
    assert len(review["conflicts"]) == 1 and not review["chunk_actions"]
    with pytest.raises(ValidationError, match="Choose a listed variant"):
        resolve_recovery_review(prepared, snapshot, approved, review)
    choose_first(review)
    result = resolve_recovery_review(prepared, snapshot, approved, review)
    assert snapshot == original
    assert sum(len(b["skills"]) for b in result.batches.values()) == 1
    assert result.provenance["source_run_id"] == snapshot["source_run_id"]
    assert result.provenance["original_configuration"]["model"] == "original-model"


def test_identical_meaning_combines_verified_citations(recovery_case):
    prepared, snapshot, approved = recovery_case
    for batch in snapshot["batches"].values():
        batch["skills"][0]["name"] = "Same interpretation"
    review = make_recovery_review(prepared, snapshot, approved)
    assert not review["conflicts"]
    result = resolve_recovery_review(prepared, snapshot, approved, review)
    resources = validate_batches([(r, SkillCandidateBatch.model_validate(result.batches[r["user_data"]["chunk_id"]]))
                                 for r in prepared.requests["AI-Demo"]], approved)
    assert len(resources) == 1 and len(resources[0]["payload"]["source_refs"]) == 2
    assert len(resources[0]["evidence"]) == 2


@pytest.mark.parametrize("field", ["artifact_digest", "saved_batches_digest", "source_run_id", "conflicts"])
def test_stale_or_modified_review_rejected(recovery_case, field):
    prepared, snapshot, approved = recovery_case
    review = make_recovery_review(prepared, snapshot, approved)
    review[field] = "modified"
    with pytest.raises(ValidationError, match="does not match"):
        resolve_recovery_review(prepared, snapshot, approved, review)


def invalid_context_case(recovery_case):
    prepared, snapshot, approved = recovery_case
    request = prepared.requests["AI-Demo"][1]
    context = copy.deepcopy(request["user_data"]["source_spans"][0])
    context["span_id"] = str(uuid4())
    request["user_data"]["source_spans"].append(context)
    key = request["user_data"]["chunk_id"]
    snapshot["batches"][key]["evidence"][0]["span_ids"] = [context["span_id"]]
    review = make_recovery_review(prepared, snapshot, approved)
    choose_first(review)
    return prepared, snapshot, approved, review, request, key


def test_faulty_evidence_needs_explicit_repair_or_exclusion(recovery_case):
    prepared, snapshot, approved, review, request, key = invalid_context_case(recovery_case)
    assert "primary" in review["chunk_actions"][key]["issue"]
    with pytest.raises(ValidationError, match="nonblank reason"):
        resolve_recovery_review(prepared, snapshot, approved, review)
    action = review["chunk_actions"][key]
    selected = next(v for v in review["conflicts"]["skill:python.demo"]["variants"]
                    if v["payload"]["name"] == "Second interpretation")
    review["selections"]["skill:python.demo"]["variant_id"] = selected["variant_id"]
    action.update(action="replace", reason="Synthetic source inspection")
    with pytest.raises(ValidationError, match="primary"):
        resolve_recovery_review(prepared, snapshot, approved, review)
    action["replacement_batch"]["evidence"][0]["span_ids"] = request["primary_span_ids"]
    assert not resolve_recovery_review(prepared, snapshot, approved, review).exclusions


def test_exclusion_is_recorded_and_flagged_on_retained_candidates(recovery_case):
    prepared, snapshot, approved, review, _, key = invalid_context_case(recovery_case)
    review["chunk_actions"][key].update(action="exclude", reason="Synthetic ambiguous evidence")
    result = resolve_recovery_review(prepared, snapshot, approved, review)
    assert result.exclusions == [{"chunk_id": key, "reason": "Synthetic ambiguous evidence"}]
    assert not result.batches[key]["skills"]
    assert all(any("Incomplete curriculum coverage" in f for f in batch["review_flags"])
               for batch in result.batches.values())


def test_resolution_reason_and_unknown_variant_cannot_be_bypassed(recovery_case):
    prepared, snapshot, approved = recovery_case
    review = make_recovery_review(prepared, snapshot, approved)
    choose_first(review)
    review["selections"]["skill:python.demo"]["reason"] = " "
    with pytest.raises(ValidationError, match="nonblank"):
        resolve_recovery_review(prepared, snapshot, approved, review)


@pytest.mark.parametrize("invalid", [[], None, "invalid"])
def test_review_requires_a_json_object(recovery_case, invalid):
    with pytest.raises(ValidationError, match="JSON object"):
        resolve_recovery_review(*recovery_case, invalid)


def test_review_rejects_non_string_variant_identifiers(recovery_case):
    review = make_recovery_review(*recovery_case)
    review["selections"]["skill:python.demo"]["variant_id"] = {"untrusted": "value"}
    with pytest.raises(ValidationError, match="Choose a listed variant"):
        resolve_recovery_review(*recovery_case, review)


def test_excluding_all_selected_meaning_cannot_create_an_empty_catalogue(recovery_case):
    prepared, snapshot, approved = recovery_case
    review = make_recovery_review(prepared, snapshot, approved)
    choose_first(review)
    key = prepared.requests["AI-Demo"][0]["user_data"]["chunk_id"]
    review["chunk_actions"][key] = {"action": "exclude", "reason": "Synthetic exclusion"}
    with pytest.raises(ValidationError, match="No source-supported candidates"):
        resolve_recovery_review(prepared, snapshot, approved, review)


def test_recovery_does_not_fabricate_a_missing_outcome_parent(recovery_case):
    prepared, snapshot, approved = recovery_case
    key = prepared.requests["AI-Demo"][0]["user_data"]["chunk_id"]
    batch = snapshot["batches"][key]
    batch["outcomes"] = [{"outcome_id": "python.missing.transfer.v1", "skill_id": "python.missing",
        "assessment_stage": "transfer", "observable_action": "Compare evidence", "success_criteria": ["Accurate"],
        "source_refs": batch["skills"][0]["source_refs"]}]
    batch["evidence"].append({**batch["evidence"][0], "resource_type": "outcome",
                               "resource_id": "python.missing.transfer.v1"})
    review = make_recovery_review(prepared, snapshot, approved)
    choose_first(review)
    review["chunk_actions"][key].update(action="replace", reason="Synthetic uncorrected repair")
    with pytest.raises(ValidationError, match="Outcome skill is missing"):
        resolve_recovery_review(prepared, snapshot, approved, review)


def test_review_artifact_never_overwrites_operator_edits(recovery_case, tmp_path):
    review = make_recovery_review(*recovery_case)
    target = write_recovery_review(review, tmp_path)
    modified = copy.deepcopy(review)
    choose_first(modified)
    target.write_text(json.dumps(modified), encoding="utf-8")
    assert write_recovery_review(review, tmp_path) == target
    assert json.loads(target.read_text()) == modified
    assert target.with_suffix(".md").is_file()


@pytest.mark.parametrize("with_choices", [False, True])
async def test_cli_recovery_never_constructs_a_provider(recovery_case, tmp_path, monkeypatch, capsys, with_choices):
    monkeypatch.syspath_prepend(str(Path(__file__).resolve().parents[5] / "src/scripts"))
    cli = importlib.import_module("import_skills")
    prepared, snapshot, approved = recovery_case
    actor = uuid4()

    class Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        def begin(self):
            return self

    class Repo:
        def __init__(self, session):
            pass

        async def recovery_snapshot(self, *args):
            return snapshot

        async def validation_graph(self):
            return approved

    async def preflight(*args):
        pass

    async def dispose(*args):
        pass

    def forbidden_provider(*args, **kwargs):
        raise AssertionError("Recovery must never construct a provider")

    async def recovered_import(database, gateway, *args, **kwargs):
        assert gateway is None and kwargs["recovery"].batches and kwargs["dry_run"]
        return {"status": "ready", "dry_run": True}, 0

    monkeypatch.setattr(cli, "settings", lambda: SimpleNamespace(migration_database_url=None))
    monkeypatch.setattr(cli, "validate_target", lambda *args: None)
    monkeypatch.setattr(cli, "load_artifacts", lambda *args: prepared)
    monkeypatch.setattr(cli, "create_database", lambda *args: SimpleNamespace(sessions=Session))
    monkeypatch.setattr(cli, "dispose_database", dispose)
    monkeypatch.setattr(cli, "preflight", preflight)
    monkeypatch.setattr(cli, "SkillImportRepository", Repo)
    monkeypatch.setattr(cli, "ELMGateway", forbidden_provider)
    monkeypatch.setattr(cli, "import_prepared", recovered_import)
    monkeypatch.chdir(tmp_path)
    args = ["--artifacts", "synthetic", "--actor-id", str(actor), "--target", "development",
            "--permission-ref", "permission:synthetic", "--from-run", snapshot["source_run_id"], "--no-progress"]
    if with_choices:
        review = make_recovery_review(prepared, snapshot, approved)
        choose_first(review)
        target = tmp_path / "review.json"
        target.write_text(json.dumps(review), encoding="utf-8")
        args += ["--resolutions", str(target), "--dry-run"]
    code = await cli.run(cli.parser().parse_args(args))
    result = json.loads(capsys.readouterr().out)
    assert code == (0 if with_choices else 2)
    assert result["status"] == ("ready" if with_choices else "review_required")
