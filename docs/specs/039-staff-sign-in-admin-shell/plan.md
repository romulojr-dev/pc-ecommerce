# Plan: spec 039 — staff sign-in on Better Auth, the admin shell and the demo account (#104)

Spec: [spec.md](spec.md) (approved with three fixes 2026-11-05). Checklist: [tasks.md](tasks.md). Example IDs (U, I, R, E, T) and Rule numbers are the spec's. Branch: `104-staff-sign-in-on-better-auth-the-admin-shell-and-the-demo-account`. One commit per task, subject line only, no attribution trailer (the user's saved git preference; commit after each task, post-push fixes as a separate commit, `git push -u origin HEAD`).

## Context

Nothing of auth exists: no `User` table, no `proxy.ts`, no `app/admin`, `better-auth` is not installed. What exists and is reused: the env layer (`lib/env.ts` with per-topic schema modules and `createFinalSchema` for cross-variable rules), `normalizeHost` / `parseDatabaseUrl` ([lib/db-url.ts](../../../lib/db-url.ts)), the production guard idea ([lib/reset-guard.ts](../../../lib/reset-guard.ts)), the daily cron ([lib/orders/release-cron.ts](../../../lib/orders/release-cron.ts) and its route), `secretMatches` / `bearerOf`, the shadcn `components/ui/sidebar`, the reserved-slug list and its test, `logSafeFailure`, the E2E fixture in `e2e/test.ts`, `e2e/stock.ts` (production guard for helpers) and the throwaway Docker Postgres for `*.db.test.ts`.

## Findings that shape the plan

