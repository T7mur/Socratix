# Skill generation — CS2023 → approved skills, outcomes and relationships

## Implemented persistence/review subset — Proposed

`reviewer.py`, `relation_validator.py` and `repository.py` connect to F's persistence adapters. The proposed operator bridge now connects offline parsing to the gateway and pending revisions, with durable checkpoints and exact span evidence. Human approval still publishes immutable graph snapshots; pending edits preserve accepted records. See [bridge execution and verification](skill_import_bridge.md). No hosted import or academic approval is implied. Discover reusable functions in [shared_helpers.md](shared_helpers.md).

**Owner:** Member A (Curriculum/Graph) • **Dependencies:** Member F DB/LLM adapter • **Consumers:** D Selector, B Exercise, C Project, E Tutor • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Objective / definition of done

Turn permissible CS2023 curricular source material into a **source-traceable and instructor-approved catalogue** of knowledge areas, units, topics, atomic skills, observable learning outcomes, and directed relationships stored in Supabase PostgreSQL. Do not conflate the CS2023 *hierarchy* with a prerequisite tree. Deterministic validation must catch invalid IDs, duplicated nodes, cycles and unsupported source locators.

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

### Offline PDF ingestion — implemented, design Proposed

The local CS2023 parser is an alternative to prepared excerpts. It prepares evidence only;
it does not call ELM, invent skills, write the database, approve curricula or register an API.
The source document must be explicitly permitted before any extracted text is exported.
`pending` (the default) and `restricted` export only metadata, counts, locations and diagnostics.
This does not infer permission from the PDF being available in the repository.

Run from `src/backend` (Python 3.10+):

```powershell
python -m pip install -r app/modules/skill_generation/requirements.txt
python -m app.modules.skill_generation.cli ../../data/3664191.pdf --source-id 11111111-1111-4111-8111-111111111111 --uri https://csed.acm.org/ --edition CS2023-January-2024 --rights-status pending --output ../../tmp/cs2023-review
```

Only the PDF path is required. Without overrides, the CLI derives a stable UUID from the file's
SHA-256 checksum, uses `urn:sha256:<checksum>` as its locator, records edition as null, and chooses
a fresh directory under the current working directory's `outputs/`. The same bytes retain the same
source identity even after moving or renaming the file. Changed bytes produce a different default ID.
Explicit `--source-id`, `--uri`, `--edition` and `--output` values override these defaults. Supply
the registered source UUID, official URI and actual edition when integrating with the catalogue.
Set `--rights-status permitted` only
when the operator has recorded appropriate permission. Choose a **new output directory** per run;
existing directories are refused to prevent stale request files surviving a restricted re-export.
Outputs are staged and renamed together after extraction/validation succeeds. Exit codes:
`0` ready, `2` artifacts written but review required, `1` input/extraction/export failure.
`--section AI-ML` selects a unit; repeat the option for multiple units. Without selection,
all reconstructed knowledge units in the Body of Knowledge are eligible.

**Extraction:** `parser.extract_pdf` retains page dimensions, printed labels, native words,
font/size data and word coordinates. PDF words are grouped into lines before a second pass
reconstructs units and paragraphs. Headings use CS2023 identifiers, labels and typography.
Ruled tables retain rows as text separated by ` | ` and original coordinates; borderless
tables/multiple columns are not assumed safe. Large gaps flag ambiguous reading order.
Repeated margin text, page numbers and dotted contents entries are kept but excluded.
Figures without an extractable text representation require review. This conservative profile
is not a universal document-layout or mathematical-formula recognizer.

