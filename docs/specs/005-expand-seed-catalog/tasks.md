# 005 — Tasks: expand the seed catalog

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #18

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Data tasks check every new part against its manufacturer page and add parts after the existing entries; the existing entries stay unchanged. The story ships as one commit (T8).

- [x] **T1. Reserved slugs.** `lib/reserved-slugs.ts` and its test (including the `app/` routes check); `findReservedCategorySlugs()` in `prisma/seed/validate.ts` with tests; the check in `prisma/seed.ts`.
  - Verify: rename a registry key to `cart` → `pnpm db:seed` prints the reserved message and exits 1 before "Seeding …". Add an empty `app/deals2/` → the routes test fails. Revert both.

- [x] **T2. CPUs and motherboards** (+5, +5).
  - Verify: `pnpm test`; `pnpm db:seed` on the dev branch creates 10 parts.

- [x] **T3. Memory and storage** (+5, +4).
  - Verify: `pnpm test`; `pnpm db:seed` creates 9 parts.

- [x] **T4. GPUs and PSUs** (+6, +4, including a ≥ 1000 W PSU).
  - Verify: `pnpm test`; `pnpm db:seed` creates 10 parts.

- [x] **T5. Cases and CPU coolers** (+4, +4).
  - Verify: `pnpm test`; `pnpm db:seed` creates 8 parts.

- [x] **T6. Coverage test and full check.** `prisma/seed/data/coverage.test.ts`; adjust stock and sale values on new parts if a minimum is missed; apply the owner's browser check of every `// verify:` value and remove those comments; update the `write.ts` timeout comment (raise the timeout if the 60-part seed comes close to it).
  - Verify: `pnpm test` with `.env.local` renamed. A second `pnpm db:seed` gives `0 created, 60 updated` with the same row counts. `/products` lists 60 rows. `pnpm test:e2e` passes. `git diff prisma/seed/data` shows only additions, apart from header and tier comments. `grep -r "verify:" prisma/seed/data` finds nothing.

- [x] **T7. Docs.** CLAUDE.md `db:seed` line; PRD open question on the seed catalog.
  - Verify: links resolve.

- [ ] **T8. Ship.** One commit, `git push -u origin HEAD`, PR closing #18 with the spec files.
  - Verify: CI passes on the PR.

- [ ] **T9. Re-seed production (after merge).** Done by the owner, per spec 004 "Seeding production" (no `--reset`, `NODE_ENV=production`, URLs set in the shell only).
  - Verify: the printed host is production; the summary shows `37 created, 23 updated`; `/products` in production lists 60 parts.
