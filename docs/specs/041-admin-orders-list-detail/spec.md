# 041 — Admin orders: list, filters, detail and packing slip

Status: implemented 2026-11-05 (see "What changed while building"), waiting for the preview check. Approved 2026-11-05 with three changes (one definition of "due", "ready to pack" is Processing only, a Demo masking criterion for all three pages) and the open questions settled; see D11–D13. Issue: [#106](https://github.com/romulojr-dev/pc-ecommerce/issues/106) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8). PRD: AD-6 (list, filters, detail, print packing slip; status changes, courier/tracking and cancel/refund are #108), AD-11 (roles). Depends on [spec 040](../040-admin-permissions-audit-masking/spec.md) (#105, implemented): `can()`, `lib/admin/queries/`, masking. Builds on specs [030](../030-place-an-order/spec.md), [032](../032-payment-webhooks/spec.md), [033](../033-release-unpaid-orders/spec.md), [036](../036-order-emails/spec.md), [038](../038-cash-on-delivery/spec.md), [039](../039-staff-sign-in-admin-shell/spec.md).

## 1. Summary

Staff can find an order and see everything about it. `/admin/orders` becomes a paginated, newest-first list that filters by status and payment method and searches by order number (and, for Owner and Staff, by customer). `/admin/orders/[number]` shows the whole order, including payment attempts, flags and emails sent. `/admin/orders/[number]/packing-slip` is a print-styled page with no prices. Everything customer-related goes through the masking DTO from #105, so Demo sees masks. This story reads only; it changes no order.

## 2. Behavior

### The list (`/admin/orders`)

1. Any role with `orders.view` (all three) opens it. It lists orders **newest first** (`createdAt` descending, then `id` for a stable order), **25 per page**, with the total number of matching orders and "Page n of m".
2. Each row shows: order number (a link to the detail), placed date and time (Asia/Manila), customer name (masked for Demo), the **true status**, how it is paid, fulfillment (Delivery / Store pickup), the total, and flags.
3. **True status.** The badge is the row's `status`. An order that is Pending payment or Pending confirmation, whose `expiresAt` has passed and that has no payment problem (the release job's own rule, not a copy of it: D11; boundary included) also carries a **"Due for release"** badge beside its status. The shopper's order page shows such an order as Cancelled; Admin deliberately doesn't, because the release hasn't run and stock is still held (D2).
4. **Flags**, on the row and in the detail: **"Refund required"** (`Order.refundRequired`) and **"Needs checking"** (any `Payment` with `problem = AMOUNT_MISMATCH`). An order with a payment problem is never "Due for release" (its stock stays until Admin deals with it, spec 033).
5. **Filters**, all in the URL: `status` (one of the 11 statuses), `payment` (`online` or `cod`, see D3), `number` (order-number search), `customer` (customer search, at least 3 characters), `page`. They combine with AND. A "Clear filters" link shows when any is active.
6. **Order-number search** matches part of the number, case-insensitive, trimmed ("7k3m" finds `PCS-7K3M9Q2X`). All roles may use it.
7. **Customer search** needs at least 3 characters (after trimming) and is case-insensitive; shorter text is ignored and the field shows "Type at least 3 characters to search customers." It matches part of the contact name, part of the email address, or part of the mobile number (R6 says how a mobile is read). **Owner and Staff** have the field; **Demo** doesn't see it (disabled with "This account is read-only"). A Demo request that carries `customer=` in the URL gets the read-only answer in place of results and **no query runs** (searching would confirm who is a customer). Demo's order-number search still works.
8. **Invalid values fall back to defaults**, never an error page: an unknown `status` or `payment` is ignored; a `page` that isn't a whole number from 1 up is page 1; a page past the last page redirects to the last page, except that a filter with **zero results** renders page 1 with the empty state and no redirect; blank `number` / `customer` are ignored; search text is trimmed and cut at 100 characters; repeated parameters use the first. A non-canonical URL (defaults spelled out, bad values) redirects to the canonical one.
9. **States.** Loading: a skeleton table (`loading.tsx`). Empty with no orders at all: "No orders yet." Empty because of filters: "No orders match these filters." with Clear filters. Error: the segment's error boundary with "Couldn't load orders. Try again." and a retry button; no detail of the failure.

