# 033 — Plan: Auto-cancel unpaid orders and release stock

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #81

Branch `81-auto-cancel-unpaid-orders-and-release-stock`. Commit after each task (subject-only Conventional messages, no attribution trailer).

## Context

Placement (spec 030) takes stock as a reservation, and nothing gives it back, so `ORDERS_ENABLED` stays off in Production. Spec 033 (approved with changes) releases Pending-payment orders past `expiresAt` in three steps:

- **Step 1, check.** No transaction. It cancels each open session at Xendit; a 422 goes to `reconcileSession`, and any failure skips the order.
- **Step 2, release.** A transaction with `SKIP LOCKED`: a conditional cancel, Payments to Expired, and stock back from the reservation movements.
- **Step 3.** `revalidateTag`, then the logs.

It runs inside the four purchases, after five pages or routes through `after()`, and from a daily cron. The order page shows Pending past `expiresAt` as cancelled.

## Reuse

- [lib/payments/reconcile.ts](../../../lib/payments/reconcile.ts) `reconcileSession(id, { gateway, environment, now })`, called as is. It logs its own `payment.reconcile` line.
- [lib/cart/tx.ts](../../../lib/cart/tx.ts): `lockCart`, `touch`, `Tx`, `logFailure`. [lib/orders/log.ts](../../../lib/orders/log.ts): `logSafeFailure`. [lib/orders/time.ts](../../../lib/orders/time.ts): `isPastDue`.
- [lib/payments/events.ts](../../../lib/payments/events.ts) `callbackTokenMatches`. Its body moves to `lib/secrets/compare.ts` as `secretMatches(given, expected)`, used by both the webhook and the cron.
- [lib/payments/gateway.ts](../../../lib/payments/gateway.ts): `gateway()`, `paymentEnvironment()`. [lib/payments/fake.ts](../../../lib/payments/fake.ts): `fakeGateway({ fail, now })`, `completeFakeSession`, `expireFakeSession`.
- Tests: [test-support/db.ts](../../../test-support/db.ts) `resetCatalog`, [test-support/orders.ts](../../../test-support/orders.ts) `orderData`, [test-support/payments.ts](../../../test-support/payments.ts), and H17's gateway spy in [lib/payments/reconcile.db.test.ts](../../../lib/payments/reconcile.db.test.ts).
- E2E: `withPool` from [e2e/stock.ts](../../../e2e/stock.ts) for the new `e2e/orders.ts`.

## Step 1 — Schema (one migration, `pnpm db:migrate --create-only --name release_orders`)

[prisma/schema.prisma](../../../prisma/schema.prisma):
- `Order`: `cancelledAt DateTime?`, `cancelReason OrderCancelReason?`, and `enum OrderCancelReason { EXPIRED }`, with comments.
- `StockMovementReason` gains `ORDER_RELEASED`.
- `@@index([expiresAt], where: { status: "PENDING_PAYMENT" })` on `Order`, through the `partialIndexes` preview feature already on. If Prisma rejects `where` on `@@index`, write the index as raw SQL in the migration and note that `db:drift` doesn't compare it.
- Hand-added to migration.sql (migration-only CHECKs, as in `20261101124501_payment_webhooks`):
  - `Order_cancelled_check`: `status <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL)`
  - `Order_pending_not_cancelled_check`: `status <> 'PENDING_PAYMENT' OR "cancelledAt" IS NULL`
- No new table, so the reset lists stay as they are.
- Integration: extend `lib/orders/schema.db.test.ts` with both CHECKs and the index's existence (`pg_indexes`). Run `pnpm db:drift`.

## Step 2 — Gateway: `closeSession` tells "cancelled" from "not active"

- [lib/payments/gateway-types.ts](../../../lib/payments/gateway-types.ts): `CloseOutcome = "cancelled" | "not-active"`, with a comment.
- [lib/payments/xendit.ts](../../../lib/payments/xendit.ts) `closeSession`: 2xx → `cancelled`; `http-422…` → `not-active` (drop the session read inside); other failures unchanged. Update the recorded cases in `xendit.test.ts`.
- [lib/payments/fake.ts](../../../lib/payments/fake.ts) `closeSession`: ACTIVE → CANCELED and `cancelled`; any other status → `not-active`. `FakeOptions.fail` gains an optional `code` (default `http-500`, `timeout` for S9) and `delayMs` (S9a: wait before answering).
- [lib/payments/start-payment.ts](../../../lib/payments/start-payment.ts): on `not-active`, call `gw.getSession(ref)`. `completed` → refuse `confirming`. `expired` or `closed` → mark the row EXPIRED and go on. Failure or unknown → `error`. Behavior is the same as today. `start-payment.db.test.ts` must pass unchanged. Its gateway calls inside the transaction stay until #88.
- Reconcile's close-after-paid loop ignores the outcome, so it doesn't change.

