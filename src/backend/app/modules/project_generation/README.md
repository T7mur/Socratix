# Project generation — Member C

[Specification and acceptance tests](../../../../../docs/project_generation.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Consume `GenerationBrief` and approved learning/engineering outcomes. Produce `ProjectSpec` / `MilestoneSpec` and private QA artifacts while preserving student design choices.

| Planned file | Purpose |
|---|---|
| `constraints.py` | Allowed skills, outcomes and project scope |
| `spec.py` | Generate and freeze the project contract |
| `milestones.py` | Stable milestone IDs and dependency DAG checks |
| `test_planner.py` | Private milestone acceptance-test candidates |
| `rubric.py` | Observable criteria and uncertainty handling |
| `verify.py` | Isolated QA requests and review gates |
| `publishing.py` | Versioned publication and change requests |

Also owned: `src/backend/app/api/v1/projects.py`, `src/shared/prompts/project/`, and `src/backend/tests/{unit,contract,integration}/project_generation/`.

Test milestone cycles/missing IDs, alternative valid designs, review-required rubrics, stateful invariants, regression after change requests, private artifacts and authenticated ownership. Coordinate the student-safe activities reader with B/F; E executes code, and F owns schema/migrations. A project is not an exercise with a larger prompt.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