- **`normalizeHost` already lower-cases and strips `-pooler`** (Neon's pooled host), and `parseDatabaseUrl` applies it. The scripts' guard reuses it; only the tests U8b–U8d are new, plus a case for `PRODUCTION_DATABASE_HOST` itself being given in pooled form (`normalizeHost` is applied to it already in `reset-guard.ts`; the new guard must do the same).
- **`runReleaseCron` stops at the first failed release batch** (`break`) and gives the email loop what is left of the budget; its answer type is `{ status: 401 } | { status: 200 | 500; body: { released, skipped } }`. The approved rule is "all jobs run, then 500 naming the failed job(s)". So the function is restructured into three independently wrapped jobs (`release`, `emails`, `auth-cleanup`), a failed release batch counts as the `release` job failing, the body gains `emails` and `authCleanup` counts and a `failed: string[]`, and `logCronEvent` gets a failure line. `lib/orders/release-cron.db.test.ts` and `app/api/cron/release-orders/route.db.test.ts` change with it.
- **Better Auth's rate limiter lives in its request handler**, so only the HTTP route is limited; the login form uses the Better Auth client against `/api/auth/sign-in/email`, never `auth.api.signInEmail` (D4). Tests call `auth.handler(new Request(...))` so the limiter and origin check run.
- **Proxy**: Next 16 `proxy.ts`, Node runtime by default, `runtime` must not be exported (docs: `proxy.md`, "Runtime"). Server actions are POSTs to the page route, so the matcher covers them but nothing relies on it.
- **No Better Auth CLI output is committed blind**: the Prisma models follow spec §6 and are checked against what the pinned version's adapter expects in task 1 (model and field names, `RateLimit.key` unique, `lastRequest` as bigint).
- **`DEMO_ACCOUNT_PASSWORD` is now read by the app** (the login page's demo box) and by the seed, so it joins `lib/env.ts` (optional, ≥ 12 characters). `E2E_ACCOUNT_PASSWORD` is read by Playwright only and stays out of the app schema.
- **Existing things that change**: `lib/reserved-slugs.ts` (`sidebar` leaves; the test checks folders in `app/`), `components/layout/site-header.tsx` (Account icon), `app/login`, `app/signup`, `app/sidebar` and their components are deleted, `next.config.ts` (headers for `/admin` and `/api/auth`), `.github/workflows/ci.yml`, `vitest.db.config.ts`, `.env.example`, CLAUDE.md, README, ADR 0012, the PRD `User` row. `e2e` has no reference to the Account icon or `/login`.

## Risks to settle early

1. **Every spec assumption about Better Auth 1.7.17** (task 1). Task 1 is a gate: if any probe fails, stop, report, and do not plan or build tasks 2–10 around it.
2. **`VERCEL_URL` under Deployment Protection** (Vercel's page says it "cannot be used in conjunction with Standard Deployment Protection", ambiguous). Checked on a real preview in task 1 with a temporary route, reverted before the story ends. If the variable is absent with protection on, stop and report.
3. **The forged `X-Forwarded-For` question** (spec Rule 13, a merge gate) is answered in task 10 on the final preview, not earlier, because it needs the real sign-in route.
4. **Rate limit vs tests and E2E**: 3 sign-ins per 10 s per IP. Every test that signs in repeatedly sets its own `X-Forwarded-For`; the Playwright setup gives each role its own. A test that forgets fails visibly (429), not silently.
5. **Cookie names differ between `http://localhost` and https**, and the proxy must look for the right one. One constant/function in `lib/auth/cookie.ts` is used by the auth config and the proxy, and the test checks both modes.
6. **Deploy window**: the migration only adds tables and an enum; nothing in the storefront reads them. Production gets no accounts until `staff:create` / `db:seed --accounts-only --production` is run by hand (document, task 9).

## Steps

### 0. Housekeeping
Commit `spec.md`, `plan.md` and `tasks.md`.

### 1. Verify Better Auth 1.7.17 (gate)
- Install `better-auth` at exactly `1.7.17` (`pnpm add --save-exact`), check that `better-auth/adapters/prisma` resolves without `@better-auth/prisma-adapter`, add the adapter (also exact) only if it doesn't (D1). Add `.github/dependabot.yml` with the `better-auth` group (D2) and the T-pin / T-dependabot unit tests.
- Add the draft Prisma models and migration of spec §6 (needed to prove cuid ids against a real database); `db:drift` clean on a scratch database.
- A probe auth instance in `test-support/auth-probe.ts` with the configuration the spec relies on, and `lib/auth/assumptions.db.test.ts` proving, each as its own test:
  1. **disabledPaths**: every endpoint of the pinned version (listed from the instance's own endpoint table) other than sign-in, sign-out and get-session answers 404 over HTTP; an unlisted endpoint fails the test (I4).
  2. **Rate limit**: applies to the HTTP sign-in, stored in the database (`RateLimit` row appears), keyed by IP and path (the key holds the `X-Forwarded-For` value), 3 per 10 s with the 4th refused (429), another IP unaffected, **enabled in `NODE_ENV=test` and in a production build config**; what happens with no IP header (D8: shared bucket or skipped?).
  3. **Absolute sessions**: with the chosen `expiresIn` / `updateAge`, `expiresAt` doesn't move across requests inside 8 h (clock moved), and a session over 8 h old is rejected.
  4. **`verification.storeIdentifier: "hashed"`**: a created verification row holds a hash, not the identifier.
  5. **Cookies**: names and attributes in both modes (`http://localhost` no prefix / no `Secure`; https `__Secure-` + `Secure`), `HttpOnly`, `SameSite=Lax`, `Path=/`; what `getSessionCookie` looks for in each mode.
  6. **`generateId: false` with `@default(cuid())`**: ids of `User`, `Session`, `Account` match the cuid shape.
  7. **`input: false` on `role` and `disabledAt`**: a sign-in body (and a sign-up attempt that is refused anyway) carrying them changes nothing; the field can be set by the server code that creates users.
  8. **Origin check**: trusted origins accept the configured hosts and refuse others, and what it does when `Origin` is absent (curl) is recorded.
  9. **Sign-out** deletes only the caller's session row (two sessions of one user).
  10. **`disableSignUp: true`** makes `sign-up/email` answer 404 or the documented refusal.
- A temporary route (`app/api/_probe/route.ts`, `noindex`, returns only booleans: is `VERCEL_URL` set, does it equal the request's `Host`, is `VERCEL_BRANCH_URL` set) pushed to the branch's preview and read with Deployment Protection on (a temporary protection bypass, removed after). The result goes in the report. The route is deleted in task 10's commit and must not reach `main`.
- **Stop here and report**: pass/fail per probe (with Better Auth's actual behavior for any difference). A failed or different assumption changes the spec first (the user decides); tasks 2–10 are not started until then.

### 2. Environment and pure code
- `lib/auth/env-schema.ts`: `BETTER_AUTH_SECRET` (≥ 32 bytes), the cross-rule against `ORDER_LINK_SECRET`, `VERCEL_URL` (required when `VERCEL_ENV` is `preview`), `VERCEL_BRANCH_URL` (optional), `DEMO_ACCOUNT_PASSWORD` (≥ 12); wired into `lib/env.ts`'s `createFinalSchema`; `.env.example`, `ci.yml` (dummy secret, demo and E2E passwords), `vitest.db.config.ts`.
- `lib/auth/origins.ts` (`trustedOriginsFor`), `lib/admin/safe-next.ts`, `lib/auth/script-guard.ts` (production decision on `normalizeHost`, `--production`, local-host fallback), password policy, `lib/auth/rate-limit.ts` rule table, `cleanupCutoffs`.
- Tests: U1–U12, U3b, U3c, U8b–U8d, the env messages, the script argument parser.

### 3. The auth instance and its route
- `lib/auth/auth.ts` (final configuration of Rules 4–11, `nextCookies()` last), `lib/auth/client.ts`, `lib/auth/cookie.ts`, `app/api/auth/[...all]/route.ts`, headers in `next.config.ts` for `/admin/:path*` and `/api/auth/:path*`.
- Fold task 1's probe into the real instance; keep the endpoint-set test (I4) and the assumption tests that still make sense against the real config (rename, delete the probe).
- Integration tests: I1–I16, I5b–I5d, I9, I11b, I11c, I29, I29b (against `auth.handler`).

### 4. The session guard and the proxy
- `lib/admin/session.ts`: `getAdminSession()` (request-cached, rejects a disabled user and deletes that one session), `requireAdminSession()` (redirects to `/admin/login`).
- `proxy.ts` with the `/admin/:path*` matcher, skipping `/admin/login` and `/api/auth/*`, no `runtime` export.
- Tests: R1–R7 (R5 reads the source), I17, I17b, I17c, and the static test that every `page.tsx` / `layout.tsx` under `app/admin` (except login) reaches `requireAdminSession` (R7, D9).

### 5. Accounts library, scripts and the seed mode
- `lib/auth/accounts.ts` (`createStaffUser`, `setStaffPassword`, `disableStaff`, `enableStaff`, `ensureDemoUser`, each taking a client and returning a result value), `scripts/read-password.ts` (hidden prompt, stdin when not a TTY), `scripts/staff.ts` and the three `pnpm` entries, `prisma/seed.ts` `--accounts-only` (refused with `--reset`, host line, production rule, demo only when missing, `ON CONFLICT DO NOTHING`).
- Tests: U9, U11, I18–I25, I24b, I28; the scripts' output strings from the copy table.

### 6. Login page and shell
- Delete `app/login`, `app/signup`, `app/sidebar` and the sample components (`login-form`, `signup-form`, `team-switcher`, `app-sidebar`, `nav-*`); remove the header's Account icon; remove `sidebar` from the reserved list.
- `app/admin/login/page.tsx` (per request, demo box rendered on the server, `next` through `safeNext`), `components/admin/` (login form with the busy, error and rate-limited states of Rule 31, shell, sidebar, sign-out button), `app/admin/(shell)/layout.tsx`, redirecting index, the Orders placeholder, `not-found.tsx`, metadata (`noindex`, no canonical), `connection()` in each.
- Tests: R8–R12, I30, component tests for the form states and the shell markup; accessibility attributes (live region, focus on error).

### 7. The cron: cleanup and isolated jobs
- `lib/auth/cleanup.ts` (`cleanAuthTables`), `runReleaseCron` restructured to run `release`, `emails` and `auth-cleanup` each in its own `try/catch`, all always run, 500 and a log line naming the failed job(s), body with each job's counts; the route stays as it is.
- Tests: I26, I27, I27b–I27f; the existing release-cron tests updated for the new body.

### 8. E2E
- `e2e/accounts.ts`, the Playwright `setup` project (one sign-in per role with its own `X-Forwarded-For`, `storageState` in git-ignored `e2e/.auth/`, the missing-account message), `playwright.config.ts` dependencies, `.gitignore`.
- `e2e/admin-auth.spec.ts` E1–E16. `ci.yml` creates the three accounts (scripts with stdin, `--accounts-only`) after the seed, before E2E.
- Run against a scratch database in the Docker Postgres, dev server once and the production build with `CI=1` once.

### 9. Docs
- `docs/setup/admin-accounts.md` (both Neon cases, the one command block, system variables setting, Deployment Protection on, per-environment `BETTER_AUTH_SECRET` and why, the public demo password, resetting a staff password, rotating the secret), README (demo account, setup pointer), CLAUDE.md (routes paragraph, commands, a "Staff sign-in" paragraph), ADR 0012 (every "Changed by spec 039 (#104)" note of spec §9 and the accepted copied-sessions risk), PRD `User` row, spec status.

### 10. Preview checks (merge gates)
- Delete the temporary probe route.
- On the final preview: the forged `X-Forwarded-For` check (Rule 13; the `RateLimit` key must show a real client IP; if not, set `ipAddressHeaders` to Vercel's own header, redeploy and repeat), results and the Vercel page cited written into ADR 0012 and the PR; sign in as owner, staff and demo; headers in the network tab; the cookie is `Secure`, `HttpOnly`; the origin check accepts the preview URL in use; Deployment Protection on.
- Tick the story's acceptance criteria on the preview URL.
