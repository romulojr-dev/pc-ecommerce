# Plan: spec 046 — Admin inventory: stock adjustments, low-stock threshold and movement history (#116)

Spec: [spec.md](spec.md) (approved with five changes). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `116-inventory-adjustments`, from `main`. One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `adminAction`, `adminTransaction`, `recordAudit` (`lib/admin/guard.ts`, `lib/admin/audit.ts`); `inventory.view` / `inventory.adjust` already in the permissions table; `requireAdminAccess`, `NoAccess`, `assertCan`; the list-page pattern of specs 041, 042 and 045 (pure params module, canonical redirect, `loading.tsx`, `error.tsx`, plain GET filter form); `dateTimeText` and the Manila formatter (`lib/orders/time.ts`); `HIDDEN_IN_DEMO` and `note` as an existing free-text key (`lib/admin/mask.ts`); the guard-enumeration tests, which pick up a new admin `actions.ts` by its `"use server"` directive; `guardTransactions` (`test-support/release.ts`); `PlaceOptions.afterStep` (a seam inside `placeOrder`'s transaction) for forcing interleavings.

Does not exist yet: the Inventory routes and components, the three reasons and the `note` column, the CHECKs, `lib/admin/queries/inventory.ts`, `adjustStock` / `setLowStockAt`, the pure input / params / view modules, the shared low-stock definition.

## Findings that shape the plan

- **Two migrations, not one.** Postgres can't use an enum value added in the same transaction (`unsafe use of new enum value`), and Prisma runs a migration file as one script. Migration 1 only adds the three enum values; migration 2 adds `note`, the pre-check and the CHECKs that name them.
- **The pre-check runs before the CHECKs** as a `DO` block that counts offending rows per rule and raises one exception naming the rule and the count (change 3: fail loudly). `ADD CONSTRAINT` would fail too, but without the count.
- **The CHECKs are migration-only** (Prisma can't express them), like orders'. They don't show in `db:drift`; `schema.db.test.ts` covers them (E45). Existing rows: order movements written by placement (`change < 0`, `ORDER_RESERVED`) and by release / cancel (`change > 0`, `ORDER_RELEASED`, `actorId` set or null, no note) all satisfy them; the test suite will show any fixture that does not.
- **The stock statement is a single raw `UPDATE … WHERE "stock" + delta BETWEEN 0 AND 1000000 RETURNING "stock"`**, with delta a bound parameter, taking the row lock. A concurrent `placeOrder` (conditional decrement) and an adjustment queue on that lock and each re-checks its `WHERE` on the new row version. Two adjustments cannot both pass the ceiling for the same reason. `adjustStock` takes an `afterStep` seam (`"stock"` after the update, `"movement"` after the insert) so a test can hold the transaction open at the interesting point; the other side is `placeOrder`'s existing `afterStep`.
- **Refusal reads the stock again** after a failed update, in the same transaction (read committed), and picks the message by which side failed (too low or too high). A product that does not exist is a third answer (`not-found`).
- **`updatedAt` is written by hand** in the statement (as placement does), because it is raw SQL. `editVersion` is untouched (spec 045).
- **The threshold write** is a conditional `updateMany` on `lowStockAt <> new` (so an unchanged value is detected without a read), with a prior read for the audit "before" inside the same transaction. A raw `UPDATE … RETURNING` of the old value is not available, so it reads first under `FOR UPDATE`.
- **Category filter uses the eight builder categories**, like the product list (`CATEGORY_SLUGS`), instead of "any category that has products": non-builder categories are Phase 2 and have no products, and it keeps the params module pure with no database. Recorded as a small clarification of B5 in the spec (D18).
- **Pages and components may not import the database** (`no-db-in-pages.test.ts`), so all reads go through `lib/admin/queries/inventory.ts`.
- **The confirm step is client state in the form component**, with the pure `reviewText` / `reviewState` in `inventory-view.ts` deciding the text and whether Confirm is offered, so it is unit-tested without a DOM.
- **Low-stock definition** is one pure function (`stockLevel`) and one SQL fragment (`lowStockCondition(alias)`, `lib/orders`-style `*-sql.ts`) so #120 reuses both; a `.db` test checks them against each other, as `due-sql.db.test.ts` does for the release rule.
- **Nav item** type `NavItem.key` gains `"inventory"`; tests that count nav items (`shell.test.tsx`, `nav` tests) are updated.

## Risks to settle early

1. **Migration order and the enum** (task 2): prove on the test database that migration 2 applies after migration 1 with `pnpm test:db:migrate`, and that `pnpm db:drift` is clean.
2. **Concurrency is decided by row locks, not timing** (task 5): every race is forced (hold a transaction at a step, start the competitor, release), so the tests don't depend on sleeps being long enough beyond the 400 ms settle the repo already uses.
3. **Existing fixtures that insert `StockMovement` rows** (task 2): any test inserting a movement that breaks a new CHECK is fixed in its fixture, not by loosening the CHECK.

## Deviations from the spec

- D18 (new): the category filter lists the eight builder categories. No other deviation so far; a task that finds the spec wrong stops and reports.

## Order of work

1. Housekeeping (spec, plan, tasks committed).
2. Pure rules (input, params, view, level, ceiling constant).
3. Schema: two migrations and the CHECKs, with tests.
4. Queries.
5. `adjustStock` and `setLowStockAt`.
6. Concurrency tests.
7. Actions, cache, guard and enumeration tests.
8. Nav, copy, list page.
9. Product page: adjust form with confirm step, threshold form, history.
10. E2E.
11. Docs (CLAUDE.md, spec 045's stock line, README if it lists Admin screens), then the PR.
