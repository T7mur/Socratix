# Repository tooling — Member F

Reserve this folder for integration tools such as approved curriculum import, synthetic demo seeding, OpenAPI export and TypeScript client generation. No runnable tooling is included yet.

Component-specific helpers stay with their component. F maintains tools that coordinate several services so feature branches do not each invent a generator or seed format. Use repository-relative paths under `src/`, and document required working directories when adding a command.

Import and seed tools must preserve human approval and immutable versions. Never run student/reference code in these scripts or embed service credentials.
