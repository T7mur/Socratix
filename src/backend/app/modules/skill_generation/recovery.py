"""Human resolution of saved canonical proposals. No model calls or database writes."""
import copy
import json
from dataclasses import dataclass
from pathlib import Path

from app.core.errors import ValidationError
from app.db.repositories.common import checksum
from app.modules.skill_generation.candidates import (
    SkillCandidateBatch,
    relation_key,
    semantic_payload,
    validate_batches,
)
from pydantic import ValidationError as SchemaError

RECOVERY_VERSION = "skill-recovery-v1"


@dataclass
class ResolvedRecovery:
    batches: dict[str, dict]
    provenance: dict
    exclusions: list[dict]


def _resources(batch):
    for kind, items in (("skill", batch.skills), ("outcome", batch.outcomes),
                        ("relation", batch.relationships)):
        for item in items:
            payload = item.model_dump(mode="json")
            key = relation_key(payload) if kind == "relation" else payload[f"{kind}_id"]
            yield kind, key, payload


def _parsed(snapshot):
    if not isinstance(snapshot.get("batches"), dict) or not snapshot["batches"]:
        raise ValidationError("Saved batches have an incompatible schema")
    try:
        return {key: SkillCandidateBatch.model_validate(value) for key, value in snapshot["batches"].items()}
    except (SchemaError, KeyError, TypeError):
        raise ValidationError("Saved batches have an incompatible schema") from None


def make_recovery_review(prepared, snapshot, approved):
    """Create a deterministic operator review file; null selections cannot be imported."""
    batches = _parsed(snapshot)
    groups = {}
    for chunk_id, batch in batches.items():
        for kind, key, payload in _resources(batch):
            variant_id = checksum(semantic_payload(payload))
            group = groups.setdefault(f"{kind}:{key}", {})
            variant = group.setdefault(variant_id, {"variant_id": variant_id,
                "payload": copy.deepcopy(payload), "chunk_ids": []})
            variant["chunk_ids"].append(chunk_id)
            if "source_refs" in payload:
                refs = {checksum(ref): ref for ref in variant["payload"]["source_refs"] + payload["source_refs"]}
                variant["payload"]["source_refs"] = [refs[k] for k in sorted(refs)]
    conflicts = {key: {"variants": [variants[v] for v in sorted(variants)]}
                 for key, variants in sorted(groups.items()) if len(variants) > 1}
    # For local diagnostics only, declared unit IDs are treated as known endpoints. This
    # neither claims they are approved nor replaces final whole-unit validation.
    known = {s["skill_id"] for s in approved["skills"]}
    known.update(s.skill_id for batch in batches.values() for s in batch.skills)
    context = {"skills": [{"skill_id": key} for key in known], "relationships": approved["relationships"]}
    chunk_actions = {}
    for requests in prepared.requests.values():
        for request in requests:
            chunk_id = request["user_data"]["chunk_id"]
            if chunk_id not in batches:
                raise ValidationError("Recovery snapshot is missing a selected chunk")
            try:
                validate_batches([(request, batches[chunk_id])], context)
            except ValidationError as exc:
                chunk_actions[chunk_id] = {"issue": str(exc), "action": None, "reason": "",
                    "replacement_batch": batches[chunk_id].model_dump(mode="json")}
    return {"version": RECOVERY_VERSION, "source_run_id": snapshot["source_run_id"],
        "artifact_digest": prepared.artifact_digest, "saved_batches_digest": checksum(snapshot["batches"]),
        "instructions": [
            "Inspect every conflicting variant against the source, then set its selected variant_id and reason.",
            "For every chunk issue, explicitly choose replace (edit replacement_batch) or exclude, with a reason.",
            "Exclusion leaves the recovery review_required and does not claim full curriculum coverage.",
            "These decisions select pending proposals; they do not approve academic content.",
        ],
        "selections": {key: {"variant_id": None, "reason": ""} for key in conflicts},
        "conflicts": conflicts, "chunk_actions": chunk_actions}


