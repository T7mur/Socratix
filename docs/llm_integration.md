# Shared LLM integration

Owner: Member F. Status: Proposed; user-requested implementation on `jk/llm_gateway`.
Consumer review: Members A–E. See [ADR](adr/0001-compatible-llm-gateway.md).

## Interface

`app.integrations.elm.ELMGateway` implements `app.contracts.llm.LLMGatewayProtocol`.
All arguments are keyword-only:

```python
async with ELMGateway(LLMSettings()) as gateway:
    text = await gateway.generate_text(
        operation="demo_v1", model_alias="generation",
        system_prompt="Be brief", payload={"prompt": "Hello"},
    )
    draft = await gateway.generate_json(
        operation="draft_v1", model_alias="generation",
        system_prompt="Return a draft", payload={"topic": "loops"}, schema=Draft,
    )
```

`Draft` is a caller-provided Pydantic model class. JSON output is parsed, validated and
dumped in JSON mode to a dict. `generate_schema_json` takes the same inputs with a JSON
Schema dict for the operator CLI. External schema retrieval is disabled; use local definitions.
System messages are separate from JSON-serialized user payloads. JSON calls include the
schema in instructions, without requiring provider-enforced structured outputs.
Schema validity is not factual or educational correctness. Callers own prompts, versioned
operation names, allowed IDs, privacy, human approval and publication policies.

## Settings and runtime

`LLMSettings` is independent of DB/Auth. Backend `Settings` composes it by inheritance.
Required at call time: `ELM_BASE_URL`, secret `ELM_API_KEY`, `ELM_MODEL` (or alias model).
`generation` / `review` resolve through `ELM_MODEL_GENERATION` / `ELM_MODEL_REVIEW`,
falling back to `ELM_MODEL`. Unknown aliases fail before requests.
The endpoint prefix must be supplied as documented by the provider; `/v1` is not invented.
HTTPS is required except loopback HTTP under `APP_ENV=development`. URLs may not contain
credentials, query parameters or fragments. Redirects are disabled.

`ELM_TIMEOUT_SECONDS` defaults to 60 (maximum 600); `ELM_MAX_ATTEMPTS` defaults to 3 (1–10).
SDK retries are disabled. Connection/timeouts, 408/429/5xx retry with backoff capped at four
seconds. Invalid JSON/schema output retries with fixed correction instructions, sharing the
same total attempt budget. Other request failures fail immediately. Invalid text fails immediately.
Timeout is per request; a logical call can take longer and timed-out retries may incur billing.

Use one async context-managed gateway per process. Client construction is lazy; import,
OpenAPI export and lifespan startup make no provider calls. Missing configuration fails
only on a gateway call; malformed configured values fail settings validation.
FastAPI lifespan exposes `app.state.llm_gateway` and closes it at shutdown. Workers should
compose their own gateway with the same lifecycle. Cancellation propagates.
Typed safe failures: `LLMConfigurationError`, `LLMProviderError`, `LLMOutputError`, all
under `LLMError`. No provider body, prompt or validation value is included in messages.
Safe exception metadata now distinguishes configuration, HTTP authentication/rate-limit/server/
request failure, connection/timeout and invalid model output using `code`; `status_code` is
included only for an HTTP failure. Import reports retain these fields under `failure_details`.
No provider body, headers, prompt or schema validation input is included. Old generic failure
records cannot retrospectively supply these details. Saved-response recovery constructs no provider.
SDK/transport loggers are disabled to prevent debug body leakage. No new public routes,
DTOs, DB migrations, persistence or frontend code are introduced. Domain owners map failures
to existing job/503 and human-review policies.

## Standalone usage

From this feature worktree's root:

```powershell
uv sync --project src/backend --group dev
```

Create a private ignored `.env` or set process environment variables:

```dotenv
ELM_BASE_URL=https://your-provider.example/v1
ELM_API_KEY=your-key
ELM_MODEL=your-model-id
ELM_TIMEOUT_SECONDS=60
```

```powershell
src/backend/.venv/Scripts/python.exe src/scripts/llm_request.py --prompt "Explain Python generators briefly."
```

After activating that environment, `python src/scripts/llm_request.py --prompt "Hello"`
works too. Or use `uv run --project src/backend python src/scripts/llm_request.py --prompt "Hello"`.
For another working directory, use the absolute script path. Default `.env` resolves from
the script's repository root. Other explicit file paths resolve from the invoking directory.

Exactly one of `--prompt` / `--prompt-file PATH` is required. Files are UTF-8.
Optional flags: `--system`, `--base-url`, `--model`, `--timeout`, `--env-file`, `--json-schema`.
Non-secret CLI flags override environment, then dotenv. `--model` overrides the generation
alias even if configured in the environment. Keys are only accepted through environment/dotenv.
Completion goes to stdout, sanitized failures to stderr. Exit codes: 0 success, 2 invalid
input/configuration, 1 provider/output failure, 130 user cancellation.

For JSON, save this as `answer.schema.json`:

```json
{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}},"additionalProperties":false}
```

```powershell
python src/scripts/llm_request.py --prompt "Explain generators in the answer field." --json-schema answer.schema.json
```

## Verification and integration handoff

Run `src/backend/.venv/Scripts/python.exe -m pytest src/backend/tests` for mocked tests.
Tests cover request shape/path, retries, Pydantic/JSON Schema, aliases, configuration precedence,
privacy, cancellation, cleanup, stable empty OpenAPI and CLI operation without DB/Auth from
another working directory. Credentialed verification is separate; do not infer ELM model
permissions, model listing, streaming, tools or structured output from SDK compatibility.

Verification on 2026-10-25: 34 tests passed, Ruff passed, `git diff --check` passed and
CLI `--help` ran successfully. Locked environment: Python 3.11.1, OpenAI SDK 2.54.0.
No credentialed request was sent: local configuration did not provide a usable endpoint
and model. No ELM or other external provider support is claimed from these mocked checks.

The integration branch now composes `LLMSettings` into database/auth settings and creates one
gateway alongside those services. The operator CLI creates its own context-managed gateway.
The [skill import bridge](skill_import_bridge.md) supplies the candidate schema and prompt;
provider support remains subject to a credentialed check. The gateway itself adds no public
API; the bridge separately proposes an additive admin evidence response. Reviews remain pending.

Reuse decision: no committed compatible settings/HTTP helper exists on main. The CLI reuses
the adapter. The database checkout's `_common.py` requires DB/Auth and is not imported.
See [helper catalogue](shared_helpers.md).
