# 016 — Tasks: home page

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:db` passing. Commit after each task (subject-only Conventional Commit); the PR is squash-merged.

- [x] **T1. Featured flag: migration and seed.** `Product.isFeatured` migration; `featured` in the seed part schema and writer (also on re-seed); one featured part per category; coverage test. _Verify:_ `pnpm db:migrate`, `pnpm db:seed` (8 featured), `pnpm test`.
- [x] **T2. Spec summary line on cards.** `FieldMeta.summary`, marks per category, `specSummary` with unit tests, `summary` in card data, the card's line. _Verify:_ `pnpm test`; screenshots of `/cpu`, a search and a product page's Similar products.
- [x] **T3. On sale filter.** `onSale` common filter (pure, server, sidebar checkbox); `/search?onSale=1` titled "Deals"; unit and integration tests. _Verify:_ `pnpm test`, `pnpm test:db`; `/cpu?onSale=1` in dev.
- [x] **T4. Home queries and caching.** `lib/home.ts` (featured, deals, brands; cached with `PRODUCTS_TAG`, 10 min); `lib/home.db.test.ts`. _Verify:_ `pnpm test:db`.
- [ ] **T5. Home page and builder placeholder.** Hero with the wafer SVG, category tiles (shared icon map), Featured, Deals, brands, trust strip; `/builder`. _Verify:_ screenshots of `/` and `/builder` (light, dark); keyboard and axe; `pnpm build` shows `/` with a 10-minute revalidate.
- [ ] **T6. E2E.** Home sections and links, "View all deals", summary line on `/cpu`. _Verify:_ full `pnpm test:e2e`.
- [ ] **T7. Docs and wrap-up.** ADR 0003 row, CLAUDE.md, tick the spec's criteria; `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; push and open the PR; Lighthouse desktop on the preview. After merge: `pnpm db:seed` on production.
