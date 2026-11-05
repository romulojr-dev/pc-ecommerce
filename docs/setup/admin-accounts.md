# Admin accounts and sign-in

How the people who sign in to `/admin` get onto each database, and what to set
in Vercel for sign-in to work on a preview URL. The design is in
[ADR 0012](../adr/0012-staff-auth-on-better-auth.md) and
[spec 039](../specs/039-staff-sign-in-admin-shell/spec.md) (issue
[#104](https://github.com/romulojr-dev/pc-ecommerce/issues/104)).

Nobody signs up. Accounts exist only because someone ran a command below.
There are three roles: **owner**, **staff** and **demo** (a public, read-only
account for reviewers). Customers never get an account.

## Variables

| Variable | Where | Notes |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Production, Preview, Development, `.env.local`, CI | Signs the session cookie. At least 32 bytes, different from `ORDER_LINK_SECRET`, and **a different value in each environment** (see below). Generate one with `openssl rand -base64 48`. |
| `DEMO_ACCOUNT_PASSWORD` | every environment that should show the demo account, `.env.local`, CI | At least 12 characters; the same value everywhere. It is shown on `/admin/login`, so it is public. Unset: no demo box and no demo user. |
| `E2E_ACCOUNT_PASSWORD` | `.env.local`, CI | Read by the E2E only (owner and staff test accounts). At least 12 characters. Never committed. |
| `PRODUCTION_DATABASE_HOST` | `.env.local` only | The production database's host. The account commands refuse to write to it without `--production`, and refuse any remote database they cannot classify when this is unset. |
| `VERCEL_URL`, `VERCEL_BRANCH_URL` | set by Vercel | The Preview's own hosts, trusted for the sign-in origin check. See the settings below. |

`pnpm dev` stops at startup with "BETTER_AUTH_SECRET is not set" until the first
one is in `.env.local`.

### Why `BETTER_AUTH_SECRET` differs per environment

Session tokens are stored in the database as they are, and a preview database
branch may hold copies of production rows, live `Session` rows included. With
one shared secret, a cookie signed in production would open a preview. With a
secret of its own per environment, a copied row is useless anywhere else.
Rotating a secret signs everyone out of that environment.

## Vercel settings

- [ ] **Settings → Environment Variables:** add `BETTER_AUTH_SECRET` for
  Production, Preview and Development, **three different values**. Add
  `DEMO_ACCOUNT_PASSWORD` to the ones that should show the demo account.
- [ ] **Settings → Environment Variables → "Enable access to System Environment
  Variables"** must be on. A Preview trusts only its own `VERCEL_URL` (and
  `VERCEL_BRANCH_URL` when Vercel sets it) for sign-in, so with the setting off
  the Preview stops at startup with "VERCEL_URL is not set on a Preview".
- [ ] **Settings → Deployment Protection** should be on for previews. They hold
  copied data and the public demo account.
- [ ] Redeploy after changing any of these; environment changes reach only new
  deployments.

## Which database each environment uses

| Environment | Database | Accounts |
| --- | --- | --- |
| Local (`pnpm dev`) | the Neon `dev` branch (`DATABASE_URL` in `.env.local`) | create them there |
| Integration tests, E2E in CI | a throwaway Postgres | created by the tests and by CI |
| Preview | its own Neon branch, made by the Vercel integration for each preview | see the two cases below |
| Production | the production Neon branch | create them there, with `--production` |

A preview branch is a copy of its **parent** branch at the time it is made:

- **Parent is production:** the preview inherits production's users, password
  hashes and sessions, so the same owner, staff and demo sign-ins work on the
  preview with no command. (The inherited `Session` rows are useless there
  because the secrets differ; the daily cron deletes them once expired.)
- **Parent is any other branch** (for example `dev`): the preview has that
  branch's accounts, if any. For a preview that has none, run the commands
  below against **that preview branch's** `DATABASE_URL` (Neon console →
  the branch → connection string), passed inline.

To check which case a project is in, open the Neon console and look at the
parent of a preview branch.

## The commands

All of them print the target database host first. Production needs
`--production`; `--production` on any other database is refused. The password
is read from a **hidden prompt** (asked twice) or, when stdin is not a
terminal, from **standard input**: never an argument, never echoed or logged.
At least 12 characters.

