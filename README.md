# Socratix — Team Development Handbook

The database and catalogue-review foundation now has executable backend/frontend entry points, pending team review. Start with [setup](docs/database_setup.md), [authentication](docs/authentication.md), [implementation/verification](docs/database_implementation.md), and [shared helpers](docs/shared_helpers.md). Remaining tutor/domain integrations are still proposed or scaffolded.

> **Mission:** Help Informatics students become independent problem-solvers through curriculum-aligned skills, verified exercises/projects, evidence-grounded four-stage hints, and independent reassessment. This repository's documents are a **proposed implementation contract**, not completed application code.

**Everyone starts here.** Do not ask your coding agent to build an entire product from the diagram. Assign one owned feature with a precise contract, mock its dependencies, run tests and open a reviewed pull request.

The proposed [skill import bridge runbook](docs/skill_import_bridge.md) covers PDF artifacts →
LLM candidates → durable pending review, reports/storage and real signup verification. See its
[implementation handoff](docs/skill_import_handoff.md) for actual checks and remaining external gates.

The [source map and folder ownership guide](src/README.md) shows the implementation under `src/`, with component guides and separate test/prompt directories. Database/catalogue services are implemented; remaining domain services and external deployments require their own integration work.

## 1. Team responsibilities and where to read

| Owner (replace placeholders with actual teammates) | Feature responsibility | Read before writing code | Owns |
|---|---|---|---|
| jk — Curriculum/Graph | Extract skills and learning outcomes from CS2023; review skill tree/prerequisites | [`docs/skill_generation.md`](docs/skill_generation.md) | `src/backend/app/modules/skill_generation/` |
| Member B — Exercises | Single-skill / multi-skill exercise generation and verification | [`docs/exercise_generation.md`](docs/exercise_generation.md) | `src/backend/app/modules/exercise_generation/` |
| Member C — Projects | Project generation, milestones and quality gates | [`docs/project_generation.md`](docs/project_generation.md) | `src/backend/app/modules/project_generation/` |
| Member D — Personalisation | Selector, gap estimates, planning and reflection skill tagging | [`docs/exercise_project_selector.md`](docs/exercise_project_selector.md), [`docs/knowledge_gap_identification.md`](docs/knowledge_gap_identification.md), [`docs/planning_reflection_to_skills.md`](docs/planning_reflection_to_skills.md) | `src/backend/app/modules/selector/`, `knowledge_gap/`, `planning/` |
| Member E — Tutor/Grading | Execution-backed grading, four-stage hints, diagnosis | [`docs/hinting.md`](docs/hinting.md) | `src/backend/app/modules/hinting/`, `src/grading-worker/` |
| Member F — Integration | FastAPI wiring, Postgres schema, Next.js, deployment, shared API contracts | [`docs/architect.md`](docs/architect.md), [`docs/database.md`](docs/database.md), [`docs/web_design.md`](docs/web_design.md), [`docs/shared_contracts.md`](docs/shared_contracts.md) | `src/backend/app/contracts/`, `src/backend/app/db/`, `src/frontend/`, infrastructure |

Assignments are **role placeholders**, not confirmed names. Member F coordinates contract changes but is not automatically the only person who may implement a migration. Its approval and affected owners' approval are required.

## 2. Documentation reading order

1. This root `README.md` — responsibilities, Git workflow, and coding-agent setup.
2. Root [`AGENTS.md`](AGENTS.md) — instructions shared by all coding agents.
3. [`docs/architect.md`](docs/architect.md) — end-to-end flow, boundaries, chosen stack, deployment.
4. [`docs/shared_contracts.md`](docs/shared_contracts.md) — **normative API/data contracts**, status enums and payload IDs.
5. Your component MD file(s), listed above. Read directly dependent owners' documents as necessary.
6. [`docs/changes/CHANGELOG.md`](docs/changes/CHANGELOG.md), then [`docs/adr/README.md`](docs/adr/README.md) for consequential decisions.

## 3. Branch-per-feature Git workflow (required)

Each feature, fix, experiment or documentation change gets its **own branch**. Never commit directly to `main`. Our naming convention is `<INITIALS>/<feature_name>` using lowercase snake_case for the feature. **Joshua Kwong → `jk`**. Examples: `jk/skill_extraction`, `jk/exercise_generator`, `jk/fix_selector_weights`. Other members use their own initials; resolve collisions by agreeing on unique prefixes.

```bash
git switch main
git pull --ff-only origin main
git switch -c jk/skill_extraction
# Implement the scoped feature, tests, and documentation updates
git add .
git commit -m "feat(skills): extract approved curriculum outcomes"
git push -u origin jk/skill_extraction
# Open a pull request into main and request review
```

After merging, create a **new** branch from the updated `main` for the next feature. Keep unrelated features in separate branches and PRs. Do not force-push others' branches. If working on two features concurrently, use separate branches or Git worktrees.

