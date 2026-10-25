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
