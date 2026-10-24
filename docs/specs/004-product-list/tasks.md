# 004 — Tasks: product list

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #10

Work top to bottom, one task at a time. Each task leaves `pnpm lint` and `pnpm typecheck` passing. The story ships as one commit (task 7).

- [x] **T1. Helpers and unit tests.** `lib/format.ts`, `lib/stock.ts` and their colocated `*.test.ts`.
  - Verify: `pnpm test` passes with `.env.local` renamed. Change the low-stock comparison from `<=` to `<` → the `== lowStockAt` case fails. Revert.

- [x] **T2. Page.** Add the shadcn `table` primitive; write `app/(store)/products/page.tsx` with `connection()`, the `ACTIVE` query, the table and the empty state.
  - Verify: `pnpm dev` against the Neon dev branch lists the seeded products with the right prices and stock labels. Set one product to `DRAFT` → it disappears. Revert. Light and dark look right at 1280 px.

- [x] **T3. Seed host log.** `prisma/seed.ts` prints `Seeding <host>` before writing.
  - Verify: `pnpm db:seed` on the dev branch prints the Neon dev host, then the usual counts.

- [x] **T4. E2E and CI step.** `e2e/products.spec.ts`; "Seed database" step in `.github/workflows/ci.yml`.
  - Verify: `pnpm test:e2e` passes locally. Rename the product in the test → it fails. Revert.

- [x] **T5. Local CI dry run.** Throwaway `postgres:17` in Docker, CI env in the shell: install, lint, typecheck, `db:deploy`, build, start.
  - Verify: the build lists `/products` as `ƒ`; `/products` shows the empty state with a 200. Then `db:seed` → a reload shows the products with no rebuild. Then `test` and `test:e2e` pass. The Neon dev branch is untouched; the container is stopped.

- [x] **T6. Docs.** CLAUDE.md: the `db:seed` line (CI seeds; production once by hand) and the current state (`/products`).
  - Verify: every command listed works as written.

- [ ] **T7. Ship.** One commit, `git push -u origin HEAD`, PR closing #10 with the spec files.
  - Verify: CI passes on the PR, including the seed step and the new E2E test.

- [ ] **T8. Seed production (after merge).** Once the production deploy succeeds, run the seed with the production URLs set in the shell only and `NODE_ENV=production`, no `--reset` (spec, "Seeding production"). Done by hand by the owner.
  - Verify: the printed host is the production one; `/products` on the production URL shows the catalog.
