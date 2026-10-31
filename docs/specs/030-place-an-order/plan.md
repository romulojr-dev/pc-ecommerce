# 030 — Plan: Place an order

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #78

Spec: `docs/specs/030-place-an-order/spec.md` (approved). Branch `78-place-an-order`. Commit after each task (subject-only Conventional messages, no attribution trailer); the first task also copies this plan into `docs/specs/030-place-an-order/plan.md` and `tasks.md`.

## Context

Checkout steps 1 and 2 exist (spec 029); Place order is a disabled button. This story creates the order: one transaction that locks the cart, re-runs the review's checks, compares the reviewed digest, reserves stock, writes the order with snapshots, empties the cart, and returns a private `/orders/{number}?key=` link. Placing is behind `ORDERS_ENABLED` (off in Production) because nothing releases stock until #81.

## What exists and gets reused

- `lockCart`, `touch`, `Tx` — `lib/cart/tx.ts`. Transaction style — `lib/cart/build.ts` (`db.$transaction`, `refused()` outcome).
- Review pipeline — `lib/checkout/review-checkout.ts` (`weightsOf`, `AGAIN`, `resolveAddress` + `normalizeAddress`), `review.ts` (`buildReview`, `CheckoutReview`), `problems.ts`, `input.ts` (`checkoutInputSchema`, `fieldErrors`), `draft.ts`, `copy.ts` (`STEP_COPY`).
- `getCartView` (`lib/cart/cart.ts`) → `loadGroups` (`lib/cart/groups.ts`) → `getBuilderParts`; `getShippingConfig`; `shippingFee`; `orderWeightGrams`.
- ID patterns — `lib/cart/id.ts` (`randomBytes(16).toString("base64url")`); ON CONFLICT pattern — `lib/build-snapshot.ts`; `manilaToday` — `lib/stock.ts`; `cartCountStore.fromAction`; `PRODUCTS_TAG` — `lib/home.ts`.
- UI — `ReviewStep` / `ReviewView` / `CheckoutFlow`, `CartLine`/`CartGroup` (read-only variants), `SLOT_COPY`, `formatPeso`, `addressLines`, `shippingValue`, `Container`, shadcn `Button`/`Input`/`Label`.
- Tests — `test-support/db.ts` (`resetCatalog`), `build-fixtures.ts`, `seed-parts.ts`, `review-checkout.db.test.ts` as the model; `e2e/stock.ts`, `e2e/checkout.spec.ts`.

## Design points that need care (found while planning)

1. **Pool deadlock.** `pg`'s default pool is 10 connections. A placement holds one in its transaction; if the review reads inside it use `db` they need a second, so 13 concurrent placements (P9) would starve. So `getCartView`, `loadGroups`, `getBuilderParts`, `getShippingConfig` and `weightsOf` get an optional `client` parameter (default `db`), and placement passes `tx`. No behavior change elsewhere.
2. **One review core.** Extract from `reviewCheckout` a function `computeReview(client, cartId, details)` (parse already done; returns ok `{review, address, store, config}` or `invalid`/`empty`). `reviewCheckout` and `placeOrder` both call it, so "what blocks the review blocks the order" holds by construction.
3. **Order insert** uses `tx.order.createManyAndReturn({ skipDuplicates: true })` (Prisma emits `ON CONFLICT DO NOTHING` with no target; returns only inserted rows). No row → read by `idempotencyKey`: found → roll back as `duplicate`; not found → number collision, retry (3 tries, then `error`). Never catch P2002. If it can't be made to behave, fall back to raw `INSERT … ON CONFLICT DO NOTHING RETURNING` as `build-snapshot.ts` does.
4. **Rollback on purpose** = throw a private `Refusal` class from inside the transaction callback; caught outside and mapped to `changed | duplicate | …`. Nothing is written on any refusal.
5. **Stock guard** is a raw conditional `UPDATE "Product" SET stock = stock - $q WHERE id = $id AND stock >= $q AND status = 'ACTIVE' RETURNING "effectivePrice"`, one per product in ascending id order; zero rows or a price different from the reviewed unit price → `changed`.
6. **Transaction options** `maxWait: 5_000, timeout: 15_000` (default 5 s is tight on Neon).
7. **`revalidateTag(PRODUCTS_TAG, "max")`** is called inside `placeOrder` after the transaction, in try/catch (log name+code only), so P29 can mock `next/cache`.
8. **Logging**: new `logPlaceFailure(step, error)` logs the step plus `error.name` and a string `code` only; never the message or object. `reviewCheckout`'s catch is cut down the same way.
9. **Server action** `placeOrderAction`: `ordersEnabled()` first → `{ok:false, reason:"disabled"}`; else `readCartId()` and forward; on `ok` return `{ link: "/orders/{n}?key={t}", count: 0 }`. `reviewCheckoutAction` adds `ordersEnabled` to ok results. The key/token are minted in `reviewCheckout` (read-only, still no writes).
10. **`ORDERS_ENABLED`** in `lib/env.ts`: `z.enum(["true","false"]).default("false").transform(v => v === "true")`; E2E/CI need it `true`, so add to `ci.yml` job env, `.env.example`, and (locally) the user's `.env.local` — **I must tell the user to add it; I won't edit `.env.local`**. Vitest db config env block gets it only if a test needs it (placeOrder itself is env-free).

## Tasks (one commit each)

