# Plan: spec 047 — Admin audit log view (#119)

Spec: [spec.md](spec.md) (approved with changes). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `119-audit-log-view`, from `main`. One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `AuditLog`, its trigger and `recordAudit` / `adminTransaction` (spec 040); `audit.view` in the permissions table; `maskAuditJson`, `HIDDEN_IN_DEMO` and the maskers in `lib/admin/mask.ts`; `isSecretKey` in `lib/admin/audit-data.ts`; the list-page pattern of specs 041, 042, 045 and 046 (pure params module, canonical redirect, `(list)` group with `loading.tsx` / `error.tsx`, plain GET filter form); `requireAdminAccess`, `NoAccess`, `assertCan`; `dateTimeText` and the Manila formatter (`lib/orders/time.ts`); `formatPeso`; the guard scan (`scanModules`, `sourceFiles` in `test-support/admin-guard-scan.ts`) and `makeStaffUser` / `signInCookie`; `expectNoRawValues`.

Does not exist yet: the route, components and nav item; a paginated, filterable query; the diff, params, Manila-day and label modules; the two-rule key registry; the mutation fixture registry; the two indexes.

## Findings that shape the plan

- **The column is `entity`**, not `entityType`: the second index is `(entity, createdAt DESC)`. The existing `(actorId)` index stays and no new actor index is added; the old `(createdAt)` index is left (the migration only adds).
- **`maskAuditJson` fails open today** (unknown keys kept). The registry replaces its key sets and makes an unknown key hidden for Demo. That changes spec 040 B17; `mask.test.ts` cases for unknown keys change, the ones for `status` and other known keys get explicit `shown` rules.
- **Keys the writers emit today** (these seed the registry): product save `name sku slug brandId category description price salePrice weightGrams warrantyMonths boxContents preorderShipsOn isFeatured specs.*`; stock adjust `stock reason note`; threshold `lowStockAt`; order move `status courier trackingNumber paidAt`; cancel `status cancelReason refundRequired note`. Customer-related keys from spec 040's sets (`guestEmail contactName contactMobile …`) keep their `masked` rules for writers that will exist later (refunds, payment review).
- **The fixture registry runs the real actions**, as the existing `actions.db.test.ts` files do (mocked `next/headers`, `next/navigation`, `next/cache`, a signed-in Owner). That gives the mutation-coverage test and the key-collection test one source of rows. A marked action with no fixture fails; a fixture whose export is gone fails.
- **Order numbers and product names** are resolved for the page's rows in two batched reads.
- **Date bounds** are computed once in a pure helper (Manila is UTC+8, no DST): `gte` = start of From day, `lt` = start of the day after To.
- **Diff before masking.** The query module builds the diff rows from raw values, then applies the key's Demo rule to each side; the DTO for Demo never holds a raw value (a branded `Masked` or plain text).
- **Pages don't import the database** (`no-db-in-pages.test.ts`); the page calls only the query module.

## Approach by task

1. Pure rules: `audit-keys.ts` (two rules), `mask.ts` reading it, `audit-diff.ts`, `audit-labels.ts`, `audit-params.ts`, Manila-day range; unit tests, including the "no key renders as camelCase" and "every masked kind has a masker" checks.
2. Schema: one migration with the two indexes, `schema.prisma` updated; `db:drift` and `test:db` pass.
3. Query: `listAuditPage(role, params)` replaces `listAuditEntries`; integration tests insert rows directly (INSERT is allowed) for ordering, filters, bounds, batching, role gate, Demo.
4. Mutation fixtures and the key test: `test-support/admin-audit-fixtures.ts` and the db tests: every marked action writes an audit row (E26/E27), no-op writes none (R11), both rules exist for every collected key (R9), append-only trigger (E25), no-write scan of the route (R13).
5. UI: copy, nav item, `/admin/audit` page, filters, list with diff disclosure, `loading.tsx`, `error.tsx`; markup tests; Demo page test with `expectNoRawValues`.
6. E2E: a real stock adjustment and threshold save appear in the log; Staff has no access; Demo is masked (HTML and RSC).
7. Docs, full checks, push, PR.

## Risks

- Fixture inputs for orders need orders in the right states; reuse `test-support/orders.ts` builders.
- `maskAuditJson` change can break spec 040 tests that kept unknown keys; fix them in task 1, not later.
- RSC payload for Demo must not carry the raw `before`/`after`; the DTO is built so that it can't.