## Step 3 — Pure pieces (unit, test-first)

`lib/orders/release-rules.ts` (no database imports):
- `isDue({ status, expiresAt, flagged }, now)`: E1–E6.
- `SessionCheck = { kind: "cancelled" } | { kind: "reconciled", outcome: ReconcileOutcome } | { kind: "failed", code }`.
- `releaseDecision(checks: SessionCheck[]) → { release: true } | { release: false, code }`: D1–D9.
  - Releasable outcomes: `expired`, `already-applied`.
  - Not released: `paid`, `mismatch`.
  - Everything else skips, with that code.
- Constants:
  - `PURCHASE_GATEWAY_TIMEOUT_MS = 2_500`, `PURCHASE_BUDGET_MS = 3_000`
  - `SCOPED_LIMIT = 10`, `SWEEP_LIMIT = 10`
  - `CRON_BATCH = 25`, `CRON_BUDGET_MS = 50_000`

[lib/orders/log.ts](../../../lib/orders/log.ts) `logReleaseEvent({ outcome: "released" | "skipped", orderNumber, via, code? })` is one JSON line with `event: "order.release"`, written to `console.info` (`console.error` for gateway failures). `logCronEvent({ released, skipped } | { outcome: "unauthorized" })` writes `event: "order.release.cron"`. Unit tests check the line shapes, with a spy on every console method so nothing secret is logged.

`lib/secrets/compare.ts` `secretMatches`; `callbackTokenMatches` calls it. `bearerOf(header)` returns the token only for exactly `Bearer <token>`. Unit tests cover T1–T3's header cases.

## Step 4 — Release core (`lib/orders/release.ts`, server only)

- `timedGateway(gw, ms)`: wraps each method in `Promise.race` with a timer that answers `{ ok: false, code: "timeout" }`, so the purchase stops waiting whatever the adapter does. `purchaseGateway()` = `timedGateway(gateway(), PURCHASE_GATEWAY_TIMEOUT_MS)`.
- `checkExpiredOrders({ now, productIds?, limit, exclude?, gateway, environment?, purchase? })`:
  - One `$queryRaw` over `Order`: `status = 'PENDING_PAYMENT' AND "expiresAt" <= now AND NOT EXISTS (Payment with problem)`, plus `AND EXISTS (OrderItem with productId = ANY(ids))` when scoped and `AND id <> ALL(exclude)`, `ORDER BY "expiresAt", id LIMIT n`.
  - A second query for their PENDING payments' `providerRef`s.
  - Per order, per session: `closeSession`. `cancelled` → ok. `not-active` → `reconcileSession(ref, { gateway, environment, now })`. Failure → stop the order.
  - In purchase mode: the first failure ends the loop, and no call starts after `PURCHASE_BUDGET_MS`; the rest are skipped with `budget`.
  - Returns `{ cleared: { id, orderNumber }[], skipped: { orderNumber, code }[] }`.
- `releaseExpiredOrders(tx, { now, orderIds })`:
  1. `SELECT id, "orderNumber" FROM "Order" WHERE id = ANY($ids) AND status = 'PENDING_PAYMENT' AND "expiresAt" <= $now AND NOT EXISTS (…problem…) ORDER BY id FOR UPDATE SKIP LOCKED`.
  2. `updateMany` those orders to CANCELLED, `cancelledAt`, `cancelReason: EXPIRED`.
  3. `payment.updateMany({ orderId in, status: PENDING } → EXPIRED)`.
  4. `stockMovement.groupBy` the `ORDER_RESERVED` movements by order and product, sum per product across orders, and run one `UPDATE "Product" SET "stock" = "stock" + $n, "updatedAt" = now() WHERE id = $id` per product in id order.
  5. `stockMovement.createMany` the `ORDER_RELEASED` rows, `+n` per order and product. An order with no reservation gets code `no-reservation`.
  6. Returns `{ released, notLocked: cleared ids not selected }`.
