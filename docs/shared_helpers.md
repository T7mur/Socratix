# Shared helper catalogue

Implemented on `jk/llm_gateway`; Member F owns these helpers, consumer review pending.
Search this catalogue and code with `rg` before adding helpers. Domain rules stay with owners.

| Import | Purpose and inputs → outputs | Async, effects and errors | Example and tests |
|---|---|---|---|
| `app.core.llm_config.LLMSettings` | Environment/explicit LLM values → settings, secret key | Sync; dotenv read; Pydantic errors hide input | `LLMSettings(_env_file=".env")`; endpoint/precedence tests |
| `app.core.config.get_settings` | No args → cached backend settings | Sync; environment/dotenv read; no network; validation errors | `get_settings()`; lifecycle tests |
| `app.integrations.elm.ELMGateway.generate_text` | Keyword operation, alias, system prompt, payload → str | Async; network/retries; safe typed LLM errors | See integration example; request/retry/privacy tests |
| `app.integrations.elm.ELMGateway.generate_json` | Same plus Pydantic class → JSON-compatible dict | Async; network/schema repair; typed LLM errors | `await gateway.generate_json(..., schema=Draft)`; Pydantic/budget tests |
| `app.integrations.elm.ELMGateway.generate_schema_json` | Same plus JSON Schema dict → JSON value, operator use | Async; no remote schema retrieval; typed LLM errors | `await gateway.generate_schema_json(..., schema={"type":"object"})`; schema/CLI tests |
| `app.integrations.elm.ELMGateway.aclose` | No args → None; closes client | Async; releases connections | Prefer `async with ELMGateway(settings)`; cancellation/cleanup tests |

Errors derive from `LLMError`: configuration, provider or output failures. All gateway inputs
are keyword-only. Tests live in `tests/unit/infrastructure/test_llm.py` under the backend.
Full examples and semantics: [LLM integration](llm_integration.md).
