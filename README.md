# Socratix — Team Development Handbook

The database and catalogue-review foundation now has executable backend/frontend entry points, pending team review. Start with [setup](docs/database_setup.md), [authentication](docs/authentication.md), [implementation/verification](docs/database_implementation.md), and [shared helpers](docs/shared_helpers.md). Remaining tutor/domain integrations are still proposed or scaffolded.

> **Mission:** Help Informatics students become independent problem-solvers through curriculum-aligned skills, verified exercises/projects, evidence-grounded four-stage hints, and independent reassessment. This repository's documents are a **proposed implementation contract**, not completed application code.

**Everyone starts here.** Do not ask your coding agent to build an entire product from the diagram. Assign one owned feature with a precise contract, mock its dependencies, run tests and open a reviewed pull request.

The proposed [skill import bridge runbook](docs/skill_import_bridge.md) covers PDF artifacts →
LLM candidates → durable pending review, reports/storage and real signup verification. See its
[implementation handoff](docs/skill_import_handoff.md) for actual checks and remaining external gates.

The [source map and folder ownership guide](src/README.md) shows the implementation under `src/`, with component guides and separate test/prompt directories. Database/catalogue services are implemented; remaining domain services and external deployments require their own integration work.

## Run and test commands

Commands below use **PowerShell from the repository root**, unless a block explicitly changes
directory. Install Python 3.10+, `uv`, and Node.js 22 with npm. Replace uppercase placeholders
with your own values. Stop a running development server or watcher with Ctrl+C.

