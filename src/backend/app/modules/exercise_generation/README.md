# Exercise generation — Member B

[Specification and acceptance tests](../../../../../docs/exercise_generation.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Consume `GenerationBrief` and A's approved outcomes. Produce an immutable student-safe `TaskSpec` and a separate private `GradingArtifact`.

| Planned file | Purpose |
|---|---|
| `brief.py` | Eligibility, approved IDs and outcome checks |
| `spec.py` | Generate and freeze the task contract |
| `reference.py` | Generate private candidate references |
| `tests.py` | Independently generate assessment test specifications |
| `verify.py` | Request isolated QA through `SandboxProtocol` |
| `publishing.py` | Version, verification and review transitions |

Also owned: `src/backend/app/api/v1/exercises.py`, `src/shared/prompts/exercise/`, and `src/backend/tests/{unit,contract,integration}/exercise_generation/`.

`tests.py` generates grading artifacts; developer tests belong in the separate test directories. Test single/multi-skill alignment, frozen versions, invalid tests, uncertain QA, private artifact exclusion, provider failures, idempotent jobs and authenticated ownership. F owns schema and shared contracts; E owns code execution. Do not run reference code here.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
