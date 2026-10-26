# 012 — Tasks: common filters

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing (`pnpm test:db` too from T2). Commit after each task (short Conventional Commit subject); the PR is squash-merged, so `main` still gets one commit per story.

- [x] **T1. Effective price column (spike).** `Product.effectivePrice`, migration with backfill and trigger.
  - Verify: `pnpm db:migrate` on the dev branch; a second `migrate dev` shows no drift; `pnpm db:seed` twice; `UPDATE` of `salePrice` to a value and to `NULL` changes `effectivePrice`. If it fails, stop and report; the spec's fallback applies.
- [ ] **T2. Integration test setup.** `vitest.db.config.ts`, global setup, `test-support/db.ts`, `test:db`, main config excludes `*.db.test.ts`, `.env.example`, README, CI (second database, step). The guard (`test-support/db-guard.ts`) with unit tests. First integration test: the trigger on insert, on setting/clearing `salePrice`, and overriding a value sent for `effectivePrice` (ADR 0004).
  - Verify: `pnpm test:db` and `pnpm test` (which does not touch the database).
- [ ] **T3. Filter structure and URL state.** `lib/listing-filters/` (types, brand, price, in-stock, index), `listing-params.ts` with `filters`, `ListingSort` takes `state`; unit tests.
  - Verify: `pnpm test` with `.env.local` moved aside; `pnpm typecheck`; the page still renders and sort/pagination keep working.
- [ ] **T4. Filter queries.** `lib/listing-filters/server.ts`, filtered `getCategoryProducts` with effective-price sort, `getBrandOptions`; integration tests for every case in the spec, including the in-stock/`getStockStatus` agreement.
  - Verify: `pnpm test:db`.
- [ ] **T5. Sale price on the card.** `salePrice` in the card select/data and `ProductCard`; `cardPrices` in `e2e/category-page.spec.ts` skips struck prices.
  - Verify: a sale product (Core Ultra 5 245K) in `pnpm dev`; `pnpm test:e2e` for the category-page spec.
- [ ] **T6. Sidebar and page wiring.** shadcn `checkbox`; `ListingShell`, `ListingFilters`; page wiring (options, normalization redirect, grid columns); brand, in-stock and price apply as in the spec.
  - Verify in `pnpm dev`: URLs update, results change, focus stays on a toggled checkbox, Enter applies a price, invalid price shows its error, bad URLs redirect.
- [ ] **T7. Chips, clear all, no-match state.** `ActiveFilters`, no-match message with "Clear all filters", `role="status"` on the count, metadata (`noindex`, canonical).
  - Verify in `pnpm dev`: remove one chip, Clear all keeps sort; `/cpu?minPrice=9999999`; page source shows `noindex`.
- [ ] **T8. E2E.** `e2e/category-filters.spec.ts` with the scenarios in the spec.
  - Verify: `pnpm test:e2e`, all specs.
- [ ] **T9. Docs.** CLAUDE.md (listing URL state, filter structure, effective price, `test:db`, `TEST_DATABASE_URL`), README, tick the spec's acceptance criteria and set its status.
- [ ] **T10. Build and wrap-up.** `pnpm build`, `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`; browser check (themes, 1280/1024 px, keyboard, axe); push and open the PR.
