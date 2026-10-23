# Skill generation — CS2023 → approved skills, outcomes and relationships

**Owner:** Member A (Curriculum/Graph) • **Dependencies:** Member F DB/LLM adapter • **Consumers:** D Selector, B Exercise, C Project, E Tutor • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Objective / definition of done

Turn permissible CS2023 curricular source material into a **source-traceable and instructor-approved catalogue** of knowledge areas, units, topics, atomic skills, observable learning outcomes, and directed relationships stored in Aiven PostgreSQL. Do not conflate the CS2023 *hierarchy* with a prerequisite tree. Deterministic validation must catch invalid IDs, duplicated nodes, cycles and unsupported source locators.

## Inputs and outputs

| Direction | Name | Fields (v1) | Caller |
|---|---|---|---|
| Input | `SkillImportRequest` | `contract_version`, `course_id`, `source_document_ids`, `source_kind=cs2023`, `include_fine_grained_proposals=true` | Instructor/admin |
| Input | `SourceSpan[]` | `source_id`, `section`, `page?`, `text_excerpt` (only if permitted), `rights_status` | Document ingestion |
| Input | `ExistingSkills[]` | `skill_id`, `name`, approved aliases and edges | DB repository |
| Output | `SkillCandidateBatch` | proposed skills/outcomes/`part_of` and `requires` edges, evidence refs, confidence *labels* | Human review UI |
| Output | `SkillImportReport` | new/merged/flagged counts; rejected reasons; provenance | DB + admin |
| Query output | `ApprovedSkillGraph` | `Skill[]`, `Outcome[]`, `SkillRelation[]`, graph version | Selector & generators |

Use namespaced `skill_id` (e.g. `cs2023:AL.unit_topic`, `python.conditionals`) and UUIDs for source/review records. No unpublished or `proposed` skill is eligible for selection or generation.

## CS2023 ingestion strategy

CS2023 has knowledge areas, knowledge units, topics and learning outcomes. Start with source-licensed **structured extraction** (HTML headings or approved manually prepared excerpts), not a model call across an entire unvalidated report. Check rights: CS2023 is copyrighted and its permissions differ from permissive software licenses. Do not bulk replicate protected text in a commercial model pipeline without clearance. Keep only source metadata and minimally necessary derived text where appropriate.

1. **Acquire** approved official source/sections and create immutable `curriculum_sources` record: URL, edition, checksum, ingestion date, rights status.
2. **Parse deterministic structure**: headings, KA/KU/topic IDs when available; preserve original names and source hierarchy as `part_of` edges. Never infer prerequisites from page order.
3. **LLM candidate skill extraction** for fine-grained abilities and outcomes not explicit in the source. Include each source locator and distinguish `direct_source` from `ai_inferred`.
4. **Normalise** punctuation/case, aliases, IDs; exact-match candidates then optional string/embedding duplicate suggestions. **Do not auto-merge semantically distinct skills** such as loop termination vs loops.
5. **Propose edges**: `part_of` (source hierarchy), `requires` (pedagogical prerequisite), `related_to` (non-directional association). Human reviewer approves inferred `requires` edges.
6. **Generate outcomes**: one observable action per `recall`, `understanding`, `transfer` where meaningful, with success criteria; avoid vague 'understands X'. A skill may lack a stage and be marked review-required rather than fabricating an outcome.
7. **Validate** referential integrity, duplicate score, acyclic `requires` and `part_of`, source provenance and rights.
8. **Human approval**: approve/edit/reject candidates and edges; preserve audit record and immutable graph version. Publish approved graph to consumers.

### Concrete example

Input source topic 'Conditional Constructs' plus permitted examples → proposed `python.conditionals`, `python.branch_order`, `python.boundary_conditions`; outcome `python.conditionals.transfer.v1`: *Given new numerical thresholds, implement and explain correct branch selection on exact boundaries*. `part_of` links skills to topic; `requires` for `python.conditionals -> python.comparisons` is **proposed**, not assumed proven by CS2023 hierarchy.

## Prompt: skill extraction (version `skill-extract-v1`)

```text
SYSTEM: You are a CS curriculum analyst. Use only the supplied source spans and approved existing skill IDs. Do not fabricate citations or claim source-supported prerequisites without evidence. Return strict JSON matching SkillCandidateBatch.
USER DATA:
  course_id: {{course_id}}
  source_spans: {{permitted_source_spans}}
  existing_skills: {{existing_skill_summaries}}
TASK:
  1. Propose atomic, assessable skills not larger than a single observable ability.
  2. Map each proposal to source span IDs or mark 'inferred_no_direct_source'.
  3. For each skill, propose recall / understanding / transfer learning outcomes, each with an observable action and evidence-of-success criteria.
  4. Suggest aliases and possible duplicates, but do not merge them yourself.
  5. Suggest part_of / requires / related_to relationships, each with rationale and uncertainty label.
  6. Flag ambiguous or unsupported claims for human review.
  7. Do not include exercises, reference solutions or teaching text.
```

### Deterministic validators

```python
def approve_graph_snapshot(candidates, approved_ids):
    validate_unique_ids(candidates)
    validate_source_locators(candidates)
    validate_licence_permissions(candidates)
    validate_endpoints_exist(candidates.relationships, approved_ids)
    assert_acyclic(candidates.relationships, relation='requires')
    assert_acyclic(candidates.relationships, relation='part_of')
    # Humans review proposed prereq edges, duplicate merges and outcomes.
```

**Do not** use `assert` in production validation for business-rule enforcement; the illustration names the required gates. Tests must call robust validation functions with explicit errors and retain audit records.

## Owned code and persistence

```text
src/backend/app/modules/skill_generation/
  parser.py                # approved source structure → spans
  extractor.py             # ELM call through shared gateway
  normaliser.py            # IDs, aliases, dedup candidate ranking
  relation_validator.py    # graph types and DAG checks
  outcome_builder.py       # outcome validation
  reviewer.py              # approval workflow
  repository.py            # approved/read-only graph snapshot
src/backend/app/api/v1/skills.py
src/shared/prompts/skill/extract_v1.txt
src/backend/tests/{unit,contract,integration}/skill_generation/test_skill_generation*.py
```

Database tables: `curriculum_sources`, `source_spans`, `skills`, `skill_aliases`, `skill_relations`, `learning_outcomes`, `review_decisions`, `graph_versions` — column-level ownership is with Member F; agree migration before coding.

## Tests / acceptance criteria

- Source span IDs and actual URLs/sections survive to every derived proposal.
- Same import twice does not duplicate approved skills (idempotent import by source checksum/version).
- `part_of` vs `requires` are not confused; inferred edge absent from approved graph until review.
- Cyclic prerequisites are rejected; dangling references rejected; duplicate suggestions audited.
- Every published outcome has stage, observable action, success criteria and approval record.
- `GET /api/v1/skills?course_id=...` returns approved-only graph snapshot; exercise generator can consume it without manual string conversion.
- Test against curated human labels; measure precision of proposals, **not** just count of extracted skills.

**Risks:** AI hallucinated relationships, curriculum bias, license misuse, inconsistent granularity. Mitigation: human sign-off, provenance, stable IDs, explicit rights gate, benchmark with course staff.

**Research/reference:** [CS2023](https://csed.acm.org/), [CS2023 overview](https://csed.acm.org/wp-content/uploads/2025/11/CS2023-Report.htm). Verify source terms before ingestion.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