Pull request minimum: objective, owner, linked spec(s), input/output contracts, tests, screenshots when UI changes, design changes (before → after), reviewers and unresolved risks. At least one teammate reviews before merge; contract changes additionally need Member F and affected-owner approval. GitHub's recommended [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow) describes feature branches and PRs.

## 4. Mandatory documentation and design change control

**Rule:** If the planned behaviour or design changes, **update the corresponding Markdown specification AND record the change before → after** in `docs/changes/CHANGELOG.md`. The same PR must contain code, documentation, and relevant tests.

- **Local behaviour change:** update `docs/<component>.md` and log the before/after.
- **System flow or module responsibilities:** also update `docs/architect.md`.
- **Request/response DTO, enum, endpoint or call sequence:** also update `docs/shared_contracts.md`, API/OpenAPI schemas, dependent client types, and contract tests; obtain affected-owner review.
- **DB schema/migration:** also update `docs/database.md` and migrations; coordinate via Member F.
- **Frontend interaction/design:** also update `docs/web_design.md`.
- **Major, hard-to-reverse choice:** create an [Architecture Decision Record](docs/adr/README.md) in addition to the before/after log. Accepted ADRs are preserved, not silently rewritten; supersede them with a new ADR.

Do **not** log mere spelling, formatting, or comment edits as design changes; Git history and PR descriptions are enough. Never retrospectively claim a proposed design was accepted. Example format:

```markdown
### 2026-10-23 — Exercise verification policy (Proposed)
Owner: Member B | Branch: jk/exercise_generator | PR: #TBD
Affected: docs/exercise_generation.md, docs/shared_contracts.md
Before: All generated questions publish after reference tests pass.
After: Require reference tests, boundary cases, and unresolved-ambiguity review before release.
Why: A reference solution and generated tests can agree on the same wrong assumption.
Impact: Task status enum and task-generation contract tests change.
Reviewers: Member F and Member B | Decision: pending
```

## 5. How to prompt your coding agent

Open a **new coding-agent task for one feature**. Paste this template and fill every placeholder:

```text
You are implementing Socratix in branch <INITIALS>/<feature_name>.
Ownership: <Member/feature>. Goal: <one narrow deliverable>.
Read root README.md, AGENTS.md, docs/architect.md, docs/shared_contracts.md,
and docs/<owned_component>.md before modifying code.
Implement only <owned paths> and tests; use mocks at unfinished dependencies.
Use exactly the canonical API/DTO names and status transitions.
Read docs/shared_helpers.md and search for reusable functions before adding code;
update the catalogue in the same PR and explain reuse decisions in the handoff.
If the existing design needs to change: DO NOT silently change code.
Propose a before → after entry in docs/changes/CHANGELOG.md; update the
corresponding component MD, shared contracts/architecture if affected;
add an ADR for major choices. Mark the proposal as pending review.
Never autonomously approve academic policies or cross-component contracts.
Acceptance criteria: <tests, functional behaviour, error cases>.
Deliver: implementation, tests, updated MD and log (if applicable),
and a PR handoff listing changed paths and any unresolved risks.
Do not claim ELM, DB, or sandbox execution works without running tests.
```

For **Member A**, e.g., set the goal to “extract candidate skill IDs + source references + prerequisites from a fixed CS2023 fixture and return the canonical `ApprovedSkillGraph` with human-review status.” Never ask for a generic “build Socratix” prompt.

## 6. Stack and safety

- **Next.js + TypeScript → Vercel**; **FastAPI → Render**; **Supabase PostgreSQL → SQLAlchemy/Alembic**; **University ELM API** through the shared server-side client.
- The ELM endpoint/model capabilities need authenticated verification; do not assume OpenAI SDK features are all supported.
- Student and generated code runs only in isolated grading infrastructure, not the FastAPI process. Private tests/solutions must never be returned to the browser.
- The initial selector uses **40% planning, 35% gaps, 25% retention** (configurable, unvalidated). Gap estimates and student confidence are provisional; manual review is required where specified. RL is future research, not initial implementation.

## 7. Before opening a PR

- [ ] Working on a dedicated `<INITIALS>/<feature_name>` branch based on updated `main`.
- [ ] Consulted architecture, contracts and component document.
- [ ] Changed code and contract tests together; public schemas updated consistently.
- [ ] Any design deviation recorded **before → after**, affected component MD updated, ADR added if material.
- [ ] Necessary owners reviewed shared changes; no hidden test/solution or API key leaks.
- [ ] CI/tests pass, demo/verification evidence and caveats included.

For detailed ownership and implementation requirements consult the component docs; the root `AGENTS.md` also enforces this workflow.


https://openrouter.ai/models?max_price=0&output_modalities=text
https://docs.api.nvidia.com/nim/reference/llm-apis
https://elm.edina.ac.uk/swagger-ui/index.html
https://information-services.ed.ac.uk/computing/elm/elm_competence_centre/elm-models-available-through-the-api
