# Tasks: spec 041 — admin orders: list, filters, detail and packing slip (#106)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec approved with changes (D11–D13); open questions settled
- [x] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. One definition of "due" (gate: stop and report if a release test changes)
- [x] Run the existing `release*.db.test.ts` files first and note they pass
- [x] `lib/orders/due-sql.ts`: `dueOrderCondition(now)`; `checkExpiredOrders` and `releaseExpiredOrders` use it
- [x] Release tests pass unchanged
- [x] Agreement test (E31, first version): fragment, `isDue` and `checkExpiredOrders` agree on the fixtures (at, before, after the deadline, flagged, COD confirmed, Cancelled)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 2. Pure modules
- [x] `lib/admin/orders-params.ts`: parse, canonical form, `orderParamsHref`, page rules (E2, E3, E5)
- [x] Customer term: trim, 3-character minimum, case-insensitive, mobile digits (strip non-digits, drop one leading `63` or `0`, at least 3 digits) (E9a, E9b)
- [x] `lib/admin/orders-view.ts`: badge/flag/payment-cell labels, `readyToPack` (Processing only), slip warning, amount-to-collect rule, email and payment-problem labels
- [x] Copy in `lib/admin/copy.ts` (the placeholder `body` stays until task 5, which replaces the page and the e2e text that reads it)
- [x] Unit tests: every status for `readyToPack` and the warning text (E26), mobile variants "0917 123 4567", "+63 917 123 4567", "9171234567" give the same digits, copy completeness
- [x] Pure modules import no database (ESLint limits)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. Indexes
- [x] Schema declarations and migration: `Order(createdAt desc, id desc)`, `(status, createdAt desc, id desc)`, `(paymentOption, createdAt desc, id desc)` (the filtered indexes carry `id` too: without it the planner preferred the newest-first index with a filter)
- [x] `pnpm db:drift` clean
- [x] `EXPLAIN` integration test with 5 000 orders after `ANALYZE` (E29)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test:db` pass

## 4. List query
- [x] `listOrders(role, params, now)`: allow-listed select, count, paging, status/payment filters, number search, customer search, Demo refusal before any query (also with `number` present), due ids from `dueOrderCondition`, flags
- [x] Replace `searchOrders` (its tests moved); `getOrderPerson` stays until task 6 replaces it with `getOrderDetail`
- [x] Integration tests: E1, E3, E3a, E4, E6–E11, E12–E17, role gating
- [x] Agreement test E31 extended with the admin badge (in `orders-list.db.test.ts`)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. List page
- [x] `/admin/orders` page: GET filter form (labelled, works without JS), table with caption, pagination, "Clear filters", canonical redirects
- [x] `loading.tsx` skeleton, `error.tsx`, empty states (no orders / no match, zero results render page 1 without redirect)
- [x] Demo: customer field disabled with the read-only text; `?customer=` shows the refusal and runs no query
- [x] Render tests for Owner and Demo; `admin-pages` and `no-db-in-pages` tests stay green
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass
- [x] Run the page in a browser (redirects, Demo `?customer=` message, real rows): done by `e2e/admin-orders.spec.ts`, run locally against the Docker Postgres

## 6. Detail
- [x] `getOrderDetail(role, number, now)` with named selects (items as `OrderPageItem`, payments newest first incl. `OPENING`/`FAILED`, emails, event times, flags, due, amount to collect)
- [x] `/admin/orders/[number]` page: header, items by build, totals with voucher, amount to collect for cash orders, contact, address or pickup, timeline with deadline, payments, emails, flag callouts; no `loading.tsx` (the list, its `loading.tsx` and `error.tsx` moved into an `orders/(list)` route group so they do not wrap the detail) 
- [x] Malformed number 404s with no database read; unknown number 404s (E28)
- [x] Tests: E18–E21, E23, E26a; allow-list serialization test E22 with a fully populated order (token hash, idempotency key, cart hash, `PaymentEvent` payload, recipient hash)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass
- [x] Open the detail in a browser as Owner and Demo: done by `e2e/admin-orders.spec.ts`

## 7. Packing slip
- [x] `getPackingSlip(role, number)`: no price fields in the type, `orders.packing-slip` required
- [x] `/admin/orders/[number]/packing-slip` page: ship-to with mobile, item checklist by build, weight, payment line ("Collect payment" with no amount), "Do not ship" banner unless Processing
- [x] Print styles: shell nav and header hidden in print, no page break inside an item row; Print and Back buttons hidden in print
- [x] Tests: E24, E25, E26 (all 11 statuses), E27, no `₱` in the markup, E28
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass
- [x] Print preview of one slip in a browser: the e2e emulates print media and checks the buttons, sidebar and header are hidden (a human print preview stays on the preview-URL check)

## 8. Demo across all three pages
- [x] One shared fixture order with distinctive raw values
- [x] List, detail and slip rendered as Demo; spec 040's `expectNoRawValues` passes on each page's RSC payload (E30)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 9. E2E
- [x] `e2e/admin-orders.spec.ts`, Owner: filter by status and COD, search by number and by phone variants, open detail, open slip (mobile shown, no `₱`)
- [x] Demo: masked values, no customer field enabled, `?customer=` gives the read-only message
- [x] Each order has its own recipient; helpers write through the E2E database guard
- [x] `pnpm test:e2e` (admin project) passes

## 10. Documentation
- [x] CLAUDE.md: bullet for the admin orders screens, the shared due definition, "ready to pack", the query functions
- [x] Spec status line and "What changed while building"; spec 033 note about `due-sql.ts`
- [x] README only if it lists admin screens

## 11. Final checks and PR
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build`
- [x] `git push -u origin HEAD`, then the PR from `.github/pull-request-template.md` ([#132](https://github.com/romulojr-dev/pc-ecommerce/pull/132))
- [ ] Preview URL: every acceptance criterion at 1024 px and 1280 px, print preview of one slip
- [ ] I can explain what this story changed
