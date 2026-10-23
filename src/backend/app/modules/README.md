# Domain modules

Each child folder has one accountable owner and its own implementation guide. Use `snake_case` names matching the specifications. Keep orchestration readable: business rules in the module, HTTP/auth handling in its assigned API file, external model calls through the shared adapter, and migrations through Member F.

| Module | Owner |
|---|---|
| [skill_generation](skill_generation/README.md) | A / JK |
| [exercise_generation](exercise_generation/README.md) | B |
| [project_generation](project_generation/README.md) | C |
| [selector](selector/README.md) | D |
| [knowledge_gap](knowledge_gap/README.md) | D |
| [planning](planning/README.md) | D |
| [hinting](hinting/README.md) | E |

Do not collect unrelated helpers into a common `utils.py` or duplicate DTOs here. Keep a helper with the component that owns its behaviour. Cross-component needs use reviewed service/repository boundaries with canonical DTOs. See the [source map](../../../README.md) for tests, prompts and API ownership.
