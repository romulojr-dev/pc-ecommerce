# Plan: spec 040 — admin roles, permission guard, audit log and customer-data masking (#105)

Spec: [spec.md](spec.md) (approved 2026-11-05, with the Staff wording and D3 confirmed). Checklist: [tasks.md](tasks.md). Example IDs (E, T), Rule (R) and Behavior numbers are the spec's. Branch: continue on the current branch unless you want a new one for #105. One commit per task, subject line only, no attribution trailer (saved git preference); post-push fixes as a separate commit.

## Context

Reused as it is: `loadAdminSession` / `requireAdminSession` ([lib/admin/session.ts](../../../lib/admin/session.ts): disabled users refused and the session deleted on every call), `trustedOriginsFor` ([lib/auth/origins.ts](../../../lib/auth/origins.ts)), the shell and nav ([components/admin/](../../../components/admin/)), the static page test ([lib/admin/admin-pages.test.ts](../../../lib/admin/admin-pages.test.ts)), `resetCatalog()` ([prisma/seed/write.ts](../../../prisma/seed/write.ts)) and the test copy in [test-support/db.ts](../../../test-support/db.ts), `reset-catalog.db.test.ts`, the ESLint `no-restricted-imports` block for `lib/builder`, the Docker test database, and the E2E sign-ins per role (`e2e/auth.setup.ts`).

Does not exist yet: `lib/admin/permissions.ts`, the wrappers, `AuditLog`, any masking, any admin mutation or admin API route. Today's `"use server"` files are all under `app/(store)`.

## Findings that shape the plan

- **The enumeration test must import modules under Vitest.** `vitest.config.ts` is "pure: no database or env vars", and `lib/db.ts` imports `lib/env.ts`, whose `createEnv` validates at import. A real admin action module will import data code (`@/lib/db`, `@/lib/env`) and the wrapper imports `next/headers` and the session. Task 1 settles this before anything else (gate). Options, in order of preference: (a) the test file `vi.mock`s `@/lib/env`, `@/lib/db`, `@/lib/admin/session`, `next/headers` and `next/cache` (hoisted; the modules under test load against the mocks and nothing connects); (b) the wrapper imports the session lazily, inside the returned function, so import needs fewer mocks; (c) a separate Vitest project for the scan with `setupFiles` that sets dummy env values. If (a)–(c) all fail, stop and report.
- **Detecting "use server" files must read the directive, not grep the text.** `lib/auth/auth.ts` contains the words in a comment. The scan checks that the first statement of the file is the `"use server"` directive.
- **Next's server-action transform vs the marker.** In Vitest nothing is transformed, so the marker survives (the issue says so). Whether `export const x = adminAction(...)` is accepted in a `"use server"` file in the pinned Next 16.4 (exports must be async functions; a function with a symbol property should pass) is checked in task 3 against `node_modules/next/dist/docs/` and by a `pnpm build` that includes a tiny wrapped admin action (kept only if it earns its place). If Next rejects a wrapped export, the fallback is `export async function name(input) { return guarded(input) }` with the marker set on the exported function by a helper, which keeps the test's contract.
- **A branded transaction client.** Prisma's `TransactionClient` is a structural subset of `PrismaClient`, so a plain `db` compiles against it (spec D12). `adminTransaction(actor, fn)` is the one place that hands out the branded client (`AuditTx`), implemented as `db.$transaction(async (tx) => fn(tx as AuditTx))`; `recordAudit` accepts only `AuditTx`. A `@ts-expect-error` test (checked by `pnpm typecheck`) proves `db` is rejected.
- **TRUNCATE and the trigger.** A row-level `BEFORE UPDATE OR DELETE` trigger does not fire on `TRUNCATE`, which is what we want. `User` is truncated `CASCADE` by existing auth tests; that now also empties `AuditLog` and `StockMovement` in those tests, harmless.
- **`db:drift` ignores triggers and CHECKs** (spec 025); the trigger and FK additions live in the migration SQL and are covered by the db tests.
- **Customer = guest email on orders.** No customer table, so the masking queries are shaped around `Order` columns (`guestEmail`, `contactName`, `contactMobile`, `street`, `zip`, `barangayName`, `cityName`, `provinceName`, codes, `regionName`, `zone`). There are no order or refund note columns today; "free text" masking is built as `maskFreeText` and the audit key list, so a later column only adds its name.
- **No admin page reads data yet** (spec 039 R-13), so the masking queries have no caller in this story except tests. They are written as the real query layer (`lib/admin/queries/`) so screen stories import them.
- **Origin rule inputs.** `trustedOriginsFor` needs the same inputs as in `lib/auth/auth.ts` (site URL, `VERCEL_URL`, `VERCEL_BRANCH_URL`, environment). The wrapper reads them through `env` at call time; unit tests inject the list.

## Risks to settle early

1. **Importable "use server" modules under Vitest** — task 1, a gate.
2. **Wrapped exports inside `"use server"` files in Next 16.4** — task 3, with a real `pnpm build`.
3. **The branded `AuditTx`** must not make normal transactions awkward: handlers call `adminTransaction`, not `db.$transaction`. A test shows a handler with raw `db.$transaction` can't call `recordAudit`.
4. **Allowlist maintenance (R9b).** The allowlist of non-admin `"use server"` files and mutating routes is explicit and each entry has a reason; adding an unrelated action later means adding a line, by design.
5. **Deploy window:** the migration adds a table, a trigger and an FK on `StockMovement.actorId` (existing values are all null). Nothing in the storefront reads the new table.

