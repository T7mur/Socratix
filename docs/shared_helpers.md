# Shared helpers: find before adding

These helpers are implemented. Search the named module with `rg` and read its contract before reuse. Owner F maintains infrastructure; Member A owns catalogue validation/review. Extend compatibly with affected-owner review. Do not move domain policy into a generic utility merely to eliminate similar-looking code.

## Import bridge helpers — implemented draft, A/F review pending

| Import path / owner | Inputs → outputs | Async, effects and errors | Example / tests |
|---|---|---|---|
| `app.modules.skill_generation.import_artifacts.load_artifacts` / A | directory, optional unit codes → `PreparedImport` | Sync reads/rebuilds artifacts, no writes/network. Safe domain ValidationError for inconsistent/unsupported evidence | `load_artifacts(Path('outputs/source'), ['AI-ML'])`; `test_skill_import.py` |
| `app.modules.skill_generation.candidates.validate_batches` / A | request/batch pairs, approved graph → canonical resources with span evidence | Sync/pure. Uses canonical DTOs and existing graph validators; rejects unsupported references/IDs/cycles. No approval | Called once per complete unit; `test_skill_import.py` |
| `app.modules.skill_generation.importer.import_configuration`, `extraction_prompt` / A | settings/permission/units → non-secret config; none → versioned prompt | Sync prompt reads/hash; no provider or DB writes | `import_prepared`; fingerprint tests |
| `app.modules.skill_generation.importer.preflight` / A/F | database, actor, prepared input → none | Async read-only revision/admin/source/approved-context checks; ConflictError, ForbiddenError, ValidationError, SQL errors | CLI dry-run; disposable bridge tests |
| `app.modules.skill_generation.importer.import_prepared` / A | database/gateway/settings/input/actor/permission, dry-run flag → report + exit code | Async orchestrator; manages short transactions and bounded gateway calls. Unit atomicity; no DB transaction during model calls. Safe failures in report; unavailable infrastructure can propagate to CLI | `import_skills.py`; orchestration + disposable bridge tests |
| `app.modules.skill_generation.importer.write_report` / A | report, output root → report path | Sync atomic file replacement. No database/model calls. OSError on unavailable output | `write_report(report, Path('outputs/skill-imports'))`; report tests |
| `app.db.repositories.skill_imports.import_lock` / F | engine, fingerprint → async lock context | Dedicated session advisory lock; no open transaction during body. ConflictError on concurrent run; DB errors propagate | `async with import_lock(engine, fingerprint)`; disposable concurrency test |
| `app.db.repositories.skill_imports.SkillImportRepository` / F | caller session; actor/source/run/chunk/resource/evidence inputs → rows, reports, admin evidence | All methods async, caller-owned transactions; never commit. `require_admin`, `check_source`, `start`, `chunks`, `checkpoint`, `persist_unit`, `finish`, `report`, `evidence`. Writes only sources/spans/import ledger and delegates catalogue revisions to CatalogueRepository. Reports missing run with NotFoundError; conflicts/permission failures explicit. Evidence reads return empty on 0005 | `SkillImportRepository(session).report(run_id)`; disposable bridge tests |
| `src/scripts/_common.configure_event_loop` / F | none → none | Sync Windows selector policy, no effect elsewhere; call before asyncio.run/uvicorn | check/seed/role/import/serve scripts; Windows operator smoke |

`SkillImportRepository.validation_graph()` acquires the shared catalogue transaction lock before
reading the graph for final unit validation, keeping concurrent approval and unit insertion consistent.

Reuse decision: reuse the canonical review DTOs, checksums, target/settings/database lifecycle,
catalogue transaction lock/revision repository and graph validators. Keep generation policy in A
and persistence in F. Student activity generation jobs cannot represent curriculum import history.
`check_connection` now reports client TLS as `tls` and separate pooler/backend `server_tls`.

## Backend

Progress additions (implemented draft, A/F review pending):

| Import path / owner | Inputs → outputs | Effects / errors | Tests |
|---|---|---|---|
| `app.modules.skill_generation.importer.ImportProgress`, `ProgressCallback` / A | Internal phase/count/unit/chunk/run observation → synchronous optional callback | `import_prepared(..., progress=callback)` emits after durable checkpoints/commits; no new schema, provider call or fingerprint input. Callbacks must not perform domain writes | `test_import_orchestration.py` |
| `app.db.repositories.skill_imports.SkillImportRepository.latest_run` / F | actor UUID → active/latest run UUID | Async read-only; caller-owned transaction. Most recent queued/running, otherwise latest finished; NotFoundError if absent. `report()` additionally exposes per-chunk `checkpointed`, excluding semantically rejected results | Watcher + disposable repository tests |
| `src/scripts/_import_progress.ImportProgressDisplay`, `progress_from_report` / F | Internal event or operator report → stderr bar/status | Async display context with cancellable heartbeat; sync update/format functions. No stdout/DB/provider operations. Closed stderr disables display rather than aborting import. Example: `async with ImportProgressDisplay() as display` | `test_import_progress.py` |
| `src/scripts/import_skills.watch_run` / F | database, admin actor, run UUID or latest, callback → final report/exit code | Async polling every 2 seconds using short read-only transactions. No model calls; cancellation stops only polling. Permission/not-found/SQL errors propagate to safe CLI handling | `test_import_progress.py` |

Reuse decision: the watcher uses the existing private ledger/report/admin checks rather than
creating a second job tracker or touching the active process. The display uses the standard
library, preserving JSON stdout and leaving generated API contracts unchanged.

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
# Shared helper catalogue

Implemented on `jk/llm_gateway`; Member F owns these helpers, consumer review pending.
Search this catalogue and code with `rg` before adding helpers. Domain rules stay with owners.

| Import | Purpose and inputs → outputs | Async, effects and errors | Example and tests |
|---|---|---|---|
| `app.core.llm_config.LLMSettings` | Environment/explicit LLM values → settings, secret key | Sync; dotenv read; Pydantic errors hide input | `LLMSettings(_env_file=".env")`; endpoint/precedence tests |
| `app.core.config.get_settings` | No args → cached backend settings | Sync; environment/dotenv read; no network; validation errors | `get_settings()`; lifecycle tests |
| `app.integrations.elm.ELMGateway.generate_text` | Keyword operation, alias, system prompt, payload → str | Async; network/retries; safe typed LLM errors | See integration example; request/retry/privacy tests |
| `app.integrations.elm.ELMGateway.generate_json` | Same plus Pydantic class → JSON-compatible dict | Async; network/schema repair; typed LLM errors | `await gateway.generate_json(..., schema=Draft)`; Pydantic/budget tests |
| `app.integrations.elm.ELMGateway.generate_schema_json` | Same plus JSON Schema dict → JSON value, operator use | Async; no remote schema retrieval; typed LLM errors | `await gateway.generate_schema_json(..., schema={"type":"object"})`; schema/CLI tests |
| `app.integrations.elm.ELMGateway.aclose` | No args → None; closes client | Async; releases connections | Prefer `async with ELMGateway(settings)`; cancellation/cleanup tests |

Errors derive from `LLMError`: configuration, provider or output failures. All gateway inputs
are keyword-only. Tests live in `tests/unit/infrastructure/test_llm.py` under the backend.
Full examples and semantics: [LLM integration](llm_integration.md).
