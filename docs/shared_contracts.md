# Shared contracts — **AUTHORITATIVE v1.0**

## Additive implemented proposal — identity and catalogue review

Pending Member F/affected-owner review. `contract_version` remains `1.0`; existing decision request/response names are preserved. Canonical enum definitions live in `src/backend/app/contracts/enums.py`. The generated [OpenAPI snapshot](../src/shared/openapi/openapi.json) specifies all implemented DTO fields and query parameters; generate TypeScript rather than hand-copying them.

| Method / route | Request and response | Authorisation |
|---|---|---|
| GET `/api/v1/me` | `UserProfile`: contract_version, id, email, display_name, role, is_active, created_at | Valid Supabase user, active local profile; first request idempotently creates a student |
| GET `/api/v1/reviews` | optional resource_type/status/cursor, limit default 25/max 100 → `ReviewQueue` with items/next_cursor | Active application admin |
| GET `/api/v1/reviews/{resource_type}/{id}` | required resource_version → `ReviewDetail`: queue metadata, canonical payload, safe source provenance, validation_errors | Active admin |
| GET `/api/v1/reviews/{resource_type}/{id}/history` | → `ReviewHistory.items` of review_id, decision, decided_at, resource_version, reviewer_id, reason | Active admin |
| POST `/api/v1/reviews/{resource_type}/{id}` | existing `{contract_version,resource_version,decision,reason}` → existing `{contract_version,review_id,decision,decided_at}` | Active admin; global catalogue only |

`resource_type` is `skill | relation | outcome` for these implemented routes. Queue items have resource_type, resource_id, resource_version, approval_status, title and created_at. Default queue status means proposed/under_review. Cursor pagination is ordered by timestamp/type/id/version. Stale/repeated decisions are 409; missing resources 404; deterministic validation 422; unavailable database/key service 503. API permission checks are independent of Next.js route guards. A registration role or student_id is never trusted.

Standalone outcome review payloads carry skill_id, assessment_stage, observable_action, success_criteria and source_refs; nested outcome/source objects accept the documented fields with default contract_version. Skill import outcomes must be submitted for separate human review, not silently approved with the parent. Source IDs remain persistence metadata, not student DTO fields. The sample's admin requirement supersedes instructor wording below only for implemented global catalogue review; course-scoped instructor review is deferred.

All other routes listed in this document remain planned unless present in the generated OpenAPI. No activity/submission API or student grader integration is claimed by this change.

**Owner:** Member F (Full-stack/Integration). **All members must read this first.** Changes to public DTOs/routes require a reviewed PR, updated Pydantic schemas, regenerated frontend types, and contract tests. No agent should privately change field names.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Concept / skill** | Small, teachable ability (e.g. `python.conditionals`); not a whole exercise. |
| **Knowledge area / unit / topic** | CS2023 organisational hierarchy. `part_of` does not mean `requires`. |
| **Learning outcome** | Observable ability, linked to a concept and a stage. |
| **Prerequisite** | Approved directed `requires` edge, distinct from `part_of`, `related_to`, `practises`. |
| **Activity** | Exercise or project; immutable specification once verified/published. |
| **TaskSpec** | Student-facing requirements and privately stored grading contract for one exercise. |
| **ProjectSpec** | Milestones and dependencies, each with its own requirements/evidence. |
| **Evidence event** | Append-only report of a response, test result, assistance, explanation or self-report. |
| **Skill estimate** | Derived, versioned summary of evidence; never a ground-truth diagnosis. |
| **Hint level** | 1 location, 2 intended behaviour, 3 counterfactual, 4 solution/explanation. |
| **Manual review** | Explicit human approval/rejection with reviewer and timestamp. |

## 2. Data / naming conventions

