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
| Exercise | `#/learn/stock-status` | `/learn/[activityId]` |
| Project | `#/projects/cafe-terminal` | `/projects/[projectId]` |
| Reflection | `#/reflection` | `/reflection` |
| Review queue (instructor) | `#/review` | `/review` |
| Settings & privacy | `#/settings` | `/settings` |

## Files

- `index.html`: page shell and font/icon loading (Google Fonts: Atkinson Hyperlegible Next/Mono; Lucide 0.460.0 from unpkg)
- `styles.css`: design tokens and components (dark canvas, thin off-white outlines, stage/state colours)
- `data.js`: sample data shaped with `shared_contracts.md` v1.0 field names (`SelectorResult`, `TaskSpec`, `ProjectSpec`, `HintResponse`, `SkillEstimate`, …)
- `app.js`: hash router, screens, and simulated interactions (jobs, hints, reveal, confirmations, review decisions)

## Verification against the project design documents

Each item was checked against the spec text and exercised in a headless Chrome pass (desktop 1440 px and mobile 390 px, no console errors, no horizontal overflow).

### docs/web_design.md acceptance tests

| # | Requirement | Where in the prototype |
|---|---|---|
| 1 | Typed plan → proposed tags → student confirms/rejects; only confirmed IDs reach the selector | Plan: checkboxes, *Reject all*, *Confirm N tags* (disabled at 0), "Only confirmed tags reach the selector" |
| 2 | Recommendation shows weighted reasons, policy version and override; ranking ≠ AI always right | Dashboard: 0.40/0.35/0.25 diagram, `selector-v1`, *Choose something else* → Start anyway / Integrated prep / Quick diagnostic, alternatives with *Choose* |
| 3 | Verified test evidence + four-stage hints; stage 4 warns before reveal | Exercise: T1–T4 with requirement IDs; hint ladder 1→4; reveal needs the "won't count as independently solved" checkbox |
| 4 | Untrusted content renders safely; no hidden graders in payloads | All text is HTML-escaped; `data.js` has no reference solutions or hidden tests; note says hidden tests are never shown |
| 5 | Async pending/success/failure/review-required states, no frozen spinner | Generation job and grading job step through `queued → running → succeeded`; *Prototype only* panel previews grader unavailable (503) and uncertain test |
| 6 | Students can't reach instructor review by URL | `#/review` as student shows "Instructor access required", explained as a server-side check |
| 7 | E2E: plan → select → exercise → submit → hint → revise → reflect → skill evidence | Plan → Dashboard *Start* → Exercise (submit, hints, fix `<=` → 4/4) → *Reflect on this attempt* → Skills |
| 8 | Project milestones + late change request, no forced architecture | Project: M1–M6 DAG with dependencies, M6 change request, "Your design, not ours", only the CLI protocol is fixed |

### Product rules (AGENTS.md, shared_contracts.md, component specs)

- **Indices never shown as probabilities:** "priority index · uncalibrated heuristic, not a mastery probability"; skill indices are labelled uncalibrated; `null` shows as "n/a" or hatched "insufficient evidence", never zero.
- **Hint levels recorded; stage 4 makes the attempt assisted:** *Help used* and *Independent evidence* stay separate from *Correctness*; after a reveal, a pass is labelled "assisted solution, not independent mastery".
- **Hints don't invent locations:** no line is highlighted as the error; level 1 points at the failing input only.
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
