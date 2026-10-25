# Skill import bridge handoff

Branch: `jk/skill_import_bridge`, based on local main with the merged integration branch
fast-forwarded in. Original local lockfile changes were carried forward; the frontend auth
helper's configuration logging was removed while adding URL/key validation. No commit, push,
hosted migration, permission grant or academic approval was performed.

Design: Proposed, Member A/F review pending. See [runbook](skill_import_bridge.md),
[change ledger](changes/CHANGELOG.md), [ADR](adr/0003-durable-skill-import.md),
[contracts](shared_contracts.md) and [database dictionary](database_dictionary.md).

## Delivered behavior

- Operator CLI accepts validated ingestion artifacts, unit selection, actor/permission/target,
  dry-run, repeat/resume and report regeneration. Input is an immutable artifact snapshot;
  output is pending canonical catalogue revisions, durable evidence/checkpoints and a report.
- Reuses settings, target validation, database lifecycle, checksum, canonical DTOs, catalogue
  revision/transaction locks and graph validators. New domain policy stays in skill generation;
  new storage operations stay in F's repository. No competing skill schema, student job or
  generic utility module was introduced. See helper catalogue for inputs, effects and errors.
- Proposed 0006 adds private run/chunk/evidence tables. Successful checkpoints and imported
  source evidence cannot be overwritten. Whole-unit writes roll back together; model calls
  hold no transaction. This PostgreSQL behavior has tests but remains unexecuted locally.
- Admin review details show direct/inferred provenance, excerpts and flags. Existing review
  continues on 0005 with empty import evidence. Student access remains denied.
- Backend lifecycle includes database/auth plus lazy gateway; PDF output defaults match docs;
  Windows scripts configure the selector event loop. Source permission is rechecked before
  each provider call and before unit persistence. Reports can be recovered from the database.
- Frontend configuration now rejects SQL URLs and secret keys; ignored local frontend settings
  were prepared with the canonical HTTPS Auth origin. The root environment was not rewritten.
  Callback exceptions fail safely. Real user's password is never requested in chat or logged.

## Verification

| Check | Result |
|---|---|
| Backend tests | 127 passed; 18 skipped (17 disposable-database, 1 optional OCR) |
| Backend lint | Passed with explicit backend Ruff configuration |
| Frontend unit/component tests | 26 passed |
| TypeScript | Passed |
| Production build | Passed; isolated `.next-bridge` output |
| Browser tests with installed Chrome | 5 passed: navigation, protected review, mobile form, password mismatch, callback failure |
| Visual inspection | Desktop login/mobile registration screenshots inspected; no clipping |
| Proposed migration SQL | Upgrade through 0006 and 0006→0005 downgrade rendered; not executed |
| Real PDF bridge validation | 459 pages/166 units; selected AI-ML: 49 chunks, 167 spans, no selected-unit blockers |
| Hosted database read-only | Connected at 0005; client TLS enabled, pooler backend TLS reported separately |
| Hosted Auth settings | Signup/email enabled, confirmation required, matching signing algorithm available |
| Supplied existing account | Confirmed active admin, exactly one matching application UUID/profile; not new signup proof |

Reproduce credential-free checks from root:

```powershell
uv sync --project src/backend --group dev --frozen
uv run --project src/backend ruff check --config src/backend/pyproject.toml src/backend/app src/backend/tests src/scripts
uv run --project src/backend pytest src/backend/tests -q
```

From `src/frontend`, use `npm test` and `npm run typecheck`. For an isolated production/browser
check alongside the existing dev server:

```powershell
$env:SOCRATIX_NEXT_DIST_DIR = '.next-bridge'
npm run build
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

CI installs its own Chromium; local Chrome avoids a browser download. The normal app continues
to use `.next`. Browser tests do not create accounts, submit source text to providers or approve
curricula. Screenshots are in ignored `.cache/ui/`; SQL previews and real PDF artifacts are in
ignored `outputs/`. Authoritative import records/reports require reviewed 0006 deployment.

## Remaining external gates

1. Member F/A review the draft schema/contract, validate migration and persistence on an explicit
   disposable target, then authorise development deployment/grants. Temporary PostgreSQL startup
   was declined; no substitute hosted destructive test was attempted.
2. Verify the configured LLM with authorised network access, then a synthetic import and the
   permitted real unit. The sandboxed credentialed request failed; unsandboxed execution was
   declined. Neither real generation nor database import/publication is claimed.
3. Complete a fresh student registration and email callback in the initiating browser, then
   refresh/login/logout and check exact UUID linkage. The supplied email belongs to an existing
   admin. A separate address/alias was requested; its use and confirmation remain pending.
   Interactive browser control is not connected; user participation is required for password
   entry/email. Existing-account verification must not be described as new registration.

Do not mark the live integration gate passed based on mocks, SQL rendering, a displayed form,
an existing confirmed account or two model calls agreeing. No automatic approval is added.
