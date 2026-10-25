# Database and catalogue implementation handoff

**Branch:** `jk/database`. **Design status:** Proposed; Member F and affected owners must review. User-directed hosting change: Supabase PostgreSQL and Auth replace the Aiven database proposal. No hosted schema/data was migrated or changed by this implementation.

## Delivered boundaries

- 38 SQLAlchemy tables in private `socratix`, five frozen Alembic revisions, versioned catalogue snapshots and database history/freeze guards.
- TLS-encrypted async connector (`sslmode=require`), bounded pool, caller-owned transactions, repository adapters, operator bootstrap/seed/check/role commands. No local CA-file setting is required.
- Standard `postgresql://` URLs are accepted directly; shared settings select psycopg and add the TLS option internally for API and migration connections. Separate migration credentials are optional.
- FastAPI identity and admin catalogue review APIs, asymmetric Supabase JWT verification, generated OpenAPI and TypeScript.
- Next.js email/password signup, confirmation, login/logout/recovery and catalogue review UI.
- Shared-helper instructions/catalogue, setup/auth guides, generated physical dictionary and synthetic fixtures.

Generators, learning-policy algorithms, email delivery infrastructure, job/outbox consumers, object-store provisioning and isolated grading execution remain owned integrations. The repository does not claim an end-to-end tutor exists. Persistence adapters accept trusted domain outputs; they do not autonomously approve academic content.

## Find code and contracts

| Area | Files / entry points | Ownership |
|---|---|---|
| Composition | `src/backend/app/main.py`, `core/{config,security,logging,errors}.py` | F |
| Persistence | `db/{base,session}.py`, `db/models/`, `db/repositories/` | F with domain review |
| Schema history | `src/backend/migrations/versions/0001` through `0005`, embedded `guards_v1.sql` | F |
| Contracts/routes | `contracts/{enums,identity,reviews,activities,protocols}.py`, `api/v1/{identity,reviews}.py` | F with affected owners |
| Human review | `modules/skill_generation/{reviewer,relation_validator,repository}.py` | A/F |
| Operations | `src/scripts/{bootstrap_db,check_db,seed_demo,grant_role,export_openapi,generate_schema_docs}.py` | F |
| Frontend | `src/frontend/src/app/`, `components/{auth,review}/`, `lib/{auth,api}/` | F |
| Verification | `src/backend/tests/{unit,contract,integration}/infrastructure/`, frontend tests | F/A |

Function inputs, side effects and errors are indexed in [shared_helpers.md](shared_helpers.md). Every physical column, key, default, check and index is listed in [database_dictionary.md](database_dictionary.md); it is generated from the ORM rather than maintained as a second hand-written schema.

## Migration stages

1. Identity, courses, sources/spans, skills and directed relationships.
2. Outcomes, aliases/course coverage, catalogue revisions, graph snapshots and review audit.
3. Plans, frozen activity/project contracts, milestones and private artifact metadata.
4. Generation jobs, submissions, evaluation revisions, hints and transactional outbox.
5. Evidence/corrections, private reflections, derived estimates, gap history, reassessment schedules, selector decisions and v1 database guards.

Deploy the full `head` before starting services; intermediate heads are ordering checkpoints, not supported application releases. Never edit deployed revisions. API startup does not migrate. Initial revision rendering tooling refuses to overwrite existing revisions.

Implementation refinements recorded in the change log: candidate revisions have `source_id` for auditable provenance; activities pin `graph_version`; evaluations repeat activity target keys so composite foreign keys reject mismatched private artifacts. Current accepted catalogue rows are projections; immutable revisions retain earlier meanings.

## Worked record stories

**Catalogue:** synthetic skill proposal → revision 1 `proposed` → admin validates rights and approves → accepted skill projection plus append-only decision → graph snapshot 1. Editing the description creates revision 2; snapshot 1 remains unchanged until and after revision 2 is approved.

**Task:** activity `(id,1)` targets approved outcomes from a pinned graph → requirements freeze before verification → private artifact references that exact version → owned submission → evaluation revision + evidence + outbox in one transaction. A changed requirement creates `(id,2)`; old attempts still reference 1.

**Assistance/correction:** accepted level-four hint records reveal and queues recalculation. Evidence queries conservatively exclude independence for retries on the same original activity, including separate attempts. Invalid/uncertain grading is retained for audit but omitted from valid-evidence reads. A grader rerun requires an explicit correction reason; correction events invalidate prior observations without overwriting them. A separate, later unaided transfer activity can supply new independent evidence.

## Verification record

Local verification results are updated before handoff. Offline/contract checks do not prove Postgres trigger execution, Supabase configuration, SMTP or a deployed service. Database integration tests require an explicitly disposable target; the local PostgreSQL start was declined, so that instance was not started. The existing root `.env` was left unchanged.

| Check | Result on 2026-10-25 |
|---|---|
| Backend unit/contract/HTTP permission checks | 30 passed, including standard URL/password/query preservation and API/migration engine checks; lint passed |
| Disposable-database integration suite | 12 skipped: no designated test project; not claimed as passed |
| PostgreSQL migration SQL generation | Upgrade and downgrade SQL rendered successfully, without executing SQL |
| Frontend unit/component tests | 12 passed |
| TypeScript and production build | Passed |
| Chrome browser smoke tests | 3 passed: login/recovery navigation, protected-review redirect and mobile registration |
| Visual inspection | Desktop login and mobile registration screenshots inspected; no clipping/overflow found |
| Hosted Supabase read-only connection | Attempt failed with a network error; TLS/connectivity not verified; no tables/data changed |
| Real signup, confirmation, recovery email and restore | Not run; require configured test Auth/SMTP/database targets |
| Generated OpenAPI/types/dictionary and guide links | Generated and locally checked |

`.github/workflows/ci.yml` runs credential-free checks and detects generated contract/document drift. No hosted CI run or remote deployment is claimed. An owner must run the disposable database suite and credentialed provider checks before treating the database integration gate as satisfied.

See [database_setup.md](database_setup.md) for execution commands and safety guards, and [authentication.md](authentication.md) for project settings and remaining credentialed checks.