Quick links: [setup](#install-and-configure), [servers](#start-the-backend-and-frontend),
[database](#database-and-account-tools), [LLM](#test-the-llm-provider-independently),
[skills](#extract-and-import-skills), [backend tests](#backend-tests-by-component),
[frontend tests](#frontend-tests-and-production-build), [generated files](#generated-contracts-and-documentation).

### Install and configure

```powershell
uv sync --project src/backend --group dev --frozen
npm --prefix src/frontend ci
```

Create root `.env` using [.env.example](.env.example) and `src/frontend/.env.local` using
[its example](src/frontend/.env.local.example). Preserve existing files and secrets. Each
worktree has its own configuration; the root commands here use this checkout's `.env`.

| Component | Required configuration |
|---|---|
| Backend/database tools | `DATABASE_URL`, `SUPABASE_AUTH_URL=https://PROJECT_REF.supabase.co`; `APP_ENV=development` for the examples |
| Privileged operator tools | `MIGRATION_DATABASE_URL` with an authorised operator connection; some tools fall back to `DATABASE_URL`, but role provisioning requires it explicitly |
| LLM requests/import generation | `ELM_BASE_URL`, `ELM_API_KEY`, `ELM_MODEL` or `ELM_MODEL_GENERATION` |
| Frontend | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL=http://localhost:3000`, `API_BASE_URL=http://localhost:8000` in `src/frontend/.env.local` |

SQL URLs must use direct or session pooling on port 5432; percent-encode password characters.
`SUPABASE_AUTH_URL` is the HTTPS Auth origin, not the SQL host. Separate legacy
`SUPABASE_USER/PASSWORD/PORT/DB` values do not replace `DATABASE_URL`. Keep backend secrets
out of `NEXT_PUBLIC_*` variables. See [database setup](docs/database_setup.md) and
[authentication](docs/authentication.md) for permissions and Auth callback configuration.

### Start the backend and frontend

First check database/Auth prerequisites (read-only, no LLM calls):

```powershell
uv run --project src/backend python src/scripts/check_services.py
```

Terminal 1 starts the API with the Windows-compatible PostgreSQL event loop:

```powershell
uv run --project src/backend python src/scripts/serve_backend.py
```

Terminal 2 starts Next.js:

```powershell
npm --prefix src/frontend run dev
```

Open the API documentation at <http://127.0.0.1:8000/docs> and the frontend at
<http://localhost:3000>. Frontend routes include `/register`, `/login`, `/account`, and
the admin-only `/review`. Reuse existing servers on these ports. API startup never migrates
the database or calls the model provider.

### Database and account tools

Inspect the current schema and preview migration SQL:

```powershell
uv run --project src/backend python src/scripts/check_db.py
uv run --project src/backend alembic -c src/backend/alembic.ini current
uv run --project src/backend alembic -c src/backend/alembic.ini upgrade head --sql
```

After the required migration/owner review, apply migrations to the configured development
project and optionally seed synthetic pending catalogue candidates. **These commands write
to the database.** Seeding creates no Auth accounts and approves no candidates.

```powershell
uv run --project src/backend python src/scripts/bootstrap_db.py --target development
uv run --project src/backend python src/scripts/seed_demo.py --target development
```

Complete signup and email confirmation in the browser, visit `/account`, then verify the
new student profile with operator credentials:

```powershell
uv run --project src/backend python src/scripts/check_registration.py --email YOUR_TEST_EMAIL --target development
```

An authorised operator can grant an existing profile admin access with an audit reason.
Both UUIDs must identify existing application profiles. This changes permissions:

```powershell
uv run --project src/backend python src/scripts/grant_role.py --target development --user-id USER_UUID --actor-id OPERATOR_UUID --role admin --reason "Authorised catalogue reviewer"
```

### Test the LLM provider independently

These commands need only LLM configuration, with no API server, frontend, or database.
They send real requests and use the provider's quota/billing rules.

```powershell
uv run --project src/backend python src/scripts/llm_request.py --prompt "Reply with OK."
```

Override the generation model or timeout for one request, or read a UTF-8 prompt file:

```powershell
uv run --project src/backend python src/scripts/llm_request.py --prompt "Reply with OK." --model YOUR_MODEL_ID --timeout 120
uv run --project src/backend python src/scripts/llm_request.py --prompt-file PATH_TO_PROMPT.txt
uv run --project src/backend python src/scripts/llm_request.py --help
```

For JSON output, create a local schema and pass it to the same CLI:

```powershell
[System.IO.File]::WriteAllText((Join-Path (Get-Location) 'llm-test.schema.json'), '{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}')
uv run --project src/backend python src/scripts/llm_request.py --prompt "Return an answer field containing OK." --json-schema llm-test.schema.json
```

`ELM_MODEL_GENERATION` and `ELM_MODEL_REVIEW` fall back to `ELM_MODEL`.
`ELM_TIMEOUT_SECONDS` defaults to 60; `ELM_MAX_ATTEMPTS` defaults to 3.
Set `ELM_BASE_URL` to the provider's API prefix without a trailing backslash.
Free models can still have daily quotas and rate limits; switching free models may not
resolve an account quota. See [LLM integration](docs/llm_integration.md) for other flags.

### Extract and import skills

Offline PDF extraction needs no provider or database. Use `permitted` only with recorded
permission to process the source. The output directory must be new; choose another name
if it already exists. Exit 2 can mean artifacts were written but require review.

```powershell
uv run --project src/backend python -m app.modules.skill_generation.cli data/3664191.pdf --rights-status permitted --section AI-ML --output outputs/cs2023-bridge-check
```

Validate the artifacts and database prerequisites without model calls or database writes:

```powershell
uv run --project src/backend python src/scripts/import_skills.py --artifacts outputs/cs2023-bridge-check --section AI-ML --actor-id REVIEWER_UUID --target development --permission-ref YOUR_PERMISSION_RECORD --dry-run
```

The actor must be an active admin and reviewed migration 0006 must be installed.
A successful dry-run does not test provider access. To generate candidates and save pending
revisions, run without `--dry-run` (real provider requests and database writes):

```powershell
uv run --project src/backend python src/scripts/import_skills.py --artifacts outputs/cs2023-bridge-check --section AI-ML --actor-id REVIEWER_UUID --target development --permission-ref YOUR_PERMISSION_RECORD
```

Repeat that exact command to resume after the original process has stopped. Successful
checkpoints are reused; input/model configuration changes create a different fingerprint.
Human review is required before publication. Repeat `--section` to select multiple units.

Monitor an existing import in another terminal, or regenerate its local report:

```powershell
uv run --project src/backend python src/scripts/import_skills.py --watch-run latest --actor-id REVIEWER_UUID --target development
uv run --project src/backend python src/scripts/import_skills.py --report-run RUN_UUID --actor-id REVIEWER_UUID --target development
```

Watch/report commands make no model calls or database writes; they can write the local report.
Reports live at `outputs/skill-imports/RUN_UUID/report.json`. Use `--watch-run RUN_UUID` to
watch a specific run, or `--no-progress` to suppress progress output. Ctrl+C stops only the
watcher. See the [import runbook](docs/skill_import_bridge.md) for recovery and exit codes.

### Backend tests by component

Run the full suite or the service-free unit/contract suites (provider calls are mocked):

```powershell
uv run --project src/backend pytest src/backend/tests -q
uv run --project src/backend pytest src/backend/tests/unit src/backend/tests/contract -q
# Static checks (report only; no automatic fixes)
uv run --project src/backend ruff check src/backend src/scripts
```

Run an individual component, file, or test:

```powershell
# LLM gateway and operator CLI
uv run --project src/backend pytest src/backend/tests/unit/infrastructure/test_llm.py src/backend/tests/contract/infrastructure/test_llm_contract.py -q
# Configuration, authentication and HTTP permissions
uv run --project src/backend pytest src/backend/tests/unit/infrastructure/test_config_and_safety.py src/backend/tests/unit/infrastructure/test_security.py src/backend/tests/unit/infrastructure/test_http_permissions.py -q
# Canonical DTOs/OpenAPI
uv run --project src/backend pytest src/backend/tests/contract/infrastructure/test_contracts.py -q
# Skill extraction, candidates, import orchestration and progress
uv run --project src/backend pytest src/backend/tests/unit/skill_generation src/backend/tests/contract/skill_generation -q
# Offline PDF CLI integration (no database required)
uv run --project src/backend pytest src/backend/tests/integration/skill_generation/test_pdf_cli.py -q
# Select tests by name; use FILE.py::TEST_NAME for one exact test
uv run --project src/backend pytest src/backend/tests/unit/skill_generation/test_import_orchestration.py -k dry_run -q
```

Database-backed integration tests skip unless explicitly enabled. They **drop and rebuild
the `socratix` schema**: use a separate disposable database, never the normal application
project. The test URL needs the `postgresql+psycopg://` driver form. For hosted Supabase:

```powershell
$env:TEST_DATABASE_URL = 'postgresql+psycopg://postgres:ENCODED_PASSWORD@db.DISPOSABLE_PROJECT_REF.supabase.co:5432/postgres?sslmode=require'
$env:SOCRATIX_TEST_PROJECT_REF = 'DISPOSABLE_PROJECT_REF'
$env:SOCRATIX_TEST_RESET = '1'
# Database repositories, append-only history and permissions
uv run --project src/backend pytest src/backend/tests/integration/infrastructure -q
# Durable skill import, transactions and concurrency
uv run --project src/backend pytest src/backend/tests/integration/skill_generation/test_import_bridge.py -q
Remove-Item Env:TEST_DATABASE_URL, Env:SOCRATIX_TEST_PROJECT_REF, Env:SOCRATIX_TEST_RESET
```

These integration tests need only the disposable SQL target; provider requests are mocked.
On Windows, if pytest reports that psycopg cannot use the Proactor event loop, run the same
test paths through a selector-loop wrapper:

```powershell
uv run --project src/backend python -c "import asyncio, pytest; asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy()); raise SystemExit(pytest.main(['src/backend/tests/integration', '-q']))"
```

### Frontend tests and production build

```powershell
# All unit/component tests, then individual areas
npm --prefix src/frontend test
npm --prefix src/frontend test -- tests/unit
npm --prefix src/frontend test -- tests/component/review.test.tsx
npm --prefix src/frontend test -- tests/unit/auth.test.ts
# Build before typecheck so generated Next.js route types exist
npm --prefix src/frontend run build
npm --prefix src/frontend run typecheck
```

Browser tests require an installed Playwright browser and a production build. From the
repository root, install Chromium once and run the suite:

```powershell
Push-Location src/frontend
npx playwright install chromium
Pop-Location
npm --prefix src/frontend run build
npm --prefix src/frontend run test:e2e
# One browser test file or matching test title
npm --prefix src/frontend run test:e2e -- tests/e2e/auth.spec.ts
npm --prefix src/frontend run test:e2e -- --grep "review requires authentication"
```

Playwright starts/reuses a production Next.js server at `http://localhost:3100`.
The current browser suite checks forms, validation, redirects and layout; it does not prove
real email delivery or authenticated DB workflows. Test signup manually as described above.
To serve the production build yourself on the normal frontend port:

```powershell
npm --prefix src/frontend run start
```

### Generated contracts and documentation

Regenerate OpenAPI before client types; never hand-edit generated TypeScript:

```powershell
uv run --project src/backend python src/scripts/export_openapi.py
npm --prefix src/frontend run generate:types
uv run --project src/backend python src/scripts/generate_schema_docs.py
uv run --project src/backend python src/scripts/check_documentation.py
```

These tools write the OpenAPI snapshot, generated client and database dictionary, then
check implementation-guide links. They need no live database or model. Review generated
diffs against the shared-contract and migration review rules.

### Components without executable entry points

Exercise generation, project generation, selector, knowledge-gap estimation, planning/reflection,
hinting, the background job worker and the isolated grading worker remain scaffolded in this
checkout. There are no runnable domain services or populated component test suites for them
yet. Their specifications and source locations are linked in the ownership table below;
persistence tests do not demonstrate implemented tutor algorithms or a safe grading sandbox.

For command failures, inspect `$LASTEXITCODE` immediately after the command. Pytest exit 0
means collected tests passed, but check the summary for skipped database tests. The LLM CLI
uses 0 for success, 1 for provider/output failure and 2 for configuration/input failure.

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
