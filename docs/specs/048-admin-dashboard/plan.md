# Plan: spec 048 — Admin dashboard (#120)

Spec: [spec.md](spec.md) (approved with five additions). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `120-admin-dashboard`, from `main`. One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `dashboard.view` in the permissions table (Owner and Demo); `requireAdminAccess`, `NoAccess`, `assertCan`; the list-page pattern (`connection()`, `loading.tsx`, `error.tsx`); `countsAsSale` / `saleOrderCondition` (spec 042), `dueOrderCondition` (spec 041), `lowStockCondition` / `stockLevel` (spec 046); `maskName` and the `CustomerName` union, `OrderBadges`, `dateTimeText`, `formatPeso`; the Manila day helpers in `lib/admin/manila-day.ts`; `expectNoRawValues` and `FIXTURE_CUSTOMER`; `orderData` in `test-support/orders.ts`.

Does not exist yet: the dashboard route and components, `salesSummary` / `dashboardWindows`, `needsReview` and its SQL, `getDashboard`, the `paidAt` index, `adminHomeFor`.

## Findings that shape the plan

- **Landing without a role at the login page.** The login page knows no role (the visitor is signed out), and `safeNext` falls back to `ADMIN_HOME`. Instead of making `safeNext` role-aware, `ADMIN_HOME` becomes `/admin` and the `/admin` page redirects with `adminHomeFor(role)` (`/admin/dashboard` for Owner and Demo, `/admin/orders` for Staff). Same behavior as spec B2 / R13; a supplied `next` is honoured as before. `demo-pages.db.test.ts` and `safe-next.test.ts` are updated.
- **Windows are computed once** in `dashboardWindows(now)`, from `manila-day.ts` helpers (`startOfManilaDay` of the Manila date of `now`). The query binds the three instants; no column is converted in SQL (E30). The Manila date of `now` comes from adding 8 hours and reading the UTC date.
- **One slim query.** Orders with `createdAt` or `paidAt` in `[last30Start, tomorrowStart)`: four fields. `salesSummary` does the rest, with `countsAsSale`. An agreement test compares it with a SQL aggregate built on `saleOrderCondition()`.
- **AOV** is `floor((2·sales + n) / (2·n))` in integers. Sums stay far below `Number.MAX_SAFE_INTEGER`.
- **Needs review** is a pure `needsReview` and `needsReviewCondition()` (alias `o`): `refundRequired` or an exists-payment-with-`problem`. #111 will add `reviewedAt` to both (its criteria were edited).
- **Recent orders** use the list's badge and masking pieces but their own small select (5 rows), plus `dueAmong`-style SQL for the Due badge via `dueOrderCondition`. `dueAmong` is not exported today; it is exported from `queries/orders.ts` and reused instead of copied.
- **Partial index:** `Order(paidAt) WHERE paidAt IS NOT NULL`, declared in `schema.prisma` with the `partialIndexes` feature like the cart's; one migration, `db:drift` clean.
- **No cache:** the page calls `connection()`; a source test forbids `unstable_cache`, `revalidate`, `cacheTag`/`"use cache"` in the page and query module (R9).
- **Nav:** `NavItem.key` gains `"dashboard"`, first in the list; tests that list nav items are updated.

## Risks to settle early

1. The Manila "today" arithmetic at 23:59:59, 00:00:00 and 08:00 (UTC midnight): unit tests first (task 1).
2. Fixtures for the sales E2E: "today" moves, so the E2E reads the figures, inserts one known paid order and asserts the difference.

## Deviations from the spec

- R13's mechanism only: the fallback is `/admin` (role redirect there) rather than a role-aware `safeNext`. Behavior unchanged. A task that finds the spec wrong stops and reports.

## Order of work

1. Housekeeping. 2. Pure rules. 3. Schema index. 4. SQL fragment and query with integration tests. 5. Landing, nav and page. 6. Demo and E2E. 7. Docs and PR.
