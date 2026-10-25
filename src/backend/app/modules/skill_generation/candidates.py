"""Internal generation envelope reusing the canonical catalogue DTOs."""
from typing import Literal
from uuid import UUID

from app.contracts.identity import Contract
from app.contracts.reviews import Outcome, Skill, SkillRelation
from app.core.errors import ValidationError
from app.db.repositories.common import checksum
from app.modules.skill_generation.ingestion_models import stable_id
from app.modules.skill_generation.relation_validator import validate_acyclic, validate_endpoints_exist
from pydantic import Field

PROMPT_VERSION = "skill-extract-v1"
SCHEMA_VERSION = "skill-candidates-v1"


class CandidateEvidence(Contract):
    resource_type: Literal["skill", "outcome", "relation"]
    # For relations use 'from_skill_id|relation|to_skill_id'; the importer assigns the UUID.
    resource_id: str = Field(min_length=1, max_length=500)
    span_ids: list[UUID] = Field(min_length=1)
    evidence_kind: Literal["direct_source", "ai_inferred"]
    rationale: str = Field(min_length=1, max_length=4000, pattern=r"\S")


class SkillCandidateBatch(Contract):
    skills: list[Skill] = Field(default_factory=list)
    outcomes: list[Outcome] = Field(default_factory=list)
    relationships: list[SkillRelation] = Field(default_factory=list)
    evidence: list[CandidateEvidence] = Field(default_factory=list)
    review_flags: list[str] = Field(default_factory=list)


def relation_key(relation: dict) -> str:
    return "|".join(relation[k] for k in ("from_skill_id", "relation", "to_skill_id"))


def validate_batches(batches: list[tuple[dict, SkillCandidateBatch]], approved: dict) -> list[dict]:
    """Validate a complete unit, returning canonical resources with exact span evidence.

    No writes, merges, provider calls or approval. Raises safe domain ValidationError.
    """
    resources, evidence, supplied = {}, {}, {}
    for request, batch in batches:
        spans = {s["span_id"]: s for s in request["user_data"]["source_spans"]}
        supplied.update(spans)
        primary = set(request["primary_span_ids"])
        local = set()
        for kind, items in (("skill", batch.skills), ("outcome", batch.outcomes),
                            ("relation", batch.relationships)):
            for item in items:
                payload = item.model_dump(mode="json")
                if payload["approval_status"] != "proposed" or (kind == "skill" and payload["outcomes"]):
                    raise ValidationError("Generated resources must be separate proposed candidates")
                key = relation_key(payload) if kind == "relation" else payload[f"{kind}_id"]
                pair = (kind, key)
                if pair in local:
                    raise ValidationError("Duplicate candidate within a chunk")
                local.add(pair)
                if pair in resources and checksum(resources[pair]["payload"]) != checksum(payload):
                    raise ValidationError("Conflicting candidates across unit chunks")
                if kind != "relation":
                    for ref in payload["source_refs"]:
                        if not any(ref["uri"] == s["locator"]["uri"] and ref["section"] == s["section"]
                                   and ref["page"] == s["page"] for s in spans.values()):
                            raise ValidationError("Candidate source locator was not supplied")
                resources[pair] = {
                    "resource_type": kind,
                    "resource_id": stable_id("skill-relation", key) if kind == "relation" else key,
                    "payload": payload,
                }
        covered = set()
        evidence_keys = set()
        for item in batch.evidence:
            pair = (item.resource_type, item.resource_id)
            ids = {str(x) for x in item.span_ids}
            if pair not in local or ids - spans.keys():
                raise ValidationError("Candidate evidence references unknown resources or spans")
            if not ids & primary:
                raise ValidationError("A candidate must cite primary evidence, not repeated context alone")
            if item.resource_type == "relation" and item.evidence_kind != "ai_inferred":
                raise ValidationError("Generated relationships require explicit inference review")
            covered.add(pair)
            for span_id in ids:
                evidence_key = (*pair, span_id)
                if evidence_key in evidence_keys:
                    raise ValidationError("Duplicate evidence for a candidate span")
                evidence_keys.add(evidence_key)
                evidence.setdefault(pair, []).append({
                    "chunk_id": request["user_data"]["chunk_id"], "span_id": span_id,
                    "evidence_kind": item.evidence_kind, "rationale": item.rationale,
                })
        if covered != local:
            raise ValidationError("Every candidate requires source evidence")
    if not resources:
        raise ValidationError("No source-supported candidates were generated; review required")
    approved_ids = {s["skill_id"] for s in approved["skills"]}
    unit_ids = {key for kind, key in resources if kind == "skill"}
    known = approved_ids | unit_ids
    edges = {name: [] for name in ("requires", "part_of")}
    for edge in approved["relationships"]:
        if edge["relation"] in edges:
            edges[edge["relation"]].append((edge["from_skill_id"], edge["to_skill_id"]))
    for pair, resource in resources.items():
        kind, _ = pair
        payload = resource["payload"]
        if kind == "outcome" and payload["skill_id"] not in known:
            raise ValidationError("Outcome skill is missing from the unit or approved graph")
        if kind == "relation":
            validate_endpoints_exist(payload["from_skill_id"], payload["to_skill_id"], known)
            if payload["relation"] in edges:
                edges[payload["relation"]].append((payload["from_skill_id"], payload["to_skill_id"]))
        refs = payload.get("source_refs", [])
        cited = {x["span_id"] for x in evidence[pair]}
        if refs and not all(any(ref["uri"] == supplied[s]["locator"]["uri"]
                            and ref["section"] == supplied[s]["section"]
                            and ref["page"] == supplied[s]["page"] for s in cited) for ref in refs):
            raise ValidationError("Candidate citations and evidence disagree")
        resource["evidence"] = evidence[pair]
    for graph in edges.values():
        validate_acyclic(graph)
    return list(resources.values())
