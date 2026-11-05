# Plan: spec 042 — Admin customers (#107)

Spec: [spec.md](spec.md) (reviewed 2026-11-05). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `107-admin-customers`, rebased on `origin/main` (spec 041 is in the tree). One commit per task, subject line only, no trailer.

## Context

Reused as it is: `requireAdminAccess` / `NoAccess`, `can()` and the permission table (`customers.view`: Owner, Staff, Demo masked; `orders.search-customer`: Owner, Staff), `contactView` and the `Masked` brand ([lib/admin/mask.ts](../../../lib/admin/mask.ts)), `assertCan` / `denied`, `normalizeRecipient` ([lib/email/recipient.ts](../../../lib/email/recipient.ts)), the order list's pieces in [lib/admin/orders-params.ts](../../../lib/admin/orders-params.ts) (`customerQueryOf`, `hasCustomerTerm`, `customerTooShort`, `resolvePage`, `pageCount`, the `first` / text helpers), `formatPeso`, `dateTimeText`, `expectNoRawValues`, the `admin` Playwright project and `e2e/admin-order-fixtures.ts`, and the pattern of `lib/orders/due-sql.ts` + `release-rules.ts` + `due-sql.db.test.ts`.

Replaced: `listCustomers(role)` in [lib/admin/queries/customers.ts](../../../lib/admin/queries/customers.ts) (grouped by the raw lower-cased email, summed every order, read 5 000 rows and sliced to 200); the placeholder assertions in `queries.db.test.ts` move to the new function.

Does not exist yet: `/admin/customers`, a `buyer` filter, `customerKey` on the order detail, the shared sale predicate, the SQL customer key, the nav item.

## Findings that shape the plan

