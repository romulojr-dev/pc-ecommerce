# 048 — Admin dashboard

Status: approved with five additions folded in below (average order value rounds half up; one pure function for the Manila boundaries, SQL gets UTC instants; the labels "Paid sales" and "Orders placed" and the refund note; the Demo masking check on the RSC payload; Dashboard first in the nav) and the open questions settled (D12 to D16). #111's acceptance criteria were edited to take over the dashboard link and the narrowing of the count. Issue: [#120](https://github.com/romulojr-dev/pc-ecommerce/issues/120) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8). PRD: AD-1 (dashboard), AD-11 (roles; Demo masked). Builds on [spec 040](../040-admin-permissions-audit-masking/spec.md) (`dashboard.view`, masking, the query-module rule), [spec 041](../041-admin-orders-list-detail/spec.md) (order rows, "Due for release", flags), [spec 042](../042-admin-customers/spec.md) (`countsAsSale`, `saleOrderCondition`), [spec 043](../043-order-fulfillment-transitions/spec.md) (cash `paidAt` at delivery or pickup, #108) and [spec 046](../046-admin-inventory-adjustments/spec.md) (the shared low-stock definition, #116). It points at [#111](https://github.com/romulojr-dev/pc-ecommerce/issues/111) (the review list), which is not built yet.

Short form not used: this adds a screen, a pure aggregation, two shared definitions and a change to where Owner and Demo land.

## 1. Summary

Owner and Demo get a **Dashboard** at `/admin/dashboard`: today's sales, last-30-days sales, orders placed and average order value for each window; the products that need restocking; the five most recent orders; and a count of orders that need payment review. Days are Asia/Manila days. Sales count by `paidAt` (so a cash order counts when delivered or picked up) and leave out cancelled and refunded orders; "orders" counts orders **placed**. The numbers are real for Demo; only the recent-orders customer fields are masked.

## 2. Behavior

### Who sees what

