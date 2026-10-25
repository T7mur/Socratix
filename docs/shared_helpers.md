# Shared helpers: find before adding

These helpers are implemented. Search the named module with `rg` and read its contract before reuse. Owner F maintains infrastructure; Member A owns catalogue validation/review. Extend compatibly with affected-owner review. Do not move domain policy into a generic utility merely to eliminate similar-looking code.

## Backend

Python imports start with `app`, not `src`. All async repository methods use a caller-supplied `AsyncSession`; none commits. Default errors are `ConflictError` (409), `ForbiddenError` (403), `NotFoundError` (404), `ValidationError` (422). SQL/provider failures are translated at the HTTP boundary without raw exception details.

| Module / functions | Inputs → outputs | Behaviour / errors | Tests |
|---|---|---|---|
| `app.core.config.get_settings` | env → cached `Settings` | Sync; normalizes SQL URLs and validates pool/Auth configuration; Pydantic error without input secrets | `test_config_and_safety.py` |
| `app.core.config.normalize_database_url` | string or `SecretStr` PostgreSQL URL → normalized `SecretStr` | Owner F; sync, no I/O. Selects psycopg and defaults to required TLS; preserves credentials/query parameters. Rejects unsupported/incomplete URLs or conflicting TLS modes with safe `ValueError`. Used by both application and migration settings | `test_config_and_safety.py`: provider URLs and API/operator engine regression checks |
| `app.db.session.create_database`, `dispose_database` | settings → engine/session factory; database → none | Creation is sync and lazy; disposal async; no migrations or connection at import | config/DB integration |
| `app.db.session.get_db_session`, `transaction` | request/session → scoped session | Async; closes sessions; transaction commits on success, rolls back on failure | DB integration |
| `app.db.session.check_connection` | database → connectivity/version/TLS/revision | Async; read-only, returns no credentials; requires configured DB | credentialed smoke |
| `app.core.security.verify_access_token`, `get_current_user`, `require_admin` | request/token → claims/application user | Async; JWKS validation, student-default profile, active/role checks; HTTP 401/403/503 | `test_security.py`, `test_http_permissions.py` |
| `app.core.security.require_resource_owner` | owner UUID, caller UUID → none | Sync; 403 on mismatch | ownership integration |
| `app.core.logging.configure_logging`, `log_failure` | operation/error → safe operational log | Sync; suppress driver/provider payload logging; never stringify exception details | `test_config_and_safety.py` |
| `app.db.repositories.common.checksum`, `validate_public_payload` | JSON → digest / none | Sync; stable JSON hashing; recursively rejects internal artifact fields. Not a general text scrubber or a replacement for explicit DTOs | safety/contract tests |
| `app.db.repositories.common.require_course_membership` | session, user, course → none | Async; checks active membership; 403 otherwise | DB integration |
| `app.db.repositories.users.UserRepository` | session; `ensure_student_profile`, `get_user`, `set_user_role` | Async; profile upsert preserves roles/disabled state. Role change is operator-only, needs owner credential and audit reason | DB integration |
| `app.db.repositories.catalogue.CatalogueRepository` | session; create/list/get/review diagnostics/approved reads | Async; validates canonical candidate schemas, versions proposals, paginates pending queue, returns approved snapshots | catalogue integration |
| `app.modules.skill_generation.relation_validator.validate_endpoints_exist`, `validate_acyclic` | IDs/edges → none | Sync; explicit validation errors; prerequisite and hierarchy graphs are checked separately | graph unit/integration |
| `app.modules.skill_generation.reviewer.review_candidate` | session, admin UUID, resource identity, decision DTO → decision | Async; locks, authorises, validates, appends audit and snapshot in caller transaction | review HTTP/concurrency integration |
| `app.db.repositories.activities.ActivityRepository` | session; create/version/transition/safe read/private artifact read | Async; pins graph; private read is trusted-orchestrator-only and denied to API DB role; no grader execution | history integration |
| `app.db.repositories.jobs.JobRepository` | owned generation request/outbox event → job/message | Async; stable idempotency, safe owned job projection; does not run a worker | history integration |
| `app.db.repositories.evidence.EvidenceRepository` | session; submission/evaluation/evidence/correction/hint → persisted IDs | Async; attempt/activity locks, validity/ownership checks, append-only revisions and outbox. `append`/`list_for_skill` satisfy canonical `EvidenceRepositoryProtocol` | history integration |
| `app.db.repositories.planning.PlanningRepository` | owner, plan/reflection, confirmed/dismissed IDs → records | Async; learner confirmation and consent; self-report never becomes objective correctness | history integration |
| `app.db.repositories.selection.SelectionRepository` | trusted derived estimates/schedules/ranking → records | Async; no learning algorithm; checks injected configurable heuristic weights, defaults 0.40/0.35/0.25 | history integration |
| `src/scripts/_common.py` | root env/target → settings/Alembic config | Operator tooling only; validates non-production target/project; shared by bootstrap/seed/role commands | operator smoke |

### Transaction example

URL normalization example: `normalize_database_url("postgresql://user:password@host:5432/postgres")` returns a masked `SecretStr`; settings apply this automatically, so consumers use the existing `database_url` / `migration_database_url` fields. Do not log their unmasked values.

