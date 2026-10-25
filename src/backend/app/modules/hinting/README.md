# Hinting — Member E

[Specification and acceptance tests](../../../../../docs/hinting.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Consume immutable B/C task contracts and verified grading evidence. Produce student-safe `HintResponse` and valid assessment/assistance events, with private diagnosis kept server-side.

| Planned file | Purpose |
|---|---|
| `diagnose.py` | Requirement-linked failure evidence and tentative causes |
| `ladder.py` | Four hint levels and persistent reveal state |
| `generator.py` | Hint wording through F's ELM gateway |
| `verifier.py` | Grounding, uncertainty and answer leakage checks |
| `repository.py` | Hint history and append-only assistance events |

Also owned: `src/backend/app/api/v1/{submissions,hints}.py`, `src/backend/app/integrations/grading.py`, `src/shared/prompts/hint/`, and `src/backend/tests/{unit,contract,integration}/hinting/`. E also owns the separate [grading worker](../../../../grading-worker/README.md).

Test levels 1–4, explicit answer reveal, assistance persistence, unknown/invalid failures, correct code with no invented bug, prompt injection, private trace/test exclusion and authenticated ownership. Stage 4 sets `solution_revealed=true` and prevents independent mastery credit on that attempt. Execute code only through the isolated worker; F wires jobs and D derives gap estimates.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
