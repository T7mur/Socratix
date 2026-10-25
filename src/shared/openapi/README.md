# OpenAPI snapshots — Member F

Reserved for schema snapshots generated from the implemented FastAPI application. No snapshot has been generated yet.

Public contract changes require affected-owner review, updated backend contract tests, regenerated snapshots and regenerated frontend types in the same PR. Do not hand-author a snapshot to imply routes already exist.

## Export and client generation

From the repository root run `uv run --project src/backend python src/scripts/export_openapi.py`, then run `npm run generate:types` in `src/frontend`. The committed snapshot covers implemented identity/catalogue routes only. CI rejects drift; never hand-edit generated TypeScript.
