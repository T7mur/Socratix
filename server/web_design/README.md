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
| Today (planning cards) | `#/` | `/` |
| Reflection (replaces the evening check-in; `#/?checkin=1` redirects here) | `#/reflection` | `/reflection` |
| Plan landing | `#/plan` | `/plan` |
| Setup | `#/plan/setup` | `/plan/setup` |
| Backward planning | `#/plan/milestones` | `/plan/milestones` |
| Daily wizard | `#/plan/today/1` … `#/plan/today/4` | `/plan/today/1` … `/4` |
| Progress (planning section) | `#/progress` | `/progress` |
| Skills (graph + list) | `#/skills` | `/skills` |
| Practice landing | `#/practice` | `/practice` |
| Solve screen | `#/practice/list-total` (`?task=<plan task id>` from a plan task) | `/practice/:itemId` |
| Wrap-up | `#/practice/list-total/done` | `/practice/:itemId/done` |
| Quick challenge | `#/practice/challenge/list-product` | `/practice/challenge/:itemId` |
| Mixed challenge | `#/practice/mixed/mx-1` | `/practice/mixed/:setId` |
| Upload status | `#/practice/uploads/up-1` | `/practice/uploads/:uploadId` |
| Projects | `#/project` | `/project` |
| New project plan (3 steps) | `#/project/new` | `/project/new` |
| Accepted project | `#/project/pj-cafe` | `/project/:id` |
| Review queue (instructor) | `#/review` | `/review` |
| Settings & privacy | `#/settings` | `/settings` |

## Files

- `index.html`: page shell and font/icon loading (Google Fonts: Atkinson Hyperlegible Next/Mono; Lucide 0.460.0 from unpkg)
- `styles.css`: design tokens and components (dark canvas, thin off-white outlines, stage/state colours)
- `data.js`: sample data shaped with `shared_contracts.md` v1.0 field names (`SelectorResult`, `TaskSpec`, `ProjectSpec`, `HintResponse`, `SkillEstimate`, …)
- `app.js`: hash router, screens, and simulated interactions (jobs, confirmations, review decisions)
- `tutorial.js`: welcome on first sign-in, the ? help menu and the 12-step tour (driver.js 1.3.1, pinned)
- `project.js`: project list, Idea → Questions → Plan wizard (J1/J2 mocked; dates placed by rules) and the accepted plan page
- `reflection.js`: today's tasks, per-task review, follow-up question (R1 mocked) and the no-hints independence check, plus a Knowledge Gap mock
- `planning.js`: Today, Plan, Setup, Milestones, the 4-step wizard, evening check-in, Progress and the planning parts of Settings. A simulated server applies the planning rules (planning_execution_plan.md §7) and mocks the ELM calls E1–E5
- `practice.js`: the Practice area (exercises). A simulated server owns the hint rules and checking, so the screens behave like the spec; solutions and hidden values never sit in `data.js`

## Verification against the project design documents

Each item was checked against the spec text and exercised in a headless Chrome pass (desktop 1440 px and mobile 390 px, no console errors, no horizontal overflow).

### docs/web_design.md acceptance tests

| # | Requirement | Where in the prototype |
|---|---|---|
| 1–2 | Plan tags and selector recommendation | Superseded by `planning_ui.md` v2 (see Planning below); the goal → skill-tags screen and the selector dashboard were replaced |
| 3 | Verified test evidence + graded hints | Superseded for exercises by `practice_spec.md`: hints H0–H4, never the full solution; the model answer appears only after solving (see Practice below) |
| 4 | Untrusted content renders safely; no hidden graders in payloads | All text is HTML-escaped; `data.js` has no reference solutions or hidden tests; note says hidden tests are never shown |
| 5 | Async pending/success/failure/review-required states, no frozen spinner | Generation job and grading job step through `queued → running → succeeded`; *Prototype only* panel previews grader unavailable (503) and uncertain test |
| 6 | Students can't reach instructor review by URL | `#/review` as student shows "Instructor access required", explained as a server-side check |
| 7 | E2E: plan → exercise → run → hint → revise → wrap-up | Plan (Path 2) → suggested practice task → *Practise* → solve → wrap-up → the plan task is ticked automatically |
| 8 | Project milestones + late change request, no forced architecture | Project: M1–M6 DAG with dependencies, M6 change request, "Your design, not ours", only the CLI protocol is fixed |

### Tutorial, Project, Reflection: demo_features_spec.md §4 checklist

`demo_features_spec.md` v1 wins where it changes earlier files: C1 nav order (Today · Plan · Practice · Reflection · Progress · Skills · Project), C2 phone bottom bar (Today · Plan · Practice · Reflect · More), C3 the evening check-in moved into Reflection, C4 suggestions from the independence check on both paths, C5 email + password (no recovery code), C6 the tool drafts project plans. Checked with Playwright at 360 and 1280 px, light and dark: 59 checks, no console errors, no horizontal overflow.