1. **Docs scaffold** — copy this plan and a task list to `docs/specs/030-place-an-order/{plan,tasks}.md`.
2. **Switch** — `lib/env.ts`, `lib/orders/enabled.ts`, `.env.example`, `.github/workflows/ci.yml` env, `docs/setup/payments.md` (table row + "turn on after #81" checklist). Tests Z3, Z4, Z7.
3. **Pure primitives** (`lib/orders/`, Vitest) — `number.ts` (`newOrderNumber`, `orderNumberShape`, Crockford alphabet), `secrets.ts` (`newAccessToken`, `newIdempotencyKey`, `hashToken`, `tokenMatches` via `timingSafeEqual`, `hashCartId`, canonical `keyShape`/`tokenShape` that decode-and-re-encode), `time.ts` (`payByText`/`placedOnText` with a module-level `Intl.DateTimeFormat({timeZone:"Asia/Manila"})` assembled from `formatToParts`), `timeline.ts` (`orderTimeline`), `lib/checkout/digest.ts` (`reviewDigest`), `input.ts` (`placeOrderInputSchema`). Tests U1–U6, D2–D4, V10, V16–V16e (run under `TZ=UTC` and a non-UTC zone via `process.env.TZ` in a small child-free test using the formatter's explicit zone).
4. **Schema + migration** — models `Order`, `OrderItem` (with `position`), `StockMovement`, enums `OrderStatus`, `Fulfillment`, `StockMovementReason`; relations on `Product`/`Build`. `pnpm db:migrate --name place_order`, then hand-append: `CHECK (stock >= 0)`, Order CHECKs (amounts ≥ 0, `total = subtotal + shippingFee − discount`, address/zone present iff DELIVERY), OrderItem CHECKs (`quantity >= 1`, `(buildId IS NULL) = (slot IS NULL)`), partial uniques for OrderItem (`@@unique(… where: {buildId: null})` like `CartItem`), and the narrowed trigger (`DROP TRIGGER product_search_vector; CREATE TRIGGER … BEFORE INSERT OR UPDATE OF "name","sku","specs","brandId","categoryId"`). Add `"Order"`, `"StockMovement"` to the TRUNCATE lists in `test-support/db.ts` and `prisma/seed/write.ts`. Tests S1–S6, T1–T4 (`lib/orders/schema.db.test.ts`; search tests stay untouched). Run `pnpm db:drift`.
5. **Review changes** — thread `client` param; extract `computeReview`; `reviewCheckout` returns `digest`, `idempotencyKey`, `accessToken`, `holdHours`; action adds `ordersEnabled`; cut the log line. Update `review-checkout.db.test.ts`: D1, D5, D6, P36.
6. **`placeOrder`** — `lib/orders/place-order.ts` (+ `logPlaceFailure`), `placeOrderAction`. Steps exactly as spec Behavior 7–14: lock → replay (key + `cartIdHash`) → `computeReview(tx)` → problems/digest → stock guard → insert order (retry) → items (position, build/slot) → movements → delete cart items → `touch`. Tests `place-order.db.test.ts`: P1–P37 (real parallel `Promise.all` for P5, P7–P10, P27; injectable `newNumber` and a failing-step seam for P24–P26; spies for P35).
7. **Review UI** — `review-view.tsx`: enabled Place order when `ordersEnabled && canPlace`, hold sentence, busy state; `review-step.tsx`: submit with the stored key/token, same pair reused on retry, outcomes `changed` (notice + reload), `invalid`, `empty`, `disabled`, `duplicate`, `error`, network failure; on `ok`: clear `pc-silicon-checkout`, `cartCountStore.fromAction(0)`, `router.replace(link)`. Copy into `lib/checkout/copy.ts`. Markup tests Z1 and the button states.
8. **Order page** — `lib/orders/get-order.ts` (shape checks, one read, dummy-hash compare, store settings for pickup), `app/(store)/orders/[number]/page.tsx` (`connection()`, `noindex`, no canonical, `notFound()`), components in `components/orders/` (`OrderTimeline`, `OrderItems`, `OrderSummary`, `CopyLink` client), `next.config.ts` `headers()` for `/orders/:path*` (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`). Tests V1–V15 (DB for access/404 parity; markup for the view).
9. **E2E** — `e2e/place-order.spec.ts` X1–X7 using a part no other spec uses; known stock set first and restored in `finally` via `e2e/stock.ts`; needs `ORDERS_ENABLED=true` locally.
10. **Docs close-out** — CLAUDE.md orders paragraph and `--reset` line; "Changed by spec 030" notes on specs 029 (Behavior 19, 28, N11) ; ADR 0009 (placement protocol, safeguards, switch); README check; spec status → Implemented.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` (Docker Postgres via `pnpm test:db:up`, inline `TEST_DATABASE_URL`), `pnpm db:drift`, `pnpm build`, `pnpm test:e2e` (with `ORDERS_ENABLED=true`).
- Manual on `pnpm dev`: place an order for a Ryzen × 2 to QC, land on the order page, copy the link, open it in a private window, try a wrong key (404), confirm stock fell and the header count is 0; flip `ORDERS_ENABLED=false` and confirm "Placing orders is coming soon.".
- Preview: one delivery order (checks the `/checkout` tracing key); confirm Production has no `ORDERS_ENABLED`.

## Needs the user

- Add `ORDERS_ENABLED=true` to `.env.local` (I won't edit it) and to Vercel Preview; leave Production unset until #81.
- Docker Desktop for `pnpm test:db` (existing practice).
