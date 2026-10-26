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



### 2026-10-26 — Component B exercise generation extensions (Proposed)
- **Owner / branch / PR:** Member B / OC/exercise_generation / not opened
- **Component(s):** docs/exercise_generation.md
- **Before:** Exercise-generation pipeline focused on coding reference solutions, executable tests, and initial deterministic validation.
- **After:** Add semantic review, duplicate detection, non-coding model answers, private grading-rubric candidates, and separate coding/non-coding worker paths.
- **Why / alternatives:** Support recall and understanding assessments without treating every task as executable Python code.
- **Impact:** Exercise-generation modules, worker flow, private assessment artifacts, prompts, and tests. No approved shared public DTO or database migration.
- **Verification:** 117 local exercise unit/integration tests passed.
- **Reviewers / decision date:** Component F/E owners and designated academic reviewer / pending.
- **ADR:** None proposed; existing component boundaries retained.

### 2026-10-26 — Component C project generation implementation (Proposed)
- **Owner / branch / PR:** Member C / OC/exercise_generation / not opened
- **Component(s):** docs/project_generation.md
- **Before:** Approved project-generation design and canonical ProjectSpec example, without locally implemented project generation.
- **After:** Add ProjectSpec and milestone validation, AI-backed project draft generation, private per-milestone test and four-level rubric candidates, independent semantic review, project worker, conservative lifecycle transitions, and asynchronous generation-job route.
- **Why / alternatives:** Implement milestone-based project generation while preserving public/private separation and requiring trusted verification and instructor approval before publication.
- **Impact:** Project-generation modules, prompts, project API, and tests. No database migration or approved shared public DTO change. Private assessment formats remain implementation proposals.
- **Verification:** 45 local project unit/contract tests passed. Real sandbox verification, persistent jobs, public route registration, and authorised publication remain untested.
- **Reviewers / decision date:** Members E/F and designated academic reviewer / pending.
- **ADR:** Cross-component integration review pending; no runtime architecture change proposed.