def _reason(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 4000:
        raise ValidationError("Every recovery decision requires a nonblank reason of at most 4000 characters")
    return value.strip()


def resolve_recovery_review(prepared, snapshot, approved, review):
    """Apply explicit operator choices, then validate all canonical resources before writing."""
    if not isinstance(review, dict):
        raise ValidationError("Recovery review must be a JSON object")
    expected = make_recovery_review(prepared, snapshot, approved)
    for key in ("version", "source_run_id", "artifact_digest", "saved_batches_digest", "conflicts"):
        if review.get(key) != expected[key]:
            raise ValidationError("Recovery review does not match the saved snapshot; regenerate it")
    selections = review.get("selections")
    if not isinstance(selections, dict) or set(selections) != set(expected["selections"]):
        raise ValidationError("Recovery selections must cover exactly the conflicting resource IDs")
    flags, selected = [], {}
    for key, choice in selections.items():
        variants = {v["variant_id"] for v in expected["conflicts"][key]["variants"]}
        if (not isinstance(choice, dict) or not isinstance(choice.get("variant_id"), str)
                or choice["variant_id"] not in variants):
            raise ValidationError("Choose a listed variant for every conflict before recovery")
        reason = _reason(choice.get("reason"))
        selected[key] = choice["variant_id"]
        flags.append(f"Operator selected a variant for {key}: {reason}")
    originals = _parsed(snapshot)
    values = {key: batch.model_dump(mode="json") for key, batch in originals.items()}
    actions = review.get("chunk_actions")
    if (not isinstance(actions, dict) or set(expected["chunk_actions"]) - actions.keys()
            or set(actions) - values.keys()):
        raise ValidationError("Chunk decisions must cover all recorded issues and reference known chunks")
    exclusions = []
    for key, action in actions.items():
        if not isinstance(action, dict):
            raise ValidationError("Invalid chunk recovery decision")
        reason = _reason(action.get("reason"))
        if action.get("action") == "exclude":
            values[key] = SkillCandidateBatch(review_flags=[f"Operator excluded this response: {reason}"]).model_dump(mode="json")
            exclusions.append({"chunk_id": key, "reason": reason})
        elif action.get("action") == "replace":
            try:
                values[key] = SkillCandidateBatch.model_validate(action["replacement_batch"]).model_dump(mode="json")
            except (SchemaError, KeyError, TypeError):
                raise ValidationError("A repaired response must use the canonical batch schema") from None
        else:
            raise ValidationError("Choose replace or exclude for every chunk issue")
        flags.append(f"Operator response decision {key} ({action['action']}): {reason}")
    if exclusions:
        flags.append(f"Incomplete curriculum coverage: {len(exclusions)} model responses were explicitly excluded")
    for chunk_id, value in values.items():
        # Remove non-selected variants and only their own evidence. Never pick first/last.
        retained = set()
        for kind, field in (("skill", "skills"), ("outcome", "outcomes"), ("relation", "relationships")):
            rows = []
            for payload in value[field]:
                key = relation_key(payload) if kind == "relation" else payload[f"{kind}_id"]
                selection = selected.get(f"{kind}:{key}")
                if selection is None or checksum(semantic_payload(payload)) == selection:
                    rows.append(payload)
                    retained.add((kind, key))
            value[field] = rows
        value["evidence"] = [e for e in value["evidence"] if (e["resource_type"], e["resource_id"]) in retained]
        value["review_flags"] = list(dict.fromkeys(value["review_flags"] + flags))
        values[chunk_id] = SkillCandidateBatch.model_validate(value).model_dump(mode="json")
    for requests in prepared.requests.values():
        declared = {s["skill_id"] for r in requests for s in r["user_data"]["existing_skills"]}
        context = {**approved, "skills": [s for s in approved["skills"] if s["skill_id"] in declared]}
        validate_batches([(r, SkillCandidateBatch.model_validate(values[r["user_data"]["chunk_id"]]))
                          for r in requests], context)
    provenance = {"version": RECOVERY_VERSION, "source_run_id": snapshot["source_run_id"],
        "saved_batches_digest": checksum(snapshot["batches"]),
        "review_digest": checksum({"selections": selections, "chunk_actions": actions}),
        "original_configuration": snapshot["configuration"]}
    return ResolvedRecovery(values, provenance, exclusions)


def write_recovery_review(review, root: Path):
    """Create a new review artifact, refusing to overwrite operator decisions."""
    folder = root / review["source_run_id"]
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"review-{checksum(review)[:12]}.json"
    text = json.dumps(review, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    # Exclusive creation preserves edits on subsequent runs.
    try:
        with target.open("x", encoding="utf-8") as stream:
            stream.write(text)
    except FileExistsError:
        pass
    comparison = target.with_suffix(".md")
    lines = ["# Saved skill proposal recovery", "", f"Source run: `{review['source_run_id']}`", "",
        "Edit the matching JSON review file after comparing these variants against the source PDF.",
        "Set each selection's `variant_id` and `reason`. Do not edit the displayed conflict payloads.",
        "For chunk issues, choose `replace` with a corrected canonical batch, or `exclude`, with a reason.",
        "Exclusion leaves incomplete coverage flagged for human review. Nothing here approves a skill.", ""]
    for key, conflict in review["conflicts"].items():
        lines += [f"## {key}", ""]
        for index, variant in enumerate(conflict["variants"], start=1):
            lines += [f"### Variant {index}", "", f"Selection ID: `{variant['variant_id']}`", "",
                      "```json", json.dumps(variant["payload"], indent=2, ensure_ascii=False), "```", ""]
    for chunk_id, action in review["chunk_actions"].items():
        lines += [f"## Evidence issue: {chunk_id}", "", action["issue"], "",
                  f"Inspect the original request at `requests/{chunk_id}.json` in the ingestion artifact folder.",
                  "The full saved batch is in this chunk's `replacement_batch` entry in the JSON review file.", ""]
    try:
        with comparison.open("x", encoding="utf-8") as stream:
            stream.write("\n".join(lines) + "\n")
    except FileExistsError:
        pass
    return target
