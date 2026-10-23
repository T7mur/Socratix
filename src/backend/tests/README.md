# Backend tests

Tests are grouped by purpose, then by the component that owns them:

```text
tests/
|-- unit/<component>/          Deterministic logic; mocked external boundaries
|-- contract/<component>/      Canonical DTOs and component interface behaviour
`-- integration/<component>/   Authorised persisted workflows and job transitions
```

`<component>` is one of `skill_generation`, `exercise_generation`, `project_generation`, `selector`, `knowledge_gap`, `planning`, or `hinting`. That component's owner maintains all three of its folders. Each tier also has `infrastructure/`, owned by F, for auth, DB, OpenAPI drift and shared integration checks. F coordinates the cross-component demo smoke test there.

Keep component fixtures/fakes in the component's own test folder. Root test configuration and any shared `conftest.py` belong to F; avoid editing those for every new feature. Reusable, reviewed synthetic contract examples belong in `src/shared/fixtures/`.

Acceptance cases remain in the linked component specifications. Include invalid/uncertain outputs, authenticated ownership and privacy checks as well as happy paths. No test framework or executable tests have been added by this scaffold. Student and reference code may only execute in the isolated grading infrastructure; backend tests mock its protocol boundary.