### The detail (`/admin/orders/[number]`)

10. Opens for any role with `orders.view`. A malformed number, an unknown number and a number with the wrong case all show the shell's not-found page (404); a malformed number does no database read. No `loading.tsx` on this route, so the 404 keeps its HTTP status (same reason as the store's order page).
11. Header: order number, true status, "Due for release" badge when it applies, flags, placed date, and a "Packing slip" link (when the role has `orders.packing-slip`) and "Back to orders" that keeps the list's filters and page.
12. Sections, in this order:
    - **Items**, grouped as the shopper saw them (`orderEntries`): single lines, and build groups with their parts, quantity, unit price and line total from the snapshots, plus the group total.
    - **Totals**: subtotal, shipping fee, `Discount ({code})` when a voucher was used, total, order weight. For a **cash order not yet delivered or picked up** (no `paidAt`, status not Cancelled or Refunded), a prominent "Amount to collect" line shows the total, with "on delivery" or "on pickup".
    - **Contact**: name, email, mobile (masked for Demo).
    - **Delivery or pickup**: the full address for Owner and Staff; region (and zone) only for Demo; "Store pickup" for pickup.
    - **Status timeline**: the FR-20 steps (`orderTimeline`) for the true status, with the time of each known event (placed, paid, confirmed, cancelled and its reason) and the deadline ("Due {time}"; "Was due {time}" once past).
    - **Payments**: one row per `Payment` attempt, **including** attempts that never opened a session: reference id (`{number}-{n}`), provider, status, amount, channel, session id, gateway payment id, created / paid / session-expiry times, and the **problem** in words (Amount didn't match; Paid after cancellation; Second payment) with the amount received when it differs. Cash orders say "Cash on delivery, no online payment" (or "Pay on pickup").
    - **Emails**: one row per `EmailOutbox` row: type (Order placed, Payment received, Order cancelled, Cash order confirmation), status (Queued, Sending, Sent, Failed, Skipped), attempts, sent time, and the short error code when failed or skipped. No address, body or hash. The email goes to the contact address above.
    - **Flags** callouts at the top of the sections they concern: "Refund required: a payment arrived after the order was cancelled or a second payment arrived" and "Needs checking: a payment's amount didn't match the order". They are information only; resolving them is #108 / Sprint 8's refund story.
13. Read-only: no button on this page changes the order. (Status, courier, tracking, cancel and refund buttons arrive with #108.) *Changed by spec 043 (#108): the Fulfillment section moves an order (Processing, Shipped, Ready for pickup, Delivered, Picked up) with courier and tracking number; cancel is #109 and refunds #110. The packing slip also prints the courier and tracking number once shipped (masked for Demo).*
14. Demo sees every section with the masks from #105; nothing in the page, its props or its RSC payload holds the real value.

### The packing slip (`/admin/orders/[number]/packing-slip`)

15. Needs `orders.packing-slip` (all roles; Demo masked). Same 404 rules as the detail.
16. One page, print-styled (`@media print`: the admin nav, header and buttons disappear; black on white; A4 or Letter with margins; no page break inside an item row). On screen it shows a "Print" button (`window.print()`) and "Back to order".
17. Contents: store name, order number, placed date, fulfillment; **ship-to**: contact name, **mobile number** (the courier needs it) and the full address (delivery), or "Store pickup. Customer shows the order number and a valid ID" (pickup); the items as a checklist (☐ name, quantity), grouped by build as in the detail; the order weight; a payment line. **No prices anywhere**: no unit price, line total, subtotal, shipping, discount, voucher or total. The email address isn't printed.
18. **Payment line.** Online orders: "Paid online" / "Not yet paid". Cash orders: "Collect payment" with no amount (pickup: "Collect payment on pickup"); the amount is on the order detail page (D6).
19. **Ready to pack means Processing, and nothing else.** An order in any other status (Pending payment, Pending confirmation, Paid, COD confirmed, Shipped, Ready for pickup, Delivered, Picked up, Cancelled, Refunded) shows a banner at the top of the slip, in print too: "Do not ship: this order is {status}." (A Paid or COD confirmed order becomes Processing in #108; until then its slip carries the banner.) Reading the slip never changes anything.
20. Demo: the name, mobile and address are masked as in the detail (`A••• R•••`, `+63•••••••••`, region only), so a Demo slip is a layout preview.

### Access

21. Every page here calls `requireAdminAccess(action)` and returns `<NoAccess />` when refused; data comes only from `lib/admin/queries/orders.ts`, which re-checks the action with the role. Responses are `no-store`, `no-referrer` and `noindex` (the `/admin/*` rules of spec 039). Reads are not audited (spec 040, Behavior 12).

## 3. Examples

Seed parts: `CPU-AMD-7600X` (Ryzen 5 7600X), and the order-seed helper in `e2e/orders.ts` / `test-support/` for orders. Names below are the fixtures' (Ana Reyes, `ana.reyes@example.com`, `+639171234567`).

| # | Input | Result |
| --- | --- | --- |
| E1 | Owner opens `/admin/orders` with 30 orders | 25 rows, newest first, "30 orders · Page 1 of 2"; `?page=2` shows the other 5 |
| E2 | `?page=abc`, `?page=0`, `?page=-3` | page 1, URL redirects to `/admin/orders` |
| E3 | `?page=9` with 2 pages | redirect to `?page=2` |
| E3a | `?status=SHIPPED&page=4` where nothing is Shipped | page 1 rendered with "No orders match these filters.", **no redirect** |
| E4 | `?status=SHIPPED` with one Shipped order | that order only, URL kept |
| E5 | `?status=bogus&payment=card` | both ignored; all orders; redirect to `/admin/orders` |
| E6 | `?payment=cod` | only orders with `paymentOption` COD (delivery COD and pay-on-pickup) |
| E7 | `?payment=online&status=PAID` | online Paid orders only |
| E8 | Order `PCS-7K3M9Q2X`; `?number=7k3m` | finds it. `?number=ZZZZ` → "No orders match these filters." |
| E9 | Owner or Staff: `?customer=reyes` (also `REYES`), then `?customer=ana.reyes@example` | finds Ana's orders by name and by email, case-insensitive |
| E9a | Owner: `?customer=ab` (2 characters) | term ignored, all orders, hint shown |
| E9b | Owner: `?customer=0917 123 4567`, `?customer=+63 917 123 4567`, `?customer=9171234567`, `?customer=917123` | each finds the same order (`+639171234567`); `?customer=0` and `?customer=63` add no mobile condition |
| E10 | Demo: `?customer=reyes` | read-only message in place of results; no order query ran (spy); the page has no customer field enabled |
| E11 | Demo: `?number=7k3m` | finds the order; the row shows `A••• R•••` |
| E12 | Pending-payment order, `expiresAt` 1 s ago, no payment problem | row: "Pending payment" + "Due for release" (not "Cancelled") |
| E13 | Same order, `expiresAt` exactly now | "Due for release" (boundary included) |
| E14 | Same order, `expiresAt` 1 s from now | "Pending payment" only |
| E15 | Pending-payment order past `expiresAt` with a `Payment` `problem = AMOUNT_MISMATCH` | "Pending payment" + "Needs checking"; no "Due for release" |
| E16 | Cancelled order with a `LATE` payment, `refundRequired = true` | "Cancelled" + "Refund required"; the detail shows the payment row with "Paid after cancellation" |
| E17 | COD confirmed order whose `expiresAt` has passed | "COD confirmed" only (it never expires) |
| E18 | Detail of an order with a build group (CPU + motherboard + RAM) and one single SSD | Items shows the SSD line and a "Build" group with three parts and the group total; the totals add up to `total` |
| E19 | Detail with voucher `WELCOME10` | "Discount (WELCOME10)" row |
| E20 | Online order with 2 payment attempts: first Expired, second Paid (GCASH), plus a Failed attempt with no session | three payment rows, newest first; session id blank for the failed one |
| E21 | Order with `ORDER_PLACED` Sent and `PAYMENT_RECEIVED` Failed (`timeout`) | two email rows with status and code; no address or hash |
| E22 | Serialize the detail and list DTOs for any order | contain none of `accessTokenHash`, `idempotencyKey`, `cartIdHash`, `PaymentEvent.payload`, `recipientHash` (field names or values) |
| E23 | Demo opens the detail of Ana's delivery order | masked name, email, mobile; address "National Capital Region" only; `expectNoRawValues` passes on the RSC payload |
| E24 | Owner opens `/admin/orders/PCS-7K3M9Q2X/packing-slip` | name, `+639171234567`, full address, item checklist, weight, "Paid online"; no `₱` anywhere |
| E25 | Packing slip for a pickup order | "Store pickup…" text, name and mobile, no address block |
| E26 | Packing slip for an order in each of the 11 statuses | Processing: no banner. Every other status: "Do not ship: this order is {status}." |
| E26a | Detail of a COD order not yet delivered, total ₱41,990.00 | "Amount to collect ₱41,990.00 on delivery" shown prominently; its slip says "Collect payment" with no amount; a Delivered COD order (has `paidAt`) shows no such line |
| E27 | Packing slip as Demo | `A••• R•••`, `+63•••••••••`, region only |
| E28 | `/admin/orders/not-an-order`, `/admin/orders/PCS-AAAAAAAA` (unknown) | 404 in the shell; the first does no database read |
| E30 | Demo opens the list, the detail and the packing slip of the fixture order | spec 040's shared `expectNoRawValues` helper passes on the RSC payload of each of the three |
| E31 | Fixtures: pending orders at, before and after the deadline, flagged, COD confirmed, Cancelled | the badge's answer, the pure `isDue` and the release job's selection agree on every fixture |
| E29 | Seed 5 000 orders; list with each filter | the plan uses the new indexes (checked by an `EXPLAIN` integration test on the unfiltered, status, and payment queries) |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| Paginated, newest first, filter by status and payment method (incl. COD), search by order number | B1, B5, B6, E1–E4, E6–E8; R1–R4 |
| Owner/staff search by email or name; Demo can't (`orders.search-customer`) | B7, E9, E10, E11; R6 |
| Filters in the URL; invalid values fall back to defaults | B5, B8, E2, E3, E5; R2, R3 |
| Indexes for the list and its filters | §6 Schema, E29; R10 |
| True status shown; "Due for release" badge instead of Cancelled | B3, E12–E17, E31; R7, R8 |
| Detail: items by build, totals, voucher, contact, address, timeline, payment attempts, flags, emails | B12, E18–E21 |
| Refund-required and needs-check flags in list and detail | B4, B12, E15, E16 |
| DTO never includes the five secrets | E22; R11 |
| Print-styled packing slip, no prices, with mobile, masked for Demo | B15–B20, E24–E27; R12, R13 |
| All customer data masked for Demo through #105's DTO | B14, B20, E10, E11, E23, E27; R5 |
| (added) List, detail and slip each rendered as Demo with the fixture order; spec 040's shared masking helper passes on all three RSC payloads | B14, E30; R5 |
| (added) The badge and the release job agree on the same fixtures | B3, E31; R7 |

## 4. Rules and edge cases

- R1. The list order is `createdAt` descending then `id` descending; adding an order between two page loads can repeat or skip a row at a page edge (offset pagination). Accepted at this volume (D4).
- R2. The URL is parsed and serialized in one pure module (`lib/admin/orders-params.ts`), like `lib/listing-params.ts`; the canonical form omits defaults (`page=1`, empty values).
- R3. `status` accepts exactly the 11 `OrderStatus` values (upper-case). `payment` accepts `online` and `cod`. Anything else is dropped. Values are never interpolated into SQL (bound parameters through Prisma).
- R4. Filters count and page on the same `where`; the count is one query, the page another.
- R5. Demo's DTOs have no field that can hold a real customer value (the `Masked` brand from spec 040). The list's customer name, the detail's contact and address and the slip all use `contactView` / `addressView`. Order numbers, items, totals, timestamps, voucher code and region are not customer data and stay visible. No customer free text exists on an order today, so "Hidden in demo" is not used here; a future notes field must go through `maskFreeText`.
- R6. A customer term as Demo is refused **before any query** (`orders.search-customer`), including when `number` is also present and whatever the term's length. The refusal doesn't reveal whether anything would have matched. For Owner and Staff the term is trimmed and must have 3 or more characters, else it is ignored. It matches the contact name and the email (case-insensitive contains). **Mobile:** take the term's digits only (spaces, `+`, dashes dropped); drop one leading `63` or `0`; when 3 or more digits remain, also match them as a substring of the stored number's digits (stored as `+639XXXXXXXXX`). A term with fewer remaining digits adds no mobile condition.
- R7. **One definition of "due".** The release job's due condition (Pending payment or Pending confirmation, `expiresAt <= now`, no payment with a problem) lives in one place; both of the release's queries and the list and detail badge use it, and the badge doesn't re-implement it (D11). `isDue` in `release-rules.ts` stays as the pure statement of the rule that tests check the shared definition against. One `now` per request. E31 fails if the badge, `isDue` and the release's selection ever disagree.
- R8. The badge is information; the page never releases anything. The release runs from purchases, sweeps and the cron (spec 033).
- R9. Payments in the detail are all attempts newest first (`createdAt` descending), unlike `paymentsSummary`, which skips attempts without a session; the page shows `OPENING` and `FAILED` ones with their state.
- R10. Indexes added by a migration: `Order(createdAt DESC, id DESC)` for the unfiltered list, `Order(status, createdAt DESC, id DESC)`, `Order(paymentOption, createdAt DESC, id DESC)` (each filter index ends in `id` so it serves the list's exact order without a sort). Name and contact searches use `contains`, which can't use a B-tree; they scan, and that is accepted at this scale (trigram indexes are out of scope, D5).
- R11. **DTO allow-list.** Query functions `select` named fields; they never spread a row. A test serializes every DTO built from a fully populated order and fails when it contains a forbidden field name or any of the fixture's forbidden values. The `PaymentEvent` table is not read at all by this story.
- R12. The slip DTO has no price field at all (not hidden by the view): items carry name and quantity only.
- R13. The slip includes the mobile number for Owner and Staff because the courier needs it; it is bearer-free (no link, no token) and it is a plain authenticated admin page.
- R14. Concurrency: reads only. A status change by another admin between list and detail is simply seen on the next load.
- R15. Dates and times use `lib/orders/time.ts` (Asia/Manila) and amounts `formatPeso`.
- R16. Desktop-first: usable from 1024 px; the list table scrolls horizontally rather than wrapping below that.
- R17. Accessibility: the table has a caption and header cells; badges are text, not colour only; filter controls are labelled; the filter form works without JavaScript (a GET form); focus goes to the results heading after a filter submit.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| List heading | Orders |
| Count | `{n} orders` / `1 order` · `Page {p} of {m}` |
| Filters | Status · Payment · Order number · Customer · Search · Clear filters |
| Status filter "all" | All statuses |
| Payment options | All payments · Online · Cash on delivery or pickup |
| Customer field placeholder | Name, email or mobile |
| Demo customer field | This account is read-only |
| Empty (no orders) | No orders yet. |
| Empty (filters) | No orders match these filters. |
| List error | Couldn't load orders. Try again. · Try again |
| Badges | Due for release · Refund required · Needs checking |
| Fulfillment | Delivery · Store pickup |
| Payment cell | Online · Online (GCash) · Online (Maya) · Online (Card) · Cash on delivery · Pay on pickup |
| Detail headings | Items · Totals · Contact · Delivery · Pickup · Status · Payments · Emails |
| Timeline deadline | Due {time} · Was due {time} |
| Flag: refund | Refund required: a payment arrived after the order was cancelled, or a second payment arrived. |
| Flag: check | Needs checking: a payment's amount didn't match the order. |
| Payment problem | Amount didn't match · Paid after cancellation · Second payment |
| Cash payment | Cash on delivery, no online payment · Pay on pickup, no online payment |
| No payments | No payment attempts. |
| No emails | No emails for this order. |
| Email types | Order placed · Payment received · Order cancelled · Cash order confirmation |
| Email statuses | Queued · Sending · Sent · Failed · Skipped |
| Buttons/links | Packing slip · Back to orders · Print · Back to order |
| Slip pickup | Store pickup. Customer shows the order number and a valid ID. |
| Slip payment | Paid online · Not yet paid · Collect payment · Collect payment on pickup |
| Detail: amount to collect | Amount to collect {amount} on delivery · Amount to collect {amount} on pickup |
| Customer search hint | Type at least 3 characters to search customers. |
| Slip warning | Do not ship: this order is {status}. |
| Not found | the shell's existing not-found page |
| Page titles | Orders · Order {number} · Packing slip {number} |

## 6. Data and interfaces

**Routes** (all under `app/admin/(shell)/orders`): `page.tsx` (list, with `loading.tsx` and `error.tsx`), `[number]/page.tsx` (detail), `[number]/packing-slip/page.tsx`. The packing slip's print styles are a small stylesheet or Tailwind `print:` classes; the shell layout needs `print:hidden` on its nav and header. No new API route, no server action.

**Schema change** (one migration, no data change): the three indexes in R10. `db:drift` must stay clean.

**Pure modules** (no database, importable by client components): `lib/admin/orders-params.ts` (`parseOrderParams(searchParams) → { filters, page, canonical }`, `orderParamsHref(params)`); `lib/admin/orders-view.ts` (badge and flag labels, payment-cell text, the "ready to pack" rule, the status-to-slip-warning rule); copy in `lib/admin/copy.ts`.

**Shared due definition:** one SQL condition for "due" (`dueOrderCondition(now)`, a `Prisma.sql` fragment next to `release-rules.ts`) used by `checkExpiredOrders`, `releaseExpiredOrders` and the admin queries; the admin queries ask it which of a page's ids are due (one query per page). What the release selects does not change.

**Queries** in `lib/admin/queries/orders.ts` (extend; each takes the role, calls `assertCan`, selects named fields):
- `listOrders(role, params, now) → { ok: true, rows, total, page, pageCount } | Denied`. Row: `orderNumber`, `createdAt`, `status`, `dueForRelease`, `fulfillment`, `paymentOption`, `paymentMethod`, `total`, `contact.name` (via `contactView`, name only), `flags: { refundRequired, needsCheck }`. It replaces `searchOrders` (kept as a thin caller or removed with its tests moved).
- `getOrderDetail(role, number, now) → OrderDetail | null`: order fields, `contact: ContactView`, `address: AddressView`, `items` (the `OrderPageItem` shape so `orderEntries` is reused), totals, voucher code, weight, timeline inputs and event times, `payments[]`, `emails[]`, flags, `dueForRelease`, `expiresAt`.
- `getPackingSlip(role, number) → PackingSlip | null`: order number, `createdAt`, fulfillment, status, payment option and paid flag, `contact` (name, mobile only), `address`, items `{ name, quantity, buildId, slot }`, weight. Needs `orders.packing-slip`.

**Reused:** `isDue`, `displayStatus` (not used), `orderEntries`, `orderTimeline`, `statusLabel`, `dateTimeText`, `formatPeso`, `contactView`, `addressView`, `NoAccess`, `requireAdminAccess`, `expectNoRawValues`. The pages import no database (`no-db-in-pages.test.ts`).

## 7. Test plan

- **Agreement test (integration):** E31, over the fixture orders, compares the admin badge, `isDue` and the ids `checkExpiredOrders` selects; the existing release tests stay green after the refactor.
- **Unit (pure, no DB):** `orders-params` (E2, E3, E5, repeated and oversized values, canonical form); `orders-view` (badge rules E12–E17 as a table, payment-cell text, slip warning for all 11 statuses (E26), mobile normalization (E9b), customer-term length (E9a), mapping labels); masking of the new DTO builders; copy completeness.
- **Integration (`*.db.test.ts`, Docker Postgres):** `listOrders` ordering and paging (E1), each filter and combinations (E4, E6, E7), number and customer search (E8, E9), Demo refusal runs no query (E10, spy on `db`), E11; the due/flag derivations against real rows with the boundary cases (E12–E17); `getOrderDetail` for build groups, voucher, attempts incl. `OPENING`/`FAILED`, emails (E18–E21); DTO allow-list serialization (E22); `getPackingSlip` has no price keys (E24, E25); role gating of each query (`QueryDeniedError`); index usage with `EXPLAIN` (E29).
- **Page render tests:** list and detail and slip markup for Owner and Demo (E23, E26, E27), `expectNoRawValues` on each page's RSC payload for the list, detail and slip as Demo (E30); 404s (E28); `no-db-in-pages` stays green; the admin-page guard test (every page calls `requireAdminSession` / `requireAdminAccess`) includes the new routes.
- **E2E (`admin` project, `e2e/admin-orders.spec.ts`):** sign in as Owner, filter by status and COD, search by number, open a detail, open the slip and check there is no `₱` text and the mobile is shown; sign in as Demo, confirm masked values and no customer field, `?customer=` URL gives the read-only message. Orders come from the existing order helpers; the spec gives each order its own recipient (CLAUDE.md email cap note).
- Lint, typecheck and `db:drift` pass. Preview check: the acceptance list on the preview URL at 1024 px and 1280 px, print preview of one slip.

## 8. Out of scope

- Any status change, courier and tracking number, cancel and refund buttons: #108 (Sprint 8). Resolving "Refund required" / "Needs checking" is there too.
- Exports, bulk actions, saved filters.
- Customers screen (AD-7) and order history per customer: its own story; the detail doesn't link to it. *(Changed by [spec 042](../042-admin-customers/spec.md): the detail's Contact block links to the customer's orders, and the list gains a `buyer` filter.)*
- Resending an email (#101); `PaymentEvent` viewing; the audit log screen.
- Trigram or full-text indexes for customer search; cursor pagination.
- Dashboard recent orders (AD-1).
- Mobile layouts (Phase 2).

## 9. Decisions

- **D1 — One story, three routes.** List, detail and slip are separate pages so each has one `requireAdminAccess` action (`orders.view`, `orders.packing-slip`). Rejected: a slide-over detail on the list (no shareable URL, harder to test masking).
- **D2 — Admin shows the row's true status, unlike the order page.** The shopper-facing `displayStatus` hides unreleased state; staff need to know stock is still held. The issue asks for this explicitly. Rejected: reusing `displayStatus` (it would also hide the need to act).
- **D3 — `payment` filters on `paymentOption` (online / cod), not on the gateway channel.** `Order.paymentMethod` (GCash, Maya, Card) is null until an online order is paid, so a channel filter would omit every unpaid order. The channel shows in the row and the detail. Rejected: a channel filter now (Phase 2).
- **D4 — Offset pagination, 25 per page.** Simple, linkable, fine at this volume. Rejected: cursor pagination (no use case for infinite scroll; harder canonical URLs).
- **D5 — Customer search uses `contains` scans, no new index.** The only indexes added are for the list and filters (issue). Rejected: `pg_trgm` (extension and migration cost for a portfolio-size table).
- **D6 — No prices on the slip, including COD.** The issue says none. For a cash order the slip says "Collect payment" with no amount; the detail page shows the amount to collect. Rejected: printing the total only for COD.
- **D7 — Two search inputs (`number`, `customer`), not one smart box.** A single box can't tell "ana" (a name) from "7k3m" (part of a number), and Demo's refusal must be decided before the query. Rejected: guessing the kind from the text.
- **D8 — Payment attempts include session ids and gateway payment ids.** Staff need them to find the payment in Xendit's dashboard; they aren't on the issue's forbidden list and aren't customer data. Rejected: hiding them.
- **D9 — The slip warns instead of refusing for orders not ready to pack.** A pending order's slip may still be wanted for planning. Rejected: a 404 or redirect.
- **D10 — This replaces `searchOrders` from #105.** Its role checks and Demo refusal move into `listOrders` with the same tests. Not a disagreement with spec 040; its R19/D rules are followed as written.
- **D11 — The release job has two SQL copies of "due", and the pure `isDue` is used only by tests.** To honor "no second definition", the story extracts one SQL fragment used by both release queries and the admin queries. This touches spec 033's code without changing what it selects (its tests prove that). Rejected: the badge calling `isDue` alone (a third copy that could drift) or filtering the release in TypeScript (a different query plan on the hot path).
- **D12 — "Ready to pack" is Processing only.** Paid and COD confirmed orders carry the banner until #108 adds the move to Processing. Rejected: a wider list.
- **D13 — Settled questions.** Payment filter is Online / Cash only (a channel filter is Phase 2); the slip says "Collect payment" with no amount while the detail shows it; a page past the last redirects but a zero-result filter doesn't; mobile search rule in R6.
- **Flag, not a conflict:** the PRD lists "status transitions, courier + tracking, cancel/refund" under AD-6; the issue puts them in #108. The PRD wins on scope overall; this story follows the issue's split, which the PRD's sprint table permits.

## 10. Open questions

None. The four from the first draft were settled in review (D13).

## 11. What changed while building

- **The due rule was in two SQL copies, not one function.** The release job never called `isDue`; `checkExpiredOrders` and `releaseExpiredOrders` each wrote the condition in SQL. D11 extracted `dueOrderCondition(now)` (`lib/orders/due-sql.ts`) and the release uses it too; the release tests passed unchanged, and `due-sql.db.test.ts` (E31) compares the fragment, `isDue` and `checkExpiredOrders`.
- **The filter indexes end in `id`.** `(status, createdAt desc)` made the planner prefer the newest-first index with a filter; `(status, createdAt desc, id desc)` and `(paymentOption, createdAt desc, id desc)` match the list's order exactly. R10 says so. This new index competed with the partial `Order_expiresAt_idx` in spec 038's plan test, which now drops it inside a transaction it rolls back.
- **The list lives in a route group.** `orders/(list)/` holds the page, `loading.tsx` and `error.tsx`, so the loading boundary doesn't wrap `orders/[number]` and its 404 keeps its status (B10). URLs are unchanged.
- **"Back to orders" keeps the list's state** through a `back` query value that is parsed again into an `OrderParams` and rebuilt, so it can only ever name the list. The spec had the behavior (B11) but not the mechanism.
- **Customer search of a phone number** applies only when the term looks like a phone number (digits and phone punctuation), so a name or email with digits doesn't match mobiles by accident. A term under 3 characters stays in the URL so the field can say why it was ignored.
- **The page-level Demo check runs in a database test** (`lib/admin/demo-pages.db.test.ts`): the three page functions are rendered as Demo with a mocked session, and the markup and the props handed to the view are checked with spec 040's helper. It lives under `lib/admin/` because `no-db-in-pages.test.ts` forbids database imports under `app/admin`. The real RSC payload is fetched by `e2e/admin-orders.spec.ts`.
- **E2E fixtures are inserted directly** (`e2e/admin-order-fixtures.ts`), with the same production guard as the stock helper, and removed after the run. Run locally against the Docker Postgres with inline variables (no `.env.local` change); the whole `admin` project passed on a production build, and `e2e/admin-auth.spec.ts` E11 (keyboard sign-in) is a cold `next dev` hydration race that fails in dev mode and passes against `pnpm build` output, which is what CI serves.
- **The print rule is global CSS** (`[data-slot="sidebar"]` under `@media print`) plus `print:hidden` on the shell header, because the sidebar's own `className` goes to an inner element, not the wrapper that holds the gap.
- **Spec 039's E7 changed.** It said Demo's `/admin/orders` has no order or price data, which held only while the page was a placeholder (R-13: "Until #105"). With orders in the database the list shows numbers and totals, as B2 requires, so E7 now checks that the shell opens and shows no raw customer name, email or mobile.
