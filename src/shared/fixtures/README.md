# Contract fixtures — Member F

Reserved for synthetic examples agreed with the component owners. Canonical shared fixture names from [the contract](../../../docs/shared_contracts.md#6-cross-module-test-fixtures) will live directly here:

- `approved_skills.json`
- `student_beginner.json`
- `stock_status_task.json`
- `cafe_project.json`
- `failed_submission.json`
- `invalid_test.json`

These are planned examples, not generated or verified fixture data. Domain-specific test fixtures belong in the owning component's test directories. Do not include authentic learner profiles, credentials, production hidden tests or reference solutions. A synthetic grading fixture still stays out of browser bundles.

## Implemented synthetic fixtures

`catalogue_candidates.json` is used by the idempotent seed command; all four entries require real review in the sample. `approved_skills.json`, `stock_status_task.json`, `cafe_project.json`, `student_beginner.json`, `failed_submission.json` and `invalid_test.json` are illustrative synthetic contract fixtures. Their example approved/verified labels are not real human approvals and the seed command never publishes them. No fixture executes student/reference code or contains runtime credentials.
