# Isolated grading worker — Member E

[Grading and hinting requirements](../../docs/hinting.md) · [Architecture](../../docs/architect.md)

This service is separate from FastAPI and the generation job worker. It is the only execution boundary for student code and model-generated references. A directory scaffold is not a safe sandbox implementation.

| Planned file / folder | Responsibility |
|---|---|
| `runner/sandbox.py` | Per-job sandbox lifecycle and isolation |
| `runner/execute.py` | Execution inside the approved isolation boundary |
| `runner/limits.py` | CPU, memory, time, process, filesystem and network limits |
| `runner/report.py` | Private, version-linked grading and verification reports |
| `tests/` | Grading correctness and isolation abuse cases |
| `Dockerfile` and dependency manifest | Separate service build, added after isolation design review |

E owns this service, the backend `SandboxProtocol` client in `src/backend/app/integrations/grading.py`, and hinting. F reviews shared protocol/schema changes and deployment wiring. The frontend and public API never import `runner`.

Test timeouts, process/fork abuse, filesystem access, imports/network attempts, malicious code and invalid test artifacts. The runner must not receive ELM keys, application DB credentials or unrelated learner data. Keep reports/private traces distinct from student-safe feedback. Network isolation, authentication and resource controls must be implemented and reviewed before enabling execution.
