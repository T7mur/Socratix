# Project generation — multiple skills + developer mindset

**Owner:** Member C (Projects) • **Dependencies:** A graph/outcomes, D selector, B task contract patterns, E secure grader and tutor, F DB/LLM • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Goal

Projects teach **requirements → design → implementation → testing → modification → reflection**, not merely bigger exercises. Combine already-taught skills with 1–2 targeted weaknesses and introductory engineering outcomes (`engineering.requirements`, `engineering.decomposition`, `engineering.testing`, `engineering.debugging`, `engineering.maintainability`). Target outcomes must be approved and source-traceable.

## Arguments in / outputs out

- **Input** `GenerationBrief` with `activity_type=project`, `target_skill_ids`, `outcome_ids`, `allowed_skill_ids`, `excluded_skill_ids`, difficulty, `preferred_context`, `constraints.max_minutes` and optional desired project idea.
- **Output** `ProjectSpec`: ID/version, student brief, requirements, milestone DAG, public interfaces or black-box CLI protocol, rubric per milestone, required engineering outcomes, a staged change request, QA/review status.
- **Private output**: milestone-specific reference solutions or executable acceptance-test oracle, test suites, specification check, rubric probes; not accessible via student routes.
- **Consumers**: Member F UI renders milestones, Member E grades milestone `SubmissionRequest` and dynamically hints, Member D derives evidence and schedules retention.

## Design choices

1. **Project objective != just several concepts:** require an observable integration outcome and at least one engineering practice outcome.
2. **Student controls architecture:** specify observable behavior/public interfaces only where necessary for automated grading; allow multiple internal designs. Students first propose components/functions and explain tradeoffs.
3. **Milestone DAG:** dependencies strictly directed and acyclic. Each milestone can be `tests`, `rubric`, or `mixed` graded and has explicit completion criteria.
4. **Functional contract first:** LLM drafts whole spec with constraints; freeze it, then generate private tests/reference material independently.
5. **Future change request:** after baseline functionality, introduce a new realistic requirement (e.g. cancellation); evaluate maintainability and regression tests. Must not rely on concepts not taught.
6. **Stateful testing:** for multi-step projects check sequences and invariants (e.g. stock never negative), not only isolated sample output.
7. **Manual review:** new project families, subjective design rubrics, and inconsistent generation require instructor verification before publish; for MVP manually approve one project family.

## Generation flow

`Approved goals & skills → project generation brief → LLM ProjectSpec → schema + skill/milestone checks → instructor spec review as policy requires → freeze version → independent milestone tests & private reference candidate(s) → sandbox QA → human rubric review → publish → milestone submissions → verified hints/revisions → change request → reflection → evidence`.

## Example: Campus Café Terminal

Allowed: variables, types, lists, loops, conditionals, functions and validation. Excluded: dictionaries/classes/files/database/networking. Student builds: menu display, repeated item selection, input rejection, stock tracking, checkout in integer pence. Sample milestone decomposition:

| Milestone | Goal | Evidence | Assessment |
|---|---|---|---|
| M1 | Requirements and decomposed design | student's design plan and edge cases | Rubric + human uncertainty flag |
| M2 | Menu and basic command loop | menu output and termination | CLI functional tests |
| M3 | Input validation | malformed selections rejected without crash | Invalid-input tests |
| M4 | Stock and cart updates | invariants after operation sequences | Stateful property tests |
| M5 | Checkout | correct totals and clear completion state | End-to-end tests |
| M6 | Change request: cancellation | cancel restores pending state; old behaviour remains | Regression tests + design reflection |

For students who have not yet learned functions, scale back architecture requirements; don't force patterns before prerequisites.

## Prompt: project specification (`project-spec-v1`)

```text
SYSTEM: You design beginner software engineering projects that students build themselves. Output a ProjectSpec JSON matching the supplied schema, without working code.
INPUT: {{generation_brief}} {{approved_skill_outcomes}} {{engineering_outcomes}} {{constraints}}
REQUIRE:
- One coherent user scenario. Explicit functional/negative requirements and allowed language features.
- Milestones in dependency order; each has requirement IDs, observable success criteria, outcome IDs, assessment_method (tests/rubric/mixed).
- M1 requires a student-authored plan; do not prescribe exact functions or architecture.
- At least one failure mode the student can discover with tests and at least one later change request.
- Define the public interface/CLI protocol used for grading but leave internals flexible.
- Include a testing checkpoint and reflection questions.
- Identify ambiguities and dependencies on unintroduced concepts instead of hiding them.
- No reference implementation, tests, or hints in this step.
```

