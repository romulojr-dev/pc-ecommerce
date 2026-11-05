# Tasks: spec 039 — staff sign-in on Better Auth, the admin shell and the demo account (#104)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only.

## 0. Housekeeping
- [x] Spec reviewed and approved with three fixes (cron runs all jobs then 500; disabled sessions deleted; `VERCEL_URL` required on Preview, `VERCEL_BRANCH_URL` optional)
- [x] Plan approved
- [x] Commit `spec.md`, `plan.md` and `tasks.md` on `104-staff-sign-in-on-better-auth-the-admin-shell-and-the-demo-account`

## 1. Verify Better Auth 1.7.17 (gate: stop and report if any probe fails)
- [x] `better-auth` installed at exactly `1.7.17`; `better-auth/adapters/prisma` resolves without the adapter package (else add `@better-auth/prisma-adapter`, exact)
- [x] `.github/dependabot.yml` with the `better-auth` / `@better-auth/*` group; T-pin and T-dependabot tests
- [x] Draft Prisma models and migration; `db:drift` clean on a scratch database
- [x] Probe: `disabledPaths` blocks every endpoint except sign-in, sign-out, get-session (full endpoint list of the pinned version). **Finding:** it matches exact strings, so `/callback/:id` and `/reset-password/:token` still respond; a route-level allowlist blocks them (verified)
- [x] Probe: rate limit applies to the HTTP sign-in, database storage, IP-and-path key, 3 per 10 s, on in test and production config; behavior with no IP recorded
- [x] Probe: `expiresIn` / `updateAge` give absolute 8-hour sessions
- [x] Probe: `verification.storeIdentifier: "hashed"`
- [x] Probe: cookie names and attributes in both modes; what `getSessionCookie` reads in each
- [x] Probe: `generateId: false` with `@default(cuid())` gives cuid ids
- [x] Probe: `input: false` on `role` and `disabledAt`
- [x] Probe: trusted origins, absent `Origin`, sign-out deletes only the caller's session, `disableSignUp`. **Finding:** Better Auth skips the origin and CSRF checks under `NODE_ENV=test` unless `advanced.disableOriginCheck: false` is set explicitly
- [x] Temporary `app/api/probe-env` route (an `_probe` folder would be private in the App Router) on the preview: `VERCEL_URL` present with Deployment Protection on, equal to the request host; `VERCEL_BRANCH_URL` presence recorded. **Result (2026-11-05):** `vercelEnv` preview, `VERCEL_URL` set and equal to the host, `VERCEL_BRANCH_URL` set (not equal to the deployment host the request used, as expected)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass
- [x] **Report to the user: pass/fail per probe. Do not start task 2 until they answer** (reported; user confirmed the preview result and asked to continue)

## 2. Environment and pure code
- [x] `lib/auth/env-schema.ts` and `lib/env.ts` (`BETTER_AUTH_SECRET`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `DEMO_ACCOUNT_PASSWORD`); `.env.example`, `ci.yml`, `vitest.db.config.ts`
- [x] `trustedOriginsFor`, `safeNext`, script guard (normalized hosts), password policy, rate-limit rule table, cleanup cutoffs
- [x] Unit tests U1–U12, U3b, U3c, U8b–U8d, env messages, script argument parser
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. The auth instance and its route
- [x] `lib/auth/auth.ts`, `client.ts`, `cookie.ts`; `app/api/auth/[...all]/route.ts`; headers in `next.config.ts`
- [x] Probe folded into the real instance; endpoint-set test kept
- [x] Integration tests I1–I16, I5b–I5d, I9, I11b, I11c, I29, I29b
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. The session guard and the proxy
- [x] `getAdminSession()` / `requireAdminSession()` (disabled user rejected on every call and that session deleted)
- [x] `proxy.ts` (matcher `/admin/:path*`, skips `/admin/login` and `/api/auth/*`, no `runtime`)
- [x] Tests R1–R5, I17, I17b, I17c. The static "every admin page reaches the guard" test (R7) moves to task 6, because `app/admin` does not exist yet
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. Accounts library, scripts and the seed mode
- [x] `lib/auth/accounts.ts`; `scripts/read-password.ts`; `scripts/staff.ts`; `staff:create`, `staff:set-password`, `staff:disable` entries
- [x] `db:seed --accounts-only` (demo only when missing, refused with `--reset`, 12-character minimum, host line, production rule)
- [x] Tests U9, U11, I18–I25, I24b, I28
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Login page and shell
- [x] Sample routes and components deleted; header Account icon removed; `sidebar` out of the reserved list
- [x] `/admin/login` (demo box, Use demo account, states of Rule 31), the shell, Orders placeholder, not-found, metadata
- [x] Static test that every admin page and layout calls `requireAdminSession` and `connection()` (R7, D9)
- [x] Tests R8–R12, I30, component tests
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. The cron: cleanup and isolated jobs
- [x] `cleanAuthTables`; `runReleaseCron` runs release, emails and auth-cleanup in separate `try/catch`, all always run, 500 and a log naming the failed job(s)
- [x] Tests I26, I27, I27b–I27f; existing release-cron tests updated
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. E2E
- [x] `e2e/accounts.ts`; Playwright `setup` project with `storageState` per role and the missing-account message; `.gitignore`
- [x] `e2e/admin-auth.spec.ts` E1–E16; `ci.yml` creates the accounts before E2E
- [x] Run against a scratch database in the Docker Postgres (dev server, and the production build with `CI=1`)

## 9. Docs
- [x] `docs/setup/admin-accounts.md`
- [x] README and CLAUDE.md
- [x] ADR 0012 ("Changed by spec 039 (#104)" notes, copied-sessions risk accepted) and the PRD `User` row
- [x] Spec status set to implemented, with "What changed while building"

## 10. Preview checks (merge gates)
- [x] Temporary `probe-env` route deleted
- [x] Forged `X-Forwarded-For` check (2026-11-05: key `112.203.62.40|/sign-in/email`, the real IP, so Vercel overwrites the header and no change is needed): the `RateLimit` key shows a real client IP (else `ipAddressHeaders` set and repeated); result and Vercel page cited in ADR 0012 and the PR
- [ ] Owner, staff and demo sign in on the preview; response headers; cookie `Secure` and `HttpOnly`; Deployment Protection on
- [ ] Acceptance criteria checked on the Preview URL
