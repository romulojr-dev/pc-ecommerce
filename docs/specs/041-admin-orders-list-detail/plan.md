# Plan: spec 041 — admin orders: list, filters, detail and packing slip (#106)

Spec: [spec.md](spec.md) (approved 2026-11-05 with changes). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `admin-orders-list-filters-and-detail`. One commit per task, subject line only, no trailer.

## Context

Reused as it is: `requireAdminAccess` / `NoAccess` ([lib/admin/session.ts](../../../lib/admin/session.ts)), `can()`, `contactView` / `addressView` and the `Masked` brand ([lib/admin/mask.ts](../../../lib/admin/mask.ts)), `assertCan` / `denied` ([lib/admin/queries/guard.ts](../../../lib/admin/queries/guard.ts)), `orderEntries` ([lib/orders/view.ts](../../../lib/orders/view.ts)), `orderTimeline` / `statusLabel`, `lib/orders/time.ts`, `formatPeso`, `expectNoRawValues` ([test-support/no-raw-values.ts](../../../test-support/no-raw-values.ts)), the order helpers in `test-support/orders.ts` and `e2e/orders.ts`, the `admin` Playwright project.

Replaced: `searchOrders` and `getOrderPerson` in [lib/admin/queries/orders.ts](../../../lib/admin/queries/orders.ts) (no page calls them; their tests move to `listOrders` / `getOrderDetail`). Replaced: the placeholder [app/admin/(shell)/orders/page.tsx](../../../app/admin/(shell)/orders/page.tsx) and its `ADMIN_COPY.orders` strings.

Does not exist yet: the three routes below the list, `lib/admin/orders-params.ts`, `orders-view.ts`, the indexes, a shared due condition, print styles.

## Findings that shape the plan

- **"Due" has two SQL copies and one unused pure function.** `checkExpiredOrders` and `releaseExpiredOrders` in [lib/orders/release.ts](../../../lib/orders/release.ts) each write the condition in SQL; `isDue` ([release-rules.ts](../../../lib/orders/release-rules.ts)) is read only by tests. The approved change ("same predicate the release job uses; no second definition") is met by extracting one `Prisma.sql` fragment, `dueOrderCondition(now)`, and using it in both release queries and in the admin queries (D11). The release's behavior must not change: its existing `release*.db.test.ts` files are the safety net, run before and after the refactor.
- **The badge needs the fragment, so it is a query, not a pure function.** The list asks one raw query per page: `SELECT id FROM "Order" o WHERE o.id = ANY(ids) AND <dueOrderCondition>`; a row is "Due for release" when its id comes back. `isDue` stays as the pure statement of the rule and E31 compares the three.
- **Flags** need `Payment.problem`: `needsCheck` = any payment `AMOUNT_MISMATCH` (`EXISTS` subquery or `include: { payments: { select: { problem } } }` limited to ids on the page; chosen in task 4 after reading the query plan).
- **Customer search normalization** (R6) is pure, so it sits in `orders-params`/`orders-view` and is unit-tested; the query only receives `{ text, mobileDigits | null }`.
- **Demo refusal before any query** is already the shape of `searchOrders` (`denied()`); keep it, and add the "also when `number` is present" case.
- **Indexes can't be checked by `db:drift` alone for ordering.** Declare them in `schema.prisma` (`@@index([createdAt(sort: Desc), id(sort: Desc)])`, `[status, createdAt(sort: Desc)]`, `[paymentOption, createdAt(sort: Desc)]`); the `EXPLAIN` test (E29) proves they are used. Plan for the planner to prefer a seq scan on a small table: the test seeds 5 000 orders and runs `ANALYZE`.
- **`loading.tsx` and 404s.** The list gets `loading.tsx` and `error.tsx`; the detail and slip must not (B10), so unknown numbers keep their 404 status.
- **Print.** The shell layout must hide nav and header under `@media print`; check how [components/admin/admin-shell.tsx](../../../components/admin/admin-shell.tsx) is built before adding `print:hidden`. The "Print" button is a tiny client component.
- **Amount to collect** only needs `paymentOption`, `paidAt`, `status`, `fulfillment` and `total`, all already on the detail DTO.
- **E2E accounts and orders.** The `admin` project signs in per role; orders come from `e2e/orders.ts` helpers. Each order gets its own recipient (email cap). Need orders of several statuses; the helper may need a "set status" function that writes through the E2E database guard like `e2e/stock.ts`.

