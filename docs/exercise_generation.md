# Exercise generation — one skill, multiple skills, three stages

**Owner:** Member B (Exercises) • **Dependencies:** A approved skill/outcome graph, D selector `GenerationBrief`, E grading worker, F ELM/DB • **Consumers:** Frontend, E hinting, D evidence engine • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Scope

Generate a **new, bounded, student-safe exercise** from an approved learning outcome; generate its grading artifacts separately; publish only after checks. Support:

- **One-skill exercise:** focus on one skill (other known skills merely enable the interface), e.g. conditionals: `stock_status(quantity)`.
- **Multi-skill exercise:** target an *approved integration outcome* requiring interaction among skills, e.g. loops + lists + conditionals: `first_low_stock(levels,threshold)`.
- **Three stages:** `recall` (retrieval question, rubric), `understanding` (predict/trace/explain, rubrics and examples), `transfer` (new context, code and explanation, automatic tests). Do **not** call all three 'coding tests'.

## Required inputs/outputs

- **Input**: `GenerationBrief` from `shared_contracts.md`, approved `Skill[]`, `Outcome[]`, permitted interface policy, and relevant prior-task fingerprints. Never take untrusted student claimed-skill IDs directly as approved IDs.
- **Output student-safe**: `TaskSpec` with immutable `task_id`, `task_version`, title, stage, requirements, examples, function signature (for coding tasks), targets, explanation questions.
- **Output private**: `GradingArtifact`: reference solution(s), independently generated tests, rubric, verification report, failure-to-requirement mapping, protected storage refs.
- **Job result**: `JobRef` on accepted async request; after verification `JobStatus` reports `resource_id` or `review_required`.

## Step-by-step pipeline

1. **Deterministic preflight**: require approved target/outcome IDs; calculate prerequisite closure, filter excluded/unintroduced skills; detect duplicates/identical old tasks; reject impossible briefs early.
2. **Single vs combined objective**: for single, one dominant outcome. For multi, build or retrieve **approved integration outcome** describing how skills must be used together. Do not simply concatenate unrelated questions.
3. **LLM generates only a frozen `TaskSpec`**: complete functional/answer contract, valid input bounds, expected output, boundary/error behavior, concept evidence map, duration and public examples. No solution/code yet.
4. **Deterministic metadata checks**: schema; targets exactly equal brief targets; unique requirement IDs; valid outcome IDs; constraints and stage; no missing contract sections.
5. **Semantic contract review** via independent LLM critique and human review on uncertain outputs; do not let the reviewer silently change requirements. Fix by creating a **new version**.
6. **Generate reference implementations and test specifications independently from the frozen contract** (different LLM prompts; test generator does not see solution).
7. **Test-quality gate** in isolated worker: reference(s) run and pass; branch/boundary/invalid-input coverage; property tests where applicable; test suite kills representative incorrect variants; no tests on unspecified behavior; syntax checks; no unapproved dependencies in suggested reference path.
8. **Publish only verified items** (`human_review_status` according to release policy). Save model IDs, prompt versions, contract hash, output and verification details privately.
9. **Student submission**: evaluation is Member E's job; send requirement-aligned failures without hidden answer content. Member D records evidence only if task/grading validity is `valid`.

## LLM prompt templates

### `exercise-spec-v1`

```text
SYSTEM: You are a CS assessment designer. Given a validated GenerationBrief and approved learning outcomes, design ONE solvable exercise with observable evidence. Return TaskSpec JSON only.
INPUT: {{generation_brief}} {{approved_outcome_definitions}} {{previous_task_fingerprints}}
RULES:
- For single_skill_exercise, focus on only one dominant target outcome.
- For multi_skill_exercise, each target skill must play an essential interacting role; give the integration requirement IDs.
- For recall, require memory retrieval; understanding, prediction/explanation; transfer, new-context application.
- Specify exact input/output behavior, valid inputs, all critical edge and boundary cases; never invent a runtime feature outside allowed_skill_ids.
- Include test-intent descriptions aligned with requirement_ids, not code.
- If specification cannot satisfy constraints, return an explicit design_failure reason; do not fake compliance.
- Avoid replicating existing prompts/problems verbatim.
```

### `exercise-reference-v1`

```text
SYSTEM: Produce a private valid solution for the **frozen** TaskSpec. Do not modify its contract. Obey permitted skill constraints. Return {source_code, requirement_coverage, notes} as JSON.
INPUT: {{immutable_task_spec}}
```

### `exercise-test-v1`