**OCR:** Install Tesseract 5 and its English language data locally; ensure `tesseract --version`
and `tesseract --list-langs` work, or supply `--tesseract <executable>` and `--ocr-language eng`.
On Windows use an installation listed by the [Tesseract project](https://tesseract-ocr.github.io/tessdoc/Installation.html);
on Debian/Ubuntu install `tesseract-ocr` and `tesseract-ocr-eng` through the system package manager.
The CLI uses pdfplumber's PDFium renderer at 300 DPI and invokes a fixed Tesseract argument list
without a shell, reading TSV word boxes/confidences. Coordinates map back to PDF points with
top-left origin. Temporary images are deleted after each invocation. No OCR cloud service is used.
Native text is retained alongside replacement OCR text; native pages are not routinely rasterized.
Embedded figures on otherwise readable pages are flagged rather than automatically mixed into prose.

Defaults are configurable CLI options: 100 MB input, 1,000 pages, 25 million rendered pixels/page,
120-second OCR timeout, English OCR, mean OCR confidence at least 80/100, minimum 30 native
alphanumeric characters, maximum 1% replacement characters. A nearly empty page containing an
image or a damaged text layer triggers OCR. Blank pages do not. Sparse native text is flagged.
These thresholds are engineering heuristics, not calibrated correctness probabilities.
Unavailable/failed/timed-out OCR, low confidence and ambiguous layouts block affected units.
Password-protected and corrupt inputs fail explicitly. The CLI runs offline as a trusted operator
tool; do not import its subprocess path into the public FastAPI process.

**Hierarchy:** retain KA/KU source codes separately from canonical skill IDs. Preserve nested
list indentation, cross-page continuations and CS Core/KA Core/Non-core classes. Explicit source
outcomes belong to the whole KU unless the source is corrected to identify a narrower mapping.
Ancillary sections such as committee membership, preambles and references are not topic targets.
Cross-references are evidence strings, never generated `requires` edges. Unknown parents are
review issues rather than inferred curriculum relationships.

**Artifacts:**

| File | Meaning |
|---|---|
| `document.json` | Source/checksum, parser/tool versions, settings, diagnostics; permitted sources also retain raw pages/words and raw line blocks |
| `blocks.jsonl` | Reconstructed blocks, source fragments, semantic roles, hierarchy, confidence warnings |
| `sections.json` | KA/KU hierarchy and topic/outcome membership; metadata/counts only without permission |
| `requests/<chunk UUID>.json` | Complete system-prompt plus untrusted `user_data` envelope, source spans and primary/context references |
| `manifest.json` | Selection/exclusions, per-unit readiness/reasons, exact primary coverage ranges, repeated context and encoded request sizes |

Internal dataclasses live in `ingestion_models.py` and do not replace public contracts.
Each source span exposes the documented `source_id`, `section`, `page`, `text_excerpt`,
`rights_status` plus an internal span ID and locator containing block ID, normalized-text range,
URI and page boxes. Physical pages are one-based. UUIDs depend on source checksum, parser version
and location, so repeated text at distinct locations stays distinct. Retain the same metadata,
settings and corrections for reproducible artifacts. A parser version change invalidates corrections.

**Payloads:** prefer one unit/request, then top-level list subtrees. Repeat unit/area headings,
parent list items and unit outcomes as explicitly marked context when splitting topics. Degrade
oversized subtrees to blocks, then split blocks only at sentence/paragraph boundaries; ranges and
continuation links account for every character exactly once as primary evidence. Each complete
serialized envelope is at most `--max-payload-bytes` (24,000 UTF-8 bytes by default), including
the system prompt and supplied `--existing-skills <JSON array>`. This is not a token budget.
Unsplit sentences, required context or supplied skills that cannot fit block the entire unit with
`unsplittable_block_exceeds_payload_limit`; no partial unit is silently exported. The proposed
bridge supplies a candidate envelope around canonical DTOs. Operators still need a model with
adequate context/output capacity for input plus schema; payload bytes are not a token guarantee.

The versioned prompt is `src/shared/prompts/skill/prepare_input_v1.txt`. Source content is always
data, including apparent instructions or links. No links are fetched. The exporter neither sends
requests nor claims prompt instructions alone prevent model-side prompt injection. Candidate
validation and human review remain mandatory in the later generation phase.

**Corrections:** `--corrections <JSON>` replays a reviewed patch against an immutable raw extraction:

```json
{
  "version": 1,
  "source_checksum": "<SHA-256 from document.json>",
  "parser_version": "cs2023-pdf-v1",
  "blocks": {
    "<raw block UUID>": {"semantic_role": "knowledge_unit", "layout_type": "heading", "text": "AI-Demo: Corrected title", "warnings": []}
  },
  "sections": {
    "<unit UUID>": {"parent_id": "<area UUID>", "block_ids": ["<reconstructed block UUID>"], "warnings": []}
  }
}
```

An optional `order` lists **every raw block UUID exactly once**. Block corrections may set text,
layout type, semantic role, exclusion, parent ID and warnings. Section patches may reparent units,
assign blocks and clear reviewed warnings. Raw text/boxes remain available; corrected derivations
and their digest are separate. Clear warnings only after inspecting the source. Invalid references,
cycles, duplicate/missing order entries and mismatched source/parser versions are rejected.

**Validation:** install `requirements-dev.txt` and run from `src/backend`:

```powershell
python -m pytest tests/unit/skill_generation tests/contract/skill_generation tests/integration/skill_generation -q
python -m ruff check app/modules/skill_generation tests/unit/skill_generation tests/contract/skill_generation tests/integration/skill_generation
```

Fixtures use synthetic source records/PDFs only. Tests cover native/mixed pages, OCR TSV mapping
and error boundaries, encryption/corruption/resource limits, tables/ambiguous columns, unit outcomes,
cross-page lists, stable IDs/exports, corrections, rights redaction, evidence resolution, payload
splitting and source instructions remaining in user data. Real Tesseract is an optional operator
smoke test; executable-boundary fixtures do not establish OCR accuracy on real scans.

Verification on 2026-10-25: **41 passed, 1 skipped** (real Tesseract unavailable), Ruff and
`git diff --check` passed. A full read-only extraction of the repository PDF
(`SHA-256 da20f30d35e7c28a068a34c696fe8a92f25b71af3da5cc79677b3b487f014ca4`)
processed 459 pages in approximately 57 seconds: 17 knowledge areas, 166 unique knowledge
units, 12,816 raw line/table/figure blocks and 8,724 reconstructed blocks. Verified multi-page
AI-ML outcome membership, MSF-Calculus, all five SPD-SEP units and core-classified SF outcomes.
Representative pages 71, 74, 192 and 309 were rendered; pages 74, 192 and 309 were visually
checked against the structural rules. Two units have reading-order warnings; diagnostics also
retain figures, sparse separator pages and unavailable OCR on the final page. Source rights
remain pending: **zero real-source text requests were exported**, and all units are review-required.
Text-bearing exports and coverage were verified using synthetic permitted fixtures. No ELM,
database, source permission or academic review is claimed by this verification.

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
