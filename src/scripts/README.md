# Repository tooling — Member F

Implemented database/catalogue foundation: [setup](../../docs/database_setup.md), [Auth](../../docs/authentication.md), [handoff](../../docs/database_implementation.md), [shared helpers](../../docs/shared_helpers.md). Read the helper catalogue and search existing code before adding functions. The framework/dependency/migration and sample review entry points are executable; unimplemented domain components remain scaffolded.

Reserve this folder for integration tools such as approved curriculum import, synthetic demo seeding, OpenAPI export and TypeScript client generation. Bootstrap, connectivity, synthetic seeding, role provisioning and schema/type export commands are implemented; see the setup guide.
Reserve this folder for integration tools such as approved curriculum import, synthetic demo seeding, OpenAPI export and TypeScript client generation. The LLM request tool below is implemented; other tooling remains planned.

Component-specific helpers stay with their component. F maintains tools that coordinate several services so feature branches do not each invent a generator or seed format. Use repository-relative paths under `src/`, and document required working directories when adding a command.

Import and seed tools must preserve human approval and immutable versions. Never run student/reference code in these scripts or embed service credentials.

## Standalone LLM request

For the merged PDF → gateway → pending review workflow, see [bridge runbook](../../docs/skill_import_bridge.md).
`import_skills.py` supports validated artifact import, dry-run, resume and report regeneration.
It now displays chunk/unit progress on stderr (`--no-progress` disables it). To monitor an
existing run without restarting or making provider calls, use `--watch-run latest` or a run
UUID with the existing `--actor-id` and `--target` options. See the bridge runbook.
`check_services.py` and `check_registration.py` make read-only credential-safe checks.
`serve_backend.py` configures the Windows-compatible event loop before starting the local API.

Install from the repository root with `uv sync --project src/backend --group dev`.
Configure `ELM_BASE_URL`, `ELM_API_KEY`, `ELM_MODEL` in the ignored root `.env`.

```powershell
src/backend/.venv/Scripts/python.exe src/scripts/llm_request.py --prompt "Explain Python generators briefly."
```

No FastAPI server, database or Supabase configuration is needed. Use `--prompt-file` for
UTF-8 input, `--json-schema` for validated JSON, or `--help` for all flags.
See [full setup and examples](../../docs/llm_integration.md).
