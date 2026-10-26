# Socratix web design prototype

A clickable, static design prototype for the student workspace and the instructor review queue. **Sample data only.** It makes no API calls and holds no secrets. The production frontend remains Next.js in `src/frontend/` (docs/web_design.md); this folder is for design review.

## Open it

- **On Render:** the FastAPI app serves this folder at **`/design/`** (see `server/main.py`, step 7), e.g. `https://<your-render-service>.onrender.com/design/`.
- **Locally:** `cd server && ELM_API_KEY=dummy uvicorn main:app --port 8765`, then open http://localhost:8765/design/.
  (`ELM_MOCK=true` alone currently fails at startup because the OpenAI client still requires a key; that bug predates this prototype.)
- Use **Prototype: view as Student / Instructor** in the left rail to switch roles.

| Screen | Hash route | Spec route |
|---|---|---|
| Sign in | `#/login` | `/login` |
| Dashboard | `#/dashboard` | `/dashboard` |
| Plan | `#/plan` | `/plan` |
| Skills (graph + list) | `#/skills` | `/skills` |
| Practice landing | `#/practice` | `/practice` |
| Solve screen | `#/practice/list-total` (`?task=t-loops` from a plan task) | `/practice/:itemId` |
| Wrap-up | `#/practice/list-total/done` | `/practice/:itemId/done` |
| Quick challenge | `#/practice/challenge/list-product` | `/practice/challenge/:itemId` |
| Mixed challenge | `#/practice/mixed/mx-1` | `/practice/mixed/:setId` |
| Upload status | `#/practice/uploads/up-1` | `/practice/uploads/:uploadId` |
| Project | `#/projects/cafe-terminal` | `/projects/[projectId]` |
| Reflection | `#/reflection` | `/reflection` |
| Review queue (instructor) | `#/review` | `/review` |
| Settings & privacy | `#/settings` | `/settings` |

## Files

- `index.html`: page shell and font/icon loading (Google Fonts: Atkinson Hyperlegible Next/Mono; Lucide 0.460.0 from unpkg)
- `styles.css`: design tokens and components (dark canvas, thin off-white outlines, stage/state colours)
- `data.js`: sample data shaped with `shared_contracts.md` v1.0 field names (`SelectorResult`, `TaskSpec`, `ProjectSpec`, `HintResponse`, `SkillEstimate`, …)
- `app.js`: hash router, screens, and simulated interactions (jobs, confirmations, review decisions)
- `practice.js`: the Practice area (exercises). A simulated server owns the hint rules and checking, so the screens behave like the spec; solutions and hidden values never sit in `data.js`

## Verification against the project design documents

Each item was checked against the spec text and exercised in a headless Chrome pass (desktop 1440 px and mobile 390 px, no console errors, no horizontal overflow).

### docs/web_design.md acceptance tests

| # | Requirement | Where in the prototype |
|---|---|---|
| 1 | Typed plan → proposed tags → student confirms/rejects; only confirmed IDs reach the selector | Plan: checkboxes, *Reject all*, *Confirm N tags* (disabled at 0), "Only confirmed tags reach the selector" |
| 2 | Recommendation shows weighted reasons, policy version and override; ranking ≠ AI always right | Dashboard: 0.40/0.35/0.25 diagram, `selector-v1`, *Choose something else* → Start anyway / Integrated prep / Quick diagnostic, alternatives with *Choose* |
| 3 | Verified test evidence + graded hints | Superseded for exercises by `practice_spec.md`: hints H0–H4, never the full solution; the model answer appears only after solving (see Practice below) |
| 4 | Untrusted content renders safely; no hidden graders in payloads | All text is HTML-escaped; `data.js` has no reference solutions or hidden tests; note says hidden tests are never shown |
| 5 | Async pending/success/failure/review-required states, no frozen spinner | Generation job and grading job step through `queued → running → succeeded`; *Prototype only* panel previews grader unavailable (503) and uncertain test |
| 6 | Students can't reach instructor review by URL | `#/review` as student shows "Instructor access required", explained as a server-side check |
| 7 | E2E: plan → select → exercise → run → hint → revise → wrap-up | Dashboard *Continue practice* → List total (Run, H0 → H1 → H2, fix) → wrap-up ticks the plan task → quick challenge |
| 8 | Project milestones + late change request, no forced architecture | Project: M1–M6 DAG with dependencies, M6 change request, "Your design, not ours", only the CLI protocol is fixed |

### Practice: practice_ui_structure.md §12 acceptance checklist

