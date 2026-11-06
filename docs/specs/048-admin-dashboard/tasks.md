# Tasks: spec 048 — Admin dashboard (#120)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task.

## 0. Housekeeping
- [x] Spec approved with five additions folded in; open questions settled; #111's criteria edited
- [ ] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. Pure rules
- [ ] `lib/admin/dashboard-sales.ts`: `dashboardWindows`, `salesSummary`, `averageOrder` (E1–E14, E27–E29)
- [ ] `lib/orders/review-rules.ts` (`needsReview`), `lib/admin/dashboard-view.ts`, `dashboard-copy.ts`, `adminHomeFor`
- [ ] Unit tests; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema
- [ ] Migration: partial index `Order(paidAt) WHERE paidAt IS NOT NULL`; `schema.prisma`; `pnpm db:drift` clean

## 3. Queries
- [ ] `lib/orders/review-sql.ts`; `lib/admin/queries/dashboard.ts` (`getDashboard`)
- [ ] Integration tests: SQL vs pure (R4), restocking, recent, needs review, role gate, no `AT TIME ZONE` (E30), no cache API (R9)

## 4. Landing, nav and page
- [ ] `ADMIN_HOME` = `/admin`, `/admin` redirects by role; nav item first; `/admin/dashboard` page, components, `loading.tsx`, `error.tsx`
- [ ] Markup tests (zero state, Demo masked, labels and notes); update existing tests that expect the old landing

## 5. Demo and E2E
- [ ] `demo-dashboard-pages.db.test.ts` with `expectNoRawValues` on the RSC payload (E19)
- [ ] `e2e/admin-dashboard.spec.ts` (Owner, Staff, Demo; HTML and RSC)

## 6. Docs and PR
- [ ] CLAUDE.md paragraph, README, spec 040 note, PRD AD-1 pointer
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build` pass
- [ ] Push; PR "Closes #120"
