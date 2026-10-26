# 011 — Tasks: grow the seed catalog to 150 parts

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #34

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Data tasks check every new part against its manufacturer page, add parts after the existing entries (which stay unchanged), place their share of the stock / sale / pre-order targets from the plan, and run `pnpm db:seed` on the dev branch. The story ships as one commit (T11).

- [x] **T1. Seed run time and test scaffolding.** Raise the `writeSeed` transaction timeout to 180 s and update its comment; relax the 55–65 total and 4–8 on-sale bounds in `coverage.test.ts` so they don't fail as data grows.
  - Verify: `pnpm test`; `pnpm db:seed` on the dev branch still gives `0 created, 60 updated`; note the run time.

- [x] **T2. CPUs** (+18, 26 total) and the E2E page assertion (`/cpu?page=99` → `/cpu?page=2`).
  - Verify: `pnpm db:seed` creates 18; `pnpm test:e2e` category-page spec passes.

- [x] **T3. GPUs** (+21, 30 total).
  - Verify: `pnpm db:seed` creates 21.

- [x] **T4. Memory** (+13, 20 total).
  - Verify: `pnpm db:seed` creates 13.

- [x] **T5. Storage** (+13, 20 total).
  - Verify: `pnpm db:seed` creates 13.

- [x] **T6. Motherboards** (+10, 18 total).
  - Verify: `pnpm db:seed` creates 10.

- [x] **T7. Cases, PSUs and CPU coolers** (+5 each, 12 total each; PSUs include a ≥ 1200 W and an SFX-L unit).
  - Verify: `pnpm db:seed` creates 15.

- [x] **T8. Coverage test.** Replace the old rules in `coverage.test.ts` with the spec's (size, brands, filterable fields, prices, stock and sale, quality); extend the fixture SKU list to all 60 existing SKUs. Adjust stock, sale or price values on new parts if a rule is missed.
  - Verify: `pnpm test` passes; temporarily dropping a DDR4 kit fails it with a message naming category, field and values.

- [x] **T9. Full check.** The `// verify:` comments were removed and their values accepted as given (owner decision).
  - Verify: second `pnpm db:seed` gives `0 created, 150 updated`, same row counts, run time noted; `git diff prisma/seed/data` shows only additions apart from header comments; `grep -r "verify:" prisma/seed/data` finds nothing; `pnpm test:e2e` passes; `/cpu` and `/gpu` show two pages; a pre-order, a sale and an out-of-stock product page look right.

- [x] **T10. Docs.** CLAUDE.md `db:seed` line; pointers in spec 005 and the PRD open question.
  - Verify: links resolve.

- [x] **T11. Ship.** One commit, `git push -u origin HEAD`, PR closing #34 with the spec files.
  - Verify: CI passes on the PR.

- [ ] **T12. Re-seed production (after merge).** Done by the owner, per spec 004 "Seeding production" (no `--reset`, `NODE_ENV=production`, URLs set in the shell only).
  - Verify: the printed host is production; the summary shows `90 created, 60 updated`; `/cpu` and `/gpu` in production show two pages.