The exercise part follows `practice_ui_structure.md` v1.0 (structure) and `practice_spec.md` v1 (rules; the spec wins where they differ).

| Requirement | Where in the prototype |
|---|---|
| Landing order: Continue → Recommended (picks, suggested next, subject groups) → Independence checks → Your own exercises | `#/practice`; the filter (All · Not started · With hints · Due) sits above the subject groups. *Prototype only → Show first visit* shows concept groups only, with "Start here" (spec §3) |
| Solve order: Task (collapsible) → Work area with output attached + sticky Help panel → states | *Hide task / Show task*; output sits inside the work card; Help is sticky; tablet turns Help into a tab, phone is reading mode |
| Hint disabled before the first Run; status line explains every lock; "I don't know what to change" in the status line | Status line under the action bar covers every §5.2 state; Hint/Next hint/H4 open labels |
| Whitespace/comment-only change doesn't unlock; a real change does (at Run) | Add spaces and Run → "That wasn't a real change"; edit the condition and Run → unlocked |
| Same failure → next level; different failure → same level; never skip; H4 rules | One level per real change; compile errors start at H1; H4: 1st wrong removes a decoy, 2nd+ highlights the first misplaced line, correct → verified → wrap-up |
| Wrap-up badge reflects max level (≤ H1 = on your own) | "Solved on your own" / "Solved with hints"; explanation items show "Looks complete (AI feedback)" and never count |
| Challenges have no hint UI | Quick and mixed challenges have no hint button, help panel or H4; misses get neutral wording |
| Upload needs confirmation; progress steps; verified/unverified badges; daily limit | Prepare stays disabled (with the reason) until confirmed; 4 animated steps; "N of 3 uploads left today"; unverified/failed outcomes under *Prototype only* |
| `?task=` auto-ticks the plan task | Continue card opens `?task=t-loops`; wrap-up shows the task ticked and the `activity_completed` payload |
| Keyboard-only use, including H4 | Cmd/Ctrl+Enter runs; H4 rows take Alt+↑/↓ and N; every move has a button |

Item types in the demo bank: `code` (Python, Haskell), `worked_steps` (first wrong step, arithmetic checked), `explanation` (labelled AI feedback), `formula` (truth-table equivalence, mismatching rows), `logic_proof` (each line checked for entailment from the lines it cites). Screen states (runner/ELM unavailable, hidden-check limit, offline, server waking, load error, skeleton) are under *Prototype only*.

### Product rules (AGENTS.md, shared_contracts.md, component specs)

- **Indices never shown as probabilities:** "priority index · uncalibrated heuristic, not a mastery probability"; skill indices are labelled uncalibrated; `null` shows as "n/a" or hatched "insufficient evidence", never zero.
- **Hint levels recorded:** H0–H4 history newest first; "Solved with hints" means the highest level was H2–H4 (practice_spec.md §5).
- **Gaps are suspected, not diagnoses:** hypotheses show `suspected`, their evidence IDs, and *Prove it with a new diagnostic* (the student challenge path).
- **Graph has a list alternative:** Skills has *Graph / List*, and graph nodes are keyboard-focusable buttons.
- **`part_of` vs `requires`:** the dashed area shows the `part_of` grouping, arrows show `requires`, and the proposed edge is dashed amber, marked "under review".
- **Planning provenance:** `model_suggested` vs `student_explicit`; unmapped phrases are shown and no new skill IDs are invented.
- **Reflection is private and low-weight:** "Private" badge; confidence is self-report and "never raises your skill indices"; the evidence opt-in checkbox matches `allow_use_as_learning_evidence`.
- **Human review is append-only:** a decision requires a reason, the receipt records time and reviewer, and later changes create a new decision.
- **Canonical vocabulary:** `assessment_stage` (recall/understanding/transfer), `activity_type`, `approval_status`, `job_status`, `grading_validity` are used as named in the contracts.
- **No invented auth vendor:** the login says the provider isn't chosen yet.
- **Accessibility (WCAG 2.2 AA target):** skip link, focus rings, labelled controls, `aria-live` status for grading and hints, text plus colour for every state, reduced-motion support.

### Known gaps and decisions for the team

- The prototype is plain HTML/JS for review. It is not the Next.js implementation, and nothing here is generated from OpenAPI.
- Sample identities (Sam Rivera, Dr. A. Moreno) and all numbers are synthetic.
- The Render service now also serves `/design/`. Remove the mount in `server/main.py` before production if the team doesn't want it public.
