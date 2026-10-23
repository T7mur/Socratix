# Web design — Next.js learning workspace

**Owner:** Member F (Frontend & Integration). **Dependencies:** Member A skills, B exercises, C projects, D plans/selector/gaps, E hinting/verification; **contract:** [shared_contracts.md](shared_contracts.md) v1.0.

## Product goal

Give an Informatics student a workspace where they can choose what to study, inspect **why** an AI recommendation exists, independently solve exercises and design/build projects, request progressively more revealing hints, and understand what evidence backs their learning profile. The interface should make independent effort easier than outsourcing the task to a chatbot.

Use **Next.js App Router + TypeScript**, deployed on **Vercel**. Backend is **FastAPI on Render**; no frontend code directly contacts ELM or Aiven PostgreSQL. ELM credentials and hidden grader artifacts are never part of the browser bundle. Use an application authentication mechanism selected by Member F with backend token verification and role-based access. Avoid inventing a final auth vendor until chosen.

## Page map and user journeys

| Route / view | UX goal | Backend contract |
|---|---|---|
| `/login` | Sign in; role-aware redirect | Auth provider + API session |
| `/dashboard` | Current goal, recommended next action, due reassessments, recent work | `SelectorResult`, student evidence summary, active plan |
| `/plan` | Write today's/this week's goal; inspect suggested skill tags, edit/confirm | `POST /plans/tag`, `/plans/{id}/confirm` |
| `/skills` | Explore hierarchical concepts, `requires` edges, skill evidence and confidence labels | `GET /skills`, `GET /students/me/skill-estimates` |
| `/learn/[activityId]` | Exercise statement, staged recall/understanding/transfer UI, editor when appropriate | `GET /activities/{id}`, `POST /submissions`, hint route |
| `/projects/[projectId]` | Requirement brief, proposed architecture, milestone checklist, code/tests, revisions | ProjectSpec via activities route and submissions |
| `/reflection` or contextual modal | What changed, what was hard, what to revisit; candidate tags for confirmation | `POST /reflections`, confirmation route |
| `/review` (instructor only) | Approve proposed skills/relations/outcomes; scrutinise generated tasks and gaps | `POST /skills/{id}/review`, `POST /reviews/...` |
| `/settings` | Privacy, stored evidence explanation, data access/export request | Authorised user/profile routes (future exact DTO) |

The frontend must support student override without concealing prerequisites: e.g. "I want sorting now; you suggested list indexing first. Start anyway / integrated prep / quick diagnostic." Do not force a single mandatory learning order.

## Main exercise interaction

