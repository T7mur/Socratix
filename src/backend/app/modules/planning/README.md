# Planning and reflection — Member D

[Specification and acceptance tests](../../../../../docs/planning_reflection_to_skills.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Map student-authored goals/reflections to approved candidate skills. Persist confirmation before downstream use. Produce `ConfirmedPlan`, `ReflectionReceipt` and explicitly identified append-only self-report evidence.

| Planned file | Purpose |
|---|---|
| `candidate_search.py` | Retrieve approved IDs, aliases and descriptions |
| `tagging.py` | Shared ELM calls and allowed-ID checks |
| `confirmation.py` | Student confirms, edits or rejects candidate tags |
| `reflection.py` | Private reflection capture and consented self-report |
| `policy.py` | Limits, allowed statuses and provenance rules |
| `repository.py` | Owned plan/reflection persistence and reads |

Also owned: `src/backend/app/api/v1/plans.py`, `src/backend/app/api/v1/reflections.py`, `src/shared/prompts/planning/`, and `src/backend/tests/{unit,contract,integration}/planning/`.

Test unknown model IDs, rejecting all tags, confirmation before selection, private reflections, consent, cross-student access and confidence-only reports. F owns auth primitives/schema; A owns curriculum proposals. Knowledge-gap logic consumes self-reports as weak evidence rather than independent mastery.