```python
from app.db.repositories.catalogue import CatalogueRepository
from app.db.session import transaction

async with database.sessions() as session:
    async with transaction(session):
        repo = CatalogueRepository(session)
        revision = await repo.create_candidate_revision(
            resource_type, resource_id, canonical_payload, source_id, actor_id
        )
        # Related writes belong here. Any exception rolls back ALL changes.
```

Public handlers use canonical response models, not `row.__dict__`. Long ELM/grading calls must not hold open this transaction. The isolated runner never receives a session.

## Frontend

| Module / functions | Inputs → outputs | Behaviour / errors | Tests |
|---|---|---|---|
| `@/lib/auth/server.createClient`, `client.createClient` | configured env → Supabase client | Server factory async, browser factory sync; share cookie-based SSR configuration | browser/provider smoke |
| `@/lib/auth/session.updateSession` | NextRequest → NextResponse | Async proxy refresh; preserves refreshed cookies, no private caching | browser smoke |
| `@/lib/auth/guards.getCurrentUser`, `requireAdmin` | session → verified Auth user/application profile | Async; redirect unauthenticated/student callers; backend still authorises | browser/HTTP tests |
| `@/lib/auth/actions` | form state/FormData → state or redirect | Async server actions: `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`; no application role accepted from signup | auth/browser tests |
| `@/lib/auth/validation.safeNext`, `passwordError` | redirect/password fields → safe path/error | Sync; fixed callback allowlist; shared form password policy | `tests/unit/auth.test.ts` |
| `@/lib/api/client.apiFetch` | relative API path/init → generated DTO | Async, server-only; bearer forwarding, no-store, timeout; `ApiError` contains HTTP status and safe message | review UI/HTTP tests |
| `@/lib/api/reviews` | filters/candidate/decision → serialisable result | Async server actions: list/detail/history/decision; return structured failure for stale/UI states | review components/browser |

### Frontend example

```ts
import type { components } from '@/types/generated/api';
import { apiFetch } from '@/lib/api/client';
const profile = await apiFetch<components['schemas']['UserProfile']>('/me');
```

Only use this API helper on the server. Client components call the reviewed server actions. Generate API types with `npm run generate:types`; never hand-edit them. No backend helper is imported into the browser, and `src/shared` is not an executable shared package.

## Maintaining this catalogue

For a new helper document its import, owner, arguments/result, async behaviour, side effects, failure modes, example and test. Remove stale entries alongside removed code. PR handoffs should name reused helpers or explain why superficially similar code has different semantics. Read the current source; this index is a discovery aid, not a competing contract.
# Shared helpers: discovery catalogue

This branch adds only the offline ingestion helpers below. Database/authentication helpers under
development on other branches remain owned by their components and must be merged additively.
Python imports start with `app` when running from `src/backend`. All listed functions are synchronous;
none calls ELM, opens a database session, authenticates a user, or approves a skill graph.

| Import path / owner | Inputs → outputs | Side effects and errors | Tests |
|---|---|---|---|
| `app.modules.skill_generation.parser.extract_pdf` / A | PDF path, `SourceMetadata`, optional `ParseOptions` → raw `ParsedDocument` | Reads local PDF; optional fixed Tesseract executable and temporary images. `IngestionError` for unreadable/encrypted/corrupt/oversized inputs; per-page OCR failures become diagnostics. | `test_pdf_cli.py`, `test_pdf_ingestion.py` |
| `app.modules.skill_generation.parser.reconstruct_document` / A | Raw document, optional corrections object → independent reconstructed document | No I/O; preserves raw records. `IngestionError` for stale/invalid corrections and hierarchy cycles. | `test_pdf_ingestion.py` |
| `app.modules.skill_generation.parser.parse_pdf` / A | Same source/options/corrections → reconstructed document | Convenience composition of extraction and reconstruction, with the same side effects/errors. | `test_pdf_cli.py` |
| `app.modules.skill_generation.payload_builder.build_generation_inputs` / A | Reconstructed document; selected unit codes, approved existing-skill summaries, byte ceiling, optional prompt → `(requests, manifest)` | Reads versioned prompt unless injected; no model call. Rights/quality/size failures become unit review reasons; invalid selections/settings raise `IngestionError`. | `test_pdf_ingestion.py`, `test_generation_input.py` |
| `app.modules.skill_generation.cli.export_artifacts` / A | Raw/derived document, requests, manifest, new output path → `None` | Atomically writes artifact directory; redacts source text without permission, refuses existing output. `IngestionError`/`OSError` on invalid target or export failure. | `test_pdf_ingestion.py`, `test_pdf_cli.py` |

Example (offline operator code):

```python
from app.modules.skill_generation.ingestion_models import SourceMetadata
from app.modules.skill_generation.parser import extract_pdf, reconstruct_document
from app.modules.skill_generation.payload_builder import build_generation_inputs

source = SourceMetadata("11111111-1111-4111-8111-111111111111", "https://example.invalid/source", "2024", "pending")
raw = extract_pdf("curriculum.pdf", source)
document = reconstruct_document(raw)
requests, manifest = build_generation_inputs(document)  # No text requests while rights are pending.
```

Reuse decision: searched the existing module and the database branch's helper catalogue. Graph
review/validation helpers are unrelated to layout parsing. The database repository's JSON checksum
requires backend dependencies and has different ownership; this offline module hashes source bytes
and serializes its own versioned artifacts without importing repository-private code. No second
configuration, authentication, HTTP, transaction or database helper is introduced. Internal ID/encoding
functions belong to ingestion and are not advertised as general application utilities.
