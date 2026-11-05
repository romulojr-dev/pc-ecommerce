# ADR 0012 — Staff auth on Better Auth

Status: **Accepted** · Date: 2026-11-05 · Story: #103 · Implemented by #104 (auth) and #105 (Admin)

## Context

Sprint 8 builds the Admin panel (AD-1 to AD-11). Admin needs sign-in, roles and a guard on every page and action. Customer accounts (FR-18, FR-19) were planned for the same sprint, but guest checkout already covers the buy flow, so they moved to Phase 2 in the PRD. The only people who sign in during the MVP are the shop's staff.

## Decision

**Better Auth, staff only.** It replaces "Auth.js or Better Auth" in the PRD's stack table. Better Auth has a first-class Prisma adapter, email and password built in and typed server APIs. Auth.js's credentials flow is the less supported path and would need hand-built password handling.

- **Public sign-up is disabled.** Staff and owner rows are created by hand with `pnpm staff:create`; the seed creates only the demo user (`pnpm db:seed --accounts-only`). Customers never get a `User`. *Changed by spec 039 (#104): was "created by the seed and, later, by the owner".*
- **Roles are `OWNER`, `STAFF` and `DEMO`** (a `UserRole` enum), held in `User.role` and owned by the server: the field is declared with `input: false`, so no request can set it. A `disabledAt` column blocks a user (`pnpm staff:disable`): sign-in is refused with the wrong-password answer, and `requireAdminSession()` refuses the user on every request and deletes the session it finds. *Changed by spec 039 (#104): upper-case enum and `disabledAt`.*
- **Only sign-in, sign-out and get-session are reachable over HTTP.** The catch-all auth route allows those three endpoints, by exact path and method, and answers 404 for everything else (password change, user update, session listing and so on). Better Auth's `disabledPaths` is kept as a second lock, but it compares exact strings, so it cannot switch off the two endpoints with a path parameter (`/callback/:id`, `/reset-password/:token`); the route's own allowlist does. A test lists every endpoint of the pinned version and fails when one is in neither list. *Changed by spec 039 (#104), after the verification in plan task 1.*
- **Plain `Session.token` is accepted.** The session cookie carries the token signed with the secret, and the database stores the token as it is. Sessions last 8 hours **absolutely** (`expiresIn` with the refresh disabled, so nothing extends one) and the cookie cache is off, so every request reads the session row: removing a user or a session takes effect on the next request. The cookie is `HttpOnly`, `SameSite=Lax`, and on https `Secure` with the `__Secure-` prefix. A hashed-token column would add nothing, because the browser already holds only the signed cookie value and the cache that would need it is off.
- **`verification.storeIdentifier: "hashed"`**, so a verification row never holds the plain identifier.
- **Rate limiting in the database, keyed by IP** (Better Auth's `rateLimit` with database storage, since serverless instances share no memory), on in every environment (Better Auth enables it only in production by default), 3 sign-ins per 10 seconds per IP. The login form signs in through the HTTP endpoint, because only the HTTP route runs the limiter. A request whose IP Better Auth cannot trust (none, or a forwarded chain of several addresses) shares one bucket instead of being unlimited.
- **Origin and CSRF checks are switched on explicitly.** Better Auth skips them under `NODE_ENV=test` unless told otherwise. Trusted origins are exact hosts, never a pattern: `NEXT_PUBLIC_SITE_URL` in Production, the deployment's own `VERCEL_URL` (and `VERCEL_BRANCH_URL` when Vercel sets it) on a Preview, `http://localhost:3000` locally.
- **`BETTER_AUTH_SECRET` differs in Production, Preview and Development** (and from `ORDER_LINK_SECRET`). Session tokens are stored as they are, and a preview database branch may hold copies of production rows, including live `Session` rows: with one shared secret a production cookie would open a preview. With separate secrets a copied row is useless there. Those rows stay until they expire (8 hours) or the daily cron deletes them; that residual is accepted. Previews should also sit behind Vercel's Deployment Protection.
- **There are no auth emails.** No verification, no password reset, no magic links. An owner resets a staff password by hand. This keeps the email outbox for orders only and leaves no mail-based takeover path.
- **Proxy approach.** `proxy.ts` makes an optimistic check, the presence of the session cookie, to redirect signed-out visitors away from `/admin`. It is not a security boundary. **The real check runs in each page and each server action**, which read the session and the role.
- **The Better Auth version is pinned** (exact version, no range), and Dependabot groups Better Auth packages into one pull request, so an upgrade is reviewed as a unit.

### Rate limiting and the client IP

Rate limits key on the client IP, so the IP must be one the client can't choose. Vercel's request-headers page ([https://vercel.com/docs/headers/request-headers](https://vercel.com/docs/headers/request-headers)) says Vercel overwrites `X-Forwarded-For` when the app is behind a proxy, "to prevent IP spoofing", and that Trusted Proxy is Enterprise-only.

The page **does not say** what happens to an `X-Forwarded-For` the client sends on a **direct** request, which is how this app is reached. Until that is known, the key is not assumed to be unspoofable. #104 verifies the behavior on a preview deployment (send a request with a forged header and see which value the app receives) and **updates this ADR with the result**; the story is not merged until the `RateLimit` key shows a real client IP.

What Better Auth 1.7.17 does with the header (verified in the story's tests): it reads `x-forwarded-for` only when it holds a **single** address; a chain such as `forged, real` is not trusted and falls into one shared `no-trusted-ip` bucket. So a client-sent header that Vercel *appends to* would put every visitor in one bucket (3 sign-ins per 10 seconds for all), and one that Vercel *keeps* would let a client pick its own bucket. Which of these happens is the open question.

**Result on a preview deployment:** *pending, recorded by the story's last task.*

### The demo role

Demo lets a reviewer see Admin without being able to change it, and without seeing customer data.

- **One guard.** Every Admin page and action goes through a single server function that reads the session and checks a permission.
- **A pure `can(role, permission)`** is the only place that maps roles to permissions: owner can do everything; staff can manage orders, see customers and adjust inventory; demo can view what owner can view and nothing that changes data. It has unit tests for every role and permission.
- **Masking at the DTO layer.** Admin reads return data transfer objects built by functions that take the role; for demo they replace names, emails, phone numbers and addresses with masked values before anything reaches a component. A page can't leak what its data never held.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Auth.js | Credentials is the less supported path; password hashing, sessions and rate limiting would be hand-built |
| Own session code | Security-critical code written for no gain |
| Customer accounts in the same sprint | Guest checkout covers the buy flow; accounts move to Phase 2 |
| Auth emails for staff (reset, verification) | Few users, all known to the owner; mail-based recovery is an attack path and a dependency for no benefit |
| Hashed `Session.token` or the cookie cache | The cookie cache would delay removal of a user; hashing the stored token adds nothing while the browser holds a signed value |
| Authorizing in `proxy.ts` alone | The proxy check is optimistic; pages and actions can be reached other ways |
| Hiding data for demo in the UI | A client-side mask still ships the data; masking in the DTO means it never leaves the server |

## Consequences

- Every request to Admin reads the session from the database; at the shop's scale this is cheap.
- A forged `X-Forwarded-For` may let someone dodge the sign-in limit until the preview check above is recorded; the accounts are few and passwords are at least 12 characters.
- Better Auth's tables are `User`, `Session`, `Account`, `Verification` and `RateLimit`; `Verification` is never written, and the daily cron (inside the existing release cron, each job in its own `try/catch`) deletes expired `Session` and old `RateLimit` rows.
- A new Admin screen must call the guard and build its data through a role-aware DTO; code review checks this.
- Customer accounts later add their own `User` kind or table; this ADR doesn't decide that.
