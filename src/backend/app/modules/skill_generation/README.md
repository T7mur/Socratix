# Skill generation — Member A / JK

[Specification and acceptance tests](../../../../../docs/skill_generation.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Turn permitted source spans into proposals, deterministic graph validation and auditable human approval. Consumers receive `ApprovedSkillGraph` with approved skills, outcomes and relationships only.

Planned files from the specification:

| File | Purpose |
|---|---|
| `parser.py` | Permitted source structure and traceable spans |
| `extractor.py` | Candidate extraction through the ELM gateway |
| `normaliser.py` | Stable IDs, aliases and duplicate suggestions |
| `relation_validator.py` | Endpoint checks and separate prerequisite/hierarchy cycle checks |
| `outcome_builder.py` | Observable, stage-linked outcome checks |
| `reviewer.py` | Human approval and review audit |
| `repository.py` | Owned persistence and approved graph reads |

Also owned: `src/backend/app/api/v1/skills.py`, `src/shared/prompts/skill/`, and `src/backend/tests/{unit,contract,integration}/skill_generation/`. All files are planned; implement incrementally.

Test provenance, repeat imports, duplicates, dangling IDs, both cycle types, authenticated review and approved-only reads. F owns schema/migrations; B/C/D/E consume approved snapshots through interfaces. Never publish an inferred edge solely on model agreement.
