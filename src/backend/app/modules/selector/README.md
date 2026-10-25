# Selector — Member D

[Specification and acceptance tests](../../../../../docs/exercise_project_selector.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Read A's approved graph, confirmed planning tags, skill estimates and due-retention indicators. Produce `SelectorResult` and the shared `GenerationBrief` for B/C.

| Planned file | Purpose |
|---|---|
| `eligibility.py` | Approval, course availability and prerequisites |
| `feature_builder.py` | Planning/gap/retention indices and missing-signal flags |
| `scoring.py` | Configurable fixed weights and deterministic tie-breaks |
| `activity_choice.py` | Single-skill, multi-skill or project choice |
| `explanations.py` | Evidence-linked reasons and optional model wording |

Also owned: `src/backend/app/api/v1/selection.py`, `src/shared/prompts/selector/`, and `src/backend/tests/{unit,contract,integration}/selector/`.

Start with exactly `0.40 planning + 0.35 gap + 0.25 retention`, an unvalidated heuristic. Filter eligibility before scoring; keep override and missing-data behaviour visible. Test weight validation, deterministic ranking, absent evidence, rejected planning tags, unapproved IDs, repeated tasks, prerequisites and authenticated ownership. Do not write gap estimates or recompute scores with an LLM.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
