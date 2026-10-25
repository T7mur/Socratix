# ADR 0001 — Supabase identity and PostgreSQL hosting

- Status: **Proposed**, pending Member F and affected-owner review
- Date: 2026-10-25
- Branch: `jk/database`
- Supersedes: the unimplemented Aiven hosting/authentication-vendor baseline in this branch's initial proposal

## Context

The user selected email/password registration, confirmation and password reset, then explicitly changed application database hosting from Aiven to Supabase. No deployed Aiven application schema exists to migrate.

## Decision

Use Supabase Auth and Supabase PostgreSQL while retaining SQLAlchemy/Alembic/FastAPI as the application boundary. Keep application tables in a non-exposed `socratix` schema. Auth UUIDs identify application users without modifying or adding cascading foreign keys to Supabase-managed tables. Application roles remain local and cannot be set through signup metadata.

Use asymmetric JWKS verification, explicit issuer/audience/expiry checks and short-lived access tokens. Next.js uses the supported SSR session integration. Database connections use TLS encryption (`sslmode=require`) and direct/session pooling on 5432, without a local CA-file requirement or requested server identity verification. Runtime SQL identities are restricted separately from operator credentials. The user-directed change is recorded in the change log; this ADR remains Proposed.

## Alternatives and consequences

Self-hosted password handling would duplicate provider functionality and recovery responsibilities. Supabase Data API access would require a separate browser-facing data policy; it is deliberately excluded from this implementation. One provider simplifies setup but couples Auth/database availability and connection budgeting. Custom SMTP is still required for general email delivery. JWT/signing-key revocation has expiry/cache windows.

## Verification and rollout

Require JWT negative tests, permission checks, migration/schema tests, generated contracts and credentialed Auth/SMTP/TLS smoke tests. No production or academic approval is implied. See [change log](../changes/CHANGELOG.md), [authentication](../authentication.md) and [setup](../database_setup.md).