## Steps

### 0. Housekeeping
Commit `spec.md`, `plan.md` and `tasks.md` (the spec 039 note and the PRD AD-11 wording were edited with the spec; commit them with it).

### 1. Prove the enumeration setup (gate)
- `test-support/admin-guard-scan.ts`: `findUnguarded(modulePaths)` that dynamic-imports each module and returns `{ file, export, reason }` for every exported function without the marker. No Next or db code in the scanner itself.
- `test-support/admin-fixtures/unguarded-actions.ts` (a `"use server"` module exporting an async function with no wrapper), `unguarded-route.ts` (exports `POST` without the wrapper) and `guarded-actions.ts` (hand-set marker, to prove the passing case).
- `test-support/admin-guard-scan.test.ts`: imports one real `"use server"` module (`app/(store)/cart/actions.ts`, a real module with real imports of `next/cache`, `@/lib/db`, `@/lib/env`) and the fixtures, using only mocks of the kind listed above; shows the scanner reporting the fixtures (and the real cart module, since it is not guarded) and passing the guarded fixture.
- Report pass or fail and the option used. **Stop if importing is impractical** (the user decides among the options above or a source-parsing fallback, which the issue explicitly rules out).

### 2. Permissions (pure)
`lib/admin/permissions.ts`: `AdminRole`, `AdminAction` (24), the `Record` table, `can()`, `ADMIN_ACTIONS`, `isMutationAction`-style helper only if the enumeration test needs it (it needs "is this a read action": decided by a `.view` / `.packing-slip` suffix list kept next to the table and tested). ESLint block extended to `lib/admin/permissions.ts` and `lib/admin/mask.ts`. T2 written out row by row. The role mapper (`UserRole` → `AdminRole`) lives in `lib/admin/session.ts` and `AdminSession` gains `role`.

### 3. The wrappers
`lib/admin/guard.ts`: `adminAction`, `adminRoute`, the marker (`Symbol.for("pcs.adminAction")`), denial answers (Demo: "This account is read-only"; Staff on an owner-only action: "Only owners can do this"; 401, 400, origin 403), logging of the action name and code only. Order of operations as the spec: origin (write methods only) → session → `can` → parse → handler. Dependencies (session loader, trusted-origins list) are injectable for tests. T3, T14 and a spy proving a denied request makes no query and never reads the body. `pnpm build` with a small real wrapped action to settle risk 2.

### 4. The page-level guard and the shell
`requireAdminAccess(action)` (session + `can` for a view action; renders the no-access page), the no-access page and copy, nav items filtered by `can()`, the Demo notice, disabled-control helper with the role's reason text (shared with the server's message constants). Update `admin-pages.test.ts` (pages call `requireAdminSession` or `requireAdminAccess`). T10.

### 5. Enumeration test on the real folders and placement
`lib/admin/guard-enumeration.test.ts`: discovery by reading the directive (R8), real `app/admin/**` "use server" modules and `app/api/admin/**/route.ts` (POST/PUT/PATCH/DELETE and GET), the fixtures must be reported, marker names a known action, demo gets false for non-read actions, each marked function called as Demo with empty input leaves row counts unchanged (db-backed part as `*.db.test.ts`, discovery and fixtures as a unit test). Placement (R9b) with the allowlist. ESLint (R9a): `actions.ts` naming and import restriction for `adminAction` / `adminRoute`, each proven by a fixture lint test.

### 6. Audit
Migration: `AuditLog` table and indexes, `BEFORE UPDATE OR DELETE` trigger that raises, `StockMovement.actorId` FK (`Restrict`) with the comment in `schema.prisma` replaced. `adminTransaction`, `AuditTx`, `recordAudit` with redaction, size cap, closed `AuditEntity` / `AuditAction` unions. `resetCatalog()` / `--reset` and `test-support/db.ts` name `AuditLog`. Tests T6, T7, T8 (db), including the type test. `pnpm db:drift` clean.

### 7. Masking and the query layer
`lib/admin/mask.ts` (pure): `maskCustomer`, `maskAddress`, `maskFreeText`, `maskAuditEntry`, with the Demo DTO types lacking raw fields. `lib/admin/queries/`: `orderContact` / `orderAddress` readers, a customers reader (grouped by email, no key for Demo), an audit-entry reader, `searchOrders` refusing a customer term for Demo. The import-ban test (T12) and the shared helper `expectNoRawValues` ([test-support/](../../../test-support/)). T9, T11.

### 8. E2E, docs and preview
E2E: the three roles sign in, land on Orders; Demo sees the notice; Staff opening a view it lacks sees the no-access page (via a view action with no screen yet, a route the test knows is guarded, such as `/admin/dashboard` rendering the no-access page for Staff without data). Docs: CLAUDE.md staff bullet, README, ADR 0012 note, PRD `AuditLog` row, spec 039 status line if needed, `docs/setup/admin-accounts.md` roles text. Preview check of the acceptance criteria.

## Verification

After each task: `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:db` where the task touches the database. Before the PR: `pnpm build`, `pnpm test:e2e` (production build under CI settings), `pnpm db:drift`.
