# Repository tooling — Member F

Reserve this folder for integration tools such as approved curriculum import, synthetic demo seeding, OpenAPI export and TypeScript client generation. The LLM request tool below is implemented; other tooling remains planned.

Component-specific helpers stay with their component. F maintains tools that coordinate several services so feature branches do not each invent a generator or seed format. Use repository-relative paths under `src/`, and document required working directories when adding a command.

Import and seed tools must preserve human approval and immutable versions. Never run student/reference code in these scripts or embed service credentials.

## Standalone LLM request

Install from the repository root with `uv sync --project src/backend --group dev`.
Configure `ELM_BASE_URL`, `ELM_API_KEY`, `ELM_MODEL` in the ignored root `.env`.

```powershell
src/backend/.venv/Scripts/python.exe src/scripts/llm_request.py --prompt "Explain Python generators briefly."
```

No FastAPI server, database or Supabase configuration is needed. Use `--prompt-file` for
UTF-8 input, `--json-schema` for validated JSON, or `--help` for all flags.
See [full setup and examples](../../docs/llm_integration.md).
