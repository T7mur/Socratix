# Repository tooling — Member F

Implemented database/catalogue foundation: [setup](../../docs/database_setup.md), [Auth](../../docs/authentication.md), [handoff](../../docs/database_implementation.md), [shared helpers](../../docs/shared_helpers.md). Read the helper catalogue and search existing code before adding functions. The framework/dependency/migration and sample review entry points are executable; unimplemented domain components remain scaffolded.

Reserve this folder for integration tools such as approved curriculum import, synthetic demo seeding, OpenAPI export and TypeScript client generation. Bootstrap, connectivity, synthetic seeding, role provisioning and schema/type export commands are implemented; see the setup guide.

Component-specific helpers stay with their component. F maintains tools that coordinate several services so feature branches do not each invent a generator or seed format. Use repository-relative paths under `src/`, and document required working directories when adding a command.

Import and seed tools must preserve human approval and immutable versions. Never run student/reference code in these scripts or embed service credentials.
