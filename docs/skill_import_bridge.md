# Operator skill import bridge

Status: implemented draft on `jk/skill_import_bridge`; Member A/F review pending. Migration
0006 and the additive admin evidence contract have not been applied to hosted Supabase.

## Start local services

From the repository root:

```powershell
uv sync --project src/backend --group dev --frozen
uv run --project src/backend python src/scripts/check_services.py
uv run --project src/backend python src/scripts/serve_backend.py
```

In a second terminal:

```powershell
Set-Location src/frontend
npm ci
npm run dev
```

Use root `.env` for database/ELM settings and `src/frontend/.env.local` for frontend settings.
`NEXT_PUBLIC_SUPABASE_URL` must be the HTTPS Auth origin matching `SUPABASE_AUTH_URL`, never
a PostgreSQL connection URL. Use a publishable key, never a secret/service-role key.
Development defaults: `SITE_URL=http://localhost:3000`, `API_BASE_URL=http://localhost:8000`.
Reuse existing servers on these ports rather than starting another copy.

Startup, OpenAPI export and registration make no LLM calls. Windows operator entry points
configure psycopg's selector event loop. Connectivity `tls` describes the client connection;
`server_tls` describes the backend connection, which can differ behind a pooler.

## Prepare and inspect evidence

```powershell
Set-Location src/backend
.\.venv\Scripts\python.exe -m app.modules.skill_generation.cli ../../data/3664191.pdf --rights-status permitted --section AI-ML --output ../../outputs/cs2023-bridge-check
Set-Location ../..
```

Use `permitted` only with recorded permission. Files: `document.json`, `blocks.jsonl`,
`sections.json`, `manifest.json`, `requests/*.json`. Choose a new directory per extraction.
Without `--output`, files go under the invoking directory's `outputs/`. Exit 2 means artifacts
were written but review is required. Inspect per-unit readiness: unrelated document diagnostics
can make the global status review-required while the selected unit is ready. Selected-unit
warnings block that unit. Pending/restricted sources export no text requests.

The importer rebuilds request envelopes from blocks/sections and checks exact coverage,
context, inventory, metadata and byte sizes. Digests establish consistency, not proof of the
original PDF's authenticity or copyright permission. Operator source inspection is required.

## Review migration 0006, then import

Member F and affected owners must review migration/contract changes first. An authorised
operator then follows [database setup](database_setup.md) to upgrade development to 0006 and
review grants. Revisions 0001–0005 remain frozen. Existing catalogue review remains usable on
0005 with empty evidence lists; imports require 0006. API startup never migrates.

Validate without provider calls or writes:

```powershell
uv run --project src/backend python src/scripts/import_skills.py --artifacts outputs/cs2023-bridge-check --section AI-ML --actor-id REVIEWER_UUID --target development --permission-ref YOUR_PERMISSION_RECORD --dry-run
```

Run the same command without `--dry-run` to import. Repeat `--section` for multiple units;
omitting it selects non-excluded manifest units. The actor must already be an active admin.
Database operator access establishes CLI authority; the actor UUID is audit attribution, not
an authenticated session. Target must match `APP_ENV` and the SQL/Auth project. Production
imports are refused. Store a real permission reference rather than a fabricated placeholder.

The versioned extraction prompt requests an internal `SkillCandidateBatch` wrapping existing
canonical skill/outcome/relation DTOs. Every proposal requires supplied primary evidence;
repeated context alone is insufficient. Relationship UUIDs are deterministic and all generated
relationships are marked inferred. Schema validation does not establish educational correctness.
Choose a model with enough context/output capacity for input plus response schema: payload
bytes are not a token guarantee.

Chunks run sequentially and validated results are checkpointed. A complete unit's candidate
revisions, spans, evidence and completion markers commit in one transaction. No transaction
spans a provider call. Exactly matching pending/approved content is reused; conflicting pending
edits are explicit. Accepted records and old graph versions remain unchanged.

## Resume, reports and storage

Repeat the command to resume. Fingerprints include artifacts, selected units, actor, permission,
prompt/schema digests and resolved non-secret model configuration. Moving the artifact folder
preserves identity; changing inputs creates a new run. A database advisory lock serializes the
same fingerprint. Provider interruption preserves validated checkpoints. Semantic rejection
requires regenerating that unit on the next invocation. A crash before checkpointing can incur
another provider charge; exactly-once billing is not promised.

JSON terminal output lists run ID, processed/skipped/blocked units, safe failure codes,
candidate IDs/versions, pending reviews and report path. Reports are stored at:

```text
outputs/skill-imports/<run-id>/report.json
```

Regenerate a lost report or refresh review counts without model calls:

```powershell
uv run --project src/backend python src/scripts/import_skills.py --report-run RUN_UUID --actor-id REVIEWER_UUID --target development
```

Authoritative records live in private Supabase schema `socratix`:

| Tables | Meaning |
|---|---|
| `curriculum_sources`, `source_spans` | Source identity and permitted evidence |
| `skill_import_runs`, `skill_import_chunks` | Permission/configuration audit and validated checkpoints |
| `catalogue_revisions`, `skill_candidate_evidence` | Exact pending versions and span/chunk links |
| `skills`, `learning_outcomes`, `skill_relations` | Accepted projections after human approval |
| `review_decisions`, `graph_versions`, `graph_members` | Append-only review and exact graph history |

Admin `/review` details show evidence, inference labels, rationale and review flags. Excerpts
are suppressed if rights are no longer permitted. Approve skills before dependent outcomes
and relationships. Imports do not assign curricula to courses or enrol learners.

Exit codes: 0 completed (human review may still be pending), 2 input/permission/review issues,
1 runtime/provider/database/output failure, 130 interruption. A report distinguishes completed
units from blocked/failed units. Credentials and source/model bodies are not printed in errors.

## Verify registration

Open `http://localhost:3000/register` with a new email, enter your own password, then open the
confirmation email in that same browser. Reach `/account`, verify student role, refresh, sign
out and sign in. Use the operator connection to verify exact profile linkage:

```powershell
uv run --project src/backend python src/scripts/check_registration.py --email YOUR_TEST_EMAIL --target development
```

Expected: one Auth account, confirmed email, one active application profile, matching UUID,
role `student`. An existing admin account does not prove new registration; do not reset it.
SMTP delivery and callback allowlists need real verification. Keep confirmation enabled and
use a separate authorised reviewer for import approvals.

## Actual verification — 2026-10-25

- Hosted read-only connection succeeded at 0005 with client TLS. The pooler backend reports
  no TLS; this is reported separately. No hosted migration or catalogue import was applied.
- Auth settings: email/signup enabled, confirmation required, configured signing algorithm
  available. Email delivery and callback allowlists are not proven by those settings.
- The supplied account already has a confirmed active admin profile with one matching UUID;
  new student signup awaits another address and user confirmation.
- Real PDF extraction: 459 pages, 166 units. AI-ML: 49 chunks, 167 spans, bridge consistency
  validation passed. Document-wide diagnostics remain. No real-source text was sent to a model.
- Credentialed model request failed in the sandbox; unsandboxed smoke execution was declined.
  Provider functionality is not claimed.
- Temporary PostgreSQL startup was declined. Disposable transaction/trigger tests remain
  unexecuted; offline upgrade/downgrade SQL rendering passed.
- Automated checks and limitations are summarised in [handoff](skill_import_handoff.md).
