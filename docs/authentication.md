# Authentication and catalogue review

**Implemented, pending design review.** Supabase Auth handles identity; FastAPI and the private PostgreSQL application tables handle authorisation. Hosted login, email delivery and database integration need credentialed verification.

## Configure Supabase

1. Enable email/password registration and email confirmation. Set the password policy to at least 12 characters; the UI accepts 12–128 characters.
2. Configure the site URL and exact Auth redirect URLs, including `http://localhost:3000/auth/callback` for development and the deployed site's `/auth/callback`. Do not allow arbitrary production redirects.
3. Configure an asymmetric signing key, default `ES256`. Set the access-token lifetime to 600 seconds for this deployment baseline. FastAPI checks issuer, audience (`authenticated`), algorithm, expiry, issued-at and UUID subject using JWKS.
4. Configure custom SMTP for real users. Supabase's default sender is restricted to authorised project-team addresses and a small testing allowance. SMTP configuration belongs in Supabase; no application email adapter or password table is needed.
5. Configure confirmation and recovery email templates for the supported PKCE redirect flow. Test links in the initiating browser; a missing/expired verifier or reused link returns the expired-link message. Never log callback codes or session cookies.

Backend `.env`:

```dotenv
SUPABASE_AUTH_URL=https://PROJECT_REF.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_JWT_ALGORITHM=ES256
```

Frontend `src/frontend/.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=REPLACE_WITH_PUBLISHABLE_KEY
SITE_URL=http://localhost:3000
API_BASE_URL=http://localhost:8000
```

The publishable key is designed for the browser. Never substitute a secret/service-role key or database password. Neither a Supabase secret key nor a JWT signing secret is needed by FastAPI's asymmetric verifier.

## Local verification tools

`src/scripts/check_services.py` performs read-only configuration/Auth/JWKS/database checks,
printing booleans and safe status values. `src/scripts/check_registration.py --email ADDRESS
--target development` checks confirmation and exactly matching application UUID/profile count
through the operator connection, without printing tokens/passwords. Frontend `.env.local` must
use the HTTPS Auth origin, not a copied SQL pooler connection URL. Startup and Windows-compatible
commands are in [the bridge runbook](skill_import_bridge.md). Existing confirmed accounts do
not prove signup; use a separate address and the initiating browser for a new student test.

## User journeys

- Register → confirmation email → callback exchanges the code → account page. A first API request idempotently creates a student profile. User-controlled metadata supplies display text only and cannot grant roles.
- Sign in → account page → authorised administrators open `/review`. Students receive an account page without reviewer access; API review routes independently reject them.
- Forgot password → generic response regardless of whether the account exists → recovery email → callback → new-password form → global refresh-session sign-out → sign in again.
- Sign out ends the current Supabase session. Already issued access tokens may remain valid until expiry. The API caches public signing keys for up to five minutes, and Supabase may also cache JWKS; key revocation is not instantaneous. Local `users.is_active=false` blocks subsequent application requests immediately after the database change is observed.

Next.js uses `@supabase/ssr` cookies and `proxy.ts` refresh for Next.js 16. Protected data is not statically cached. Server actions forward the session's bearer token to FastAPI; no browser PostgreSQL queries are made. The backend uses a restricted SQL login. Cookie/path redirects and UI hiding never replace server permission checks.

## Review workflow

The implemented global catalogue queue supports `skill`, `relation` and `outcome`. Only active application admins can use it. Instructor course-scoped review, generated-task review, user-management UI and academic grading decisions are outside this sample.

1. Filter the pending queue; pending means `proposed` or `under_review`.
2. Inspect the immutable payload, provenance, source-rights state and deterministic checks.
3. Supply a reason and approve/reject the exact `resource_version`.
4. The service locks the catalogue, rechecks the admin and version, validates approved endpoints and separate prerequisite/hierarchy cycle rules, then writes the accepted projection and decision atomically.
5. Approval publishes a new exact graph snapshot. Rejection retains the proposal and audit. Repeated/stale decisions return 409 and the UI reloads; no client-side status is authoritative.

An approved skill's pending edit remains a separate revision. Published tasks pin a graph version, so later catalogue edits do not reinterpret historical requirements. Review reasons and synthetic fixture data render as escaped text rather than raw HTML.

## Verification checklist

On a dedicated test project verify signup/confirmation, login, refresh, recovery, expired/reused links, logout, student/admin separation, local account disabling, signing-key rotation, and email delivery. Provider mocks verify JWT rejection locally; they do not prove Supabase project settings or SMTP delivery work.

Sources: [password flows](https://supabase.com/docs/guides/auth/passwords), [SSR](https://supabase.com/docs/guides/auth/server-side/nextjs), [JWT](https://supabase.com/docs/guides/auth/jwts), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