- **Public API prefix:** `/api/v1` (do not infer from ELM endpoints).
- **Identifiers:** UUID strings for `user_id`, `course_id`, `task_id`, `project_id`, `attempt_id`, `job_id`, `evidence_id`; stable namespaced strings for `skill_id` and `outcome_id` (e.g. `python.conditionals`, `python.conditionals.transfer.v1`).
- Every request/response DTO has `contract_version: "1.0"`. Datetimes ISO-8601 UTC. Scores in `[0,1]` are *indices/heuristics* unless explicitly calibrated; no false probability claims.
- `source_kind`: `cs2023 | course_material | exercise | instructor | ai_proposed`. Include source locator (`uri`, `section`, `page` where permitted), extraction model, and rights status.
- `approval_status`: `proposed | under_review | approved | rejected` for concepts, relationships and outcomes.
- `activity_status`: `draft | verifying | review_required | verified | published | rejected | archived`.
- `job_status`: `queued | running | succeeded | failed | review_required`.
- `assessment_stage`: `recall | understanding | transfer`.
- `activity_type`: `single_skill_exercise | multi_skill_exercise | project`.
- `review_status`: `not_required | pending | approved | rejected`.

## 3. Canonical DTO examples (normative field names; examples are illustrative)

### Approved skill and learning outcome

```json
{
  "contract_version":"1.0",
  "skill_id":"python.conditionals",
  "name":"Conditionals",
  "description":"Select actions using Boolean conditions",
  "source_kind":"cs2023",
  "source_refs":[{"uri":"https://csed.acm.org/","section":"source section to confirm","page":null}],
  "approval_status":"approved",
  "outcomes":[{"outcome_id":"python.conditionals.transfer.v1","assessment_stage":"transfer","observable_action":"Apply conditional branching in a new domain","success_criteria":["correct boundary cases"],"approval_status":"approved"}]
}
```

### Directed skill relationship

```json
{"contract_version":"1.0","from_skill_id":"python.conditionals","to_skill_id":"python.comparisons","relation":"requires","approval_status":"approved","evidence_ref":"review:uuid"}
```

**Interpretation:** the `from_skill_id` requires the `to_skill_id`; only approved `requires` edges enter prerequisite closure. Cycle checks apply to `requires` and `part_of` separately.

### Planning tag request/response

```json
{"contract_version":"1.0","student_id":"uuid","text":"I want to make a terminal café ordering app next week","time_horizon":"week","course_id":"uuid"}
```

```json
{"contract_version":"1.0","plan_id":"uuid","candidate_tags":[{"skill_id":"python.loops","confidence_label":"medium","reason":"Repeated interaction"}],"unmapped_phrases":["terminal café ordering app"],"requires_student_confirmation":true}
```

### Selector request/response

```json
{"contract_version":"1.0","student_id":"uuid","course_id":"uuid","mode":"blended","activity_type_preference":null,"planning_skill_ids":["python.loops"]}
```

```json
{"contract_version":"1.0","selection_id":"uuid","policy_version":"selector-v1","weights":{"planning":0.40,"gap":0.35,"retention":0.25},"ranked_targets":[{"skill_ids":["python.loops","python.conditionals"],"activity_type":"multi_skill_exercise","priority_score":0.72,"reasons":["planning match","recent transfer difficulty"],"override_allowed":true}]}
```

### GenerationBrief — SAME input to exercise/project generators

```json
{
  "contract_version":"1.0","request_id":"uuid","student_id":"uuid","course_id":"uuid",
  "activity_type":"multi_skill_exercise","target_skill_ids":["python.loops","python.conditionals"],
  "outcome_ids":["python.loops.transfer.v1","python.conditionals.transfer.v1"],
  "allowed_skill_ids":["python.variables","python.conditions","python.loops"],
  "excluded_skill_ids":["python.classes"],"assessment_stage":"transfer",
  "difficulty_level":2,"preferred_context":"cafe","constraints":{"max_minutes":25,"language":"python"},
  "generation_policy_version":"generation-v1"
}
```

**Rule:** `target_skill_ids` and `outcome_ids` must exist and be approved. Backend computes the allowed set from the course/learner graph; LLM may not silently add skills.

### TaskSpec — exercise

