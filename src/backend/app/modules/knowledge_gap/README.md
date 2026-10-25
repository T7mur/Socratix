# Knowledge gaps — Member D

[Specification and acceptance tests](../../../../../docs/knowledge_gap_identification.md) · [Shared contracts](../../../../../docs/shared_contracts.md)

Consume E's valid `AssessmentEvidence` and assistance history, plus separately identified confirmed self-reports. Produce conservative `SkillEstimate` read models, hypotheses and due-retention indicators.

| Planned file | Purpose |
|---|---|
| `evidence.py` | Validity and outcome-reference gates |
| `scoring.py` | Deterministic per-stage indices and versioned gap policy |
| `hypotheses.py` | Tentative explanations with evidence thresholds |
| `retention.py` | Delayed independent-check schedules |
| `repository.py` | Owned reads, derived estimates and audit history |

Also owned: `src/backend/app/api/v1/students.py`, `src/shared/prompts/gap/`, and `src/backend/tests/{unit,contract,integration}/knowledge_gap/`.

Test invalid/uncertain evidence exclusion, insufficient evidence, requirement-to-outcome attribution, stage-4 reveal, corrected event history, weak self-report and cross-student access. Keep gap thresholds separate from selector weights. F owns schema/migrations; E owns grading validity, and planning owns the original reflection. Do not invent a competing evidence DTO.

Before implementing a task, read [shared helpers](../../../../../docs/shared_helpers.md), search existing functions and reuse compatible infrastructure. Update the catalogue in the same PR for new shared helpers; preserve domain ownership.
