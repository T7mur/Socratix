# Skill generation — Member A / JK

[Specification and acceptance tests](../../../../../docs/skill_generation.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Turn permitted source spans into proposals, deterministic graph validation and auditable human approval. Consumers receive `ApprovedSkillGraph` with approved skills, outcomes and relationships only.

The proposed bridge now includes `import_artifacts.py`, `candidates.py` and `importer.py`.
It uses F's private import repository and migration 0006, both pending owner review.
See [commands, artifacts, failure handling and verification](../../../../../docs/skill_import_bridge.md).

Files from the specification (reviewer, repository and relation validator implemented):
Implemented offline ingestion: `python -m app.modules.skill_generation.cli --help` from `src/backend`.
Install `requirements.txt` in this directory; tests additionally use `requirements-dev.txt`.
See the specification's **Offline PDF ingestion** section for OCR setup, rights-gated exports,
corrections, artifact formats and tests. This feature does not call ELM or publish candidates.

Component files from the original specification (the bridge uses the modules listed above):

| File | Purpose |
|---|---|
| `parser.py` | Permitted source structure and traceable spans |
| `extractor.py` | Candidate extraction through the ELM gateway |
| `normaliser.py` | Stable IDs, aliases and duplicate suggestions |
| `relation_validator.py` | Endpoint checks and separate prerequisite/hierarchy cycle checks |
| `outcome_builder.py` | Observable, stage-linked outcome checks |
| `reviewer.py` | Human approval and review audit |
| `repository.py` | Owned persistence and approved graph reads |

Also owned: reserved `src/backend/app/api/v1/skills.py`, `src/shared/prompts/skill/`, and `src/backend/tests/{unit,contract,integration}/skill_generation/`. The bridge is an operator CLI; it does not implement the reserved import HTTP route.

Test provenance, repeat imports, duplicates, dangling IDs, both cycle types, authenticated review and approved-only reads. F owns schema/migrations; B/C/D/E consume approved snapshots through interfaces. Never publish an inferred edge solely on model agreement.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