## Risks to settle early

1. **Refactoring the release SQL** (task 1) is the only change to code with money-adjacent behavior; do it first, alone, behind the existing tests.
2. **Index use at small scale** (E29): seed enough rows and `ANALYZE` or the test is flaky.
3. **Offset page edge repeats** (R1) are accepted; no work.
4. **RSC payload masking for three pages** (E30): the helper needs a real fixture with distinctive values; build one fixture order that all three tests share.

## Steps

### 0. Housekeeping
Commit `spec.md`, `plan.md`, `tasks.md`.

### 1. One definition of "due" (gate)
- `lib/orders/due-sql.ts`: `dueOrderCondition(now)` returning a `Prisma.Sql` fragment (status in the two pending values, `expiresAt <= now`, no payment with a problem), imported by both queries in `release.ts`.
- Run the existing release tests unchanged. Add the agreement test E31 (admin side can't exist yet, so first version compares the fragment, `isDue` and `checkExpiredOrders` on the fixtures; task 4 adds the admin badge to it).
- **Stop and report if any release test changes behavior.**

### 2. Pure modules
- `lib/admin/orders-params.ts`: parse and serialize the URL (R2, R3, B8), `page` rules, customer term (length, mobile digits) per R6, canonical form and `orderParamsHref`.
- `lib/admin/orders-view.ts`: badge and flag labels, payment-cell text, `readyToPack(status)` (Processing only, D12), slip warning text, amount-to-collect rule, email type/status labels, payment problem words.
- Copy added to `lib/admin/copy.ts` (replacing the placeholder strings). Unit tests T1–T3.

### 3. Indexes
Migration for the three indexes (R10), schema declarations, `db:drift` clean. `EXPLAIN` integration test (E29).

### 4. List query
`listOrders(role, params, now)` with the allow-listed `select`, count, paging, filters, number and customer search, Demo refusal, due ids via the fragment, flags. Row DTO type with `Masked` name for Demo. Integration tests E1, E3, E3a, E4–E17 and the Demo spy test; extend E31 with the badge.

### 5. List page
`/admin/orders` page, filter form (GET, labelled, works without JS), table, pagination, empty/loading/error states, redirects to the canonical URL, Demo's disabled customer field. Page render tests, `admin-pages` and `no-db-in-pages` stay green. Nav unchanged.

### 6. Detail query and page
`getOrderDetail` (named selects; items in `OrderPageItem` shape; payments newest first including `OPENING`/`FAILED`; emails; timeline times; flags; due; amount to collect), the page with sections and flag callouts, 404 handling. Tests E18–E23, E26a, E28 and the serialization allow-list test E22 (fully populated order including `PaymentEvent`, hashes, key).

### 7. Packing slip
`getPackingSlip` (no price fields at all, R12), page with print styles and the Print button, `print:hidden` on the shell, the "Do not ship" banner via `readyToPack`. Tests E24–E27 (all 11 statuses), E28.

### 8. Demo across the three pages
One shared fixture order; render list, detail and slip as Demo and run `expectNoRawValues` on each RSC payload (E30). Fix any leak found.

### 9. E2E
`e2e/admin-orders.spec.ts` for Owner and Demo as in the spec's test plan.

### 10. Documentation
CLAUDE.md bullet for this story (routes, the shared due definition, "ready to pack", query layer functions), spec status line, README only if it lists admin screens, and the "What changed while building" section of the spec. Note in spec 033's doc that the due condition now lives in `due-sql.ts`.

### 11. Final checks
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build`, `pnpm test:e2e` (admin project). Then push, open the PR from the template, and check the acceptance list on the preview URL at 1024 px and 1280 px, plus a print preview of one slip.