```json
{
  "contract_version":"1.0","task_id":"uuid","task_version":1,
  "activity_type":"single_skill_exercise","title":"Stock classifier",
  "target_skill_ids":["python.conditionals"],"outcome_ids":["python.conditionals.transfer.v1"],
  "assessment_stage":"transfer","language":"python",
  "student_brief":"Classify stock quantities using the specified boundaries.",
  "function_contract":{"name":"stock_status","parameters":[{"name":"quantity","type":"int"}],"returns":"str"},
  "requirements":[{"requirement_id":"R1","description":"0 returns sold_out"},{"requirement_id":"R2","description":"1-3 return low"},{"requirement_id":"R3","description":"4+ return available"}],
  "input_constraints":["quantity is nonnegative"],"public_examples":[{"args":[3],"expected":"low"}],
  "explanation_questions":["Why is the result for 3 different from 4?"],
  "verification_status":"verified","human_review_status":"not_required"
}
```

**Private** `GradingArtifact`: `{task_id,task_version,reference_solution_ref,hidden_test_suite_ref,verification_report_ref}`. Never include these refs/content in student DTOs or public Next.js bundles.

### ProjectSpec and MilestoneSpec

```json
{
  "contract_version":"1.0","project_id":"uuid","project_version":1,
  "title":"Café terminal ordering system","target_skill_ids":["python.loops","python.conditionals","python.functions"],
  "engineering_outcome_ids":["engineering.requirements.v1","engineering.testing.v1"],
  "student_brief":"Create a menu and checkout system without classes.",
  "milestones":[{"milestone_id":"M1","title":"Requirements","depends_on":[],"assessment_method":"rubric","requirement_ids":["PR1"]},{"milestone_id":"M2","title":"Order processing","depends_on":["M1"],"assessment_method":"mixed","requirement_ids":["PR2"]}],
  "verification_status":"verified","human_review_status":"pending"
}
```

`assessment_method`: `tests | rubric | mixed`. `milestone_id` stable inside project version; dependency graph must be acyclic. Publish only if policy allows `human_review_status`.

### Submission / evaluation / hint

```json
{"contract_version":"1.0","task_id":"uuid","task_version":1,"student_id":"uuid","attempt_id":"uuid","source_code":"def stock_status(quantity): ...","explanation":"I used boundaries","requested_hint_level":null}
```

```json
{
  "contract_version":"1.0","attempt_id":"uuid","task_id":"uuid","task_version":1,
  "grading_validity":"valid","test_summary":{"passed":3,"total":4},
  "failures":[{"requirement_id":"R2","test_id":"T4","input_repr":"3","expected_repr":"low","actual_repr":"available","trace_ref":"private-ref"}],
  "independent":true,"max_hint_level_used":0,"solution_revealed":false,
  "evidence_event_ids":["uuid"]
}
```

```json
{"contract_version":"1.0","attempt_id":"uuid","hint_id":"uuid","level":2,"hint_text":"What is the condition meant to identify at quantity 3?","student_action":"Explain the intended branch","grounded_failure_ids":["T4"],"quality_status":"accepted","solution_revealed":false}
```

### AssessmentEvidence and SkillEstimate

```json
{
  "contract_version":"1.0","evidence_id":"uuid","student_id":"uuid","attempt_id":"uuid",
  "skill_id":"python.conditionals","outcome_id":"python.conditionals.transfer.v1","stage":"transfer",
  "task_validity":"valid","observed_correctness":0.75,"independent":false,
  "max_hint_level_used":2,"solution_revealed":false,"student_confidence":0.7,
  "feedback":"I was confused at a boundary","occurred_at":"2026-10-23T12:00:00Z"
}
```

```json
{"contract_version":"1.0","student_id":"uuid","skill_id":"python.conditionals","policy_version":"gap-v1","recall_index":0.9,"understanding_index":0.65,"transfer_index":0.45,"gap_priority_index":0.71,"evidence_count":5,"confidence_label":"medium","hypotheses":[{"label":"boundary confusion","status":"suspected","supporting_evidence_ids":["uuid"]}]}
```

The indices above are **illustrative, uncalibrated**; do not display as a probability of mastery.

## 4. API routes (agreed resource boundaries)

