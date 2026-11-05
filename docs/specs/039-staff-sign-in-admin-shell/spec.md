# 039 — Staff sign-in on Better Auth, the admin shell and the demo account

Status: implemented (2026-11-05; approved with three fixes, see "Changes made by the review" at the end of §10, and "What changed while building" there). Issue: [#104](https://github.com/romulojr-dev/pc-ecommerce/issues/104) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8, size L). PRD: AD-11 (roles), NFR Security. [ADR 0012](../../adr/0012-staff-auth-on-better-auth.md) (accepted in #103). Part 1 of 2: permissions, the guard, audit and masking are [#105](https://github.com/romulojr-dev/pc-ecommerce/issues/105).

Long form: the story adds a package, six tables, an auth configuration, a rate limit, a proxy, a route group, three scripts, a seed mode, a cron job and a setup document. **It asks to change ADR 0012 and the PRD's `User` row** (§9, "Conflicts").

## 1. Summary

Shop staff sign in with email and password at `/admin/login` and land in a protected `/admin` shell; a public **demo** account lets a reviewer sign in too. Accounts are created by scripts and the seed, never over HTTP: public sign-up is off, `role` can't be set by any request, and only sign-in, sign-out and get-session answer. Sign-in is rate-limited per client IP in the database, in every environment. This story builds the **foundation**: after it, a signed-in person sees an empty shell (a placeholder Orders page, their name and role, Sign out). It shows no shop data and has no permissions, so a demo account is harmless until #105 adds `can()`, the guard, audit and masking.

## 2. Behavior

### Accounts (data)

1. Five tables hold the auth state: `User`, `Session`, `Account`, `Verification`, `RateLimit`. Ids are `cuid`s made by the database default, not by Better Auth. `User` has `role` (`UserRole`: `OWNER`, `STAFF`, `DEMO`) and `disabledAt` (null: active). The password hash is in `Account`, never in `User`. `Verification` is never written (there are no auth emails); the table exists because Better Auth's schema has it.
2. Nobody signs up. The sign-up endpoint answers 404. A request that carries `role` (or `disabledAt`) in any body is ignored or refused; the stored value never comes from a request.
3. Accounts reach a database in exactly three ways (§ "Account scripts"): `pnpm staff:create`, `pnpm staff:set-password`, `pnpm staff:disable`, and `pnpm db:seed --accounts-only` (the demo user). Nothing else writes `User` or `Account`. `pnpm db:seed` without the flag, `--reset` and `resetCatalog()` don't touch these tables.

### The auth endpoints

4. The catch-all route `app/api/auth/[...all]` serves **three** endpoints: sign in with email and password, sign out, get session. Every other endpoint Better Auth ships (sign-up, change password, update user, change email, delete user, list/revoke sessions, link/unlink account, reset/verify email, `ok`, `error` and the rest) is in `disabledPaths` and answers 404. A test knows the pinned version's complete endpoint list and **fails when one is neither allowed nor disabled and responds**, so a Better Auth upgrade that adds an endpoint can't open a door silently.
5. A session lasts **8 hours from sign-in, absolutely**: `expiresIn` is 8 h and `updateAge` is set so that no request can extend it (the refresh never fires inside the lifetime). Using the session, calling get-session or signing in again elsewhere never moves an existing session's `expiresAt`. The cookie cache is off: every request reads the `Session` row, so deleting a row or disabling a user ends access on the next request. **Cookie attributes:** `HttpOnly`, `SameSite=Lax`, path `/`, and outside localhost (Production and Preview, i.e. https) `Secure` with the `__Secure-` name prefix. Over `http://localhost` (local runs, and CI, which serves the production build there) the cookie has no prefix and no `Secure`, so it is still set and read. A test reads the `Set-Cookie` header of a sign-in response for both cases.
6. `verification.storeIdentifier` is `hashed`. There is no other plugin than `nextCookies()`, and it is last.
7. Better Auth's `baseURL` and trusted origins (its CSRF defence) are built from the environment, with **no host pattern**: in **Production** the one origin is `NEXT_PUBLIC_SITE_URL`; on a **Preview** it is the deployment's own exact hosts, `https://` + `VERCEL_URL` and `https://` + `VERCEL_BRANCH_URL` (the per-deployment and the per-branch addresses); locally it is `http://localhost:3000`. Any other origin gets a refusal; `*.vercel.app` as a whole is never allowed. Both Vercel variables are added to the env schema. **`VERCEL_URL` is required when `VERCEL_ENV` is `preview`** (a Preview with system variables switched off fails at startup instead of rejecting every sign-in). **`VERCEL_BRANCH_URL` is optional and trusted only when present**: Vercel's page does not say it is set for every deployment, so its absence is never an error and never widens the list. Sources: [Vercel, System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables) (page updated 2026-07-15) says both values "do not include the protocol scheme https://" and are "Available at: Both build and runtime"; it **does not say** that `VERCEL_BRANCH_URL` exists only for Git deployments (nor that it exists for CLI ones), so that is unconfirmed and the optional treatment covers either. The page's setting is called **"Enable access to System Environment Variables"** (not "Automatically expose…"); `docs/setup/admin-accounts.md` says it must be on. The same page notes that `VERCEL_URL` "cannot be used in conjunction with Standard Deployment Protection"; task 1 of the plan checks on a preview that the value is still present with Deployment Protection on (Open question 2).
8. Passwords are at least **12** characters (D6), hashed by Better Auth. A wrong password, an unknown email and a disabled user all give the **same** answer, so the form can't be used to find out who has an account (D7).

### Rate limiting

9. Rate limiting is **on in every environment** (Better Auth enables it only in production by default; here it is set explicitly), stored in `RateLimit` (serverless instances share no memory), keyed by **client IP and path**. Sign-in allows **3 requests per 10 seconds** per IP; the rest of the auth routes keep Better Auth's default window. The 4th sign-in inside 10 seconds is refused with 429 and a retry delay, **whether or not its password is right**, until the window ends.
10. A limit on one IP doesn't affect another: after IP A is limited, a correct demo login from IP B succeeds.
11. A request whose IP can't be determined is **not unlimited**: it falls into one shared bucket (D8). The plan must check this against the pinned version; if Better Auth skips limiting without an IP, a small wrapper supplies the bucket key.
12. Sign-in must go through the **HTTP endpoint**, not a server action calling `auth.api.signInEmail`: the limiter sits in Better Auth's request handler, and a direct `auth.api` call skips it.
13. **Which IP the app sees is verified on a preview deployment and is a merge gate**: the story is not merged until the `RateLimit` key from that check shows a real client IP (never the forged value), recorded in the PR. The check: send a sign-in request with a forged `X-Forwarded-For: 203.0.113.7` straight to the preview, then read the `RateLimit` row's key (it holds the IP the app used; no debug endpoint is added). If the key holds the forged value, the forged header gets through; then `advanced.ipAddress.ipAddressHeaders` is set to the header Vercel itself sets, and the check is repeated. The result, the page cited and the Vercel header used are written into ADR 0012 in the same PR. The preview is behind Vercel's protection, so the check uses a temporary protection-bypass for that one run (turned off after; payments.md forbids leaving it on).

### Routes and the shell

14. `proxy.ts` (Node runtime; no `runtime` export, because Proxy throws if it is set) runs on `/admin/:path*` only, and **skips `/admin/login` and `/api/auth/*`** (the first by an explicit exclusion in the matcher or an early return, the second because it is outside the matcher). It checks that the **session cookie exists** (`getSessionCookie`) and otherwise redirects to `/admin/login`. It validates nothing and is not a security boundary. A signed-out visit to `/admin/login` renders the form with no redirect.
15. **The real check** is one data-access function every `/admin` page and layout calls: `getAdminSession()` reads the session (Better Auth, from the request headers), loads the user, and returns it only when the session is valid and **`disabledAt` is null, checked on every call (every request), not only at sign-in**. When it finds `disabledAt` set it **also deletes that session row** (only that one; the user's other sessions go the same way when each is used, and `staff:disable` already removed them all), so clearing `disabledAt` later does not bring an old cookie back: the person signs in again; the guarded variant `requireAdminSession()` redirects to `/admin/login` otherwise. #105's `adminAction` / `adminRoute` build on it. A pure function in the page that skipped the call would be a bug; a test lists every `page.tsx` and `layout.tsx` under `app/admin` (except login) and fails if one doesn't reach it (D9).
16. **Every `/admin` response** is per request (`connection()`), `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `noindex`, with no canonical, and the pages are not in the sitemap. `admin` stays a reserved slug. `/api/auth/*` responses are `no-store`.
17. `/admin/login` shows the sign-in form and, when `DEMO_ACCOUNT_PASSWORD` is set, a **demo account box** rendered on the server from the environment: the demo email, the demo password, and a **Use demo account** button that fills the two fields (it doesn't submit). With the variable unset, the box is absent. The page is per request, so the box always matches the running environment, and the password is public by design (D17). Submitting posts to the sign-in endpoint; on success the browser goes to `/admin/orders`, or to `next` when the visitor was sent to login from another `/admin` page. `next` is used only when it is a path starting with `/admin` and not `//` or a scheme (D10). A signed-in visitor who opens `/admin/login` goes to `/admin/orders`; one whose cookie is stale sees the form (no redirect loop).
18. `/admin` (the bare path) redirects to `/admin/orders`. **`/admin/orders` is a placeholder** in this story: the shell with the heading "Orders" and the text in §5 ("The order list comes with the Admin panel."). It reads no order. Staff, Owner and Demo all land there (D3).
19. The shell is a layout for everything under `/admin` except login: a sidebar (shadcn `Sidebar`, built from the existing `components/ui/sidebar`) with the shop name and one nav item, **Orders**; a header with the signed-in person's name, role label and a **Sign out** button. "Shows only what the role can use" is true by construction here: every role can use the one item. #105 makes the nav depend on `can()`.
20. **Sign out** posts to the sign-out endpoint, deletes **only the caller's own `Session` row**, clears the cookie and goes to `/admin/login`. After it, the old cookie value no longer opens `/admin/orders`. The demo account is shared, so other sessions of the same user (other reviewers) stay signed in; sign-out never deletes by user id.
21. A signed-out visitor to `/admin/anything` (including an unknown path) ends at `/admin/login`; a signed-in visitor to an unknown `/admin/…` path sees the not-found page inside the shell.
22. The sample routes `/login`, `/signup` and `/sidebar` and their components (`login-form`, `signup-form`, `team-switcher`, `app-sidebar` / `nav-*` with sample data) are removed or replaced: `/admin/login` and the admin shell use new components with no sample data. The **Account icon is removed from the storefront header**; staff reach Admin by its URL (nothing public links to it). `/login` and `/signup` become ordinary 404s but **stay reserved slugs** (customer sign-in is Phase 2, D11); `sidebar` is removed from the reserved list. CLAUDE.md's description of these routes is rewritten.

### Account scripts

23. `pnpm staff:create --email <e> --name <n> --role owner|staff` creates a user and its password account. The password comes from a **hidden prompt** on a terminal, or from **standard input** (one line) when stdin isn't a terminal. It is never taken from an argument or an environment variable, never echoed, never logged and never in an error message. `--role demo` is refused here (the demo user comes from the seed). An existing email is an error ("already exists"), except with `--enable` (point 26).
24. `pnpm staff:set-password --email <e>` reads the new password the same way, replaces the hash and **deletes all of that user's sessions**. An unknown email is an error.
25. `pnpm staff:disable --email <e>` sets `disabledAt` and deletes the user's sessions; the user can't sign in and any cookie they hold stops working. Running it on an already-disabled user is a no-op with a message.
26. `pnpm staff:create --email <e> --enable` clears `disabledAt` for an existing user (no new password, no role change). The user then signs in with the password they had.
27. **All three scripts print the target database host first**, then ask nothing more and write. They **refuse production unless `--production` is passed**, and refuse `--production` on a database that isn't production (so the flag can't become a habit). "Production" is the host in `PRODUCTION_DATABASE_HOST` (as the reset guard does), **compared after normalizing both sides**: lower-cased, and Neon's `-pooler` suffix removed from the first label, so the pooled and the unpooled URL of one branch count as one host (the existing `normalizeHost` is checked first and extended only if it doesn't already do this). Running a `staff:*` command against a remote dev branch needs `PRODUCTION_DATABASE_HOST` in `.env.local` too, or the command is refused. When that variable is unset, the scripts accept only a local host (`localhost`, `127.0.0.1`, `[::1]`, which covers Docker and CI) and refuse any other, saying to set it in `.env.local` (D12). Errors never print a password or a full connection string.
28. `pnpm db:seed --accounts-only` creates the **demo user** (`DEMO` role, name "Demo reviewer", email `demo@pcsilicon.tech`) **only when no user has that email**, with the password from `DEMO_ACCOUNT_PASSWORD`. With the variable unset it writes nothing and prints "DEMO_ACCOUNT_PASSWORD is not set; skipped the demo account." (exit 0). An existing demo user is left exactly as it is (its password is not reset, even if the variable changed). The mode touches no catalog table, prints the host first, and is refused with `--reset`. It follows the same production rule as the scripts (the demo account on Production needs `--production`).
29. `docs/setup/admin-accounts.md` says, for **local**, **preview** and **production**, which database each uses, which variables to pass (`DATABASE_URL`, `PRODUCTION_DATABASE_HOST`, `DEMO_ACCOUNT_PASSWORD`, `BETTER_AUTH_SECRET`) and the exact commands in **one command block**, so "sign-in works on a preview URL" is checkable. Local runs use the Neon `dev` branch; **each preview gets its own Neon branch through the Vercel integration**. The document covers both cases: previews branched from production **inherit its accounts** (users, hashed passwords and sessions), so nothing needs creating, and a preview branched from anything else needs the accounts command run against that branch (its `DATABASE_URL` passed inline). It also says: "Enable access to System Environment Variables" must be on in Vercel (Rule 7), and **Deployment Protection must be on for previews** (they hold copied data, signed-in sessions and the public demo box); the demo email and password are shown on `/admin/login` and in the README (D17; the account can change nothing and sees masked data once #105 lands); how an owner resets a staff password by hand; and **`BETTER_AUTH_SECRET` is different in Production, Preview and Development**, and why (session tokens are stored as they are, and a preview branch may hold copies of production rows, so a shared secret would let a cookie signed in one environment open another); rotating it signs everyone out. The E2E accounts (`E2E_ACCOUNT_PASSWORD`, `DEMO_ACCOUNT_PASSWORD`, then the commands) are in the same block.

### Cleanup

30. The existing daily cron (`/api/cron/release-orders`; **no new route and no new `vercel.json` entry**) also calls `cleanAuthTables(now)`, which deletes **expired `Session` rows** (`expiresAt` in the past) and **`RateLimit` rows** whose last request is more than one hour old (every window is shorter). Each of the cron's jobs (the release, the emails, the cleanup) runs in **its own `try/catch`**, so a failure in one never stops the others: **all jobs always run**, then, if any failed, the response is 500 and one log line names which job(s) failed (job name and error name only), with each job's counts in the body. The cleanup is tested directly and through the route; it has no secret of its own (the route's `Authorization: Bearer ${CRON_SECRET}` check comes first: unset secret, 401, nothing read). It writes one log line with the two counts and never touches users, accounts or an unexpired session.

### Empty, loading and error states

31. **Login form** (and the demo box, Rule 17: pressing Use demo account fills the fields and moves focus to Sign in; with JavaScript off the box still shows the credentials as text): idle; submitting (button busy, fields kept, no double submit); wrong credentials (the generic message, password cleared, focus back to the password field); rate limited (message with the seconds to wait, from the response's retry delay); network or server failure ("Couldn't sign in. Try again."). The error text is in a live region the screen reader announces; no message says whether the email exists.
32. **Shell:** the placeholder page has no loading or empty data state because it loads none. A session that expires while the page is open takes effect on the next navigation or action (redirect to login with `next`); it is not polled.
33. **Missing configuration:** with `BETTER_AUTH_SECRET` unset, too short or equal to `ORDER_LINK_SECRET`, startup fails with the env error (as every other variable does).

## 3. Examples

Sign-in cases use throwaway users in the test database; `ana@example.com` is not used.

### Pure functions (unit)

| # | Input | Expected |
| --- | --- | --- |
| U1 | `safeNext("/admin/orders")` | `/admin/orders` |
| U2 | `safeNext("//evil.com")`, `safeNext("https://evil.com")`, `safeNext("/admin/../checkout")`, `safeNext("/cart")`, `safeNext(undefined)` | `/admin/orders` |
| U3 | Env: `BETTER_AUTH_SECRET` 31 bytes / 32 bytes / equal to `ORDER_LINK_SECRET` / unset | issue / ok / issue on `BETTER_AUTH_SECRET` / issue |
| U3b | Env: `VERCEL_ENV=preview` with `VERCEL_URL` and `VERCEL_BRANCH_URL` set / `VERCEL_URL` set and `VERCEL_BRANCH_URL` unset / `VERCEL_URL` unset; `VERCEL_ENV` unset or `production` with both unset; `DEMO_ACCOUNT_PASSWORD` 11 chars / 12 chars | ok / ok / issue naming `VERCEL_URL`; ok; issue / ok |
| U3c | `trustedOriginsFor(env)`: production with `NEXT_PUBLIC_SITE_URL=https://pcsilicon.tech`; preview with `VERCEL_URL=pc-abc-team.vercel.app`, `VERCEL_BRANCH_URL=pc-git-feat-team.vercel.app`; preview with `VERCEL_BRANCH_URL` unset; local | `["https://pcsilicon.tech"]`; both exact `https://` hosts; only the `VERCEL_URL` host; `["http://localhost:3000"]`; never a wildcard |
| U4 | Script target guard: host `ep-x.neon.tech` = `PRODUCTION_DATABASE_HOST`, no flag | refused, names the flag |
| U5 | same host with `--production` | allowed |
| U6 | host `ep-y.neon.tech` (not production) with `--production` | refused |
| U7 | host `localhost:5433`, `PRODUCTION_DATABASE_HOST` unset, no flag | allowed |
| U8 | host `ep-y.neon.tech`, `PRODUCTION_DATABASE_HOST` unset | refused, says to set the variable |
| U8b | `PRODUCTION_DATABASE_HOST=ep-x.neon.tech`; target host `ep-x-pooler.neon.tech` (pooled URL), and `EP-X.NEON.TECH` (unpooled, upper-case), no flag | both refused as production; with `--production` both allowed |
| U8c | `PRODUCTION_DATABASE_HOST=ep-x-pooler.neon.tech`; target `ep-x.neon.tech` | production (the normalization works both ways) |
| U8d | target `ep-xy.neon.tech` while production is `ep-x.neon.tech` | not production (only a `-pooler` suffix on the first label is stripped) |
| U9 | `readPassword` with piped stdin `"correct horse battery\n"` | `correct horse battery`; with empty stdin | error, no value in the message |
| U10 | Password policy: 11 chars / 12 chars | refused / accepted |
| U11 | Script argument parser: `--role demo`; `--role admin`; missing `--email` | each refused with a message; a password flag (`--password x`) is an unknown option |
| U12 | `cleanupCutoffs(now)` | session cutoff = now; rate-limit cutoff = now − 1 h |

### Auth configuration (integration, test database, through the real handler with `Request`s)

| # | Setup | Action | Expected |
| --- | --- | --- | --- |
| I1 | none | create a user through the script function | `User.id`, `Session.id`, `Account.id` match the cuid shape (starts `c`, 25 chars) |
| I2 | none | POST `sign-up/email` | 404, no row |
| I3 | owner exists | POST `sign-in/email` correct password, body also has `"role":"OWNER"` and `"disabledAt":null` | 200; the user's stored role is unchanged |
| I4 | none | the full endpoint set of the pinned version, each requested | only sign-in, sign-out, get-session respond other than 404; an endpoint missing from both lists fails the test |
| I5 | staff exists | sign in | `Session.expiresAt` is 8 h after creation (±5 s) |
| I5b | I5's session, clock moved to +1 h, +7 h 59 min | get session, `getAdminSession()` and a page read at each time | the session is valid and `expiresAt` and `updatedAt` are unchanged each time (absolute, never extended) |
| I5c | I5's session, clock at +8 h 1 min | get session | none; signing in again makes a new session whose `expiresAt` is 8 h from then |
| I5d | sign-in response for `baseURL` https (production config) and for `http://localhost` | read `Set-Cookie` | https: name starts `__Secure-`, has `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`; localhost: no prefix, no `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` |
| I6 | session of 8 h + 1 s old (clock set) | get session | no session |
| I7 | staff session | delete the row, request again | no session on the next request (cookie cache is off) |
| I8 | staff exists | wrong password; unknown email; disabled user with the right password | the same status and the same body text for all three |
| I9 | none | `Verification` rows after sign-in | none; and the stored identifier format test: a created verification row holds a hash, not the identifier |
| I10 | origin header `https://evil.example` | sign-in | refused |
| I11 | production config (`NEXT_PUBLIC_SITE_URL=https://pcsilicon.tech`); origins `https://pcsilicon.tech`, `https://other.vercel.app`, a preview host | sign-in | allowed; refused; refused |
| I11b | preview config (`VERCEL_URL=pc-abc-team.vercel.app`, `VERCEL_BRANCH_URL=pc-git-feat-team.vercel.app`); origins both hosts, `https://pc-zzz-team.vercel.app`, `https://pcsilicon.tech` | sign-in | allowed; allowed; refused; refused |
| I11c | the same with `VERCEL_BRANCH_URL` unset; origin = the branch host above | sign-in | refused (trusted only when present) |
| I12 | demo and owner exist | 3 sign-ins from IP A inside 10 s, the 4th (correct password) | 4th is 429; `RateLimit` row key holds IP A |
| I13 | I12's state | demo sign-in, correct password, from IP B | 200 |
| I14 | I12's state, window passed (clock +11 s) | IP A signs in | 200 |
| I15 | no IP header | 4 sign-ins | the 4th is 429 (shared bucket) |
| I16 | rate limit config | read | `enabled` is true when `NODE_ENV` is `test` and `production` |
| I17 | user signs in and gets a live session; then `disabledAt` is set directly in the database (the session row is **kept**) | `getAdminSession()` with that session's cookie, then `requireAdminSession()` | the first call returns null **and deletes that `Session` row**; later calls with the cookie return null; `requireAdminSession()` redirects to `/admin/login`; after `disabledAt` is cleared the **old cookie is still rejected** (no row) and a **fresh sign-in is required**, which then works |
| I17c | a disabled user with two live sessions A and B (rows kept) | A is used | A's row is gone, B's row is untouched until B is used; another user's session is never touched |
| I17b | the same live session | the page-level read of `/admin/orders` (rendered with that cookie) | redirect to login, not the page |
| I18 | `staff:disable` on a user with 2 sessions | run, then sign in | both `Session` rows gone; sign-in gives I8's answer |
| I19 | `staff:create --enable` on that user | run, sign in with the old password | 200 |
| I20 | `staff:set-password` on a user with 2 sessions | run | hash changed, 0 sessions, new password signs in, old doesn't |
| I21 | `staff:create` for an existing email | run | error "already exists", the hash unchanged |
| I22 | `db:seed --accounts-only` with `DEMO_ACCOUNT_PASSWORD` set, no demo user | run twice | one demo user; the second run changes nothing (same hash, same `updatedAt`) |
| I23 | I22 with a different password the second time | run | the first password still works |
| I24 | variable unset | run | exit 0, message printed, no row; no `Product` / `Category` row touched in any case |
| I24b | `DEMO_ACCOUNT_PASSWORD` is 11 characters | run | refused with "The demo password must be at least 12 characters.", no row, non-zero exit |
| I25 | `db:seed --accounts-only --reset` | run | refused, nothing written |
| I26 | 2 expired sessions, 1 live session, 2 old and 1 fresh rate-limit rows | `cleanAuthTables(now)` | 2 and 2 deleted; the live session and fresh row stay; users and accounts untouched |
| I27 | the existing cron route | no header / wrong secret / `CRON_SECRET` unset / right secret | 401 / 401 / 401 / 200 with the release, email and cleanup counts |
| I27b | right secret, `cleanAuthTables` made to throw | call the route | the release and the email send still ran (their counts in the body), the cleanup is reported failed, **status 500**, the log line names the job `auth-cleanup` and an error name only |
| I27c | right secret, the release made to throw | call the route | `cleanAuthTables` and the email send still ran and the expired rows are deleted; **status 500**, the log line names the job `release` |
| I27d | right secret, the email send made to throw | call the route | the release and the cleanup still ran; **status 500**, the log line names `emails` |
| I27e | right secret, two jobs made to throw | call the route | the third still ran; status 500; the log line names both |
| I27f | right secret, no job throws | call the route | status 200, no failure line |
| I29 | the demo user signs in twice (two sessions A and B, two cookies) | A signs out | A's row is gone and A's cookie no longer opens the shell; B's row is untouched and B's cookie still opens it; a third user's session is untouched |
| I29b | the same | A and B call sign out at the same time | both end signed out, no error, no other row deleted |
| I30 | login page data | read the demo box with `DEMO_ACCOUNT_PASSWORD` set / unset | the email and password / no box |
| I28 | `resetCatalog()` after users exist | run | users, accounts, sessions still there |

### Routes and rendering (unit and integration)

| # | Action | Expected |
| --- | --- | --- |
| R1 | Proxy: `/admin/orders`, no cookie | redirect to `/admin/login?next=%2Fadmin%2Forders` |
| R2 | Proxy: `/admin/orders`, any cookie value of the right name | passes through (the proxy doesn't validate) |
| R3 | Proxy: `/admin/login`, no cookie | passes through (no redirect) |
| R4 | Proxy: `/cart`, `/api/auth/get-session`, `/api/auth/sign-in/email`, `/_next/static/x.js` | the proxy does nothing (matcher or early return) |
| R5 | `proxy.ts` source | has no `runtime` export |
| R6 | Page with a stale cookie (name right, no row): `/admin/orders` | redirect to login |
| R7 | Every `page.tsx` / `layout.tsx` under `app/admin` except login | reaches `requireAdminSession` (static test) |
| R8 | Response headers for `/admin/login`, `/admin/orders`, `/api/auth/get-session` | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; admin pages carry `noindex` |
| R9 | `sitemap()` | no `/admin` URL |
| R10 | Reserved slugs | `admin`, `login`, `signup` reserved; `sidebar` not; the app-folder test passes with `login`, `signup`, `sidebar` gone |
| R11 | `app/` folders | no `login`, `signup`, `sidebar` |
| R12 | Storefront header markup | no "Account" link |

### E2E (Playwright, Chromium, 1280 × 800)

The accounts come from `e2e/accounts.ts`: three users (`e2e-owner@example.test`, `e2e-staff@example.test`, and the seeded demo), with passwords from env (`E2E_ACCOUNT_PASSWORD`, and `DEMO_ACCOUNT_PASSWORD` for the demo), never a literal password in the repo (D13). A `setup` project signs in **once per role** and saves `storageState` to `e2e/.auth/{role}.json` (git-ignored); the other tests reuse it. Each setup sign-in sends its own `X-Forwarded-For`, so the three never share a bucket. **If an account is missing** (the sign-in fails with the generic message), the setup stops with a message naming the role and the command block in `docs/setup/admin-accounts.md` ("The e2e-staff account doesn't exist in this database. Create the E2E accounts: see docs/setup/admin-accounts.md"); it never creates accounts itself.

| # | Scenario | Expected |
| --- | --- | --- |
| E1 | setup: owner, staff, demo each sign in at `/admin/login` | each lands on `/admin/orders`; heading "Orders"; header shows the person's name and role label |
| E2 | signed out, open `/admin/orders` | ends on `/admin/login` with the form; after signing in as staff, lands on `/admin/orders` (`next` honoured) |
| E3 | staff `storageState`, open `/admin` | `/admin/orders` |
| E4 | staff clicks **Sign out** | `/admin/login`; going Back and reloading `/admin/orders` ends on login |
| E5 | wrong password (own forged IP) | the generic message in a live region, password field cleared and focused, still on login |
| E6 | 4 wrong passwords in 10 s (own forged IP) | the 4th shows the rate-limit message with a number of seconds |
| E7 | demo `storageState` | shell opens; the page has no customer, order or price data |
| E8 | `/login`, `/signup`, `/sidebar` | 404 |
| E9 | storefront home | no Account icon |
| E10 | `/admin/login?next=//evil.com`, sign in | lands on `/admin/orders` |
| E11 | keyboard only: Tab through the login form, Enter submits | works; focus rings visible |
| E12 | page `<head>` of `/admin/login` | `noindex`; no canonical |
| E13 | signed out (no cookie, fresh context), open `/admin/login` | the form renders at `/admin/login` with no redirect (final URL unchanged, status 200) |
| E14 | signed out, open `/admin/login` with the demo variable set (CI sets it) | the demo box shows `demo@pcsilicon.tech` and the password; **Use demo account** fills both fields and doesn't submit; **Sign in** then lands on `/admin/orders` as "Demo (read-only)" |
| E15 | two browser contexts both signed in as demo (E1's state and a fresh sign-in, own forged IPs); context 1 signs out | context 2 still opens `/admin/orders` |
| E16 | a failed sign-in's response headers (network), and a successful one | the success sets the session cookie with `HttpOnly` and `SameSite=Lax` (no `Secure` on `http://localhost`) |

### Acceptance criteria → examples and rules

| Acceptance criterion (#104) | Covered by |
| --- | --- |
| `better-auth` pinned exactly 1.7.17; adapter package only if needed | Rule 6; D1; unit test on `package.json` (T-pin) |
| `dependabot.yml` with a `better-auth` / `@better-auth/*` group | D2; file check test (T-dependabot) |
| Models, `UserRole`, cuid ids, migration, `db:drift` | Rule 1; I1; CI's `db:drift` step |
| Sign-up refused; `role` can't be set | Rule 2; I2, I3 |
| Only sign-in, sign-out, get-session over HTTP; full endpoint set tested | Rule 4; I4 |
| Sessions 8 h; cookie cache off | Rule 5; I5, I6, I7 |
| *(review)* 8 h is absolute, can't be extended | Rule 5; I5b, I5c |
| *(review)* Cookie: `Secure` + `__Secure-` outside localhost, `HttpOnly`, `SameSite=Lax` | Rule 5; I5d, E16 |
| `verification.storeIdentifier` hashed | Rule 6; I9 |
| `nextCookies()` last; `baseURL` production and project previews, not `*.vercel.app` | Rules 6, 7 (exact `VERCEL_URL` / `VERCEL_BRANCH_URL` hosts, no pattern); U3b, U3c, I10, I11, I11b |
| `BETTER_AUTH_SECRET` required, ≥ 32 bytes, differs from `ORDER_LINK_SECRET`; in `.env.example`, `ci.yml`, `vitest.db.config.ts`, Vercel | Rule 33; U3; §6 (env); the Vercel step in the document (Rule 29) |
| *(review)* `BETTER_AUTH_SECRET` differs per environment, reason in ADR 0012 and docs/setup | Rule 29; §6 (ADR edits); D18; reviewed by hand (T-doc) |
| *(review)* Previews need the system variables exposed | Rules 7, 29; U3b |
| Rate limiting on everywhere, database-stored, per IP and path, `/sign-in` 3 per 10 s | Rules 9, 12; I12, I14, I16 |
| Test: failed sign-ins limited, demo login from another IP succeeds | Rule 10; I12, I13 |
| `X-Forwarded-For` verified on a preview; result in ADR 0012 | Rule 13; manual check recorded in the PR (§7) |
| *(review)* The check is a merge gate: the key must show a real client IP | Rule 13; §7 manual check, a blocking item in the PR |
| E2E signs in once per role with `storageState` | §3 E2E intro; E1 |
| `/admin/*` without a session → `/admin/login`; proxy cookie-only, no `runtime`; real check in `getSession` | Rules 14, 15; R1–R7; E2 |
| *(review)* Proxy skips `/admin/login` and `/api/auth/*`; signed-out `/admin/login` renders with no redirect | Rule 14; R3, R4; E13 |
| *(review)* `requireAdminSession()` rejects a disabled user on every request, live session included, and deletes that session; re-enabling needs a fresh sign-in | Rule 15, R-3; I17, I17b, I17c |
| *(approval)* Cron runs every job, then 500 and a log naming the failed job(s) | Rule 30; I27b–I27f |
| *(approval)* `VERCEL_URL` required on Preview, `VERCEL_BRANCH_URL` optional and trusted only when present | Rule 7; U3b, U3c, I11b, I11c |
| `/admin` per request, `no-store`, `no-referrer`, `noindex`, not in sitemap; `admin` reserved | Rule 16; R8, R9, R10; E12 |
| Staff land on `/admin/orders`; shell and nav show what the role can use | Rules 17–19; E1, E3 |
| Sample routes and components replaced or removed; Account icon removed; CLAUDE.md updated | Rule 22; R10–R12; E8, E9 |
| `staff:create`: hidden prompt or stdin, never echoed, logged or in an argument | Rule 23; U9, U11; I21 |
| `staff:set-password`, deletes sessions | Rule 24; I20 |
| `staff:disable`, `disabledAt`, undone with `--enable` | Rules 25, 26; I8, I17–I19 |
| Scripts print the host, refuse production without `--production` | Rule 27; U4–U8 |
| *(review)* Pooled and unpooled hosts compare equal; remote dev branch needs `PRODUCTION_DATABASE_HOST` | Rule 27; U8b–U8d; document (Rule 29) |
| *(review)* Sign-out deletes only the caller's session (shared demo account) | Rule 20; I29, I29b, E15 |
| *(review)* Demo email and password on `/admin/login` with a Use demo account button | Rule 17; I30; E14 |
| *(review)* Seed refuses a demo password under 12 characters | Rule 28; U3b; I24b |
| `db:seed --accounts-only`: demo only when missing, password from env, unset skips, never touches the catalog | Rule 28; I22–I25, I28 |
| `docs/setup/admin-accounts.md` (local, preview-branch, production; inherited accounts vs per-preview command) | Rule 29; reviewed by hand (T-doc) |
| Daily cron deletes expired `Session` and `RateLimit` rows, tested directly | Rule 30 (inside the existing cron, own `try/catch`); I26, I27, I27b, I27c |
| Demo password documented publicly | Rules 17, 29; D17 |
| *(review)* Playwright setup fails clearly when an account is missing | §3 E2E intro |
| *(review)* ADR 0012 and the PRD `User` row corrected in this PR | §9 "Conflicts"; checked by hand in the PR (T-doc) |

## 4. Rules and edge cases

- **R-1 Roles.** `role` has three values and no default: a user can't be created without one. Reading code never trusts a role from a request or a cookie; it comes from the `User` row loaded for the session.
- **R-2 Email.** Emails are stored lower-case and trimmed and are unique case-insensitively; sign-in compares the same way. `Staff@Example.com` and `staff@example.com` are one user.
- **R-3 Disabled users.** `disabledAt` is checked at sign-in and again in `getAdminSession()` on every call, so a session that survives (a race between sign-in and `staff:disable`) is refused by every page **and deleted on first use**; re-enabling never revives it. Disabling twice changes nothing; `--enable` on an active user is a no-op with a message.
- **R-4 Sessions.** Sign-in creates one `Session` per sign-in (a second device doesn't end the first). `staff:set-password` and `staff:disable` end all of a user's sessions. Expired rows are ignored at once and deleted by the cron.
- **R-5 Rate limit scope.** The limit counts every sign-in request, right or wrong, so it also slows a correct-password flood. It is per IP: an attacker with many IPs isn't stopped (out of scope: lockout across IPs). A forged `X-Forwarded-For` could dodge the limit or fill another IP's bucket; Rule 13 is what settles whether that is possible.
- **R-6 Proxy coverage.** The matcher is `/admin/:path*`. Server actions are POSTs to the page's route, so they pass through it too, but they never rely on it: each calls the data-access function itself (#105 enforces this for every mutation). The proxy and the cookie name share one constant with the auth configuration, so a changed prefix can't make the proxy look for the wrong cookie.
- **R-7 `next` parameter.** Only an in-site `/admin…` path; anything else becomes `/admin/orders`. It is URL-decoded once before the check.
- **R-8 Time.** Session and cron math take an injectable `now`. Sign-in times shown nowhere in this story.
- **R-9 Secrets in logs.** Nothing logs a password, a session token, the secret, a cookie, a request body or a connection string. Script failures print an error name and a short message of our own. The auth routes log nothing about credentials.
- **R-10 Concurrency.** Two `staff:create` for one email: the unique index lets one win and the other say "already exists". `--accounts-only` run twice at once: one demo user (`INSERT … ON CONFLICT DO NOTHING`, no caught P2002, as elsewhere in the repo). The cron's deletes are single statements and safe to overlap.
- **R-11 Stale demo.** The seed never resets an existing demo password. If the variable changes, the owner rotates it with `staff:set-password` (which works for any role) and updates the document.
- **R-12 Preview and production databases.** A user created on one database doesn't exist on another. Local runs use the Neon `dev` branch; each preview has its own Neon branch (Vercel integration). A preview branched from production **inherits its users, password hashes and `Session` rows**, so a production session cookie would be valid on that preview if the secrets matched, which is why `BETTER_AUTH_SECRET` differs per environment (D18). A preview branched from another branch has the accounts of that branch. The setup document covers both and the scripts' host line tells the operator what they are about to write to.
- **R-13 No data in the shell.** Until #105, no admin page reads an order, customer or product. A test (E7) and the review of the placeholder page keep it that way, so a deployed demo account can't leak anything before masking exists.
- **R-14 Dependencies.** Better Auth is pinned exactly; the Prisma adapter package is added (also exact) only if `better-auth/adapters/prisma` doesn't resolve without it. A CI step (the existing install) fails on a lockfile mismatch.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Login page heading | Staff sign in |
| Login page sub-text | PC Silicon admin. |
| Demo box (only when the demo password is set) | Heading **Demo account**; text: Reviewers can look around Admin with this account. It can't change anything. · Email: {email} · Password: {password} · button **Use demo account** |
| Field labels / button | Email · Password · Sign in (busy: Signing in…) |
| Wrong credentials, unknown email, disabled user | Email or password is incorrect. |
| Rate limited | Too many sign-in attempts. Wait {n} seconds and try again. |
| Failure | Couldn't sign in. Try again. |
| Field errors | Enter your email. · Enter your password. |
| Shell: nav item | Orders |
| Shell: role labels | Owner · Staff · Demo (read-only) |
| Shell: sign out | Sign out |
| Orders placeholder | Heading **Orders**; body: The order list comes with the Admin panel. |
| Admin not-found | Page not found. Go to Orders. |
| Document titles | `Staff sign in · PC Silicon Admin`; `Orders · PC Silicon Admin` |
| Script: host line | `Database: {host}` |
| Script: production refused | Refusing: {host} is the production database. Pass --production to confirm. |
| Script: flag on non-production | Refusing: --production was passed but {host} is not the production database. |
| Script: host unknown | Refusing: PRODUCTION_DATABASE_HOST is not set, so I can't tell whether {host} is production. Set it in .env.local. |
| Script: password prompt | Password (hidden): · Repeat password: |
| Script: mismatch / too short | The passwords don't match. · The password must be at least 12 characters. |
| Script: created / updated / disabled / enabled | Created {role} {email}. · Changed the password for {email} and ended {n} session(s). · Disabled {email} and ended {n} session(s). · Enabled {email}. |
| Script: exists / not found / already disabled | {email} already exists. Use --enable to re-enable it. · No user with email {email}. · {email} is already disabled. |
| Seed: demo | Created the demo account. · The demo account already exists; left as it is. · DEMO_ACCOUNT_PASSWORD is not set; skipped the demo account. · The demo password must be at least 12 characters. |
| Playwright setup, missing account | The {role} account doesn't exist in this database. Create the E2E accounts: see docs/setup/admin-accounts.md. |
| Env errors | `BETTER_AUTH_SECRET` is not set · must be at least 32 bytes · must differ from ORDER_LINK_SECRET · `VERCEL_URL` is not set on a Preview (turn on "Enable access to System Environment Variables") · `DEMO_ACCOUNT_PASSWORD` must be at least 12 characters |

All copy is plain and uses no emoji. The demo email and password are shown on the login page (D17) and also go in the README and `docs/setup/admin-accounts.md`.

## 6. Data and interfaces

**Schema (one migration; `db:drift` must pass).**

- `UserRole` enum: `OWNER`, `STAFF`, `DEMO`.
- `User`: `id` (cuid), `name`, `email` (unique), `emailVerified` (boolean; true for scripted users, nothing reads it), `image` (optional, unused), `role` (`UserRole`, required), `disabledAt` (optional timestamp), `createdAt`, `updatedAt`.
- `Session`: `id`, `token` (unique), `expiresAt`, `ipAddress`, `userAgent`, `userId` (cascade), `createdAt`, `updatedAt`; index on `userId` and on `expiresAt`.
- `Account`: `id`, `accountId`, `providerId` (`credential`), `userId` (cascade), `password` (hash), the OAuth token columns Better Auth requires (left null), `createdAt`, `updatedAt`.
- `Verification`: `id`, `identifier`, `value`, `expiresAt`, `createdAt`, `updatedAt`.
- `RateLimit`: `id`, `key` (unique), `count`, `lastRequest` (milliseconds).
- `User`, `Session` and `Account` rows are never touched by `resetCatalog()`; Order and payment tables don't refer to `User` (there is no link between staff and orders until #105's audit log).

**Environment** (`lib/env.ts`, `.env.example`, `ci.yml`, `vitest.db.config.ts`, Vercel Production, Preview and Development).

- `BETTER_AUTH_SECRET`: required, at least 32 UTF-8 bytes, different from `ORDER_LINK_SECRET` (a cross-variable rule beside the payment and email ones); one per environment; never logged.
- `BETTER_AUTH_SECRET` must also differ **between environments** (Production, Preview, Development). The app can't check that, so it is a rule in ADR 0012 and `docs/setup/admin-accounts.md` (D18).
- `VERCEL_URL`, `VERCEL_BRANCH_URL`: set by Vercel when "Enable access to System Environment Variables" is on. Both are host names without `https://`. `VERCEL_URL` is optional in the schema and required when `VERCEL_ENV` is `preview`; `VERCEL_BRANCH_URL` is optional everywhere and trusted only when present (they build the trusted origins, Rule 7, source cited there). Not secrets.
- `DEMO_ACCOUNT_PASSWORD`: optional, at least 12 characters when set (the seed refuses a shorter one, and the env schema flags it); read by the seed script **and by the login page** to show the demo box (D17). It is public by design; never logged. The demo email is a constant.
- `E2E_ACCOUNT_PASSWORD`: read by Playwright only (`.env.local` and CI), at least 12 characters; not in the app's schema.

**Modules (what they do).**

- `lib/auth/auth.ts`: the single Better Auth instance (configuration of Rules 4–11). `lib/auth/client.ts`: the browser client with sign-in and sign-out only. `lib/auth/cookie.ts`: the cookie name constant shared with the proxy.
- `lib/admin/session.ts`: `getAdminSession()` → `{ user: { id, name, email, role } } | null` (cached for the request); `requireAdminSession()` → the same or redirects to `/admin/login`. The returned role is the `UserRole` value.
- `lib/admin/safe-next.ts` (pure): `safeNext(value)`.
- `lib/auth/rate-limit.ts` (pure parts): the rule table (sign-in 3 / 10 s) and the no-IP bucket key.
- `lib/auth/accounts.ts`: `createStaffUser`, `setStaffPassword`, `disableStaff`, `enableStaff`, `ensureDemoUser` (each takes a client, so tests pass the test database; each returns a result value, never throws on an expected condition).
- `lib/auth/script-guard.ts` (pure): the production / host decision of Rule 27. `scripts/read-password.ts`: hidden prompt or stdin. `scripts/staff.ts` with `create`, `set-password`, `disable` subcommands behind the three `pnpm` entries.
- `lib/auth/cleanup.ts`: `cleanAuthTables(now)` → `{ sessions, rateLimits }`, called by the existing release cron (`runReleaseCron`/its route, [lib/orders/release-cron.ts](../../../lib/orders/release-cron.ts)) after its other jobs, each job in its own `try/catch`. `lib/auth/origins.ts` (pure): `trustedOriginsFor(env)`. `lib/auth/script-guard.ts` uses the normalized host compare (Rule 27).
- `proxy.ts` at the project root (matcher `/admin/:path*`).
- `app/api/auth/[...all]/route.ts` (GET and POST). `app/admin/login/page.tsx`, `app/admin/(shell)/layout.tsx`, `app/admin/(shell)/page.tsx` (redirect), `app/admin/(shell)/orders/page.tsx` (placeholder), `app/admin/(shell)/not-found.tsx`. New components under `components/admin/` (login form, shell, sidebar, sign-out button); the old sample components are deleted.
- `next.config.ts` headers: `/admin/:path*` and `/api/auth/:path*` get `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- `package.json`: `better-auth` exactly `1.7.17`; scripts `staff:create`, `staff:set-password`, `staff:disable`. `.github/dependabot.yml`: a group `better-auth` for `better-auth` and `@better-auth/*` (package ecosystem npm), plus no other change.
- `ci.yml`: add `BETTER_AUTH_SECRET` (a dummy of at least 32 bytes) and `E2E_ACCOUNT_PASSWORD`/`DEMO_ACCOUNT_PASSWORD`; after the seed, create the E2E accounts with the same scripts (stdin) and `db:seed --accounts-only`, before the E2E step.
- `vercel.json`: unchanged (the cleanup runs inside the existing cron entry).
- ADR 0012 and `docs/prd.md` edits are part of this PR (§9, "Conflicts").
- `lib/reserved-slugs.ts`: remove `sidebar`.
- Docs: `docs/setup/admin-accounts.md`; README's setup section and demo note; CLAUDE.md (routes paragraph, commands, a short "Staff sign-in" paragraph); ADR 0012 edits (§9); PRD `User` row.

## 7. Test plan

Per the PRD's testing strategy: pure rules as unit tests, anything that touches the database as `*.db.test.ts` against the Docker Postgres, and the user path as E2E.

- **Unit (`pnpm test`):** U1–U12 (with U3b, U3c, U8b–U8d), R1–R5, R7, R9–R12, T-pin (package.json has exactly `1.7.17`, no `^` or `~`), T-dependabot (the group exists and lists both patterns), the env rule tests, the copy table's script messages.
- **Integration (`pnpm test:db`):** I1–I30 (with the lettered variants), R6, R8 where it needs a real handler. The auth tests call the handler with `Request` objects (cookies and `X-Forwarded-For` set by the test) so the rate limiter and origin check actually run. Time is injected or the rows are aged in the database. Every test that creates users cleans them up by email prefix.
- **E2E (`pnpm test:e2e`):** E1–E16. Against the production build in CI (`pnpm start`), so rate limiting, cookies over `http://localhost` and headers are the real ones. Only the setup project signs in per role; the tests that exercise failures use their own forged IP.
- **Manual, on the preview URL, recorded in the PR:** (a) Rule 13 forged-header check, its result and the ADR 0012 edit (a merge gate: the PR is not merged until the RateLimit key shows a real client IP); (b) sign in as owner, staff and demo on the preview with the accounts from the setup document; (c) check the response headers of `/admin/orders` with the browser's network tab; (d) `/admin/login` loads over https and the cookie is `Secure` and `HttpOnly`; (e) the origin check accepts the preview URL being used.
- **Not tested here:** permission rules, the guard marker, masking, audit (#105); the real Resend or Xendit (not involved).
- **CI:** the new env values, the account creation step and `db:drift` after `db:deploy`.

## 8. Out of scope

- Permissions, `can()`, `adminAction` / `adminRoute`, audit and masking: [#105](https://github.com/romulojr-dev/pc-ecommerce/issues/105). Until then every signed-in role sees the same empty shell.
- The Orders list, dashboard and every other Admin screen (AD-1 to AD-10): later Epic Admin stories.
- Customer accounts, Google sign-in, customer-facing `/login`: Epic Accounts (Phase 2, #65).
- Password reset, email verification, self-service password change, 2FA, any auth email: not planned for the MVP (ADR 0012).
- A staff management UI: owners use the scripts.
- Account lockout across IPs; rate limiting anonymous storefront writes: [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).
- Linking staff to orders or audit rows: #105.
- Moving the local E2E to the Docker database: [#74](https://github.com/romulojr-dev/pc-ecommerce/issues/74).

## 9. Decisions

| # | Decision | Reason | Rejected |
| --- | --- | --- | --- |
| D1 | `@better-auth/prisma-adapter` is added only if `better-auth/adapters/prisma` doesn't resolve without it (the issue's condition); the plan checks first | Fewer packages to pin and update | Adding it by default |
| D2 | Dependabot gets one `better-auth` group; no other ecosystem is configured by this story | The issue asks for this group only | A full Dependabot setup for all dependencies |
| D3 | All three roles land on the same placeholder `/admin/orders` | The issue says staff land there; role-based landing needs `can()` (#105) | A different landing for Owner and Demo (the dashboard) |
| D4 | The login form posts to the HTTP sign-in endpoint through the Better Auth client | Only that path runs the rate limiter (Rule 12) | A server action calling `auth.api`, which skips the limit |
| D5 | Sign-in, sign-out and get-session stay on HTTP because the issue and ADR say so, even though pages use server-side reads | Matches ADR 0012; the endpoint test pins the set | Disabling get-session too (nothing in the UI needs it over HTTP) |
| D6 | Minimum password length 12 (staff and demo) | Better Auth defaults to 8; the accounts are few and the demo password is public | Keeping 8 |
| D7 | One generic failure message for wrong password, unknown email and disabled user | No account enumeration | Telling the user "account disabled" |
| D8 | A request with no determinable IP shares one rate-limit bucket | Fails closed; a missing header can't switch the limit off | Skipping the limit when no IP is found |
| D9 | A static test lists every admin page and layout and requires them to reach `requireAdminSession` | The proxy is not a boundary; this catches a forgotten call | Trusting review alone |
| D10 | `next` accepts only `/admin…` paths | No open redirect | Accepting any same-origin path |
| D11 | `login` and `signup` stay reserved, `sidebar` leaves the list | Customer routes will use those names in Phase 2; `sidebar` was a sample | Freeing all three |
| D12 | Scripts treat an unset `PRODUCTION_DATABASE_HOST` as "local hosts only" | Works in CI and Docker without a variable, still refuses any remote database it can't classify | Requiring the variable everywhere (breaks CI) or allowing everything when unset |
| D13 | E2E account passwords come from env, not the repo; E2E emails use `example.test` | A password committed to the repo would be valid on every database the E2E accounts are created in, and a preview branched from production inherits that database's rows (the earlier reason, a shared dev database, was wrong: previews have their own branches) | Constants in `e2e/accounts.ts` |
| D14 | `--production` is also refused on a database that isn't production | The flag then means something every time it is used | Accepting it anywhere |
| D15 | The rate-limit cleanup threshold is one hour | Longer than every window, short enough to keep the table small | Deleting at the window length |
| D16 | The demo user is `demo@pcsilicon.tech`, name "Demo reviewer"; no mailbox exists and none is needed | There are no auth emails | An `example.com` address that looks like a placeholder |
| D17 | The demo email and password are shown on `/admin/login` (server-rendered from `DEMO_ACCOUNT_PASSWORD`) with a button that fills the form; also in the README | A reviewer lands there first; the password is public anyway (review answer 6) | A pointer to the README only |
| D18 | `BETTER_AUTH_SECRET` differs in Production, Preview and Development, stated in ADR 0012 and docs/setup | Session tokens are stored plain and a preview branch may copy production rows; a shared secret would let a production cookie open a preview | One secret everywhere |
| D19 | Trusted origins are exact hosts from `VERCEL_URL`, `VERCEL_BRANCH_URL` and `NEXT_PUBLIC_SITE_URL`; no pattern | No team or project slug to maintain, and no wildcard (review answer 2) | A `*.vercel.app`-style pattern for this project |
| D20 | Auth cleanup lives in the existing daily cron, each job in its own `try/catch` | No second cron entry to fit Hobby's limits; one failure doesn't block the other jobs (review answer 1) | A second route and `vercel.json` entry |
| D21 | Sessions are absolute (8 h, never refreshed) | A stolen cookie has a hard end; the shared demo account gains nothing from sliding | Better Auth's default sliding refresh |

### Conflicts with earlier documents (flagged, not quietly picked)

- **ADR 0012 says "Staff rows are created by the seed and, later, by the owner."** The issue says staff and owners come from `staff:*` scripts and the seed creates only the demo user. **This spec follows the issue, and the PR fixes ADR 0012 itself**, each change marked "Changed by spec 039 (#104)": scripts create staff (the seed only the demo user); the roles are the upper-case `OWNER` / `STAFF` / `DEMO` enum; the result of Rule 13 (with the Vercel page cited); the `disabledAt` column; the trusted origins (exact preview hosts); absolute 8-hour sessions; `BETTER_AUTH_SECRET` differs per environment and why (D18).
- **PRD data-model row for `User`** lists "id, email, name, role, createdAt". The PR updates it to add `emailVerified`, `updatedAt` and `disabledAt` (Better Auth also wants an optional `image`, unused). The PRD wins on scope; these columns don't widen it.
- **The issue says "the admin shell and nav show only what the role can use"** while permissions come in #105. This spec reads it as true by construction (Rule 19); #105 makes it real. If the intent was a role-aware nav now, that is a scope change for the PRD.
- **PRD NFR Security says "rate-limited login and checkout".** Checkout rate limiting is not here (#64, as the issue says); only login is.

## 10. Open questions

1. **Neon parent branch of the previews.** You are confirming it. Until you tell me, `admin-accounts.md` keeps both cases (inherited accounts, or the accounts command per preview).
2. **Does `VERCEL_URL` survive Deployment Protection?** Vercel's page says `VERCEL_URL` "cannot be used in conjunction with Standard Deployment Protection". The wording is ambiguous (it probably means the URL can't be fetched without bypass, not that the variable disappears). Task 1 of the plan checks on a real preview that the variable is present and equals the host the browser uses, with protection on. If it is absent, the origin rule needs a rethink and the plan stops there.

### Accepted by the reviewer (2026-11-05)

- Production sessions copied into a production-branched preview are **accepted**: per-environment secrets make their cookies unusable there and the rows expire within 8 hours. ADR 0012 records this (D18).
- Deployment Protection is on for previews; `admin-accounts.md` says so (Rule 29).

### Changes made by the review

Answers applied (2026-11-05):

- **Cron (Q1):** no new route; `cleanAuthTables()` runs in the existing daily cron in its own `try/catch` beside the other jobs (Rule 30, D20, I27b, I27c).
- **Origins (Q2):** no host pattern; exact `VERCEL_URL` / `VERCEL_BRANCH_URL` on previews, `NEXT_PUBLIC_SITE_URL` in production; added to env validation; the Vercel setting is documented (Rule 7, U3b, U3c, I11, I11b, D19).
- **Databases (Q3):** previews have their own Neon branches; `admin-accounts.md` covers inherited and per-preview accounts; D13's reason corrected (Rule 29, R-12, D13).
- **Demo password (Q4):** in the README, same `DEMO_ACCOUNT_PASSWORD` everywhere, at least 12 characters, the seed refuses shorter (Rule 28, I24b).
- **E2E accounts (Q5):** one command block; the Playwright setup fails with a clear message when an account is missing (§3 E2E intro).
- **Login page (Q6):** the demo email and password are shown on `/admin/login` with a Use demo account button (Rule 17, D17, E14).

Other changes: pooled and unpooled Neon hosts compare equal in the production guard, and a remote dev branch needs `PRODUCTION_DATABASE_HOST` (Rule 27, U8b–U8d); the preview `X-Forwarded-For` check is a merge gate (Rule 13); `requireAdminSession()` rejects disabled users on every request, tested with a live session (Rule 15, I17, I17b); ADR 0012 and the PRD `User` row are fixed in this PR (§9); `BETTER_AUTH_SECRET` differs per environment (D18); sessions are absolute (Rule 5, I5b, I5c, D21); cookie attributes are tested (Rule 5, I5d, E16); the proxy skips `/admin/login` and `/api/auth/*` (Rule 14, R3, R4, E13); sign-out deletes only the caller's session (Rule 20, I29, I29b, E15). The criteria-to-examples table lists each as a "(review)" row.

Approval fixes (2026-11-05): the cron runs every job and then returns 500 naming the failed job(s) (Rule 30, I27b–I27f); a disabled user's session is deleted on first use and re-enabling needs a fresh sign-in (Rule 15, R-3, I17, I17c); `VERCEL_URL` is required on Preview and `VERCEL_BRANCH_URL` is optional and trusted only when present, with the Vercel page cited and its silence on Git-only availability stated (Rule 7, U3b, I11c).

### What changed while building

Found by the verification in plan task 1 (22 probe tests against Better Auth 1.7.17) and while building:

- **`disabledPaths` cannot switch off endpoints with a path parameter** (`/callback/:id`, `/reset-password/:token`): it matches exact strings, so both still answered (302 and 400). Rule 4 now holds through an allowlist in the route handler (`lib/auth/route-guard.ts`: sign-in, sign-out, get-session, by exact path and method); `disabledPaths` stays as a second lock and a test fails when the installed version has an endpoint in neither list.
- **Origin and CSRF checks are off by default under `NODE_ENV=test`.** `advanced.disableOriginCheck: false` and `disableCSRFCheck: false` are set explicitly, so tests and CI's production build run the checks (Rule 7, I10, I11). A request with no `Origin` and no cookie is not checked (a browser always sends one); with a cookie it is refused.
- **Absolute sessions need `disableSessionRefresh: true`** beside `expiresIn` and `updateAge` (Rule 5, I5b).
- **The sign-in limit is Better Auth's own default** (`/sign-in*`: 3 per 10 s); it is set explicitly anyway. Better Auth trusts `x-forwarded-for` only when it holds a single address; a chain, or no header in production, shares one `no-trusted-ip` bucket (D8 holds without a wrapper). Under test it falls back to `127.0.0.1`. This makes the Vercel check (Rule 13) matter in both directions: a header Vercel keeps lets a client choose its bucket, one Vercel appends to puts everyone in one bucket.
- **`VERCEL_URL` is present and equals the host with Deployment Protection on** (preview probe, 2026-11-05); `VERCEL_BRANCH_URL` is set on that preview too.
- **`next dev`'s server keeps a client-sent `x-forwarded-for`** (`??=`): E2E tests send their own single-address header per sign-in.
- **The database limiter already prunes expired `RateLimit` rows** as it runs; the cron cleanup stays because the acceptance criteria require it.
- **The cron body gained `emails` (rows claimed), `authCleanup` and `failed`** (Rule 30); the existing cron tests changed with it, and a cancellation's email now shows in `emails`.
- **The static "every admin page reaches the guard" test (R7) arrived with the pages** (task 6); `/admin` unknown paths use a catch-all page that calls `requireAdminSession()` and `notFound()` so the not-found page renders inside the shell.
- **E2E projects:** `setup` (one sign-in per role), `admin` (depends on it) and `chromium` (the rest, independent), so a database without the E2E accounts stops only the admin specs.
- **The temporary `app/api/probe-env` route** exists on this branch only for the preview check and is deleted in the last task.
