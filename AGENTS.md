# Coding-agent instructions — Socratix repository

> Place this file at the repository root as `AGENTS.md` when starting the implementation. It specifies how independently working coding agents coordinate. It does **not** supersede the engineering documents or team review.

## Required reading order

1. Root `README.md` — mission, ownership, branch strategy, coding-agent prompt and change process.
2. `docs/architect.md` — system flow, boundaries, deployment and human review.
3. `docs/shared_contracts.md` — **normative v1.0** DTOs, routes, status transitions and version conventions.
4. Your component specification (`docs/<component>.md`) — owner, prompt versions, file locations and acceptance tests.

## Mandatory branch and design-change rule

- Every implementation task starts on its own `<INITIALS>/<feature_name>` branch based on current `main`; Joshua Kwong uses `jk`, e.g. `jk/hint_generator`. Never work directly on `main`.
- Before making any intentional design change, read `docs/changes/CHANGELOG.md`. Create a **Proposed** before → after entry with reason, owner, branch, affected documents/interfaces and expected tests/migrations. Update the relevant `docs/<component>.md` in the same PR.
- For architecture, DTO, API, DB or UI impacts, also update `docs/architect.md`, `docs/shared_contracts.md`, `docs/database.md`, or `docs/web_design.md` as applicable. Affected owners must review.
- Material decisions require an ADR under `docs/adr/`. Never erase old accepted decisions; use a superseding ADR. Coding agents may draft these but may not self-approve.
- Design change log is for meaningful changes, not typos or formatting. No code-only PR that silently contradicts the accepted MD design.

## Global engineering constraints

- Preserve **student independence** as the primary learning outcome. Do not convert the tutor into a code-writing agent that silently completes assignments.
- All module calls must use the canonical names, enum values and payload semantics in `shared_contracts.md`; never privately create a competing `Skill`, `TaskSpec`, `HintResponse`, `AssessmentEvidence`, or `SelectorResult` schema.
- Client TypeScript types are generated from FastAPI OpenAPI; do not hand-edit generated code. Schema changes must update contract tests, docs and OpenAPI snapshot in the same PR.
- Skills, outcomes and prerequisite edges cannot enter the approved graph without an auditable human review. The LLM suggests, deterministic checks reject invalid IDs/cycles, and the reviewer approves.
- Exercise/project specifications are **frozen before** private reference and test generation. Rejected generated content creates a new version; never mutate already-published task contracts or retroactively overwrite old grading evidence.
- Run student code and model-generated reference code **only in isolated grading infrastructure**. The public FastAPI process may enqueue grading jobs but may not call untrusted `exec`, `eval`, `subprocess` or equivalent local execution paths.
- Hidden tests, reference solutions, sandbox traces, ELM API keys and Aiven credentials never appear in student-facing DTOs, Next.js bundles or client logs.
- The initial selector uses exactly `0.40 planning + 0.35 gap + 0.25 retention` **as a configurable, unvalidated heuristic**. Gaps use separate provisional thresholds; do not represent these as learned probabilities or optimal educational policies.
- Record hint levels 1–4 and stage 4 answer reveal; subsequent success on the revealed original task does not count as independent mastery. Invalid/uncertain tests cannot change mastery.
- Any real decision with academic consequences needs an authorised human and institutional policy; instructor review is required for unapproved curricula, uncertain generated tasks and disputed diagnoses.
- ELM support is model/key-specific. Use `src/backend/app/integrations/elm.py`, configurable `ELM_BASE_URL`, and do not assume Responses API, constrained JSON, tool calls or streaming work without credentialed smoke tests.
- Consent, retention and student-only authorisation are required before processing authentic learner profiles; self-reported confidence/reflections are weak evidence and remain private by default.

## Source layout

Implementation roots live under `src/`. See [src/README.md](src/README.md) for component guides, API file ownership, test directories and prompt ownership. Shared contracts and schema review rules below still apply.

## Ownership map

| Code area | Owner | Required outgoing contract |
|---|---|---|
| `src/backend/app/modules/skill_generation/` | Member A | `ApprovedSkillGraph` + source-verified outcomes |
| `src/backend/app/modules/exercise_generation/` | Member B | `TaskSpec` + private `GradingArtifact` |
| `src/backend/app/modules/project_generation/` | Member C | `ProjectSpec`/`MilestoneSpec` + private QA artifacts |
| `src/backend/app/modules/selector/` | Member D | `SelectorResult`, `GenerationBrief` |
| `src/backend/app/modules/knowledge_gap/` | Member D | `SkillEstimate` and due-retention indicators |
| `src/backend/app/modules/planning/` | Member D | `ConfirmedPlan`, `ReflectionReceipt`, append-only self-report |
| `src/backend/app/modules/hinting/`, `src/grading-worker/` | Member E | `EvaluationResult`, `HintResponse`, valid assessment events |
| `src/backend/app/contracts/`, `src/backend/app/db/`, `src/frontend/`, deployment | Member F | Stable OpenAPI, migrations, frontend client, security gates |

Only Member F commits DB migrations/changes to public DTOs after affected owners approve. Contributors can propose migrations and contract patches in separate PRs.

## Task prompt for a coding agent (fill placeholders, do not omit acceptance tests)

```text
You are on branch <INITIALS>/<feature_name>. You own COMPONENT: <component name>, as assigned in root README.md.
Read root README.md and AGENTS.md; then docs/architect.md, docs/shared_contracts.md and docs/<component>.md.
Implement only the owned files and tests listed in your component spec.
Respect all exact API and DTO names; use stubs/mocks at other members' boundaries.
For any design deviation, update the owned MD and append a Proposed before → after entry to docs/changes/CHANGELOG.md. Update other impacted specs; create an ADR for major decisions. Before changing shared schema/migrations, obtain Member F and affected-owner review.
Deliver: implemented functions/handlers, typed interfaces, local tests, negative/security tests, and a short handoff describing inputs/outputs and anything blocked.
Do not claim external ELM or Aiven integration works unless you ran a real smoke test using authorised credentials.
Never send reference solutions or hidden tests to student APIs.
```

## PR readiness checklist

- [ ] I stayed within my code ownership boundary or obtained sign-off.
- [ ] I used canonical DTOs and status enums; no duplicate field names/alternate IDs.
- [ ] My prompts are versioned and model/provider-independent behind the shared ELM adapter.
- [ ] All deterministic validators reject invalid data (not mere `assert` statements).
- [ ] I added tests for happy path, invalid/uncertain outputs, and authenticated ownership.
- [ ] My module doesn't directly access another module's private tables.
- [ ] Generated content is never assumed correct merely because two LLM calls agree.
- [ ] Any new external dependency, endpoint or API capability was verified and documented.
- [ ] Uncertain human-approval cases remain `review_required` rather than auto-published.
- [ ] I updated the relevant component document and the **before → after** log for every meaningful design change; wrote/superseded ADRs for major choices.
- [ ] I worked on a dedicated `<INITIALS>/<feature_name>` branch and opened a reviewed PR.

## Demo integration smoke test

A small approved Python graph is seeded → student creates goal → candidate tags are confirmed → selector ranks skills with fixed weights → exercise is generated and verified → code is submitted to isolated grader → test failure triggers progressively generated hints → student retries → evidence and self-report are appended → derived gap estimate updates conservatively → selector suggests a later unaided transfer check. A separate project path must include milestones, change request and rubric feedback.

**Important:** These are implementation tasks. A Markdown document is not evidence that a service, ELM permission, database connection or safe code runner has been built.
