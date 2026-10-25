# Source map

Implemented database/catalogue foundation: [setup](../docs/database_setup.md), [Auth](../docs/authentication.md), [handoff](../docs/database_implementation.md), [shared helpers](../docs/shared_helpers.md). Read the helper catalogue and search existing code before adding functions. The framework/dependency/migration and sample review entry points are executable; unimplemented domain components remain scaffolded.

Start with [the team assignments](../README.md), [architecture](../docs/architect.md), and [shared contracts](../docs/shared_contracts.md). This tree contains the database/review foundation alongside planned domain components. README files explain responsibilities; `.gitkeep` files preserve empty directories in Git and can be removed when real files arrive.

## Find your component

| Owner | Component | Implementation | Specification |
|---|---|---|---|
| A / jk | Curriculum and approved skill graph | [skill_generation](backend/app/modules/skill_generation/README.md) | [Skill generation](../docs/skill_generation.md) |
| B | Exercise generation and QA | [exercise_generation](backend/app/modules/exercise_generation/README.md) | [Exercises](../docs/exercise_generation.md) |
| C | Project generation and milestones | [project_generation](backend/app/modules/project_generation/README.md) | [Projects](../docs/project_generation.md) |
| D | Activity selection | [selector](backend/app/modules/selector/README.md) | [Selector](../docs/exercise_project_selector.md) |
| D | Evidence, gaps and retention | [knowledge_gap](backend/app/modules/knowledge_gap/README.md) | [Knowledge gaps](../docs/knowledge_gap_identification.md) |
| D | Planning and reflection | [planning](backend/app/modules/planning/README.md) | [Planning](../docs/planning_reflection_to_skills.md) |
| E | Tutor and hint progression | [hinting](backend/app/modules/hinting/README.md) | [Hinting](../docs/hinting.md) |
| E | Isolated code grading | [grading-worker](grading-worker/README.md) | [Grading requirements](../docs/hinting.md) |
| F | API composition and infrastructure | [backend](backend/README.md) | [Architecture](../docs/architect.md), [database](../docs/database.md) |
| F | Learning workspace | [frontend](frontend/README.md) | [Web design](../docs/web_design.md) |

## Folder structure

```text
src/
|-- backend/                         FastAPI application (trusted server code)
|   |-- app/
|   |   |-- api/v1/                   Separate route files, owners listed below
|   |   |-- contracts/                F: canonical DTOs, enums and protocols
|   |   |-- core/                     F: settings, auth, errors and logging
|   |   |-- db/                       F: models, sessions and shared DB adapters
|   |   |-- integrations/             ELM adapter (F), grading transport (E)
|   |   `-- modules/
|   |       |-- skill_generation/     A: source import, graph and review
|   |       |-- exercise_generation/  B: frozen task specs and private QA
|   |       |-- project_generation/   C: project specs, milestones and rubrics
|   |       |-- selector/             D: eligibility, ranking and explanations
|   |       |-- knowledge_gap/        D: evidence, estimates and retention
|   |       |-- planning/             D: learner-confirmed plans and reflections
|   |       `-- hinting/              E: grounded four-stage assistance
|   |-- migrations/versions/          F: reviewed Alembic migrations
|   |-- workers/                      F: job dispatch; domain logic stays in modules
|   `-- tests/
|       |-- unit/<component>/         Component owner: isolated logic and mocks
|       |-- contract/<component>/     Component owner: canonical DTO compatibility
|       `-- integration/<component>/  Component owner: authorised workflows
|                                    Each tier also has an infrastructure/ folder (F)
|-- frontend/                        F: separately built Next.js application
|   |-- src/
|   |   |-- app/                      Pages, layouts and route composition
|   |   |-- components/               UI grouped by learning feature
|   |   |-- hooks/                    UI state and polling
|   |   |-- lib/{api,auth,validation}/ API client, session guards and form validation
|   |   `-- types/generated/          Generated from FastAPI OpenAPI; never hand-edit
|   `-- tests/{unit,component,e2e}/
|-- grading-worker/                  E: separately deployed isolated executor
|   |-- runner/                      Sandbox, execution limits and private reports
|   `-- tests/                       Isolation and grading checks
|-- shared/                          Cross-service resources, not another code layer
|   |-- prompts/                     One owner per versioned prompt directory
|   |-- fixtures/                    F: reviewed synthetic contract fixtures
|   `-- openapi/                     F: generated OpenAPI snapshots
|-- scripts/                         F: repository-wide development/integration tools
`-- deployment/                      F: service deployment configuration and notes
```

## Work without collisions

1. Implement business logic inside your module. Keep its API handler thin. Use the file names in your component guide; add real files as needed rather than empty functions.
2. Keep tests in `backend/tests/{unit,contract,integration}/<component>/` and test-only fakes beside those tests. The `infrastructure/` folders and shared test configuration belong to F. Grader and frontend tests stay with their services.
3. Keep versioned prompt templates in your assigned `shared/prompts/` directory. Use F's ELM adapter; do not create a second provider client.
4. Exchange the canonical DTOs through service/repository interfaces. Do not import another module's private helpers or access its private tables. Mock these boundaries while developing independently.
5. F connects modules in `backend/app/main.py`, registers routers, composes worker handlers and maintains shared configuration. Those files will be created with the implementation. Request integration wiring through F rather than editing a common registry in every feature branch.
6. Propose public DTO, protocol and DB changes for F and affected consumers to review. F owns migrations and generated client/snapshot updates. A directory boundary does not replace review or runtime authorisation.

### API file ownership

Paths below are relative to `src/backend/app/api/v1/`. The identity/review route subset is implemented; remaining domain routes are planned. Exact routes remain defined in the shared contracts.

| Owner | Route files |
|---|---|
| A | `skills.py` |
| B | `exercises.py` |
| C | `projects.py` |
| D | `plans.py`, `reflections.py`, `selection.py`, `students.py` |
| E | `submissions.py`, `hints.py` |
| F | Router registration, `jobs.py`, `reviews.py`; `activities.py` delegates to B/C student-safe readers |
| D + E, F wires | Reassessment scheduling and grading; agree the handler during integration |

`backend/app/integrations/elm.py` belongs to F; `backend/app/integrations/grading.py` belongs to E. Both names are reserved for the adapters in the component specifications.

## Paths and service boundaries

All implementation paths are repository-relative and begin with `src/`. The earlier `backend/`, `frontend/`, `grading-worker/`, `shared/` and `scripts/` layout now lives under that prefix. Python imports within the backend still use `app...`; `src` is a repository container, not a shared Python package. Use `backend` and `frontend` consistently instead of `back-end` and `front-end`.

The backend, frontend and grading worker have separate dependency manifests, build contexts and entry points when implemented. Deploy the web from `src/frontend`, the API/generation worker from `src/backend`, and grading from `src/grading-worker`. Root GitHub workflows remain in `.github/workflows/` and point at these locations.

`shared` means reviewed development resources, not public assets. Never import its prompts or private test fixtures into the frontend. Runtime hidden tests, reference solutions, learner submissions and sandbox traces belong in protected storage, not this source scaffold or `frontend/public/`. The API may enqueue grading but may not execute student or generated reference code. A separate folder alone does not provide sandbox isolation.

The root `docs/` remains the engineering specification, and `data/` remains separate source material. No service integration, schema or safe runner is implemented by this scaffold.