1. Student sees a **student-safe TaskSpec**: objective, requirements, permitted skills, examples, explanation prompt. Never a reference solution or hidden test.
2. For recall: short free text/structured response. For understanding: prediction/explanation. For transfer: code editor and tests. Distinguish the three stages visibly.
3. On submit, show `JobRef`/pending state when work is asynchronous. Poll `GET /jobs/{id}` until terminal; fetch authorised evaluation. Show verified observed failure, not invented diagnosis.
4. User asks for Stage 1 hint: locate the issue. Stage 2: ask intended behaviour. Stage 3: counterfactual/code-change question. Stage 4: solution and explanation (with explicit confirmation that this attempt won't count as independently solved).
5. Let user make edits/resubmit between hints. Each stage requires a valid `attempt_id`; reflect observed assistance history in the UI.
6. After completion, ask short reflection, then optionally independent transfer check later. Separate **correctness**, **assisted progress**, **independent evidence** badges/text. Do not show an uncalibrated index as a probability.

## Project experience

Provide a requirements panel with stable requirement IDs, milestones, status, starter/code workspace (Monaco or CodeMirror; choose based on accessibility/licensing/performance), user's initial system design, tests, and change requests. Don't reveal a model-supplied function architecture as mandatory if design independence is the assessed outcome. Use rubric evidence for requirements/design and execution feedback for code.

Recommended layout at desktop: left project brief + milestones, centre code/design workspace, right hint panel/history. At mobile: stacked views; basic plan/reflect/review must remain usable, though a full IDE-like editor may be best on desktop. The screenshot's sparse dark boxes can inspire styling, but function clarity and accessibility beat aesthetic imitation.

## UI components and ownership

```text
src/frontend/
  src/app/
    (public)/login/page.tsx
    (app)/layout.tsx
    (app)/dashboard/page.tsx
    (app)/plan/page.tsx
    (app)/skills/page.tsx
    (app)/learn/[activityId]/page.tsx
    (app)/projects/[projectId]/page.tsx
    (app)/reflection/page.tsx
    (instructor)/review/page.tsx
  src/components/
    layout/{app_shell,nav,loading,error_boundary}/
    skills/{skill_graph,skill_detail,confidence_label}/
    planner/{goal_input,tag_proposals,plan_confirmation}/
    assessment/{task_brief,stage_selector,result_evidence}/
    editor/{code_editor,test_output,submission_status}/
    tutor/{hint_ladder,hint_history,retry_prompt}/
    projects/{requirements,milestone_list,design_canvas,change_request}/
    reflection/{reflection_form,reflection_tags}/
    review/{approval_queue,provenance,decision_dialog}/
  src/lib/
    api/{client,activities,skills,selection,submissions,planning}/
    auth/{session,guards}/
    validation/
  src/hooks/{use_job_status,use_activity,use_skill_estimates}/
  src/types/generated/       # derived from FastAPI OpenAPI; do not hand-edit
  tests/{unit,component,e2e}/
```

The [source scaffold](../src/frontend/README.md) reserves these directories. Implement files incrementally instead of creating empty placeholder exports. Never let agent-generated client DTOs drift from `src/backend/app/contracts/`.

## API contracts and frontend state model

The **FastAPI OpenAPI document is the source of truth** for request/response types. Member F generates TypeScript types in CI and checks for drift. Examples:

```ts
// Generated names shown conceptually; source is shared_contracts.md.
type Recommendation = {
  skill_ids: string[];
  activity_type: 'single_skill_exercise' | 'multi_skill_exercise' | 'project';
  priority_score: number;  // uncalibrated heuristic, not mastery probability
  reasons: string[];
  override_allowed: boolean;
};

type Hint = {
  attempt_id: string;
  level: 1 | 2 | 3 | 4;
  hint_text: string;
  solution_revealed: boolean;
};
```

A frontend may store **ephemeral** editor state and draft plans locally until submission, but authoritative evidence, hint level, review decisions and task status must be sourced from backend. Protect against double submission with idempotency and disable retry while the relevant submission is processing. Cancel polling on unmount. Implement clear timeout/error states when ELM or sandbox is unavailable.

### Suggested HTTP interaction

```text
POST /api/v1/selection/recommend   -> SelectorResult
POST /api/v1/exercises/generation-jobs -> 202 JobRef
GET  /api/v1/jobs/{job_id}         -> JobStatus
GET  /api/v1/activities/{id}       -> student-safe TaskSpec
POST /api/v1/submissions           -> 202 JobRef (or documented immediate result)
POST /api/v1/submissions/{attempt_id}/hints -> HintResponse
POST /api/v1/reflections           -> ReflectionTagProposal or review receipt
GET  /api/v1/students/me/skill-estimates -> SkillEstimate[]
```

Reflection confirmation and response types are specified in [shared_contracts.md](shared_contracts.md); ensure the server and UI implement the **same exact path/response** before release.

## UI rules / privacy

- Use accessible labels, readable contrast, keyboard navigation, screen-reader status changes for test results, and no dependence on colour alone; aim for WCAG 2.2 AA. Do not treat the student's writing fluency or confidence as mastery.
- Render recommendations as suggestions with source-linked reasoning and confidence/uncertainty, not as objective diagnoses.
- Separate private instructor review from student-facing routes; login role is verified by server API, not merely hidden UI elements.
- Never expose ELM tokens, database credentials, hidden tests, reference solutions, or raw exception secrets through `NEXT_PUBLIC_*` variables, API responses or source maps.
- Prefer public API origin in `NEXT_PUBLIC_API_BASE_URL` only; any server-only secrets remain in protected Vercel/Render environments. Next.js embeds `NEXT_PUBLIC_*` values into client assets at build time.
- Use sanitised rendering for AI-produced Markdown, escaped code views, CSP and ordinary anti-XSS/CSRF measures appropriate for chosen auth flow.
- Protect student data with appropriate retention/export/consent policy; reflection-to-blog publishing is separately opt-in and not MVP.

## Suggested web theme

Inspired by the user's hand-drawn Eraser diagram: dark neutral canvas, thin off-white outlines, sparse typography and diagram-like skill connections. Unlike a static diagram, interactive elements need unmistakable focus/hover states and accessible contrast. Keep graph view as an optional visual representation with a usable list alternative.

## Tests / acceptance

1. On `/plan`, a typed plan yields proposed skill tags; student can reject/confirm; only confirmed IDs reach selector.
2. A recommendation shows its weighted reasons, fixed policy version and override action. Ranking does not imply the AI is always correct.
3. Code editor submission displays verified test evidence and the four-stage hint flow; stage 4 warns before revealing an answer.
4. Untrusted generated content renders safely; hidden graders never appear in network payloads.
5. Mock async job pending/success/failure/review-required states; no frozen spinner or false success.
6. A student cannot access another student's attempt, instructor review, or private reflection by manipulating URL IDs.
7. E2E demo: plan → select → generated exercise → submit → hint → revise → reflect → updated skill-evidence view.
8. Project workspace supports milestones and a late change request without forcing a predefined internal architecture.

## Integration handoff

- **D → F:** `PlanTagProposal`, `ConfirmedPlan`, `SelectorResult`, `SkillEstimate` plus explanations. D owns interpretation, F owns presentation.
- **B/C → F:** `TaskSpec`/`ProjectSpec` student-safe only; mutable draft specs must not be shown as verified.
- **E → F:** `EvaluationResult` and `HintResponse`; prepublication hidden tests/references remain server-private.
- **A → F:** Approved skill graph with distinct `part_of` and `requires` edges, source provenance and review status.
- **F → all:** Auth, generated TypeScript client, accessible shared components, workflow states, error handling, deployed staging URLs and contract checks.

## Deployment checklist (Vercel)

Set monorepo frontend root to `src/frontend/`; configure `NEXT_PUBLIC_API_BASE_URL` to deployed Render HTTPS API; do not expose secrets under `NEXT_PUBLIC_` keys. Validate Next.js deployment build and API CORS. Ensure preview deployments cannot mutate production skill estimates/review workflows by accident. Track browser observability without collecting raw private reflections or code by default.

## Sources

- [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables)
- [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying)
- [Vercel monorepo deployment](https://vercel.com/docs/monorepos)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Design-change governance (mandatory for the component owner and coding agents)

This document is the **current approved design**, not a disposable prompt. If implementation requires a different algorithm, workflow, schema, API payload, prompt contract, task policy, or project milestone design:

1. Start or continue work on your personal feature branch (`<INITIALS>/<feature_name>`); never modify `main` directly.
2. Before implementing a design deviation, record a proposal in `docs/changes/CHANGELOG.md` with the date, branch, owner, **before → after**, reason, affected files/interfaces, migration/test consequences and review status. For a significant cross-component decision, additionally write `docs/adr/NNNN-short-decision.md` (template provided).
3. Update **this component MD** to describe the newly proposed/approved behaviour. If the change touches boundaries, also update `docs/shared_contracts.md`; if it changes the overall flow, update `docs/architect.md`; for DB schemas, update `docs/database.md`; for UI behaviour, update `docs/web_design.md`. Do not silently change unrelated modules' specifications.
4. Update or add tests and include the changed Markdown files **in the same pull request as the code**. Cross-component contract changes need review from Member F and each affected owner. Changes to approved academic rules or evaluation policy need the designated human reviewer.
5. Until reviewed and merged, label the new design **Proposed** in the log; accepted design replaces the active description only upon team approval. Keep the historical before/after entry; never rewrite it.
6. Coding agents must propose changes rather than autonomously approving architectural, grading, or mastery-policy changes.

See [repository team rules](../README.md), [agent rules](../AGENTS.md), and [change-log template](changes/CHANGELOG.md). Ordinary typo or formatting fixes can be noted in the PR without a design-change entry.
