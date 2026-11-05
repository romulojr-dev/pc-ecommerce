# 042 — Admin customers

Status: reviewed 2026-11-05; the five open questions are settled (D13) and the review's changes are in; ready for the plan. Issue: [#107](https://github.com/romulojr-dev/pc-ecommerce/issues/107) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8). PRD: AD-7 (customers: list, order history per customer), AD-11 (roles). Depends on [spec 041](../041-admin-orders-list-detail/spec.md) (#106, merged to `main`): the orders list, its URL state and the customer search. Builds on [spec 040](../040-admin-permissions-audit-masking/spec.md) (`can()`, masking, `lib/admin/queries/`), [spec 035](../035-email-foundation-signed-links/spec.md) (`normalizeRecipient`), [spec 039](../039-staff-sign-in-admin-shell/spec.md) (the shell).

> **Checked against 041's merged code** (branch rebased on `origin/main`). What no longer fit as first written, and what this spec now says:
> 1. `listOrders` is a Prisma `findMany` with a typed `where`; the normalization is a SQL expression Prisma can't put in a `where`. The `buyer` filter first selects the matching order ids with one raw query (the SQL key, bound parameter) and then pages `id IN (...)` through the same typed path, so every other filter, the count, the order and the due badge stay as they are (R5a).
> 2. The filter form of the order list is a GET form that submits only its own fields, so a `buyer` filter would be lost on the next submit; the form carries it as a hidden field (B11).
> 3. `NavItem.key` is the literal type `"orders"`; it widens to include `"customers"`.
> 4. `OrderDetail.contact` already holds the email for Owner and Staff and a mask for Demo, but nothing carries a customer key. The detail DTO gains `customerKey` (B15).
> 5. The packing slip and `getPackingSlip` need no change (the email isn't read there). Spec 041 section 8 says the detail doesn't link to the Customers screen; B15 changes that, and 041 gets a "changed by 042" note.
> 6. `listCustomers(role)` has no parameters and its only callers are `queries.db.test.ts`; it becomes `listCustomers(role, params)`.

## 1. Summary

Staff can see who has bought from the store. `/admin/customers` lists each distinct guest email once, with how many orders they placed, how much they have actually spent and when they last ordered; each row links to that customer's orders in the orders list. A customer is not a table row: it is a normalized email on orders (there are no customer accounts until Phase 2). Demo sees every row masked and can neither search customers nor learn an email from a row's key. This replaces the placeholder `listCustomers` from #105, which grouped by the raw email, summed every order and silently stopped at 5 000 orders.

## 2. Behavior

### The list (`/admin/customers`)

1. Any role with `customers.view` (all three) opens it. It lists customers **most recent order first** (last order date descending, then the customer key ascending for a stable order), **25 per page**, with "{n} customers" and "Page n of m".
2. **Who is one customer.** Orders belong to the same customer when their `guestEmail` is the same after the normalization the email cap uses (`normalizeRecipient`: trimmed, lower-cased, and a `+tag` dropped from the part before the last `@`; **known limitation:** at a provider without subaddressing a `+` is an ordinary character, so `ana+shop@…` and `ana@…` may be two people and are merged here, accepted because the issue specifies `recipientHash`'s normalization, D14). `ana+promo@example.com`, `Ana@Example.com ` and `ana@example.com` are one customer; dots and the domain are never changed, so `a.na@example.com` is another. The name and the email shown are those of the customer's **newest** order, as stored (so a `+tag` shows if the newest order used it).
3. **Columns:** Customer (name, with the email under it), **Orders placed**, Total spent, Last order, and a "View orders" link. Name and email are masked for Demo. The **name is the one on the customer's most recent order** (and so is the email under it).
4. **Orders placed** is the number of orders the customer placed, whatever their status (a cancelled order is still an order they placed).
5. **Total spent** adds the `total` of the customer's orders that **count as a sale**: `paidAt` is set **and** the status is neither Cancelled nor Refunded. `total` is the order's grand total, the amount the shopper pays: items + shipping − voucher discount (`subtotal + shippingFee − discount`, stored as `total`). "Counts as a sale" is defined once, as a pure predicate with its SQL form (R4), because the Dashboard story will reuse it. Pending payment and Pending confirmation orders have no `paidAt`, so they add nothing. An online order counts from the moment it is Paid. A cash order counts only once Admin has set `paidAt` at delivery or pickup (spec 038; Admin sets it in #108). `total` is what the shopper paid (merchandise less voucher plus shipping). A customer with no counted order shows ₱0.00. Amounts use `formatPeso`.
6. **Last order** is the date and time (Asia/Manila, `lib/orders/time.ts`) of the customer's newest order of any status.
6a. **Staff.** Spec 040's permission table gives `customers.view` to Owner, Staff and Demo (Demo masked), and `orders.search-customer` to Owner and Staff only. The nav item, the page and the query all follow `can()`: Staff sees the same real values as Owner and the same search field; nothing on this screen is Owner-only. Demo is masked and has no search.
7. **View orders** goes to `/admin/orders?buyer={key}` (D3). The orders list then shows only that customer's orders (all statuses, all pages), with the usual filters still combinable, a line "Orders from {name}" (masked for Demo) and a "Show all customers' orders" link that removes the filter. For Owner and Staff `{key}` is the normalized email. For Demo it is the row's opaque position key (`c1`, `c2`, …), which the server resolves again on each request (R7).
8. **Search** (Owner and Staff): one field, "Name, email or mobile", read as spec 041 reads a customer term (at least 3 characters after trimming, case-insensitive; a term that looks like a phone number also matches by the mobile's digits, spec 041 R6). A customer matches when **any** of their orders' contact name, email or mobile matches; the row still shows the customer's whole count and total, not only the matching orders. Shorter text is ignored and the field says "Type at least 3 characters to search customers." The filter lives in the URL as `customer=` and `page=`; invalid values fall back to defaults and a non-canonical URL redirects, as in spec 041 B8.
9. **Demo can't search.** The field is disabled with "This account is read-only". A Demo request carrying `customer=` gets the read-only answer in place of results and **no customer query runs**, whatever the term's length.
10. **States.** Loading: a skeleton table (`loading.tsx`). No customers at all: "No customers yet. They appear after the first order." No match for a search: "No customers match this search." with a "Clear search" link. A page past the last redirects to the last; a search with zero results renders page 1 with its empty state, no redirect. Error: the segment's error boundary, "Couldn't load customers. Try again." with a retry button, no detail of the failure.

### The order history (the orders list with `buyer`)

11. `/admin/orders?buyer={key}` is spec 041's list with one more filter. It matches orders whose normalized `guestEmail` equals the key, exactly (not "contains": `ana@example.com` must not match `joana@example.com`). Every other rule of spec 041 holds (newest first, 25 per page, true status, flags, Demo masking, filters in the URL, canonical redirects). "Back to orders" from a detail keeps `buyer`, and the filter form carries it as a hidden field so submitting a status or number filter keeps the customer.
12. A `buyer` key that matches no customer (a Demo position past the last, a mistyped email, a customer whose orders were never placed) gives the list's empty state "No orders match these filters." and the line "Orders from an unknown customer". It is never an error page and never a 404.
13. `buyer` is **not** a customer search: it takes a key the customers screen produced, not free text. A Demo request may carry `buyer=c3` (it cannot reveal anything: a position, resolved on the server). A Demo request with `buyer=ana@example.com` is not a position, so it matches nothing and runs no email lookup (R8).

### Access

15. **From an order to its customer.** The order detail's Contact block has a link "View this customer's orders" to `/admin/orders?buyer={key}` (shown only to a role with `customers.view`). For Owner and Staff the key is the normalized email. **For Demo it is the customer's `c`-key, never the email**: the detail DTO carries the rank key for Demo and has no field that can hold the email unmasked, so the real address appears nowhere in the Demo detail page, its props or its RSC payload.
14. The page calls `requireAdminAccess("customers.view")` and returns `<NoAccess />` when refused. Data comes only from `lib/admin/queries/customers.ts`, which re-checks the action with the role. Responses are `no-store`, `no-referrer` and `noindex` (spec 039). Reads are not audited. The shell gains a "Customers" nav item (`customers.view`, so all three roles).

## 3. Examples

Fixtures use the throwaway-order helpers of `e2e/admin-order-fixtures.ts` and `test-support/`. Parts come from the seed (e.g. `CPU-AMD-7600X`, Ryzen 5 7600X); amounts are the orders' own totals. Names: Ana Reyes (`ana.reyes@example.com`, `+639171234567`), Ben Cruz (`ben.cruz@example.com`).

| # | Input | Result |
| --- | --- | --- |
| E1 | Ana has 3 orders: Paid ₱41,990.00, Delivered ₱8,500.00, Pending payment ₱1,200.00 | one row: Orders placed 3, Total spent ₱50,490.00, Last order = the newest of the three |
| E2 | Ana's third order is Cancelled (it had no `paidAt`) | still 3 orders; Total spent unchanged by it |
| E3 | Ana has a Paid ₱10,000.00 order and a Refunded ₱5,000.00 order (it has `paidAt`) | Total spent ₱10,000.00; Orders 2 |
| E4 | Ben has only a Pending payment order and a Cancelled one | Orders 2, Total spent ₱0.00 |
| E5 | A COD order, status Delivered, `paidAt` set; another COD order COD confirmed, no `paidAt` | the first counts, the second doesn't |
| E6 | Orders from `ana@example.com`, `Ana@Example.com ` and `ana+promo@example.com` | one customer, 3 orders; the newest order's name and email shown |
| E7 | Orders from `a.na@example.com` and `ana@example.com` | two customers (dots are never changed) |
| E8 | `+tag` at the start of the local part (`+x@example.com`) and an address with no `@` | each is its own customer, as `normalizeRecipient` treats them; no exception |
| E9 | 30 customers | 25 rows, newest last-order first, "30 customers · Page 1 of 2"; `?page=2` has 5 |
| E10 | Two customers whose last order is the same instant | order is stable: the smaller key first, on every load |
| E11 | 6 000 orders from 6 000 different emails | all 6 000 customers exist across the pages; no silent cutoff |
| E12 | Owner clicks "View orders" on Ana's row | `/admin/orders?buyer=ana.reyes%40example.com` (key encoded) lists Ana's orders only, "Orders from Ana Reyes" |
| E13 | Same click for `ana@example.com` while `joana@example.com` also has orders | only Ana's orders; Joana's don't appear |
| E14 | The history for the E6 customer | orders under all three spellings |
| E15 | Owner/Staff: `?customer=reyes`, `?customer=REYES`, `?customer=ana.reyes@example` | Ana's row, whole count and total |
| E16 | `?customer=0917 123 4567`, `+63 917 123 4567`, `9171234567` | the customer whose any order has mobile `+639171234567` |
| E17 | Ana renamed herself on a later order ("Ana R. Reyes"); `?customer=reyes` | still Ana's row (any order matches); the row shows the newest name |
| E18 | `?customer=ab` | term ignored, all customers, hint shown |
| E19 | `?customer=zzzzzz` | "No customers match this search." with Clear search; page 1, no redirect |
| E20 | Demo opens `/admin/customers` | rows show `A••• R•••` and `a•••@••••.•••`; keys are `c1`, `c2`…; `expectNoRawValues` passes on the RSC payload |
| E21 | Demo: `?customer=reyes` | read-only message in place of results; no customer query ran (spy on `db`); field disabled |
| E22 | Demo clicks "View orders" on row `c1` | `/admin/orders?buyer=c1`: that customer's orders, names masked, no raw email in markup or payload |
| E23 | Demo: `/admin/orders?buyer=ana.reyes@example.com` | no orders ("unknown customer"), no lookup by email, no query that confirms the email exists |
| E24 | Demo: `/admin/orders?buyer=c999` (past the last) | empty state, "Orders from an unknown customer" |
| E25 | No orders in the database | "No customers yet. They appear after the first order." |
| E26 | Customer list query as an unknown role / a role without `customers.view` | `QueryDeniedError`; the page shows `<NoAccess />` |
| E27 | `?page=abc`, `?page=0`; `?page=9` with 2 pages | page 1 (URL redirected to `/admin/customers`); redirect to `?page=2` |
| E28 | Normalization agreement: a table of addresses (case, spaces, `+tag`, dots, `@` edge cases, no `@`) | the SQL grouping key equals `normalizeRecipient` for every one |
| E29 | Staff opens the page | same real values as Owner; search field enabled; the nav lists Customers |
| E30 | Owner opens the detail of Ana's order | the Contact block has "View this customer's orders" → `?buyer=ana.reyes%40example.com` |
| E31 | Demo opens the detail of Ana's order | the link goes to `?buyer=c{rank}` of Ana's row; the page, its props and its RSC payload hold no email (`expectNoRawValues` with the fixture email and its parts) |
| E32 | The predicate over every status × `paidAt` null / set | `countsAsSale` and its SQL form agree on all 22 combinations; true only for a set `paidAt` with a status other than CANCELLED and REFUNDED |
| E33 | A customer's newest order has the name "Ana R. Reyes", an older one "Ana Reyes" | the row says "Ana R. Reyes" |
| E34 | A Paid order with a voucher: subtotal ₱10,000.00, shipping ₱150.00, discount ₱1,000.00 | counts ₱9,150.00 (its `total`) |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| `/admin/customers` lists distinct guest emails, normalized as in `recipientHash`, with order count, total spent and last order date | B1–B6; E1, E6–E11, E28; R1–R3 |
| Total spent counts orders by `paidAt` and leaves out cancelled and refunded | B5; E1–E5; R4 |
| Each customer links to their order history (the orders list filtered by that customer) | B7, B11–B13; E12–E14, E22–E24; R5–R8 |
| Demo sees masked rows and can't search by customer | B3, B8, B9; E20–E24; R7–R9 |
| Empty state handled | B10; E19, E25 |
| (review) Row name is the most recent order's; one shared "counts as a sale"; Staff and nav follow `can()`; +tag limitation noted; order-detail link with the Demo `c`-key | B3, B5, B6a, B15; E31–E34; R4, D11, D12, D14 |
| (DoD) Loading, error states | B10 |

## 4. Rules and edge cases

- R1. **One definition of "same customer".** The key is `normalizeRecipient(guestEmail)`. The grouping is done in SQL (the list must page and total over every order, not a capped read), so the key exists as one SQL expression next to the list's query, the way spec 041 put "due" in `due-sql.ts`. A test (E28) fails when that expression and `normalizeRecipient` disagree on any address of the table. `normalizeRecipient` stays the pure statement of the rule.
- R2. Ordering is `lastOrderAt` descending, then key ascending. Offset paging can repeat or skip a row at a page edge when an order arrives between loads (same acceptance as spec 041 R1).
- R3. Counts and sums are integers in centavos; the sum is computed by the database (no float, no row cap). Total spent sums `Order.total`, the grand total. `Total spent` for a customer always equals the sum of the `total` of the orders the rule in B5 selects.
- R4. **"Counts as a sale"** is `paidAt` set **and** status not CANCELLED and not REFUNDED. It lives in one place: a pure predicate `countsAsSale({ status, paidAt })` (`lib/orders/sale-rules.ts`) and its SQL form `saleOrderCondition()` (a `Prisma.sql` fragment, table aliased `o`, in `lib/orders/sale-sql.ts`), the same arrangement as `isDue` and `dueOrderCondition`. The customer list uses the SQL form; E32 checks the two against each other for every status and both `paidAt` states. The Dashboard (AD-1) will import them rather than restate the rule. A late or second payment (spec 032) never sets `paidAt`, so `refundRequired` orders add nothing. Status alone never decides ("Paid" without `paidAt` can't exist: the migration pairs them).
- R5a. The `buyer` filter selects the customer's order ids with one raw query on `customerKeySql` and then goes through `listOrders`'s typed `where` as `id IN (...)`. A customer has few orders, so the list is short; the cost is one extra query only when `buyer` is present.
- R5. `buyer` is added to `lib/admin/orders-params.ts` (`OrderParams`, parse, serialize, canonical form, `hasActiveFilters`, the `back` value). It is a short string (at most 100 characters, as the other text values), compared after normalization, and bound as a parameter. For Owner and Staff the key is the normalized email; matching is equality, never `contains`.
- R6. The orders list shows the buyer's display name through `contactView` (masked for Demo), taken from that customer's newest order; no raw email is put in a Demo DTO or the line "Orders from …".
- R7. **Demo keys are ranks across the whole list** (spec 040 R17, "Demo's rows carry no key a client could use to learn the email"). `c{n}` is the customer's rank in the whole sorted list (1 = most recent last order), never the position within a page, so the same customer has the same key on every page until an order changes the ranking. The server resolves a `c{n}` by recomputing that sorted list and taking the n-th key, on every request. A new order between the customers page (or an order detail) and the click can move a rank, so the link may show another customer's orders. Accepted for the demo account (D4). A key past the last position matches nothing.
- R8. A Demo `buyer` value that isn't `c` plus a positive whole number is not looked up: it matches nothing and no email comparison runs, so a Demo user can't test whether an address is a customer. (Owner and Staff `buyer` values are emails.)
- R9. A Demo customer search term is refused before any query, including when the term is under 3 characters (spec 041 R6 and 040 Behavior 16). The refusal doesn't reveal whether anything would have matched.
- R10. Query functions `select` named fields and never spread a row; the customer DTO has the fields in §6 and nothing else. Never read: the access-token hash, idempotency key, cart hash, recipient hash, payment events, address (the list shows no address).
- R11. The customer list runs the heaviest read in Admin so far (a `GROUP BY` over every order). It is a sequential scan, which is fine at portfolio scale; no index is added (D5). The page is `connection()` / per request, never cached, since totals change with every payment.
- R12. Desktop-first: usable from 1024 px; the table scrolls horizontally below that. The table has a caption and header cells; the search form is a GET form that works without JavaScript; focus goes to the results heading after a submit (spec 041 R17).
- R13. A customer's counted total and order count are read in one query with the page's rows (one query for the page, one for the count of customers).
- R14. Names and emails that look like markup or contain very long text are rendered as text and truncated by CSS only; nothing is trusted as HTML.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Nav item | Customers |
| Page heading / title | Customers |
| Count | `{n} customers` / `1 customer` · `Page {p} of {m}` |
| Columns | Customer · Orders placed · Total spent · Last order |
| Order detail link | View this customer's orders |
| Row link | View orders |
| Search label / placeholder | Name, email or mobile · Search |
| Short-term hint | Type at least 3 characters to search customers. |
| Demo search field | This account is read-only |
| Clear search | Clear search |
| Empty (no customers) | No customers yet. They appear after the first order. |
| Empty (search) | No customers match this search. |
| Error | Couldn't load customers. Try again. · Try again |
| Orders list, filtered by customer | Orders from {name} · Show all customers' orders |
| Orders list, unknown customer | Orders from an unknown customer |
| Page title | Customers |

(The orders list's own copy, including "No orders match these filters.", is spec 041's. The copy lives in `lib/admin/copy.ts`.)

## 6. Data and interfaces

**Routes** (under `app/admin/(shell)/customers`): `page.tsx`, `loading.tsx`, `error.tsx`. No detail route, no API route, no server action. The existing orders list gets the `buyer` filter.

**Schema change:** none. No new table, column or index (D5, D6). `db:drift` stays clean.

**Permissions:** none new; `customers.view` already exists (Owner, Staff, Demo masked), and the customer search reuses `orders.search-customer`.

**Pure modules** (no database): `lib/admin/customers-params.ts` (`parseCustomerParams(searchParams) → { customer, page }`, canonical form, `customersHref`, shared term rules from `orders-params`: `customerQueryOf`, `hasCustomerTerm`, `customerTooShort`); `lib/admin/customers-view.ts` (labels, `Orders from …` line, the key-is-a-position test `demoKeyPosition(key) → number | null`); the `buyer` field added to `lib/admin/orders-params.ts`; the nav item added to `lib/admin/nav.ts` (`NavItem.key` widened); `lib/orders/sale-rules.ts` (with `lib/orders/sale-sql.ts`).

**Query** in `lib/admin/queries/customers.ts` (replaces the placeholder; takes the role, calls `assertCan("customers.view")`, one `$queryRaw` with bound parameters):
- `listCustomers(role, params) → { ok: true, rows, total, page, pageCount } | Denied`. Row: `id` (Owner/Staff: normalized email; Demo: `c{position}`), `contact: ContactView` (from the newest order), `orderCount`, `totalSpent` (centavos), `lastOrderAt`. A Demo request with a customer term returns `Denied` before querying.
- `resolveBuyer(role, key) → normalized email | null` used by `listOrders`: Owner/Staff pass the normalized key through; Demo maps `c{n}` through the same sorted list; anything else is null. (Whether it is exposed on its own or folded into `listOrders` is the plan's choice; the behavior is B11–B13.)
- `getOrderDetail` (spec 041) gains `customerKey` (Owner/Staff: normalized email; Demo: the `c`-key from the same rank query; absent for a role without `customers.view`).
- `listOrders` (spec 041) gains the exact-match condition on the SQL key expression and the buyer's display name for the "Orders from …" line.

**Shared SQL and rules:** one `customerKeySql` fragment (the normalization), used by the customer list, the `buyer` filter, the detail's rank lookup and the agreement test (R1); `countsAsSale` / `saleOrderCondition` (R4).

**Reused:** `normalizeRecipient`, `contactView`, `assertCan`, `Denied`, `formatPeso`, `dateTimeText`, `NoAccess`, `requireAdminAccess`, `expectNoRawValues`, spec 041's list, filters and paging helpers. Pages import no database (`no-db-in-pages.test.ts`).

## 7. Test plan

- **Unit (pure):** `countsAsSale` over every status × `paidAt` (E32, with its SQL twin in the integration run); `customers-params` (E18, E27, canonical form, oversize values); `customers-view` (labels, singular/plural, Demo key parsing incl. `c0`, `c999`, `C1`, an email); `orders-params` with `buyer` (parse, serialize, canonical, back link); nav lists "Customers" for all three roles; copy completeness.
- **Integration (`*.db.test.ts`, Docker Postgres):** `listCustomers` grouping, count, counted total and last date (E1–E8); paging and ordering ties (E9, E10); no cap at 6 000 (E11, seeded in bulk); search by name, email, mobile and "any order matches" (E15–E19); Demo refusal runs no query (E21, spy on `db`); Demo rows carry no raw value and `c{n}` keys (E20); `resolveBuyer` and the `buyer` filter for Owner (E12–E14) and Demo (E22–E24); role gating (E26); **SQL key agrees with `normalizeRecipient`** over the address table (E28). The old placeholder's tests in `queries.db.test.ts` are rewritten, not deleted: the Owner/Demo masking assertion stays.
- **Page render tests:** list markup for Owner, Staff and Demo (E20, E29), empty states (E19, E25), the orders list's "Orders from …" line (E12, E24); `expectNoRawValues` on the Demo RSC payload of the customers page, of `/admin/orders?buyer=c1` and of the order detail with its customer link (E31, the fixture email and its parts); the admin-page guard test and `no-db-in-pages` include the new route.
- **E2E (`admin` project, `e2e/admin-customers.spec.ts`):** Owner opens Customers, sees a fixture customer with the right count and total, searches by name, clicks View orders and sees only that customer's orders, clears the filter; Demo sees masked rows, a disabled field, the read-only message for a `?customer=` URL, and fetches the page and the `buyer=c1` list as HTML and as RSC payloads with no raw fixture value. Fixtures give each order its own recipient except where a test needs a shared one, and respect the email cap note.
- Lint, typecheck and `db:drift` pass. Preview check: the acceptance list on the preview URL at 1024 px and 1280 px.

## 8. Out of scope

- Anything beyond the one link from the order detail to the customer's orders (no customer detail page).
- Customer accounts, sign-up and their order history for shoppers: Phase 2 (#65).
- Editing, merging or deleting customer data, exports (the issue).
- A customer detail page with contact history, addresses or notes; the history is the orders list filtered by customer (the issue).
- Splitting one person across several emails, or merging two spellings beyond the `+tag` rule.
- Segments, tags, lifetime value beyond Total spent, a repeat-buyer badge.
- Trigram or expression indexes for customer search and grouping; materialized customer table.
- Dashboard "recent orders" and "top customers" (AD-1).
- Mobile layouts (Phase 2).

## 9. Decisions

- **D1 — Group in SQL by the `normalizeRecipient` key, not in TypeScript over a capped read.** The placeholder read 5 000 orders and sliced to 200, so totals and counts went wrong past those limits. The issue asks for normalization "as in `recipientHash`". Rejected: grouping in memory (a cutoff or a full read of the table on every load).
- **D2 — "Same customer" is the email only, not name or mobile.** The issue defines a customer as a distinct guest email. Rejected: also merging by mobile (false merges; merging is out of scope).
- **D3 — A new exact-match `buyer` filter on the orders list, not `customer=<email>`.** The existing `customer` term is a "contains" search: `ana@example.com` would also return `joana@example.com`'s orders and `ana+promo@…` would be missed, so it can't be "that customer's orders". It also is refused to Demo, who must still be able to follow a row. Rejected: reusing `customer` (wrong results for Owner, unusable for Demo); a separate history page (the issue says the orders list, filtered).
- **D4 — Demo keys stay positions (`c1`, `c2`…), resolved on the server per request.** Spec 040 R17 forbids a key Demo could use to learn an email, and an unsalted hash of an email can be guessed. The cost is that a new order can shift positions between the list and the click. Rejected: a keyed hash (needs a secret and a SQL-side HMAC for little gain on a demo account); sending Demo's real email key and masking only the display (breaks R17).
- **D5 — No schema change and no index.** A `GROUP BY` scan is fine at this scale, as spec 041 D5 accepted for customer search. Rejected: a stored `customerKey` column set at checkout (touches order placement, spec 030, and needs a backfill) and an expression index (Prisma can't declare it, so `db:drift` would flag it).
- **D6 — `Orders placed` counts all orders; `Total spent` counts only paid, not-undone ones.** "Order count" has no condition in the issue; "total spent" has one. Rejected: counting only paid orders as the order count (a customer with only unpaid orders would vanish from the repeat-buyer view).
- **D7 — Search on the customers screen, using spec 041's term rules and `orders.search-customer`.** The issue says Demo "can't search by customer", which needs a search to exist here. No new action is needed. Rejected: no search on this screen (nothing for the Demo rule to forbid here, and a long list is hard to scan).
- **D8 — The list shows name and email only, not the mobile.** It is not asked for; less personal data on a list. Rejected: a mobile column.
- **D9 — Extends spec 041 (a new `buyer` filter and a changed `listCustomers`).** Not a disagreement: spec 041 §8 left "the Customers screen and order history per customer" to its own story and said the detail doesn't link to it. This spec follows that split; the order detail's contact block does not link to the customer yet (an open question).
- **D10 — Changes #105's placeholder.** `listCustomers` summed every order and grouped by trimmed lower-cased email only. Spec 040 R17 (masking) is kept as written; the grouping, totals and paging change here by the issue's request.

- **D11 — "Counts as a sale" is one pure predicate plus its SQL form, with an agreement test.** The Dashboard will need the same rule; two copies would drift, as "due" did before spec 041 D11. Rejected: restating the condition inside the customer query.
- **D12 — The order detail links to the customer.** Settled in review. Demo's link uses the customer's `c`-key so the detail never holds the email. Rejected: no link; or the email as the key for Demo (breaks spec 040 R17).
- **D13 — Settled in review:** the column is "Orders placed" and counts all placed orders; the search box is included with spec 041's term rules and Demo is refused before any query; shifting Demo keys are accepted, and the keys are ranks across the whole list, not positions within a page; the normalized email is the Owner/Staff `buyer` key.
- **D14 — Known limitation, accepted: dropping `+tags` can merge different people.** At providers without subaddressing, `ana+shop@…` and `ana@…` are different mailboxes. The issue specifies `recipientHash`'s normalization, so that is the rule. Rejected: grouping by the exact lower-cased address (contradicts the issue; the email cap and the customer list would disagree about who is one recipient).

## 10. Open questions

None. The five from the first draft were settled in review (D13).