| Requirement | Where in the prototype |
|---|---|
| Welcome on first sign-in; tour runs 12 steps across pages; "Not now" never shows it again; **?** replays it | First app open (or first sign-in) shows Welcome; the ? button left of the theme toggle → *Take the full tour*. The "seen" flag is a stand-in for `students.tutorial_seen_at` |
| "Explain this page" on `/reflection` shows steps 7–8 only | ? → *Explain this page* |
| Project: idea → 3–5 questions → 7-section plan; dates respect the 2-day buffer; **Accept** shows milestones in Plan → Due this week | `#/project` → *Start a project plan*; dates are computed backward from the deadline over free time at the chosen hours per week, with the cramming rule from Planning |
| J1/J2 down → generic questions / empty template; nothing blocks | *Prototype only → ELM down* |
| Reflection: tasks with status; Save gated on required chips; Save closes the plan and updates "N of 5" | `#/reflection` after submitting today's plan |
| Independence check: 3–5 bank items, no hints; self-rating vs result; `Not yet` → suggestion in tomorrow's Step 2 on Path 1 and 2 | *Start check* → results → *Add to tomorrow* → *Simulate next day* → Plan Step 2 "Suggested from last night's check" |
| Knowledge Gap receives `activity_type: "independence_check"` | *Prototype only: events sent to Knowledge Gap* on `#/reflection`; Practice's schedule updates |
| 360 px and 1280 px, light and dark | Phone uses the bottom bar and a bottom-sheet tour card; reduced motion turns tour animation off |

Tour animations (kept simple): the spotlight glides between targets, the card fades and rises, a thin progress bar fills to N/12, the target pulses once, the phone card slides up, and the welcome check mark draws in. Not done: axe audit (no axe in this setup), the Contact/feedback menu item (no team address yet).

### Planning: planning_ui.md §20 acceptance checklist

Screens follow `planning_ui.md` v2; rules follow `planning_execution_plan.md` §7 (`planning_spec.md` v5 wasn't available). The Welcome screen (§3, nickname + recovery code) is deferred to the sign-in work on `/login`. Checked with Playwright at 360 px and 1280 px, light and dark: 81 checks, no console errors, no horizontal overflow, none of the banned words (*fail, wrong, weak, bad, demoted*) on screen.

| Requirement | Where in the prototype |
|---|---|
| Setup → steps 1–4 → evening at 360 and 1280, light and dark | Today *Plan your day* → Step 1 (Read it, busy, priority) → Step 2 → Step 3 → Submit → Step 4 → (clock 18:30) Today *Check in* |
| Paste text → E1 preview → nothing saved until **Save all** | Setup › Deadlines › *Paste text* → *Read it* → editable rows with Keep/Remove; the saved list changes only on *Save all*; nothing found → "Couldn't read that. Fill it in instead." and the Fill in tab |
| Cramming warning when a week's hours exceed free time | Milestones: "Week of 2 Nov: 42 h planned, 39 h free. Spread it out?" plus planned-vs-free bars; buffer and order panels with *Sort by date* |
| Fixture starts at 3/5, reaches 5/5 after both suggestions are resolved | Step 3: *Use this wording* → 4/5, *Split it* → 5/5 (live, `aria-live`) |
| Worked example only on the weakest task, Path 1 only | One WORKED EXAMPLE box on "Revise lecture 5"; none on Path 2 |
| ELM down → every task "Couldn't check", Submit still works | *Prototype only → ELM down*: every card offers Accept / Edit; Submit saves the plan |
| Move only before the planned time; Off day excludes the plan | *Move* disappears once the clock passes a task; *Off day* → notice + *Undo*, and the check-in says "Off day: this plan is not counted." |
| Evening chips: no default; **All as planned** fills; Save disabled until all set | Now in Reflection (C3) |
| 5th qualifying plan unlocks; next day starts at Step 2 | The seeded student has 3 of 5 on target; an on-target check-in shows the unlock message; *Simulate next day* → Plan opens at Step 2 ("Competent path") |
| No secret in the bundle | `server/web_design/` holds sample data only |
| Keyboard-only flow | Every control is a real button/input; tested Step 1 → 2 → 3 with the keyboard |

Also: Path 2 light review with a once-only *Full feedback*; the E4 suggestion card on Today (*Add / Edit / Skip*); *Practise* deep links that auto-tick when the exercise is solved; `.ics` download; optimistic ticks that roll back with "Couldn't reach the server…" (*Prototype only → Network error*); "Waking up the server…" after 3 s; busy-time labels kept only in this browser. Dates use the 2026 calendar, so the spec's "Thu 30 Oct" appears as Thu 29 Oct.

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
- **Reflection is private and low-weight:** "Private" badge; confidence is self-report and "never raises your skill indices"; the evidence opt-in checkbox matches `allow_use_as_learning_evidence`.
- **Human review is append-only:** a decision requires a reason, the receipt records time and reviewer, and later changes create a new decision.
- **Canonical vocabulary:** `assessment_stage` (recall/understanding/transfer), `activity_type`, `approval_status`, `job_status`, `grading_validity` are used as named in the contracts.
- **No invented auth vendor:** the login says the provider isn't chosen yet.
- **Accessibility (WCAG 2.2 AA target):** skip link, focus rings, labelled controls, `aria-live` status for grading and hints, text plus colour for every state, reduced-motion support.

### Known gaps and decisions for the team

- The prototype is plain HTML/JS for review. It is not the Next.js implementation, and nothing here is generated from OpenAPI.
- Sample identities (Sam Rivera, Dr. A. Moreno) and all numbers are synthetic.
- The Render service now also serves `/design/`. Remove the mount in `server/main.py` before production if the team doesn't want it public.