| HTTP | Route | Owner | Request → response |
|---|---|---|---|
| POST | `/api/v1/skills/import-jobs` | A | Source import request → `JobRef` (202) |
| GET | `/api/v1/skills` | A | course/filter → approved skills list |
| POST | `/api/v1/skills/{skill_id}/review` | A | decision → approved/rejected status; authorised reviewer only |
| POST | `/api/v1/plans/tag` | D | planning text → candidate tags |
| POST | `/api/v1/plans/{plan_id}/confirm` | D | selected tag IDs → saved plan |
| POST | `/api/v1/selection/recommend` | D | `SelectorRequest` → `SelectorResult` |
| POST | `/api/v1/exercises/generation-jobs` | B | `GenerationBrief` → `JobRef` (202) |
| POST | `/api/v1/projects/generation-jobs` | C | `GenerationBrief` → `JobRef` (202) |
| GET | `/api/v1/jobs/{job_id}` | F | → `JobStatus` (+ activity ID if finished) |
| GET | `/api/v1/activities/{activity_id}` | B/C | → student-safe TaskSpec/ProjectSpec |
| POST | `/api/v1/submissions` | E | `SubmissionRequest` → evaluation job or result |
| POST | `/api/v1/submissions/{attempt_id}/hints` | E | requested level/current response → `HintResponse` |
| POST | `/api/v1/reflections` | D | `ReflectionCreate` → `ReflectionTagProposal` (unconfirmed) |
| POST | `/api/v1/reflections/{reflection_id}/confirm` | D | `ReflectionConfirm` → `ReflectionReceipt` + optional self-report evidence |
| POST | `/api/v1/reassessments` | D/E | `ReassessmentRequest` → `JobRef` |
| GET | `/api/v1/students/me/skill-estimates` | D | → derived indices and evidence summary |
| POST | `/api/v1/reviews/{resource_type}/{id}` | F delegates | authorised human approval, logged decision |

Student ID in requests is **not an authorisation proof**; derive caller identity from authenticated session/token and check resource ownership. APIs return `401/403` for auth, `409` for stale version or invalid workflow transition, `422` for schema errors, `503` for provider/runner unavailable.

`JobRef`: `{contract_version, job_id, status, resource_type}`. `JobStatus`: `{contract_version, job_id, status, resource_id?, error_code?, review_reason?}`. Clients poll; never pretend an asynchronous job finished immediately.

## 4A. Additional explicit request/response DTOs (normative for the named routes)

The brief examples above are not a licence to invent missing fields. Use these contracts for planning/reflection and unified exercise/project calls:

```json
{"contract_version":"1.0","plan_id":"uuid","confirmed_skill_ids":["python.loops"],"rejected_skill_ids":[],"optional_goal_text":null}
```

**POST** `/api/v1/plans/{plan_id}/confirm` → `ConfirmedPlan`:

```json
{"contract_version":"1.0","plan_id":"uuid","confirmed_skill_ids":["python.loops"],"confirmed_at":"2026-10-23T12:00:00Z","active":true}
```

**POST** `/api/v1/reflections` → `ReflectionTagProposal` (not yet an objective assessment):

```json
{"contract_version":"1.0","student_id":"uuid","course_id":"uuid","activity_id":"uuid","attempt_id":"uuid","reflection_text":"I couldn't explain why my loop stopped","reported_confidence":0.4,"self_reported_difficulty":"hard"}
```

```json
{"contract_version":"1.0","reflection_id":"uuid","candidate_tags":[{"skill_id":"python.loops","confidence_label":"medium","reason":"Student mentioned stopping condition"}],"questions_for_student":["Which stopping condition did you expect?"],"requires_student_confirmation":true}
```

**POST** `/api/v1/reflections/{reflection_id}/confirm` → `ReflectionReceipt`:

```json
{"contract_version":"1.0","reflection_id":"uuid","confirmed_skill_ids":["python.loops"],"dismissed_skill_ids":[],"allow_use_as_learning_evidence":true}
```

```json
{"contract_version":"1.0","reflection_id":"uuid","evidence_event_ids":["uuid"],"recorded_at":"2026-10-23T12:00:00Z"}
```

**Exercises versus projects:** `TaskSpec.task_id` is the UUID used as `activities.id` for an exercise. `ProjectSpec.project_id` is the UUID used as `activities.id` for a project. The shared `activity_id` refers to either. An attempt targets **exactly one** of the following mutually exclusive selectors:

