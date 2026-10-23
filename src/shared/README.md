# Shared development resources

This directory holds reviewed cross-service resources. Canonical executable DTO definitions live only in `src/backend/app/contracts/`; this is not a second shared code package.

| Directory | Owner | Purpose |
|---|---|---|
| `prompts/skill/` | A | Versioned curriculum extraction prompts |
| `prompts/exercise/` | B | Specification, private reference and test-generation prompts |
| `prompts/project/` | C | Project specifications, milestone tests and rubrics |
| `prompts/selector/` | D | Optional recommendation explanation prompts |
| `prompts/gap/` | D | Tentative evidence-grounded gap hypotheses |
| `prompts/planning/` | D | Planning/reflection tag proposals |
| `prompts/hint/` | E | Four-stage hint generation |
| `fixtures/` | F, reviewed with consumers | Synthetic cross-component contract examples |
| `openapi/` | F | Generated, reviewed API snapshots |

Use the prompt versions in each component specification, for example `skill/extract_v1.txt` and `planning/plan_tags_v1.txt`. Version changed prompts rather than silently replacing published versions. Prompt files are not implemented by this scaffold.

Keep a component's test-specific fixtures with its tests. Shared contract fixtures must match the canonical IDs, fields and status enums. These resources are not browser assets; no frontend imports or blanket copying into deployment public directories. Runtime hidden tests, generated answers, learner code and secrets belong in protected storage outside version control.