- `afterRelease({ released, skipped }, { via })`: when anything was released, `revalidateTag(PRODUCTS_TAG, "max")` in try/catch (`logSafeFailure`); then `logReleaseEvent` per order (`notLocked` → `skipped` code `locked`). Never throws.
- `sweepExpiredOrders(now, { limit, exclude, gateway, environment, via })`: check; when anything is cleared, `db.$transaction(tx => releaseExpiredOrders(…), { maxWait: 5_000, timeout: 10_000 })`; then `afterRelease`. Returns `{ released, skipped, tried }`. The whole body is in try/catch with `logSafeFailure`.
- Integration, `lib/orders/release.db.test.ts`:
  - R1–R14.
  - G1–G5. For G, call `checkExpiredOrders`, act (complete the fake row directly; run `handlePaymentEvent` / `reconcileSession`; hold a lock with reconcile's `afterStep`), then `db.$transaction(tx => releaseExpiredOrders(tx, …))`.
  - S8's spy for the release's own paths.
  - Every test uses `fakeGateway({ now })` and an explicit `now`.

## Step 5 — Scoped release in the purchases

The same pattern in each: options gain `now?: Date` and `gateway?: PaymentGateway` (default `purchaseGateway()`).
- **Before the transaction:** `const check = await safeCheck({ now, productIds, … purchase: true })`. Errors are caught, logged, and treated as `{ cleared: [] }`.
- **In the transaction**, right after the cart lock: `const released = check.cleared.length ? await releaseExpiredOrders(tx, …) : none`.
- **After the commit:** `afterRelease`. On a refusal or rollback, only the `skipped` logs are written.

Per purchase:
- [lib/cart/cart.ts](../../../lib/cart/cart.ts):
  - `addToCart`: scope `[productId]`. Step 2 after `lockCart` when the cart exists, otherwise first.
  - `setCartQuantity`: read `cartItem.findFirst({ id: lineId, cartId, buildId: null }, select productId)` before the transaction. No row → skip the release.
- [lib/cart/build.ts](../../../lib/cart/build.ts) `addBuildToCart`: scope = the items' product ids. Step 1 after the pre-transaction checks (`unavailableParts`, `checkBuild`): an add refused before the transaction never calls the gateway. The parts check reads stock outside the transaction, so a part held only by an expired order fails as `unavailable` first. **Run step 1 before `unavailableParts`**, step 2 inside the transaction, and re-run the stock-based "not buyable" part of the check inside the transaction. Simpler alternative if that grows: `unavailableParts` ignores stock and the in-transaction `buildShortages` decides. Decide while coding, and keep `cart-build.db.test.ts` green.
- [lib/orders/place-order.ts](../../../lib/orders/place-order.ts): before the transaction, `db.cartItem.findMany({ cartId }, select productId, distinct)`. Step 2 after the replay check (step 2 of the existing flow), before `computeReview`. `afterRelease` after the commit, beside the existing `revalidateTag` (skip the duplicate revalidate when both ran).
- Integration, `lib/orders/release-purchases.db.test.ts`: S1–S9c and S8's spy over S1 and S4. Existing `cart.db.test.ts`, `cart-build.db.test.ts` and `place-order.db.test.ts` stay green; pass `now` where they assert timing.

## Step 6 — Sweep wiring (`after()` from `next/server`)

`const now = new Date()`, then `after(() => sweepExpiredOrders(now, { via: "sweep" }))`, placed after each page's `notFound()` / redirect checks:
- [app/(store)/[category]/[product]/page.tsx](../../../app/(store)/[category]/[product]/page.tsx), after `notFound` and `permanentRedirect`
- [app/(store)/cart/page.tsx](../../../app/(store)/cart/page.tsx), after `connection()`
- [app/(store)/checkout/page.tsx](../../../app/(store)/checkout/page.tsx), after the empty-cart redirect
- [app/(store)/orders/[number]/page.tsx](../../../app/(store)/orders/[number]/page.tsx), after `notFound`
- [app/api/builder/candidates/route.ts](../../../app/api/builder/candidates/route.ts), after the 400

Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` first (Server Components can't read request APIs inside the callback; ours reads none). There's no unit test for the wiring; X1 covers it.

## Step 7 — Cron route and config

- `app/api/cron/release-orders/route.ts`: `export const dynamic = "force-dynamic"`, `runtime = "nodejs"`, `maxDuration = 60`.
  - `GET`: `secretMatches(bearerOf(request.headers.get("authorization")), env.CRON_SECRET)`, else 401 with an empty body and `logCronEvent({ outcome: "unauthorized" })`.
  - Then a loop: `sweepExpiredOrders(now, { limit: CRON_BATCH, exclude: tried, via: "cron" })` until a batch is empty or `CRON_BUDGET_MS` has passed.
  - `Response.json({ released, skipped }, { headers: { "Cache-Control": "no-store" } })`; 500 when a batch's database step failed (the sweep reports it rather than throwing).
  - Check the route segment config docs in `node_modules/next/dist/docs/` for `maxDuration`, `dynamic` and `runtime` on Next 16.4 first.
- [vercel.json](../../../vercel.json): `"crons": [{ "path": "/api/cron/release-orders", "schedule": "0 16 * * *" }]`.
- [lib/env.ts](../../../lib/env.ts): `CRON_SECRET: z.string().min(16, "must be at least 16 characters").optional()` with a comment. Add it to `.env.example`, empty, with a comment.
- Tests:
  - `app/api/cron/release-orders/route.db.test.ts`: T1–T6, plus T7 as a module export check.
  - N1–N2 in the env schema test (follow `orders-enabled-schema.test.ts`'s pattern; extract the schema to `lib/orders/cron-secret-schema.ts` if needed).
  - N3: `vercel.test.ts` reads `vercel.json`.

## Step 8 — Order page display

- [lib/payments/payment-view.ts](../../../lib/payments/payment-view.ts): the `past-due` view becomes `expired`. Order: `needs-check` first (unchanged), then `status === PENDING_PAYMENT && isPastDue` → `expired`, then `status !== PENDING_PAYMENT` → `none`, and the rest unchanged.
- [lib/orders/get-order.ts](../../../lib/orders/get-order.ts) and [lib/orders/view.ts](../../../lib/orders/view.ts): select and expose `cancelReason`.
- [components/orders/order-view.tsx](../../../components/orders/order-view.tsx): `const expired = view === "expired" || order.cancelReason === "EXPIRED"`.
  - `orderTimeline` and `statusLabel` get `CANCELLED` when `expired`.
  - Under the timeline: `ORDER_COPY.cancelledExpired`, then the late-payment line when `refundRequired`.
  - `expired` renders no banner, no pay-by line and no panel.
- [lib/orders/copy.ts](../../../lib/orders/copy.ts): replace `pastDue` with `cancelledExpired`. [components/orders/payment-panel.tsx](../../../components/orders/payment-panel.tsx): drop `past-due` from the excluded views.
- Tests:
  - Update `payment-view.test.ts` (past-due cases → expired, V2–V2c, V5).
  - Update `order-view.test.tsx` (V1–V6; the old past-due text assertion goes).
  - Add P1–P2 to `start-payment.db.test.ts`.

## Step 9 — E2E

- `e2e/orders.ts`: `setExpiresAt(orderNumber, date)` through `withPool`. It reuses the production guard; not a spec.
- `e2e/release.spec.ts`: X1 and X2, with the part from `place-order.spec.ts` and a known stock set and restored in `finally` (as in that spec). Requires `ORDERS_ENABLED=true` (already in CI and `.env.local`).

## Step 10 — Docs close-out

- CLAUDE.md: a "Releasing unpaid orders" paragraph covering:
  - cancel first, then the two steps;
  - the purchases' 2.5 s and 3 s limits;
  - the sweep pages and the cron with `CRON_SECRET`;
  - the order page's `expired` view.

  Also remove "until #81" wording where it's now wrong (`ORDERS_ENABLED`, `StockMovementReason`).
- `docs/setup/payments.md`: the cron checklist as built (Fluid compute on, `maxDuration` 60, the Hobby limits with a link, a hand run with `curl`); `ORDERS_ENABLED` Production stays "after #81 is deployed".
- Spec 030: V11 / past-due copy marked *Changed by spec 033*. Spec 032: §8 note narrowed (D2). ADR 0009: "Released by spec 033".
- Spec 033: status Implemented, with a "Changed while building" list.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- `pnpm test:db:up`, then `pnpm test:db:migrate` and `pnpm test:db` with an inline `TEST_DATABASE_URL` pointing at the Docker Postgres (nothing added to `.env.local`).
- `pnpm db:migrate` on the dev branch, then `SHADOW_DATABASE_URL=… pnpm db:drift`.
- `pnpm test:e2e` against `pnpm dev` (needs `PRODUCTION_DATABASE_HOST` in `.env.local`, as the stock helper already does).
- Manual, local:
  1. Place an order.
  2. Run `UPDATE "Order" SET "expiresAt" = now() - interval '1 minute' WHERE "orderNumber" = '…'`.
  3. The order page shows Cancelled with the new copy and no Pay now.
  4. A product page loaded twice shows the stock back.
  5. `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/release-orders` answers 200 JSON; without the header it answers 401.
- After merge and deploy: Fluid compute is on, and the cron is listed under Project → Settings → Cron Jobs; a hand run answers 200; then set `ORDERS_ENABLED=true` in Production and redeploy.
