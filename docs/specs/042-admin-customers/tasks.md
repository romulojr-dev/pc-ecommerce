# Tasks: spec 042 — Admin customers (#107)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec reviewed; open questions settled (D13)
- [x] Branch rebased on `origin/main`; spec 041 and `/admin/orders` in the tree; 041's code re-read (findings in the spec)
- [x] Commit `plan.md` and `tasks.md`

## 1. "Counts as a sale" in one place (gate for the Dashboard story)
- [x] `lib/orders/sale-rules.ts`: `countsAsSale({ status, paidAt })`
- [x] `lib/orders/sale-sql.ts`: `saleOrderCondition()` (alias `o`)
- [x] Agreement test E32 over all 11 statuses × `paidAt` null / set, pure vs SQL on real rows
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 2. "Same customer" in SQL (gate: stop and report if SQL and `normalizeRecipient` disagree)
- [x] `lib/orders/customer-key-sql.ts`: `customerKeySql`
- [x] Agreement test E28 on an address table (case, all whitespace kinds, `+tag`, leading `+`, no `@`, several `@`, dots, `+` in the domain)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test:db` pass

## 3. Pure modules
- [x] `lib/admin/orders-params.ts`: `buyer` (parse, serialize, canonical, `hasActiveFilters`, `back` value) and `demoKeyRank`
- [x] `lib/admin/customers-params.ts`: parse, canonical form, `customersHref` (E18, E27)
- [x] `lib/admin/customers-view.ts`: labels, plural, "Orders from …" text
- [x] `lib/admin/nav.ts`: `NavItem.key` widened, Customers item (`customers.view`); `shell.test.tsx` updated for all three roles (E29)
- [x] Copy in `lib/admin/copy.ts`, completeness test
- [x] Pure modules import no database (ESLint limits)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 4. Customers query
- [x] `listCustomers(role, params)`: group on `customerKeySql`, orders placed, total spent over `saleOrderCondition` (sum of `total`), last order, newest order's name and email through `contactView`
- [x] Paging and stable order (last order desc, key asc); no row cap (E9–E11)
- [x] Search: any order matches, whole count and total kept, `%` `_` `\` escaped, mobile digits per spec 041 (E15–E19)
- [x] Demo: masked rows, rank keys `c{n}` across the whole list, a customer term refused before any query (E20, E21)
- [x] `resolveBuyer(role, key)`: Owner/Staff pass the normalized key; Demo `c{n}` only; anything else null (E23, E24)
- [x] Role gating (E26); the placeholder tests in `queries.db.test.ts` rewritten, masking assertion kept
- [x] Integration tests E1–E8, E33, E34
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. Customers page and nav
- [ ] `app/admin/(shell)/customers/page.tsx` with `requireAdminAccess("customers.view")`, canonical and past-the-last redirects, no redirect for a zero-result search
- [ ] Table with caption, GET search form (labelled, works without JS), Demo's disabled field and read-only message, "Clear search"
- [ ] `loading.tsx` skeleton, `error.tsx`, empty states (no customers / no match) (E19, E25)
- [ ] Render tests for Owner, Staff and Demo; `admin-pages` and `no-db-in-pages` tests stay green
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 6. `buyer` on the orders list
- [ ] `listOrders`: ids of the customer's orders by `customerKeySql`, then the typed `where`; Demo through `resolveBuyer`; the buyer's display name (masked for Demo) or "unknown" in the result
- [ ] Orders page: "Orders from {name}" / "an unknown customer" and "Show all customers' orders"; filter form carries `buyer` as a hidden field; "Back to orders" keeps it
- [ ] Tests E12–E14, E22–E24; a Demo `buyer=<email>` runs no email lookup (spy)
- [ ] Spec 041's list tests stay green
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Order detail link
- [ ] `getOrderDetail` returns `customerKey` (email key for Owner and Staff, rank key for Demo; absent without `customers.view`)
- [ ] Contact block link "View this customer's orders"
- [ ] Tests E30, E31; spec 041's allow-list serialization test E22 stays green
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. Demo across the surfaces
- [ ] Fixture customer with distinctive values (email and its parts)
- [ ] `expectNoRawValues` on the RSC payload of the customers page, `buyer=c1` and the order detail (E20, E22, E31)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 9. E2E
- [ ] `e2e/admin-customers.spec.ts`, Owner: count and total of a fixture customer, search by name, View orders shows only that customer, clear the filter
- [ ] Demo: masked rows, disabled field, `?customer=` read-only message, `buyer=c1` list and the order detail fetched as HTML and RSC with no raw fixture value
- [ ] Each order has its own recipient except where a test needs a shared one; helpers write through the E2E database guard

## 10. Documentation
- [ ] CLAUDE.md bullet for this story
- [ ] Spec: "What changed while building"; status line
- [ ] Spec 041 carries the "changed by 042" note (added with the spec review; verify)
- [ ] README only if it lists admin screens

## 11. Final checks
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build` pass
- [ ] `pnpm test:e2e` (admin project) passes
- [ ] Push, open the PR from the template, check the acceptance list on the preview URL at 1024 px and 1280 px