- **`listOrders` uses a typed Prisma `where`.** A normalized-email equality can't be written there. Plan: when `buyer` is present, one raw query returns the ids of that customer's orders (`customerKeySql = $1`), and the typed `where` gets `id: { in: ids }`. Count, order, paging, due badge and masking are unchanged (R5a). An unknown customer gives an empty id list and the list's normal empty state.
- **The filter form is a GET form.** It submits only its own fields, so `buyer` needs a hidden input, or the next status filter drops it. `hasActiveFilters` counts `buyer` (so "Clear filters" shows), and "Show all customers' orders" removes only `buyer`.
- **One SQL key, three users.** The customers list (`GROUP BY`), the `buyer` filter and the detail's rank lookup all need the normalized email as SQL. It is one `Prisma.sql` fragment, `customerKeySql`, tested against `normalizeRecipient` on an address table (E28). JS `trim()` strips more whitespace than Postgres `btrim` does by default; the fragment must strip the same set (spaces, tabs, line breaks), and the table includes those.
- **Demo keys are ranks.** `c{n}` is `ROW_NUMBER()` over the whole sorted customer list (last order desc, key asc), computed in SQL so a row on page 2 is `c26`. `resolveBuyer` for Demo asks for the key at rank n (one query). The order detail's Demo link asks for the rank of one key, a `GROUP BY` plus window over all orders; that is the heaviest read on the detail, only for Demo, accepted (R11, D4).
- **Search needs "any order matches".** The customer is kept when any of their orders matches the term, but the row shows the whole count and total. In SQL that is `HAVING bool_or(name ILIKE … OR email ILIKE … OR mobile LIKE …)`; the term and digits are bound parameters, and `%`, `_` and `\` in the term are escaped (Prisma's `contains` does this for the order list; raw SQL must do it by hand).
- **Name and email of the row** come from the most recent order: `DISTINCT ON` the key ordered by `createdAt desc, id desc`, or an aggregate with `(array_agg(... ORDER BY "createdAt" DESC, "id" DESC))[1]`. Chosen in task 4 by reading the plan.
- **"Counts as a sale"** is applied as `SUM(o.total) FILTER (WHERE <saleOrderCondition>)`. The fragment is a bare boolean on alias `o`, like `dueOrderCondition`.
- **Nav.** `NavItem.key` is the literal `"orders"` in [lib/admin/nav.ts](../../../lib/admin/nav.ts) and `shell.test.tsx` asserts the exact list per role; both change.
- **Page guards.** `admin-pages.test.ts` and `no-db-in-pages.test.ts` must pass for the new route, with no database import under `app/admin` or `components/admin`.
- **Routes and loading.** `customers` gets `loading.tsx` and `error.tsx` (it has no 404 to protect). The order detail still has none.
- **Nothing in the packing slip changes.** `getPackingSlip` doesn't read the email; no task touches it, but the Demo three-page check stays green.

## Risks to settle early

1. **The SQL key vs `normalizeRecipient`** (task 2). Everything else rests on it. Build and test it before the queries; stop and report if any address in the table disagrees.
2. **Raw SQL escaping of the search term** (task 4). Test with `%`, `_` and a backslash.
3. **Demo leak through the new surfaces:** the customers page, the `buyer=c1` list and the detail link. The RSC checks (task 8) run on all three with fixture values that include the email's parts.
4. **Rank shifting** between list and click (R7) is accepted; no work.
5. **Index use at 6 000 customers** (E11): a sequential scan is expected and fine; the test asserts correctness only, with no time bound.

## Steps

### 0. Housekeeping
Commit `plan.md` and `tasks.md`.

### 1. One definition of "counts as a sale" (shared, for the Dashboard too)
- `lib/orders/sale-rules.ts`: `countsAsSale({ status, paidAt })`; `lib/orders/sale-sql.ts`: `saleOrderCondition()`.
- Test E32: all 11 statuses × `paidAt` null / set, pure vs SQL on real rows.

### 2. One definition of "same customer" in SQL
- `lib/orders/customer-key-sql.ts`: `customerKeySql` fragment (lower, trim, drop the `+tag` before the last `@`, the same edge cases as `normalizeRecipient`).
- Test E28 on an address table (case, surrounding whitespace of every kind, `+tag`, leading `+`, no `@`, several `@`, dots, `+` in the domain).
- **Stop and report if SQL and JS disagree.**

### 3. Pure modules
- `lib/admin/orders-params.ts`: `buyer` (parse, serialize, canonical, `hasActiveFilters`, `back` value), `demoKeyRank("c12") → 12 | null`.
- `lib/admin/customers-params.ts`: `{ customer, page }`, canonical form, `customersHref`.
- `lib/admin/customers-view.ts`: labels, singular/plural, the "Orders from …" text.
- `lib/admin/nav.ts` and copy in `lib/admin/copy.ts`. Unit tests.

### 4. Customers query
`listCustomers(role, params)`: grouping on `customerKeySql`, counts, `saleOrderCondition` total, last order, newest order's contact via `contactView`, search with `HAVING`, paging, rank keys for Demo, Demo refusal before any query. `resolveBuyer(role, key)`. Integration tests E1–E11, E15–E19, E21, E26, E33, E34 (the old placeholder tests move here).

### 5. Customers page and nav
`/admin/customers` page, search form, table, paging, states, redirects, Demo's disabled field; nav item for all three roles. Render tests E20, E25, E27, E29.

### 6. `buyer` on the orders list
`listOrders` takes `buyer` (ids by `customerKeySql`, Demo through `resolveBuyer`) and returns the buyer's display name or "unknown"; the list page shows "Orders from …" with the clear link; the filter form carries `buyer`; "Back to orders" keeps it. Tests E12–E14, E22–E24; a Demo `buyer=<email>` runs no email lookup (spy).

### 7. Order detail link
`getOrderDetail` returns `customerKey` (email key for Owner and Staff, rank key for Demo); the Contact block shows the link. Tests E30, E31.

### 8. Demo across the surfaces
Fixture customer with distinctive values; `expectNoRawValues` on the RSC payload of the customers page, `buyer=c1` and the order detail (E20, E22, E31).

### 9. E2E
`e2e/admin-customers.spec.ts` as in the spec's test plan.

### 10. Documentation
CLAUDE.md bullet (routes, shared sale predicate and customer key, `buyer`, Demo rank keys), the spec's "What changed while building", README only if it lists admin screens, and a check of the spec 041 note (added with the spec review).

### 11. Final checks
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift` (no schema change, must stay clean), `pnpm build`, `pnpm test:e2e` (admin project). Then push, open the PR from the template, and check the acceptance list on the preview URL at 1024 px and 1280 px.
