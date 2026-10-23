# Knowledge-gap identification — evidence, not diagnosis by assertion

**Owner:** Member D (Personalisation) • **Dependencies:** Member E valid graded attempts/hints, Member F persistence, Member A approved outcomes • **Consumers:** selector, student profile UI, tutor • **Contract:** [shared_contracts.md](shared_contracts.md) v1.0

## Objective

Estimate *which learning outcomes need attention* using exercise and project results (per skill and tier), hint usage, repeated independent attempts, student confidence and reflections. Track uncertainty and hypothesis provenance. A 'gap' is a **reviewable recommendation**, not proof that a student misunderstood a concept.

## Inputs, outputs, event semantics

| Input | Source | Rule |
|---|---|---|
| `AssessmentEvidence` | E grader, B/C task refs | Require `task_validity=valid`; record task/outcome version, difficulty and correctness. |
| `HintEvent` | E | Track max level and solution reveal; a hint-assisted success is not independent success. |
| `ReflectionEvent` | D planning/reflection | Student-stated difficulty and future intention; low-strength signal. |
| `StudentConfidence` | D UI | Self-rated 0–1; avoid treating as calibrated probability. |
| `UnaidedReassessment` | E | Stronger retention/transfer signal if task is independently valid and sufficiently distinct. |

**Output:** versioned `SkillEstimate`: `recall_index`, `understanding_index`, `transfer_index`, `gap_priority_index`, evidence count, confidence label, `hypotheses[]` with `suspected | supported | disproven | human_confirmed`, provenance IDs and policy version. **Downstream:** selector consumes gap index; hint engine consumes relevant suspected concepts but not as truth.

## Provisional MVP rules, explicitly NOT scientifically optimal

1. **Per-stage separate indexes:** recall, understanding and transfer/independent application, not one test score. No observations → `null` / insufficient evidence, not zero mastery.
2. **Validity gate:** if task spec/test is invalid or grading uncertain, store audit event but exclude from skill update.
3. **Assistance distinction:** grade successful help-assisted attempts as `assisted_success`; only valid unaided attempts contribute to independent-success index. Stage 4 `solution_revealed=true` forbids independent mastery credit on that attempt.
4. **Difficulty/task coverage:** preserve task difficulty and requirement/outcome links; don't infer every target skill from one generic pass/fail result.
5. **Repeated evidence requirement:** **proposed threshold** for a *supported gap hypothesis*: at least two independently observed relevant failures on valid tasks in distinct attempts **plus** an explanatory diagnostic or independent reassessment (or instructor confirmation). With less evidence, status stays `suspected`.
6. **Student report/confidence:** use as soft signal to prioritise diagnostics; do not mark a misconception confirmed solely due to confidence mismatch or writing quality.
7. **Retention:** due reviews chosen by simple scheduled intervals (e.g. initial 2, 7, 21 days after demonstrated independent success), adjustable; retest in unfamiliar context before assuming retained skill. Spacing interval is heuristic, not universal optimal.

### Example gap priority (for ranking, not probability of mastery)

For adequate evidence, calculate indicators in `[0,1]`:

- `D`: weighted **unaided performance deficit** across recall 0.20, understanding 0.30, transfer 0.50 where data available (missing stages flagged and reweighted explicitly, not silently).
- `F`: repeated valid failure index across distinct tasks; cap at 1.
- `H`: assistance-dependence index on comparable task difficulty; capture stage-4 reveals separately.
- `C`: discrepancy between student's self-confidence and demonstrated unaided result (potential calibration issue), bounded.

**Heuristic:** `gap_priority = 0.45*D + 0.25*F + 0.20*H + 0.10*C`. This 45/25/20/10 is **a proposed initial index**, not an optimised or validated model. Separate from selector's fixed 40/35/25 composition. Do not generate a numeric gap priority when critical independent evidence is absent; mark `insufficient_evidence` and propose a diagnostic.

### Example evidence trail

`stock_status(3)` fails in a valid conditional exercise; student needs a level-2 hint; later succeeds unaided at a fresh boundary condition. First failure ⇒ `boundary_question` **suspected**, later correct transfer reduces priority; don't permanently label student 'weak'. If failing tests are invalid, neither gap nor confidence index changes.

## Pseudocode

```python
def update_skill_estimate(previous, valid_events, policy):
    events = [e for e in valid_events if e.task_validity == "valid"]
    by_stage = group_by_stage_outcome(events)
    independent = [e for e in events if e.independent and not e.solution_revealed]
    if not independent:
        return mark_insufficient_independent_evidence(previous, events)
    per_stage = compute_unaided_stage_indices(by_stage)
    hypotheses = propose_hypotheses_from_repeated_patterns(events)
    hypotheses = apply_minimum_evidence_gate(hypotheses, events, policy)
    return versioned_estimate(per_stage, hypotheses, policy.version, events)
```

Every computation must be deterministic and testable. LLM may **propose explanatory hypotheses** (e.g. 'confuses strict and inclusive bounds') using requirement-linked evidence; never authoritatively assign mastery or change the score on its own.

## LLM prompt (`gap-hypothesis-v1`)

```text
SYSTEM: You are a cautious diagnostic assistant. Given only verified assessment evidence and student explanations, propose alternative hypotheses about possible misunderstandings. Do not assert causes from a single error. Return candidate hypotheses, supporting/contradicting evidence IDs and a discriminating follow-up question; no numeric mastery probabilities.
DATA: {{skill_outcomes}} {{valid_failed_requirements}} {{attempt_history}} {{student_reflections}}
OUTPUT: {hypotheses:[{label,status:'suspected',supports:[],contradicts:[],test_question}],insufficient_evidence:boolean}
```

## Human verification and user correction

The student may inspect gap hypotheses and ask to demonstrate competence via a new diagnostic. Instructor/admin may confirm or reject a hypothesis. Every override is event-sourced; derived state gets recomputed, not silently overwritten. Audit model/prompt/policy versions for bias evaluation. Use student feedback to identify overlooked context, but do not equate stated confidence with knowledge.

## Owned files

```text
src/backend/app/modules/knowledge_gap/
  evidence.py           # validate event and outcome references
  scoring.py            # reproducible per-stage indexes
  hypotheses.py         # conservative LLM suggestion + thresholds
  retention.py          # scheduling due independent checks
  repository.py         # read/derive SkillEstimate; append audit
src/backend/app/api/v1/students.py
src/shared/prompts/gap/hypothesis_v1.txt
src/backend/tests/{unit,contract,integration}/knowledge_gap/test_knowledge_gap*.py
```

DB (`assessment_events`, `skill_estimates`, `gap_hypotheses`, `reassessment_schedules`, `review_decisions`) owned by F migrations; Module D owns update/read logic.

## Tests and biases

- Valid first failure ⇒ suspected only; repeated independent diagnostic evidence can support hypothesis; a later correct reassessment reduces gap priority.
- A stage-4 revealed solution never increases independent transfer index.
- Invalid test status never changes derived skill estimate (strong invariant).
- Exercises with multiple skills require per-requirement mapping; unsupported evidence doesn't update all tagged concepts.
- Confidence-only negative self-report does not mark a deficit. Sparse data produces `insufficient_evidence`.
- Acknowledge bias from tasks, grading, language, access to hints, accessibility, prior programming exposure, and self-confidence reporting. **Thresholds and percentages are not optimal** and should be validated against delayed unaided outcomes. Reinforcement learning is future work only.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
