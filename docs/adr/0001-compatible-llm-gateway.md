# 0001 — Shared compatible Chat Completions gateway

Date: 2026-10-25. Status: **Proposed**. Owner: Member F; reviewers A–E.

## Context

The canonical JSON gateway has no implementation on main. ELM permissions vary by key/model.
Operators need standalone requests without configuring DB/Auth.

## Proposed decision

Use the reserved `app/integrations/elm.py` boundary, async OpenAI SDK, explicit base URL and
non-streaming Chat Completions. Add plain text to the internal protocol. Use independent
LLM settings and share transport/validation/retry logic between backend and CLI. Validate
JSON locally; do not assume Responses API, streaming, tools or constrained JSON support.

## Consequences and alternatives

Callers remain provider independent; existing ELM environment names remain valid for other
compatible endpoints. SDK retries are disabled for one explicit transport/output attempt budget.
A direct HTTP client would reduce dependencies but duplicate SDK error handling. Separate
provider wrappers are unnecessary for the selected common interface. Compatibility is limited
to tested request/response shapes; vendor-specific authentication requires later review.

This document does not grant approval or establish credentialed provider support.
