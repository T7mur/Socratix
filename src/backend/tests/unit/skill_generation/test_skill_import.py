import copy
import json
from uuid import uuid4

import pytest
from app.core.errors import ValidationError
from app.modules.skill_generation.candidates import SkillCandidateBatch, validate_batches
from app.modules.skill_generation.cli import main
from app.modules.skill_generation.import_artifacts import load_artifacts
from app.modules.skill_generation.importer import import_configuration, write_report
from reportlab.pdfgen.canvas import Canvas


@pytest.fixture
def prepared(tmp_path):
    pdf = tmp_path / "synthetic.pdf"
    canvas = Canvas(str(pdf), pagesize=(600, 800))
    for index, line in enumerate([
        "Body of Knowledge", "Artificial Intelligence (AI)", "AI-Demo: Synthetic Unit", "CS Core:",
        "1. Compare synthetic examples.", "Illustrative Learning Outcomes:",
        "1. Explain a comparison using evidence.",
    ]):
        canvas.drawString(40, 720 - index * 24, line)
    canvas.save()
    output = tmp_path / "artifacts"
    assert main([str(pdf), "--rights-status", "permitted", "--output", str(output)]) == 0
    return output, load_artifacts(output, ["AI-Demo"])


def batch_for(request):
    primary = set(request["primary_span_ids"])
    span = next(s for s in request["user_data"]["source_spans"] if s["span_id"] in primary)
    ref = {"uri": span["locator"]["uri"], "section": span["section"], "page": span["page"]}
    return {
        "skills": [{"skill_id": "cs2023.ai.demo.compare", "name": "Compare examples",
                    "description": "Explain a comparison", "source_kind": "cs2023", "source_refs": [ref]}],
        "evidence": [{"resource_type": "skill", "resource_id": "cs2023.ai.demo.compare",
                      "span_ids": [span["span_id"]], "evidence_kind": "direct_source", "rationale": "Explicit topic"}],
    }


def test_artifact_roundtrip_and_full_evidence(prepared):
    _, data = prepared
    request = data.requests["AI-Demo"][0]
    result = validate_batches([(request, SkillCandidateBatch.model_validate(batch_for(request)))],
                              {"skills": [], "relationships": []})
    assert result[0]["resource_id"] == "cs2023.ai.demo.compare"
    assert result[0]["payload"]["approval_status"] == "proposed"
    assert len(result[0]["evidence"]) == 1


def test_pending_exports_are_blocked_without_text_requests(prepared):
    directory, _ = prepared
    output = directory.parent / "pending-artifacts"
    assert main([str(directory.parent / "synthetic.pdf"), "--output", str(output)]) == 2
    data = load_artifacts(output, ["AI-Demo"])
    assert data.requests == {} and data.spans == {}
    assert data.blocked == {"AI-Demo": ["source_rights_not_permitted"]}


@pytest.mark.parametrize("change", ["text", "coverage", "inventory", "source", "readiness"])
def test_artifact_tampering_rejected(prepared, change):
    directory, _ = prepared
    if change == "text":
        path = next((directory / "requests").glob("*.json"))
        data = json.loads(path.read_text())
        data["user_data"]["source_spans"][0]["text_excerpt"] += " tampered"
    elif change == "source":
        path = directory / "document.json"
        data = json.loads(path.read_text())
        data["checksum"] = "0" * 64
    else:
        path = directory / "manifest.json"
        data = json.loads(path.read_text())
        if change == "coverage":
            data["chunks"][0]["bytes"] += 1
        elif change == "inventory":
            data["chunks"] = []
        else:
            data["sections"][0]["status"] = "excluded"
    path.write_text(json.dumps(data), encoding="utf-8")
    with pytest.raises(ValidationError):
        load_artifacts(directory, ["AI-Demo"])


@pytest.mark.parametrize("change", ["approved", "unknown_span", "missing_evidence", "bad_ref", "missing_skill", "empty"])
def test_unsafe_candidates_rejected(prepared, change):
    _, data = prepared
    request = data.requests["AI-Demo"][0]
    batch = batch_for(request)
    if change == "approved":
        batch["skills"][0]["approval_status"] = "approved"
    elif change == "unknown_span":
        batch["evidence"][0]["span_ids"] = [str(uuid4())]
    elif change == "missing_evidence":
        batch["evidence"] = []
    elif change == "bad_ref":
        batch["skills"][0]["source_refs"][0]["page"] = 999
    elif change == "empty":
        batch = {}
    else:
        batch["outcomes"] = [{"outcome_id": "cs2023.ai.demo.missing.transfer.v1",
            "skill_id": "cs2023.ai.demo.missing", "assessment_stage": "transfer",
            "observable_action": "Compare examples", "success_criteria": ["Correct comparison"],
            "source_refs": batch["skills"][0]["source_refs"]}]
        batch["evidence"].append({**batch["evidence"][0], "resource_type": "outcome",
                                  "resource_id": batch["outcomes"][0]["outcome_id"]})
    with pytest.raises(ValidationError):
        validate_batches([(request, SkillCandidateBatch.model_validate(batch))], {"skills": [], "relationships": []})


def test_cycles_and_context_only_candidates_rejected(prepared):
    _, data = prepared
    request = data.requests["AI-Demo"][0]
    batch = batch_for(request)
    other = copy.deepcopy(batch["skills"][0])
    other["skill_id"] = "cs2023.ai.demo.other"
    batch["skills"].append(other)
    batch["evidence"].append({**batch["evidence"][0], "resource_id": other["skill_id"]})
    a, b = [s["skill_id"] for s in batch["skills"]]
    batch["relationships"] = [{"from_skill_id": a, "to_skill_id": b, "relation": "requires"},
                               {"from_skill_id": b, "to_skill_id": a, "relation": "requires"}]
    for edge in batch["relationships"]:
        batch["evidence"].append({**batch["evidence"][0], "resource_type": "relation",
            "resource_id": f"{edge['from_skill_id']}|requires|{edge['to_skill_id']}", "evidence_kind": "ai_inferred"})
    with pytest.raises(ValidationError, match="cycle"):
        validate_batches([(request, SkillCandidateBatch.model_validate(batch))], {"skills": [], "relationships": []})
    request = {**request, "primary_span_ids": []}
    with pytest.raises(ValidationError, match="primary"):
        validate_batches([(request, SkillCandidateBatch.model_validate(batch_for(data.requests['AI-Demo'][0])))],
                         {"skills": [], "relationships": []})


def test_configuration_fingerprint_and_private_report(settings, tmp_path):
    first = import_configuration(settings, "permission:synthetic", ["AI-Demo"])
    settings.elm_model = "different-model"
    assert import_configuration(settings, "permission:synthetic", ["AI-Demo"]) != first
    assert "elm_api_key" not in first
    report = {"run_id": str(uuid4()), "status": "succeeded"}
    path = write_report(report, tmp_path)
    assert json.loads(path.read_text()) == report
    write_report({**report, "human_review_required": True}, tmp_path)
    assert not list(path.parent.glob(".report-*"))