```text
SYSTEM: Independently derive black-box tests for the **frozen** TaskSpec; you may NOT see a reference solution. Return typed inputs/expected results/requirement_ids, case class, and public/hidden flag. List ambiguities instead of guessing. Cover normal, boundary, empty/no-match and error outcomes explicitly specified. Do not invent extra requirements.
INPUT: {{immutable_task_spec}}
```

**ELM:** all prompts use Member F's adapter; request JSON text then schema validate with Pydantic; do not assume ELM implements server-enforced structured output. Bounded retries followed by manual review.

## Concrete one-skill example

`target_skill_ids=[python.conditionals]`, `assessment_stage=transfer`, `input quantity >= 0`, `stock_status(0) = "sold_out"`, `(1..3) = "low"`, `(4+) = "available"`. Tests include `0,1,3,4,20`; incorrect `<3` boundary implementation must fail. Explanation asks why `3` differs from `4`.

## Concrete multi-skill example

`target_skill_ids=[python.lists, python.loops, python.conditionals]`, approved integration outcome `search_first_match`, function `first_low_stock([8,2,5],3)->1`; tests also `[]->-1`, `[3,4]->-1`, `[1,1]->0`, and multiple matches must return **first**. Restrict input to nonnegative integer quantities and threshold. An AST check may ensure loops if the learning objective demands a loop; syntax alone does not establish understanding.

## Verification status transition

`draft → verifying → verified → published`, or `verifying → review_required/rejected`; `verified` describes passed QA checks, **not proof of perfect pedagogical validity**. Never send `reference_solution_ref` or `hidden_test_suite_ref` in student API responses. No uncertain test should be used for mastery updates.

## Owned implementation

```text
src/backend/app/modules/exercise_generation/
  brief.py             # validate brief/outcome/eligibility
  spec.py              # frozen TaskSpec via ELM
  reference.py         # private candidate solution generation
  tests.py             # independently proposed typed tests
  verify.py            # call grading worker, mutation checks
  publishing.py        # version/status/review policy
src/backend/app/api/v1/exercises.py
src/shared/prompts/exercise/{spec,reference,test}_v1.txt
src/backend/tests/{unit,contract,integration}/exercise_generation/test_exercise*.py
```

**Do not** implement code execution here; call Member E's `SandboxProtocol` and record returned verification artifacts. Member F owns DB migrations (`activities`, `task_requirements`, `grading_artifacts`, `verification_reports`, `generation_jobs`).

## Acceptance / handoff tests

- `GenerationBrief` fixture produces a valid, immutable v1 `TaskSpec` with correct targets/outcomes and published student-safe fields.
- The reference solution passes every required test; known faulty boundary implementation fails; hidden tests remain private.
- Invalid generated test or unintroduced concept forces `review_required`, not publication.
- Multi-skill exercise demonstrates *interaction*, not three isolated subquestions; mapping of each requirement to outcomes exists.
- Recall/understanding tasks use defined grading rubrics, not falsely guaranteed code execution.
- Provider failure is typed; job transitions are idempotent and observable; duplicated job does not create duplicate published exercises.

**Relevant tools:** [Hypothesis](https://hypothesis.readthedocs.io/), [Python `ast`](https://docs.python.org/3/library/ast.html), [Exercism problem specifications](https://github.com/exercism/problem-specifications). Reuse only under appropriate terms.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.

## Implementation update — 2026-10-26 (Proposed)

Component B now includes a locally tested exercise-generation pipeline
supporting coding and non-coding assessment candidates.

### Implemented locally
- Deterministic curriculum eligibility and TaskSpec validation.
- Frozen, versioned exercise specifications and exact duplicate detection.
- Independent advisory AI semantic review before private generation.
- Coding exercises: private reference solutions and hidden-test candidates.
- Non-coding exercises: private written model answers and grading rubrics.
- Private artifact manifest with TaskSpec, reference, hidden-test and
  optional rubric fingerprints.
- Asynchronous exercise-generation route using injected authentication
  and persistent-job interfaces.

### Integration boundaries
- AI review is not instructor approval.
- Generated assessment candidates are not automatically verified.
- Member E's sandbox must verify executable assessments.
- Member F's backend must provide authentication, durable jobs,
  AI gateway, persistence and authorised student-safe retrieval.
- Private grading artifacts must not be exposed through public routes.

### Local verification
117 exercise tests passed before the final manifest change.
The combined B/C suite subsequently passed 163 tests.

### Review status
Proposed; requires relevant component-owner and academic review.
No new shared public DTO has been approved by this update.