## Prompt: milestone assessment (`project-tests-v1`)

```text
SYSTEM: Produce validation artifacts for one milestone of a frozen, instructor-approved ProjectSpec. Do not redefine requirements.
INPUT: {{project_spec}} {{milestone_id}} {{requirement_ids}}
For machine-checkable criteria: output structured input/action sequences, expected output/state changes, invariants, boundary/failure cases and requirement mappings.
For qualitative criteria: output a 4-level rubric, observable evidence, alternative acceptable designs and 'cannot determine' conditions. Do not treat subjective architecture review as a proven fact.
Return either verified test specification candidates or review_required ambiguities.
```

## Deterministic checks

- Validate outcome IDs and prerequisites; ensure total complexity respects declared scope.
- Verify unique milestone IDs, all `depends_on` exist, milestone DAG is acyclic and requirement IDs belong to the frozen project spec.
- For executable milestones, compile/reference-test in the isolated runner and check wrong variants where appropriate. For stateful milestones, check invariants after *sequences*.
- For rubric milestones, ensure each criterion references observable evidence and a permitted skill; AI feedback receives low-confidence flags and human correction path.
- Existing activity version stays frozen when adding a change request; create a next milestone, not a silent mutation of earlier contract.

## File ownership

```text
src/backend/app/modules/project_generation/
  constraints.py
  spec.py
  milestones.py
  test_planner.py
  rubric.py
  verify.py
  publishing.py
src/backend/app/api/v1/projects.py
src/shared/prompts/project/{spec,tests,rubric}_v1.txt
src/backend/tests/{unit,contract,integration}/project_generation/test_project*.py
```

DB Member F owns `projects`, `project_versions`, `project_milestones`, `milestone_dependencies`, `requirements`, private `grading_artifacts`, reviews; coordinate before migrations.

## Integration contracts / acceptance

- `GenerationBrief → ProjectSpec` matches shared schema, no extra fields invented by agent.
- A new project appears as a set of milestones, not one opaque text blob; frontend can resume a milestone reliably.
- M1 accepts multiple valid design plans; rubric reviewer can return `review_required`, not unsupported certainty.
- Invalid stock/cart operations fail; passing prior milestones still passes after change request; tests are repeatable.
- All generated solution/test artifacts are private; project UI never receives them by accident.
- Completion triggers reflection and `AssessmentEvidence` per relevant outcome, *not* automatic independent mastery.

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

Component C now includes a locally tested project-generation pipeline
using the existing ProjectSpec v1.0 structure.

### Implemented locally
- ProjectSpec validation against trusted approved skills and
  engineering outcome identifiers.
- Milestone uniqueness, assessment-method and dependency checks.
- AI project-draft generation using the shared gateway interface.
- Structural milestone-plan checks.
- Independent advisory semantic project review.
- Private per-milestone executable-test specification candidates.
- Private four-level qualitative rubric candidates.
- Worker orchestration for tests, rubric and mixed milestones.
- Public ProjectSpec snapshot and fingerprint separate from private
  assessment candidates.
- Conservative project lifecycle transition checks.
- Asynchronous project-generation endpoint returning a JobRef.

### Limitations and integration requirements
- ProjectSpec's canonical shared example does not provide complete
  requirement definitions or an executable public interface contract.
  Those details must be resolved with the relevant component owners
  before reliable executable milestone verification can be claimed.
- Generated test specifications are candidates, not runnable or
  sandbox-verified test suites.
- Semantic review cannot replace authorised instructor approval.
- New project families and subjective design rubrics require manual review.
- Member E must provide secure verification and grading.
- Member F must provide authentication, durable jobs, AI gateway,
  persistence, route registration and authorised retrieval.
- Public student responses must exclude private test cases, model
  solutions and unpublished grader artifacts.
- Published project versions and milestone identifiers must remain
  stable for submissions and assessment evidence.

### Local verification
45 project unit/contract tests passed.
The combined B/C suite subsequently passed 163 tests.

### Review status
Proposed; shared requirement and grader-interface questions remain
subject to component-owner review.
