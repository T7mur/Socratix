# Socratix — Design Change Log

This is a **human-readable ledger of meaningful design changes** (not a substitute for Git commits). Keep the current approved specification in the relevant component MD. Append entries here whenever a proposed/accepted change affects behaviour, algorithms, APIs, workflow, storage, student evaluation or security. Record each entry in the same PR as the implementation. **Never overwrite prior before/after history.**

## Entry template

```markdown
### YYYY-MM-DD — <change title> (<Proposed | Accepted | Rejected | Superseded>)
- **Owner / branch / PR:** Member ? / XX/feature_name / #...
- **Component(s):** docs/<component>.md
- **Before:** <precise previous behaviour or contract>
- **After:** <precise proposed or approved behaviour or contract>
- **Why / alternatives:** <rationale and alternatives, if relevant>
- **Impact:** <API/DTO, schema/migration, prompt, tests, clients, deployments>
- **Verification:** <tests/evidence and manual reviewer if needed>
- **Reviewers / decision date:** <names, pending until approved>
- **ADR:** <relative link if major cross-component decision>
```

## Baseline

### 2026-10-25 — Accept standard PostgreSQL connection strings (Proposed; user-directed)
- **Owner / branch / PR:** JK / jk/database / pending
- **Before:** Users had to replace `postgresql://` with the SQLAlchemy-specific driver prefix and add `sslmode=require` to both application and migration URLs.
- **After:** A shared settings normalizer accepts standard PostgreSQL URLs, selects `postgresql+psycopg` internally and supplies `sslmode=require` when omitted. Existing psycopg URLs remain compatible. API connections and Alembic use the same normalized settings; migration credentials still fall back to the application URL when omitted.
- **Why:** Accept the direct connection string copied from Supabase without manual driver/query edits.
- **Impact:** Settings, environment examples, setup/helper documentation and connector regression tests; no schema/DTO/migration changes. Project checks and restricted production runtime identities remain in place.
- **Verification:** Test direct/pooler URL handling, password/query preservation, both settings and API/migration engine creation without network access.
- **Reviewers / decision date:** Member F and affected owners / pending.

### 2026-10-25 — Remove database CA-file setup (Proposed; user-directed)
- **Owner / branch / PR:** JK / jk/database / pending
- **Before:** Database setup required a CA-file setting and `sslmode=verify-full`; the current connector and its certificate validation test had drifted apart.
- **After:** Remove the CA-path setting and file validation. Require encrypted PostgreSQL connections with `sslmode=require`, without application-configured certificate or hostname verification. Update fixtures, hosted-test guards, environment examples and setup/helper documentation together.
- **Why:** User explicitly requested removing certificate setup before integrating the worktrees.
- **Impact:** Configuration and connection behaviour only; no table, DTO or migration changes. Existing URLs must use `sslmode=require`. Carry this change into the import integration branch during reconciliation.
- **Verification:** Backend unit/contract tests, lint and documentation checks; hosted connectivity remains a separate credentialed check.
- **Reviewers / decision date:** Member F and affected owners / pending.

### 2026-10-25 — Supabase PostgreSQL replaces Aiven (Proposed; user-directed)
- **Owner / branch / PR:** JK / jk/database / pending
- **Before:** The implementation plan selected Aiven for application records and Supabase only for authentication.
- **After:** Supabase hosts both PostgreSQL and Auth. SQLAlchemy/Alembic remain the application persistence boundary, in a dedicated `socratix` schema excluded from the Data API. Use direct/session-pooler connections on 5432 and verified TLS; migrations never alter managed `auth` tables.
- **Why:** User explicitly requested one database provider while implementation was starting. No deployed Aiven data or migrations exist to migrate.
- **Impact:** Configuration, connection/setup docs, schema isolation and ADR 0001/0002. Supabase Auth identities remain linked by UUID without cascading into historical application records.
- **Verification:** Schema/permissions tests plus a credentialed Supabase smoke test when available.
- **Reviewers / decision date:** Member F and affected owners / pending.

