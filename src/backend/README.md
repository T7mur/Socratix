# Backend — Member F integration, A–E domain modules

Implemented database/catalogue foundation: [setup](../../docs/database_setup.md), [Auth](../../docs/authentication.md), [handoff](../../docs/database_implementation.md), [shared helpers](../../docs/shared_helpers.md). Read the helper catalogue and search existing code before adding functions. The framework/dependency/migration and sample review entry points are executable; unimplemented domain components remain scaffolded.

Read the [source map](../README.md) and [architecture](../../docs/architect.md). The database/review FastAPI application is configured; domain algorithms remain separate integrations.

| Location | Responsibility | Owner |
|---|---|---|
| `app/main.py` | App creation, dependency composition and router registration | F |
The shared LLM gateway, LLM-only settings and minimal FastAPI lifespan composition are
implemented on `jk/llm_gateway`. Other services in this main-based worktree remain scaffolded.
See [LLM setup and standalone CLI](../../docs/llm_integration.md) for locked dependency
installation, examples, behaviour and integration notes for the separate database branch.

Read the [source map](../README.md) and [architecture](../../docs/architect.md). The gateway and app lifecycle run; domain routes and persistence remain planned.

| Location | Responsibility | Owner |
|---|---|---|
| `app/main.py` | App creation and gateway lifecycle; domain router registration planned | F |
| `app/api/v1/` | Thin authenticated HTTP handlers, one owner per file | See [API ownership](../README.md#api-file-ownership) |
| `app/contracts/` | Canonical Pydantic DTOs, enums and boundary protocols | F, with affected-owner review |
| `app/core/` | Configuration, security, errors and logging | F |
| `app/db/` | SQLAlchemy models, sessions and shared repository adapters | F |
| `app/integrations/elm.py` | Shared provider adapter | F |
| `app/integrations/grading.py` (planned) | Sandbox client; no local untrusted execution | E |
| `app/modules/<component>/` | Business logic and domain repository interfaces | Component owner |
| `migrations/` | Alembic setup and versioned schema changes | F |
| `workers/` | Persisted job polling/dispatch and handler wiring | F |
| `tests/` | Tests partitioned by tier, then component | Component owners; shared setup F |

Read [shared contracts](../../docs/shared_contracts.md) before adding interfaces. Existing canonical names and public routes take precedence over local convenience. Domain `repository.py` files implement only the module's permitted data access against F-reviewed schema; do not create alternate ORM models or read another module's private tables.

Workers delegate generation, assessment orchestration and evidence updates to the owning domain services. All execution of student and generated reference code goes through the separate grading worker. Long model calls belong in background jobs, not public request handlers.

<<<<<<< HEAD
The database/review slice includes the Python manifest, package initialisation, entry points and test configuration. Shared files are edited through F so separate feature branches can focus on their own folders.
=======
The Python manifest, package initialisation, minimal app entry point and gateway tests are implemented. Shared files are edited through F so separate feature branches can focus on their own folders.
>>>>>>> jk/llm_gateway