```bash
# Local (the Neon dev branch from .env.local). PRODUCTION_DATABASE_HOST must be
# in .env.local, because the dev branch is a remote host
pnpm staff:create --email you@example.com --name "Your Name" --role owner
pnpm staff:create --email ana@example.com --name "Ana Cruz" --role staff
pnpm db:seed --accounts-only            # the demo user, from DEMO_ACCOUNT_PASSWORD

# Change a password (ends that user's sessions)
pnpm staff:set-password --email ana@example.com

# Block a user (ends their sessions), and undo it
pnpm staff:disable --email ana@example.com
pnpm staff:create --email ana@example.com --enable
```

For another database, pass its URL inline (the shell's value wins over
`.env.local`):

```bash
# bash: a preview branch
DATABASE_URL="postgresql://…preview-branch…" pnpm staff:create --email … --name … --role staff

# bash: production (note --production, and PRODUCTION_DATABASE_HOST in .env.local)
DATABASE_URL="postgresql://…production…" pnpm staff:create --production --email … --name … --role owner
DATABASE_URL="postgresql://…production…" DEMO_ACCOUNT_PASSWORD="…" pnpm db:seed --accounts-only --production
```

```powershell
# PowerShell
$env:DATABASE_URL = "postgresql://…production…"
pnpm staff:create --production --email you@example.com --name "Your Name" --role owner
Remove-Item Env:DATABASE_URL
```

Use the **pooled or the direct** URL of a branch, either works: the host is
compared without Neon's `-pooler` suffix. Piping the password
(`echo … | pnpm staff:create …`) works but leaves it in your shell history; the
prompt does not.

`db:seed --accounts-only` creates the demo user **only when missing** and never
changes an existing one, its password included. It touches no catalog table.
To change the demo password later, run `pnpm staff:set-password --email
demo@pcsilicon.tech` on each database and update `DEMO_ACCOUNT_PASSWORD`.

## The demo account

| | |
| --- | --- |
| Email | `demo@pcsilicon.tech` |
| Password | the value of `DEMO_ACCOUNT_PASSWORD` (shown on `/admin/login` with a "Use demo account" button) |

It can open every screen the owner can, can't change anything and can't search
by customer, and it sees masked customer data ([spec 040](../specs/040-admin-permissions-audit-masking/spec.md)). The password is public on purpose. Several reviewers can be
signed in at once, and signing out ends only your own session.

## E2E accounts

The admin sign-in E2E needs the three accounts below on the database the app
server uses (CI creates them itself, after the seed). Locally, with
`E2E_ACCOUNT_PASSWORD` and `DEMO_ACCOUNT_PASSWORD` in `.env.local`:

```bash
pnpm db:seed --accounts-only
pnpm staff:create --email e2e-owner@example.test --name "E2E Owner" --role owner   # type E2E_ACCOUNT_PASSWORD
pnpm staff:create --email e2e-staff@example.test --name "E2E Staff" --role staff   # type E2E_ACCOUNT_PASSWORD
```

If one is missing, the Playwright setup stops with "The staff account doesn't
exist in this database. Create the E2E accounts: see docs/setup/admin-accounts.md."
and only the admin specs are skipped. Prefer the Docker Postgres for local E2E
runs ([#74](https://github.com/romulojr-dev/pc-ecommerce/issues/74)) so the dev
branch does not collect test accounts.

## Checking sign-in on a preview URL

- [ ] Open `<preview>/admin/orders` signed out: it goes to `/admin/login`.
- [ ] The demo box shows (if `DEMO_ACCOUNT_PASSWORD` is set for Preview).
  **Use demo account**, then **Sign in**: you land on `/admin/orders` as
  "Demo reviewer · Demo (read-only)".
- [ ] Sign out, then sign in as an owner or staff account.
- [ ] A wrong password shows "Email or password is incorrect."; four attempts
  inside ten seconds show the wait.
- [ ] In the browser's network tab the sign-in response sets a
  `__Secure-better-auth.session_token` cookie with `Secure`, `HttpOnly` and
  `SameSite=Lax`, and `/admin/orders` answers `Cache-Control: no-store`.
- [ ] If sign-in answers 403 "Invalid origin", `VERCEL_URL` is missing or the
  page was opened on a host the deployment does not own.

## Day-to-day

- **A staff member forgot their password:** an owner runs `staff:set-password`
  for them. There are no reset emails.
- **Someone leaves:** `staff:disable`. Their sessions end at once and sign-in is
  refused.
- **Rotating `BETTER_AUTH_SECRET`:** change it in that environment and redeploy.
  Everyone signed in there is signed out; passwords are unaffected.
- **Old rows:** the daily cron deletes expired sessions and old sign-in
  attempt rows (`/api/cron/release-orders`, with the release of unpaid orders).