### 2026-10-25 — Exact provenance and historical target references (Proposed)
- **Owner / branch / PR:** JK / jk/database / pending
- **Before:** Abbreviated revisions omitted a source foreign key; activities omitted their approved graph version; evaluation rows did not carry target keys sufficient for composite artifact integrity.
- **After:** `catalogue_revisions.source_id` binds candidate provenance; `activities.graph_version` pins accepted curriculum; evaluation activity ID/version keys reject artifacts from a different frozen task. History and frozen-spec guards are embedded in the final initial migration. Shared model/repository files are split by subsystem.
- **Why:** Preserve review meaning and historical grading attribution while implementing the requested immutable-version semantics. Hint assistance is conservatively retained across retries on the original activity.
- **Impact:** Initial migrations and dictionary; no deployed data conversion. Public identity/review additions are listed in shared_contracts.md; grading/learning APIs remain owned integration work.
- **Verification:** Offline PostgreSQL DDL/contract tests; opt-in history, ownership, concurrency, rollback and migration-roundtrip tests. Hosted execution remains unverified.
- **Reviewers / decision date:** Member F and affected owners / pending.

### 2026-10-25 — Database, Supabase identity and catalogue review (Proposed)
- **Owner / branch / PR:** JK; Member F integration / jk/database / pending
- **Components:** database, architecture, shared contracts, web design, skill review and agent workflow.
- **Before:** Documentation-only scaffold; authentication vendor undecided; representative DDL without migrations or a review UI; no helper index.
- **After:** Aiven persistence with five Alembic stages, Supabase Auth, student-default local profiles, admin-only global catalogue review, immutable catalogue revisions, transactional evidence/outbox adapters and a maintained helper catalogue.
- **Why / alternatives:** Implement the user-requested plan without duplicating password storage or schema definitions. Keep domain algorithms and isolated execution outside this change.
- **Impact:** New additive identity/review APIs, generated OpenAPI/TypeScript, migrations, backend/frontend dependencies and setup guides. Existing status values and review decision wire format remain canonical.
- **Verification:** See docs/database_implementation.md for actual checks and unverified external dependencies.
- **Reviewers / decision date:** Member F and affected owners A–E / pending. No institutional or academic-policy approval is implied.
- **ADR:** [Authentication](../adr/0001-supabase-auth.md), [Persistence](../adr/0002-versioned-persistence.md).

### 2026-10-25 — Discover and reuse shared helpers (Proposed)
- **Owner / branch / PR:** JK / jk/database / pending
- **Before:** Agents follow component boundaries but have no maintained index of reusable helpers.
- **After:** Require code search and helper-catalogue discovery before adding functions, compatible reuse and same-PR catalogue maintenance; avoid speculative abstractions.
- **Impact:** AGENTS.md, onboarding and component guides; docs/shared_helpers.md.
- **Verification:** Documentation links and implementation examples checked with the implementation.
- **Reviewers / decision date:** Team / pending.
### 2026-10-25 — PDF-only CLI defaults (Proposed)
- **Owner / branch / PR:** JK / jk/pdf_skill_ingestion / pending.
- **Before:** Optional metadata flags still passed `None` to source validation, causing UUID initialization failure; output defaulted to a rooted path.
- **After:** Require only the PDF path. Derive the source UUID and a `urn:sha256:` locator from file contents; record an unspecified edition as null. Choose a fresh directory beneath the working directory's `outputs/` unless explicitly supplied. Explicit arguments retain precedence; rights remain pending by default.
- **Why:** Local extraction should not require prior source registration or invent an edition.
- **Impact / verification:** Internal CLI/model/docs only; regression tests for PDF-only runs, stable identities across copies, explicit overrides and invalid UUIDs. No public API/database changes.
- **Reviewers / decision date:** Member A / pending.

