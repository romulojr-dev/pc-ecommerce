# Tasks: spec 046 — Admin inventory: stock adjustments, low-stock threshold and movement history (#116)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task.

## 0. Housekeeping
- [x] Spec approved with five changes and folded in; open questions settled; #110's out-of-scope line updated
- [x] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. Pure rules
- [x] `lib/admin/inventory-input.ts`: adjustment and threshold schemas (strict), `deltaOf`, sign and bound rules (E10–E15, E23, E44)
- [x] `lib/admin/inventory-params.ts` (E5, E28) and `lib/admin/inventory-view.ts` (`stockLevel`, `reviewState`, `reviewText`, history row view-models, footer text)
- [x] Unit tests for all three; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema
- [x] Migration 1: `StockMovementReason` gains `RECEIVED`, `DAMAGED`, `CORRECTION`
- [x] Migration 2: `StockMovement.note`, the loud pre-check, the CHECKs (R2, R6), the history index; `schema.prisma` and its comments updated
- [x] `stock-movement-checks.db.test.ts`: E45, E46; fix any fixture that breaks a CHECK; `pnpm db:drift`, `pnpm test:db` pass

## 3. Queries
- [x] `lib/admin/queries/inventory.ts` and `lib/admin/low-stock-sql.ts`: `listInventory`, `getInventoryProduct`, `listMovements`; named fields, role checks, Demo note masking
- [x] Integration tests: filters, order, paging, history, order links, first-movement date, Demo masking (E2–E6, E26–E30, E43), SQL against the pure definition

## 4. Adjust and threshold
- [x] `lib/admin/inventory/adjust.ts`: `adjustStock`, `setLowStockAt` (E7–E9, E12, E16, E21–E25, E33)
- [x] Integration tests, including rollback and "refusal shows the current stock"

## 5. Concurrency
- [x] Adjustment against a real `placeOrder`, both interleavings forced (E17, E18); two staff at once (E19); against release and cancel (E20); the ceiling (E41) and zero (E42)

## 6. Actions and cache
- [ ] `actions.ts`: `adminAction("inventory.adjust", …)` for both; `updateTag(PRODUCTS_TAG)` after a saved result only
- [ ] Tests: `updateTag` once on success, never on refusal / invalid / unchanged / forbidden; Demo refusal and enumeration pick the actions up (E31)

## 7. Nav, copy and list
- [ ] `lib/admin/inventory-copy.ts`, nav item, `/admin/inventory` page, filters, list component, `loading.tsx`, `error.tsx`
- [ ] Markup tests; Demo and Staff views; no-db-in-pages still passes

## 8. Product page
- [ ] `/admin/inventory/[id]`: summary, adjust form with the review and confirm step, threshold form, history with footer and paging
- [ ] Component tests (review text, Confirm withheld at the bounds, moved-stock result line, Demo disabled); `demo-inventory-pages.db.test.ts` with `expectNoRawValues`

## 9. E2E
- [ ] `e2e/admin-inventory.spec.ts` and fixtures (E38, E12, E10, threshold, Demo, filters)

## 10. Docs and PR
- [ ] CLAUDE.md paragraph; spec 045's stock line and the `StockMovement` comment checked; README if it lists Admin screens
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift` pass; push; PR "Closes #116"
