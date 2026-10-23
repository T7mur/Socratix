# Deployment — Member F

Reserved for deployment manifests and service configuration once the application is implemented. See [architecture](../../docs/architect.md) for the deployment and integration checklist.

| Service | Source/build root | Responsibility |
|---|---|---|
| Next.js on Vercel | `src/frontend/` | Student and reviewer UI |
| FastAPI on Render | `src/backend/` | Authenticated public API |
| Generation/background worker | `src/backend/` | Job dispatch and trusted generation orchestration |
| Isolated grader | `src/grading-worker/` | Execute untrusted code under reviewed isolation |

The backend and generation worker may share a source tree but have separate process entry points. The grader has its own image/dependencies and security boundary. Build contexts must include only required resources; prompts are server-only. Keep secret values in deployment secret stores.

GitHub Actions workflow files must remain at the repository root in `.github/workflows/`, with paths pointing under `src/`. Platform configuration that requires another location should be placed there and referenced here. This folder does not provision Render, Vercel, Aiven, storage or a sandbox.