### 2026-10-25 — Local CS2023 PDF ingestion (Proposed)
- **Owner / branch / PR:** JK (Member A) / jk/pdf_skill_ingestion / pending.
- **Before:** Skill ingestion accepts structured sources or prepared excerpts; no PDF parser or generation-input exporter exists.
- **After:** An offline CLI extracts native text or local OCR into traceable structural blocks, reconstructs CS2023 knowledge units and exports rights-gated, bounded LLM request artifacts. Uncertain extraction requires review. No model call or publication occurs.
- **Why / alternatives:** Preserve curriculum structure and inspect evidence before generating skills; avoid whole-report model calls and page-sized chunks.
- **Impact:** Skill-generation implementation/specification, module dependencies, versioned prompt, helper catalogue and synthetic tests. No public API, canonical DTO, database or client changes.
- **Verification:** Unit/contract tests, synthetic PDF/OCR fixtures, full-report extraction and representative visual inspection; results recorded in the component guide.
- **Reviewers / decision date:** Member A; Member F for later integration / pending. Source permission and academic review are not implied.
### 2026-10-25 — Shared compatible LLM gateway and operator CLI (Proposed)
- **Owner / branch / PR:** JK; Member F integration / jk/llm_gateway / pending
- **Before:** Reserved ELM adapter and JSON protocol, with no runtime implementation.
- **After:** One async Chat Completions adapter for configured compatible endpoints, validated JSON and plain text, LLM-only settings, backend lifecycle composition and a standalone operator script.
- **Why:** Reuse a single provider boundary without requiring database/auth setup for manual requests.
- **Impact:** Additive internal text method, dependencies, tests and documentation; no public routes, DTOs, database migrations or frontend changes.
- **Verification:** Mock transport and CLI tests; credentialed support remains unverified until a synthetic smoke test succeeds.
- **Reviewers / decision date:** Member F and affected consumers A–E / pending.
- **ADR:** [Compatible LLM gateway](../adr/0001-compatible-llm-gateway.md).

### 2026-10-23 — Initial handoff and repository governance (Accepted as documentation baseline)
- **Owner / branch / PR:** Team setup / to be assigned / not yet opened
- **Component(s):** root README.md, AGENTS.md, docs/*
- **Before:** Documentation pack named InfSocrat, onboarding README inside docs, no formal branch naming or change log requirement.
- **After:** Product is named **Socratix**. Repository root contains README.md and AGENTS.md; each feature uses `<INITIALS>/<feature_name>`; meaningful design changes require updated component MD and an append-only before → after log, with ADRs for significant architecture decisions.
- **Why:** Parallel coding agents need one visible workflow, reviewable contracts and explainable design history.
- **Impact:** Documentation and collaboration practices only; no application runtime or database migration has been made.
- **Verification:** Link/name validation in documentation pack.
- **Reviewers / decision date:** User-requested governance convention / 2026-10-23. Actual team adoption pending.

### 2026-10-23 - Component ownership scaffold under src (Proposed)
- **Owner / branch / PR:** Repository structure; Member F integration review / jk/architect / not yet opened
- **Component(s):** src/README.md, root README.md, AGENTS.md, docs/architect.md and component file-location sections
- **Before:** Architecture proposed top-level backend, frontend, grading-worker, shared and scripts roots; src contained empty back-end/front-end folders. Test files shared tier directories without component subdirectories.
- **After:** Reserve src/backend, src/frontend and src/grading-worker as separate service roots, plus src/shared, src/scripts and src/deployment. Preserve the seven canonical domain modules; assign each its own guide, tests by tier/component and prompt directory. Record separate API-file owners and Member F's composition responsibilities.
- **Why / alternatives:** Make each teammate's work easy to locate and reduce concurrent edits to common files while retaining the existing service boundaries and canonical contracts.
- **Impact:** Directory scaffold and documentation paths only. No DTO/route/status changes, schema migrations, executable services, dependencies or generated clients. Deployment tools must eventually use the src-prefixed roots.
- **Verification:** Validate local Markdown links, all seven component guides, unit/contract/integration directories per component, owner-specific prompt directories and Git placeholders. Runtime acceptance tests remain required when components are implemented.
- **Reviewers / decision date:** Member F and affected component owners / pending review
- **ADR:** Not required for this reversible folder organisation; runtime architecture and responsibilities are unchanged.