```json
{"contract_version":"1.0","student_id":"uuid","attempt_id":"uuid","task_id":"uuid","task_version":1,"project_id":null,"project_version":null,"milestone_id":null,"source_code":"...","explanation":"...","requested_hint_level":null}
```

```json
{"contract_version":"1.0","student_id":"uuid","attempt_id":"uuid","task_id":null,"task_version":null,"project_id":"uuid","project_version":1,"milestone_id":"M2","source_code":"...","explanation":"...","requested_hint_level":null}
```

The fields may be omitted instead of `null` where allowed by the Pydantic discriminated union. The API derives `student_id` from authentication and validates the supplied ID if present; a UUID is not an authorisation token. For a recall/understanding response, replace `source_code` with a separate `answer_text` field; backend enforces one appropriate response mode by stage.

**GET** `/api/v1/activities/{activity_id}` returns only published, authorised, student-safe TaskSpec or ProjectSpec; a project response includes milestone statuses and public rubrics, not hidden test details. A project attempt's evaluation must carry `project_id`, `project_version`, `milestone_id`, `attempt_id`, and private grader version so the learner model can attribute evidence to the right outcomes.

**POST** `/api/v1/reassessments` receives `{contract_version, student_id, course_id, target_skill_ids, independent:true}` and returns a `JobRef`; verification and delayed scheduling use existing TaskSpec/AssessmentEvidence contracts. This is not an unapproved new assessment stage: reassessment targets the `transfer` stage under `independent=true`.

**Review decisions:** `POST /api/v1/reviews/{resource_type}/{id}` requires an authenticated authorised instructor and `{contract_version,resource_version,decision:"approved"|"rejected",reason}`; returns `{contract_version,review_id,decision,decided_at}`. All manual approvals are append-only, including evidence and version references.

**Generation job privacy:** `JobStatus.resource_id` may be returned only after verification/publication and after checking ownership; never return hidden grader storage references. Generation jobs must be idempotent on `(authenticated_student_id,request_id,generation_policy_version)`.

**Grading-status wording:** `grading_validity` on a grader report and `task_validity` on `AssessmentEvidence` both use `valid | invalid | uncertain`. The evidence module maps them explicitly; `unknown` is not equivalent to `valid`. If an old test is later invalidated, recompute derived indices from corrected event history.

## 5. Shared runtime interfaces (Python; implement in `src/backend/app/contracts/`)

```python
class LLMGatewayProtocol:
    async def generate_json(self, *, operation: str, model_alias: str,
                            system_prompt: str, payload: dict,
                            schema: type) -> dict: ...

class SandboxProtocol:
    async def verify_task(self, task_ref: str) -> dict: ...
    async def grade_submission(self, attempt_ref: str) -> dict: ...

class EvidenceRepositoryProtocol:
    async def append(self, event: dict) -> str: ...
    async def list_for_skill(self, student_id: str, skill_id: str) -> list[dict]: ...
```

Adapters map provider-specific payloads to these DTOs. The `LLMGatewayProtocol` must work when ELM does **not** support server-enforced JSON-schema responses: request JSON, parse, validate with Pydantic, retry a bounded number of times, and then return a typed failure.

## 6. Cross-module test fixtures

- `src/shared/fixtures/approved_skills.json`: `python.variables`, `python.comparisons`, `python.conditionals`, `python.loops`, `python.lists`, `python.functions` and approved prerequisite edges.
- `src/shared/fixtures/student_beginner.json`: strong recall, weak transfer for conditionals; has a planning goal.
- `src/shared/fixtures/stock_status_task.json`: validated single-skill task with boundary tests.
- `src/shared/fixtures/cafe_project.json`: verified multi-skill project with milestones.
- `src/shared/fixtures/failed_submission.json`: boundary failure for quantity 3, then level-2 hint.
- `src/shared/fixtures/invalid_test.json`: malicious/incorrect expectation; must **not** update skill estimate.

**Merge gate:** Pydantic schema tests, OpenAPI snapshot diff, TypeScript type generation, and integration test from submission to persisted skill evidence must pass before any route/DTO change merges.

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
