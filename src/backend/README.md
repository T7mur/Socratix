# Backend — Member F integration, A–E domain modules

Read the [source map](../README.md) and [architecture](../../docs/architect.md). This is a directory scaffold for FastAPI, not a configured Python application.

| Location | Responsibility | Owner |
|---|---|---|
| `app/main.py` (planned) | App creation, dependency composition and router registration | F |
| `app/api/v1/` | Thin authenticated HTTP handlers, one owner per file | See [API ownership](../README.md#api-file-ownership) |
| `app/contracts/` | Canonical Pydantic DTOs, enums and boundary protocols | F, with affected-owner review |
| `app/core/` | Configuration, security, errors and logging | F |
| `app/db/` | SQLAlchemy models, sessions and shared repository adapters | F |
| `app/integrations/elm.py` (planned) | Shared provider adapter | F |
| `app/integrations/grading.py` (planned) | Sandbox client; no local untrusted execution | E |
| `app/modules/<component>/` | Business logic and domain repository interfaces | Component owner |
| `migrations/` | Alembic setup and versioned schema changes | F |
| `workers/` | Persisted job polling/dispatch and handler wiring | F |
| `tests/` | Tests partitioned by tier, then component | Component owners; shared setup F |

Read [shared contracts](../../docs/shared_contracts.md) before adding interfaces. Existing canonical names and public routes take precedence over local convenience. Domain `repository.py` files implement only the module's permitted data access against F-reviewed schema; do not create alternate ORM models or read another module's private tables.

Workers delegate generation, assessment orchestration and evidence updates to the owning domain services. All execution of student and generated reference code goes through the separate grading worker. Long model calls belong in background jobs, not public request handlers.

F will add the Python manifest, package initialisation, entry points and test configuration with the first implemented vertical slice. Shared files are edited through F so separate feature branches can focus on their own folders.
