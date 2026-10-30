# 025 — Tasks: Cart for single items

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 025 (approved with the review changes), the "Changed by spec 025 (#60)" notes in spec 020, this plan and task list.
- [ ] **T2. Drift check.**
  - `datasource.shadowDatabaseUrl` (optional `SHADOW_DATABASE_URL`) in `prisma7.config.ts`; `pnpm db:drift` in `package.json`.
  - CI: create `pcsilicon_shadow` beside `pcsilicon_test`, and a "Check schema drift" step after "Apply migrations".
  - *Verify:* on the Docker Postgres with an inline shadow URL, the current migrations give exit 0. If today's triggers or CHECKs show as drift, stop and report.
- [ ] **T3. Pure logic, test-first.** `lib/cart/` `id`, `cap`, `count`, `input`, `copy`, `types`, and `count-store`, with unit tests (E3–E7, E10, E15, E17–E21, E32, E39–E44).
- [ ] **T4. Schema.**
  - `partialIndexes` preview feature; `Cart` and `CartItem`; `pnpm db:migrate --name cart`, plus `CHECK ("quantity" >= 1)` appended to the migration.
  - Check the generated partial unique index; a second `migrate dev --create-only` is empty (delete it); `pnpm db:drift` exits 0.
  - `Cart` named in the reset in `prisma/seed/write.ts` and `test-support/db.ts`.
  - `lib/cart/schema.db.test.ts`: both indexes in `pg_indexes`, a second single line refused, quantity 0 refused, deleting a carted product refused.
- [ ] **T5. Cart server logic.** `lib/cart/cart.ts` and `cart.db.test.ts`: add, merge, cap across lines, set, remove, other-cart ids, retired products, fresh prices, concurrency (E1–E9, E11–E18, E22–E26, E28, E29, E45–E50).
- [ ] **T6. Actions, count route, header.** Server actions, `cookie.ts`, `GET /api/cart/count` and its test (E51), `CartLink` in the header.
- [ ] **T7. Product page.** `StockLine` extraction, controlled `QuantitySelector`, `Purchase`, `AddToCart`, markup tests; E2E E33, E37.
- [ ] **T8. Cart page.** Page, loading, lines, quantity, summary, empty and retired states, markup tests; E2E E34–E36, E38.
- [ ] **T9. Docs.** CLAUDE.md cart bullet, README (routes, `db:drift`, the CI step).