1. `dashboard.view` is Owner and Demo (spec 040's table, unchanged; no new `can()` action). **Staff cannot**: the nav has no Dashboard item and a direct visit to `/admin/dashboard` renders `<NoAccess />` with no dashboard query run.
2. The nav gains **Dashboard** as its **first** item for Owner and Demo (via `navItemsFor`; Staff never sees it). `/admin` and the post-sign-in landing go to the Dashboard for Owner and Demo and stay on Orders for Staff (this is the change spec 040, Behavior 4 anticipated; D2).
3. The page has **no mutation**: no server action, no route handler, no form that posts.
4. The page is per request (`connection()`), `no-store`, `noindex` and `no-referrer` (already true of `/admin/*`), and reads its data **never through `unstable_cache`** or any shared cache, because the masked and unmasked views differ (D6).

### The page

5. **Sales figures.** Two blocks, **Today** and **Last 30 days**, each with: **Paid sales** (₱, the sum of `Order.total` of orders that count as a sale and were paid in the window), **Orders placed** (orders placed in the window, any status), and **Average order value** (Paid sales ÷ the number of sale orders in the window, **rounded half up to the nearest centavo** with integer math; "—" when that number is 0, D3, R3). A refund recorded later (#110) lowers Paid sales for the day the order was **paid**, not the day of the refund, so a past day's figure can go down; the page says so under the figures (copy below).
   - **Today** is the current Asia/Manila calendar day: `[00:00 today, 00:00 tomorrow)` Manila.
   - **Last 30 days** is today and the 29 Manila days before it: `[00:00 Manila 29 days ago, 00:00 tomorrow)` (D4).
   - A sale is placed in the window by `paidAt`; an order is counted in Orders by `createdAt`. So an order placed yesterday and paid today is in today's Paid sales and not in today's Orders placed, and a cash order delivered today counts in today's Sales whenever it was placed.
   - "Counts as a sale" is exactly spec 042's rule: `paidAt` set and the status neither Cancelled nor Refunded. A paid order that is later cancelled or refunded drops out of Sales.
6. **Needs restocking.** Up to 10 Active products that are out of stock or low (`lowStockCondition("restock")`: stock 0, or 1 up to the product's `lowStockAt`), **lowest stock first**, then name; each shows name, SKU, stock and "Out of stock" / "Low stock", and links to `/admin/inventory/{id}`. A heading count shows the total; when more than 10, a "View all {n}" link goes to `/admin/inventory?level=restock`. Empty: "Nothing needs restocking."
7. **Recent orders.** The 5 newest orders by `createdAt` (id tiebreak), any status, showing number (linked to `/admin/orders/{number}`), placed time (Manila), customer name, the row's true status (with the "Due for release" badge, as spec 041), and total. Customer name is **masked for Demo** through the masking layer (`A••• R•••`). A "View all orders" link goes to `/admin/orders`. Empty: "No orders yet."
8. **Needs review.** A card with the count of orders that need payment review: orders with a payment that has a `problem`, or `refundRequired` set (one count, each order once; reviewed ones are not yet excluded, D13). It is shown **without a link** for now; #111 adds the link to `/admin/orders?flag=review` and narrows the count to unreviewed problems (its acceptance criteria say so, D12). Zero: "Nothing needs review."
9. **Loading**: skeleton blocks (`loading.tsx` in a `(page)` group). **Error**: `error.tsx`: "Couldn't load the dashboard. Try again." with a retry. A failing part does not show a raw error.
10. **Zero-order state**: a shop with no orders shows ₱0.00 for both Sales figures, 0 for Orders, "—" for average order value, the recent-orders empty text and the needs-review empty text; no divide-by-zero, no `NaN`, no blank card. The restocking list is independent of orders.

## 3. Examples

Times are Asia/Manila (UTC+8). "Now" is 2026-11-06 15:00 Manila (07:00 UTC). Orders are built with `test-support/orders.ts`; parts from the seed.

| # | Input | Expected |
|---|---|---|
| E1 | Three orders paid today (₱10,000.00, ₱20,000.00, ₱30,000.00), all placed today | Today: Sales ₱60,000.00, Orders 3, AOV ₱20,000.00 |
| E2 | One order placed 2026-11-05 22:00, paid 2026-11-06 01:00 | Today Sales includes it; Today Orders does **not**; Last 30 days Orders includes it (placed on a day in the window) |
| E3 | Order paid at 2026-11-05 23:59:59.999 Manila and one at 2026-11-06 00:00:00.000 Manila | the first is not in Today, the second is (boundary is Manila midnight, not UTC midnight) |
| E4 | Order paid at 2026-11-05 20:00 UTC = 2026-11-06 04:00 Manila | in Today (a UTC "today" would miss it) |
| E5 | Order paid 2026-10-08 00:00 Manila; another paid 2026-10-07 23:59 Manila | the first is the oldest day in Last 30 days (today minus 29 days); the second is out |
| E6 | Cash order placed 2026-10-20, delivered 2026-11-06 | Sales in Today and Last 30 days (by `paidAt`); Orders counts it only in Last 30 days (placed 2026-10-20) |
| E7 | Cash order pending confirmation, or confirmed but not delivered (`paidAt` null) | in Orders when placed in the window; not in Sales |
| E8 | Paid order, then Cancelled (`refundRequired`) | not in Sales; still in Orders |
| E9 | Paid order with status Refunded | not in Sales; still in Orders |
| E10 | Unpaid online order, Pending payment | in Orders; not in Sales |
| E11 | ₱100.00 paid over 3 sale orders | AOV ₱33.33 (10,000 ÷ 3 = 3,333.33 centavos, rounded to 3,333) |
| E11b | Totals over 2 sale orders: 1,000,100 / 1,000,001 / 5 centavos | ₱5,000.50 (exact) / ₱5,000.01 (500,000.5 rounds half up) / ₱0.03 (2.5 rounds up) |
| E12 | 7 orders placed, 3 of them paid | Orders 7, Sales over 3, AOV = Sales ÷ 3 (not ÷ 7) |
| E13 | No orders at all | all zero figures, AOV "—", both empty texts, no error (Behavior 10) |
| E14 | Orders placed and none paid | Sales ₱0.00, Orders n, AOV "—" |
| E15 | 12 Active products at or under their threshold or at 0 | list shows 10, out of stock first (stock 0), then lowest stock, count "12", "View all 12" link |
| E16 | A draft or retired product at stock 0 | not listed (spec 046 D4) |
| E17 | A product with `lowStockAt` 0 and stock 3 | not listed (0 turns low off); at stock 0 it is listed |
| E18 | 7 orders exist | Recent orders shows the 5 newest; two with the same `createdAt` order by id |
| E19 | Demo opens the dashboard | Sales, Orders, AOV and the restocking list are the real values; recent-orders names are `A••• R•••` form; RSC payload passes `expectNoRawValues` |
| E20 | Owner opens it | recent-orders names are whole |
| E21 | Staff visits `/admin/dashboard` | no-access page; no dashboard query ran; nav has no Dashboard item |
| E22 | Signed-out visit | redirect to login (proxy + `requireAdminSession`) |
| E23 | Owner signs in with no `next` | lands on `/admin/dashboard`; Staff lands on `/admin/orders` |
| E24 | 2 orders: one paid with `problem` LATE, one cancelled with `refundRequired` | Needs review count 2 (an order with both counts once) |
| E25 | A reviewed problem (after #111) | not counted (the shared definition gains `reviewedAt IS NULL` there) |
| E27 | "Now" = 2026-11-06 23:59:59 Manila (15:59:59 UTC) | Today is Nov 6: `[2026-11-05T16:00:00Z, 2026-11-06T16:00:00Z)`; Last 30 days is `[2026-10-07T16:00:00Z, 2026-11-06T16:00:00Z)` |
| E28 | "Now" = 2026-11-07 00:00:00 Manila (2026-11-06T16:00:00Z) | Today = Nov 7: `[2026-11-06T16:00:00Z, 2026-11-07T16:00:00Z)`; one second earlier it was still Nov 6 |
| E29 | "Now" = 2026-11-06 08:00:00 Manila (2026-11-06T00:00:00Z, UTC midnight) | Today is still Nov 6 Manila: `[2026-11-05T16:00:00Z, 2026-11-06T16:00:00Z)`, not a window that starts at UTC midnight |
| E30 | The SQL for the window | receives the instants as bound `timestamp` parameters; no `AT TIME ZONE`, `date_trunc` or per-row conversion appears in it (a source check) |
| E26 | A pending order past its deadline with no payment problem | recent orders shows status Pending payment and the "Due for release" badge |

## 4. Rules and edge cases

- R1. **The aggregation is pure** (`lib/admin/dashboard-sales.ts`, no database import): `salesSummary(rows, windows)` takes slim rows (`status`, `createdAt`, `paidAt`, `total`) and returns `{ today, last30 }`, each `{ sales, orders, saleOrders, averageOrder }`. It uses `countsAsSale` (spec 042) and the Manila day helpers (`startOfManilaDay` and friends, spec 047) and never throws on odd input (an empty list, a `paidAt` in the future).
- R2. **Windows come from one pure function**, `dashboardWindows(now)` → `{ todayStart, tomorrowStart, last30Start }` as UTC instants, built from the Manila day of `now` (UTC+8, no DST; the day arithmetic is done on calendar days, tested at month and year ends and at 23:59:59, 00:00:00 and 08:00 Manila, E27 to E29). `salesSummary` and the SQL both use these instants. **The SQL receives them as bound timestamp parameters and never converts a column's time zone** (no `AT TIME ZONE`, no `date_trunc` on `paidAt` or `createdAt`), so the indexes work and the rule lives once (E30).
- R3. **Money is integers.** Paid sales is the sum of centavos. AOV is `floor((2 × sales + n) / (2 × n))` for `n` sale orders: nearest whole centavo, **half up**, in integers (no float step, no `Math.round`), `null` when `n` is 0 (E11, E11b). Display through `formatPeso`.
- R4. The window rows are read by one query that returns **only the four fields**, for orders with `createdAt` or `paidAt` in the last-30-days window; `status`/`paidAt` filtering for "sale" is the pure function's job, so the rule lives in one place. A test builds the same orders and checks the pure result against a SQL aggregate using `saleOrderCondition()` so the two cannot drift (as spec 042 did).
- R5. `lib/admin/queries/dashboard.ts` is the only reader. It takes the role, calls `assertCan(role, "dashboard.view")` **first** (Staff throws before any query), selects **named fields only**, and returns a DTO. The recent-orders part goes through the masking layer by role; the aggregates and the restocking list carry no customer field at all, so there is nothing to mask in them (and Demo sees the true figures, as the issue says). `no-db-in-pages.test.ts` already keeps the page file free of the database.
- R6. **Needs review** has one definition shared with #111: a pure `needsReview({ refundRequired, payments })` and a SQL fragment `needsReviewCondition()` (alias `o`), `refundRequired` or an exists-payment-with-`problem`. #111 adds "unreviewed" to both; this story's count and #111's list then agree. Counted as distinct orders.
- R7. **Restocking** uses spec 046's `lowStockCondition("restock")` and `stockLevel`; this story adds no copy of the rule. The count is a separate `COUNT` over the same fragment so the heading is the full total.
- R8. Recent orders reuse the order list's row mapping (status as the row holds it, `dueForRelease` from `dueOrderCondition`), limited to 5; they do not call `listOrders` with its page count and filters.
- R9. Nothing here caches. No `unstable_cache`, no tag, no `revalidate`; a test reads the source of the page and the query module for those names (D6).
- R10. Failure of one part (for example the restocking query) fails the whole page to `error.tsx`; no partial dashboard with a silently missing figure (D8).
- R11. Accessibility: figures are in a labelled region per window (`<section aria-labelledby>`), the lists are tables or lists with headers, "Out of stock" / "Low stock" are text, not colour only.
- R12. Desktop-first (1024 px and up); below that the page scrolls rather than hiding blocks.
- R13. The landing rule is one pure function `adminHomeFor(role)` (`/admin/dashboard` for Owner and Demo, `/admin/orders` otherwise). `/admin` and the login redirect use it; `safeNext`'s fallback for a missing `next` becomes role-aware and a supplied `next` is still honoured.

## 5. Messages and copy

| Where | Text |
|---|---|
| Nav item, page title | Dashboard |
| Page intro | How the shop is doing, in Philippine time. |
| Window headings | Today · Last 30 days |
| Figure labels | Paid sales · Orders placed · Average order value |
| Paid sales note | Excludes cancelled and refunded orders. Cash orders count when delivered or picked up. |
| Orders placed note | Every order placed, whatever its status. |
| Refund note (under the figures) | A refund recorded later lowers the figure for the day the order was paid. |
| Empty AOV | — |
| Restocking heading | Needs restocking ({n}) |
| Restocking row labels | Out of stock · Low stock |
| Restocking link | View all {n} |
| Restocking empty | Nothing needs restocking. |
| Recent orders heading | Recent orders |
| Recent orders columns | Order · Placed · Customer · Status · Total |
| Recent orders link | View all orders |
| Recent orders empty | No orders yet. |
| Needs review heading | Needs review |
| Needs review text | {n} order needs payment review. / {n} orders need payment review. |
| Needs review empty | Nothing needs review. |
| Needs review link | Review payments |
| Demo note | Customer details are hidden in the demo. |
| Error page | Couldn't load the dashboard. Try again. |
| Retry | Try again |

## 6. Data and interfaces

- **Routes:** `/admin/dashboard` (a `(page)` route group with `loading.tsx` and `error.tsx`, in the shell). No action, no API route. `/admin` redirects by role (R13).
- **Pure modules** (no database imports):
  - `lib/admin/dashboard-sales.ts`: `salesSummary`, `dashboardWindows`, types `SalesFigures`, `SalesSummary` (R1 to R3).
  - `lib/orders/review-rules.ts`: `needsReview` (R6).
  - `lib/admin/dashboard-view.ts`: text for figures and labels, the heading counts, the needs-review sentence (singular/plural).
  - `lib/admin/safe-next.ts`: `adminHomeFor(role)`; `ADMIN_HOME` stays the Staff default.
  - nav: `navItemsFor` gains `dashboard` first (`dashboard.view`); `ADMIN_COPY.shell.dashboardNav`.
- **SQL fragment:** `lib/orders/review-sql.ts` → `needsReviewCondition()` (alias `o`), beside `due-sql.ts` and `sale-sql.ts`.
- **Query module** `lib/admin/queries/dashboard.ts`: `getDashboard(role, now)` → `{ sales: SalesSummary, restock: { total, items }, recent: OrderListRow-like[], needsReview: number }`. Customer name in `recent` is a `CustomerName` (masked union, spec 041), so Demo's type has no raw field.
- **Components:** `components/admin/dashboard-figures.tsx`, `dashboard-restock.tsx`, `dashboard-recent.tsx`, `dashboard-review.tsx`. Presentational.
- **Schema:** one migration adds the partial index `Order(paidAt) WHERE paidAt IS NOT NULL` (declared with the `partialIndexes` preview feature, as the cart's index is). No trigger, constraint or data change.
- **Docs:** CLAUDE.md (an "Admin dashboard" bullet; the staff-nav sentence; the "everyone lands on Orders" mention), README roles paragraph, spec 040 note that landing is now role-based, PRD AD-1 pointer to this spec.

## 7. Test plan

| Level | Covers |
|---|---|
| Unit | `salesSummary` (E1 to E14, every status, Manila boundaries E3 to E5, month/year ends, leap day, empty list, no-throw property); `dashboardWindows`; AOV rounding (E11); `needsReview` (E24); `adminHomeFor` and `safeNext` (E23); `navItemsFor` per role (E21); view text (singular/plural, empty) |
| Component (markup) | each block: figures with zero state (E13, E14), restocking list with "View all", recent orders (empty, Demo masked, Due badge E26), needs-review with and without a link; no `NaN`/`undefined` text |
| Integration (`*.db.test.ts`) | `getDashboard`: pure result equals a SQL aggregate over `saleOrderCondition()` for the same data (R4); restocking order, cap and total (E15 to E17); recent order and tiebreak (E18); needs-review count and distinctness (E24); role gate (Staff throws before any query, E21); Demo DTO has no raw name (E19); the page and query source contain no cache API (R9); `demo-dashboard-pages.db.test.ts` renders Demo's page with `expectNoRawValues` |
| E2E (`e2e/admin-dashboard.spec.ts`, admin project) | Owner: dashboard is the landing page, figures and lists visible, links go to the right screens; Staff: no nav item, no-access on a direct visit, lands on Orders; Demo: real figures, masked recent names, fetched as HTML **and as RSC payload**. Throwaway orders with a distinctive customer name, removed afterwards (as `admin-orders`). Because "today" moves, E2E asserts relative to values read before and after inserting a known paid order |

Every acceptance criterion maps below; the checks on the preview URL stay manual per the issue's definition of done.

| Acceptance criterion | Where it is covered |
|---|---|
| Today's and 30-day sales, order count, average order value | Behavior 5; E1, E2, E11, E11b, E12; R1 to R3 |
| Days use Asia/Manila boundaries | Behavior 5; E3 to E5, E27 to E30; R2 |
| Sales by `paidAt` (cash when delivered), refunded excluded, order count = placed, pure and unit-tested | Behavior 5; E2, E6 to E10, E12; R1, R4 |
| Low-stock list, recent orders, needs-review count linking to #111's list | Behavior 6 to 8; E15 to E18, E24, E25; R6 to R8; D12, D13 (the link comes with #111) |
| Per request, never inside `unstable_cache` | Behavior 4; R9 |
| Recent orders masked for Demo; aggregates are not | Behavior 7; E19, E20; R5 |
| (added at review) The dashboard rendered as Demo with the fixture order passes spec 040's shared masking helper (`expectNoRawValues`) on the RSC payload | E19; `demo-dashboard-pages.db.test.ts` and the E2E |
| Zero-order state handled | Behavior 10; E13, E14 |
| Owner and Demo can view; Staff can't (`dashboard.view`) | Behavior 1; E21, E22 |

## 8. Out of scope

- Charts, trends, top builds, top customers, conversion funnels, comparisons with the previous period: Phase 3 per the issue and PRD ("Analytics").
- The review list itself, the `flag=review` filter, `reviewedAt` and the review action: [#111](https://github.com/romulojr-dev/pc-ecommerce/issues/111). Refund recording: #110.
- Date-range pickers, CSV export, live updates, notifications for low stock.
- Per-category or per-product sales breakdowns.
- Partial refunds in Sales: refunds are recorded in #110; a Refunded order is simply excluded.
- Caching or pre-aggregating sales (a summary table, materialized view): the figures are computed per request at this project's scale.

## 9. Decisions

| # | Decision | Reason | Rejected |
|---|---|---|---|
| D1 | No new `can()` action; the screen uses `dashboard.view` | Spec 040's table already matches the issue | A new "dashboard.recent" action |
| D2 | Dashboard at `/admin/dashboard`; Owner and Demo land there, Staff on Orders | Staff can't view it, so the landing must depend on role; spec 040 Behavior 4 already said so | Making `/admin` itself the dashboard (a Staff visit would need a special case at the same URL) |
| D3 | AOV is Sales ÷ **sale orders in the window**, not ÷ Orders placed | The numerator only holds paid orders; dividing by orders placed (including unpaid ones) understates the average | Dividing by Orders: simpler, but a pile of unpaid orders drags the number down |
| D4 | "Last 30 days" is today plus 29 Manila days, ending at the next midnight | Matches "days use Manila boundaries"; same ending as Today so the windows nest | A rolling 720 hours (a window that starts mid-day) |
| D5 | Sales sums `Order.total` (items + shipping − discount) of sale orders | Consistent with spec 042's "Total spent"; it is the money the shop was paid | Merchandise subtotal only (would hide shipping the shopper paid) |
| D6 | No caching of any dashboard data | The issue requires it and masked/unmasked views differ; a shared cache entry could serve Demo's view to Owner or the reverse | `unstable_cache` for the aggregates only (safe, but the issue rules it out) |
| D7 | The pure `salesSummary` over slim rows is the single place for the sales rule, with an agreement test to SQL | The issue asks for a pure unit-tested aggregation; one rule, as spec 042 D11 | Aggregating only in SQL (the rule would live twice, untestable without a database) |
| D8 | A failure of any part fails the page | A dashboard with a quietly missing figure looks like a real zero | Per-block error states |
| D9 | The needs-review definition is shared code that #111 extends | The dashboard count and #111's list must agree | Duplicating the condition in #111 |
| D10 | Restocking shows 10 and links to Inventory for the rest | A short glanceable list; Inventory already has the full filtered list | Showing all of them |
| D11 | Paid-then-cancelled orders leave Sales (while `refundRequired` shows in Needs review) | Spec 042's rule; the shop owes the money back | Keeping them until the refund is recorded |
| D12 | The needs-review count has no link now; #111's acceptance criteria were edited (`gh issue edit`) to add the link to `/admin/orders?flag=review` | An unknown `flag` would drop to the unfiltered list, which misleads | Linking to the plain orders list |
| D13 | Count every flagged order for now; #111 narrows the shared definition to unreviewed problems (also added to its criteria) | One definition for count and list; no `reviewedAt` yet | A second, interim definition |
| D14 | Add the partial index `Order(paidAt) WHERE paidAt IS NOT NULL` | The window query filters on `paidAt` | No index until slow |
| D15 | Orders placed counts any status, by `createdAt`, in the Manila-day window | It is what the figure is called | Paid orders only |
| D16 | AOV rounds half up to the nearest centavo, integer math | Fair rounding, no float; ₱100.00 over 3 is ₱33.33 | Rounding down |
| D17 | Boundaries come from one pure function; SQL gets UTC instants and never converts a column | The rule once; indexes stay usable | `AT TIME ZONE` in the query |

## 10. Open questions

None. Settled at review: the needs-review count has no link until #111 (D12); all flagged orders are counted until #111 narrows it (D13); the partial `paidAt` index is added (D14); Orders placed is any status in the Manila-day window (D15); AOV is Paid sales ÷ sale orders (D3, D16).
