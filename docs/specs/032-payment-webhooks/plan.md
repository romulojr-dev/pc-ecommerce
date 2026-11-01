# 032 — Plan: Payment webhooks

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #80

Branch `80-payment-webhooks`. Commit after each task (subject-only Conventional messages, no attribution trailer).


## Context

Spec 031 (#79) opens Xendit payment sessions but nothing ever marks an order Paid: the fake page's Pay goes through `deliverPaymentEvent` (`lib/payments/events.ts`), which only logs. Spec 032 (approved with changes) adds the webhook route, one reusable `reconcileSession` (ask Xendit outside any transaction, then lock the order and apply), the Paid / late / second-payment / mismatch / expired states on the order page, and `pnpm webhook:replay`. The epic's done-when (E2E checkout → paid) depends on it. The PRD (FR-22), issue #80 and the #81 note are already updated.

## Step 0 — Confirm Q3 with `pnpm payments:check` (needs the owner)

- Extend [scripts/xendit-check.ts](scripts/xendit-check.ts) with `--read <ps-…>`: `GET /sessions/{id}` then, if it has `payment_id`, `GET /v3/payments/{payment_id}` (`api-version` header as in `xendit.ts`). Print only: session `status`, whether `payment_id` / `payment_request_id` are present and their prefixes, payment HTTP status, `status`, `channel_code`, `request_amount`, `currency`. Never the key or whole bodies.
- Owner runs `pnpm payments:check --keep`, pays the printed link with test card 4000 0000 0000 1000, then `pnpm payments:check --read ps-…`. If `/v3/payments/{payment_id}` doesn't answer, switch `getPayment` to the id that works (adapter-only change). Record the result in `docs/setup/payments.md` "Confirmed in test mode".

## Step 1 — Schema (one migration, `pnpm db:migrate --name payment_webhooks`)

[prisma/schema.prisma](prisma/schema.prisma):
- `Order`: `paidAt DateTime?`, `paymentMethod String?`, `refundRequired Boolean @default(false)`.
- `Payment`: `paidAt DateTime?`, `gatewayPaymentId String?`, `receivedAmount Int?`, `receivedCurrency String?`, `problem PaymentProblem?`, `events PaymentEvent[]`. Update the enum comments (PAID set by #80; FAILED unused, spec 032 D3).
- `enum PaymentProblem { AMOUNT_MISMATCH LATE SECOND_PAYMENT }`.
- `model PaymentEvent { id cuid, eventId String @unique, type String, payload Json, paymentId String? → Payment (Restrict), receivedAt DateTime @default(now()), @@index([paymentId]) }`.
- Hand-added to migration.sql (migration-only CHECKs, as in `20261101025707_payments`): `Order_paidAt_check` (`status <> 'PENDING_PAYMENT' OR "paidAt" IS NULL`), `Payment_paid_check` (`("status" = 'PAID') = ("paidAt" IS NOT NULL)`), `Payment_receivedAmount_check` (`"receivedAmount" IS NULL OR "receivedAmount" > 0`).
- Add `"PaymentEvent"` to the TRUNCATE lists in [test-support/db.ts](test-support/db.ts) `resetCatalog()` and [prisma/seed/write.ts:66](prisma/seed/write.ts#L66), with the comment line.
- Integration: extend `lib/payments/schema.db.test.ts` (CHECKs, `eventId` unique) and `test-support/reset-catalog.db.test.ts`.

## Step 2 — Gateway interface tweak

- [lib/payments/gateway-types.ts](lib/payments/gateway-types.ts): `SessionDetails` gains `referenceId: string`, `expiresAt: Date | null` (for an orphan's `Payment`).
- [lib/payments/xendit.ts](lib/payments/xendit.ts): `sessionSchema` adds `reference_id`; `toSession` maps both. Update `xendit.test.ts` recorded JSON.
- [lib/payments/fake.ts](lib/payments/fake.ts) `details()`: add `referenceId`, `expiresAt` from the row. Add a test seam to `FakeOptions`: `paymentStatus?: "succeeded" | "failed" | "pending"` (H12c) — `getPayment` currently always says succeeded.

## Step 3 — Pure pieces (unit, test-first)

- `lib/payments/webhook.ts`: `parseWebhook(body)` → `{ kind: "event", type: "completed"|"expired", sessionId, eventId, eventName } | { kind: "ignored-type", eventName } | { kind: "ignored-unknown", eventName } | { kind: "malformed" }` (B1–B6); `MAX_WEBHOOK_BYTES = 64 * 1024`; `SESSION_ID = /^ps-[0-9a-f]{24}$/` (move the one in `fake-page.ts` here and import it). `webhookStatus(outcome)` → HTTP code (behavior 18 table).
- `lib/payments/outcome.ts`: `completedOutcome(orderStatus, amountsMatch)` → `paid | mismatch | late | second`; `expiredOutcome(paymentStatus)` → `expired | already-applied`; `amountsMatch({ session, payment, row, orderTotal })`. Tests cover every `OrderStatusName`.
- `lib/payments/log.ts`: `logPaymentEvent(fields: { event: "payment.webhook" | "payment.reconcile"; outcome; type?; sessionId?; orderNumber?; code? })` → one `console.info` (`console.error` for `retry`/`error`) of `JSON.stringify` with only those keys. `L1–L9` in `log.test.ts` with a spy on every console method.
- [lib/payments/payment-view.ts](lib/payments/payment-view.ts): `paymentView(status, expiresAt, param, now, { latestPayment, needsCheck })`; new view `"needs-check"` returned first for PENDING_PAYMENT or CANCELLED when `needsCheck`; `latestPayment === "expired"` and `param === null` → `"cancelled"` (after the too-late check). Extend `payment-view.test.ts` with V14–V16e.
- [lib/payments/copy.ts](lib/payments/copy.ts): `needsCheck`, `latePayment`, `secondPayment` strings; `methodName(code)` and `paidLine(paidAt, method)` using `dateTimeText` from [lib/orders/time.ts](lib/orders/time.ts) (V10–V11).

## Step 4 — `reconcileSession` (`lib/payments/reconcile.ts`, server only)

```
reconcileSession(sessionId, { event?, gateway?, environment?, now?, afterStep? }) → { outcome, orderNumber?, code? }
```
- **Phase 1 (no transaction):** `gw.getSession` → `retry` / `ignored-unknown` / `ignored-environment` (`code` = session's environment); `db.order.findUnique({ id: metadata.order_id })` and compare `orderNumber` → `ignored-unknown` (`code: "unknown-order"`); status `active` → `active`; `completed` → need `paymentId` (else `not-yet`), `gw.getPayment` → `retry` / `not-yet` (null or pending) / `unconfirmed` (failed) / continue.
- **Phase 2:** `db.$transaction(async tx => …)`, same `{ maxWait, timeout }` style as `start-payment.ts` but short (no HTTP inside):
  1. `SELECT … FROM "Order" WHERE id = $1 FOR UPDATE` (pattern from [start-payment.ts](lib/payments/start-payment.ts)).
  2. Find `Payment` by `provider_providerRef`. Completed + none → insert from the session directly as PAID (orphan).
  3. With `event`: `INSERT INTO "PaymentEvent" (...) VALUES (...) ON CONFLICT ("eventId") DO NOTHING RETURNING "id"`; empty → return `duplicate` (never catch P2002 in a transaction — project rule).
  4. Completed: if row already PAID → `already-applied`; else `completedOutcome`, then update Payment (PAID, paidAt, gatewayPaymentId, method, received*, problem) and, for `paid`, Order (PAID, paidAt, paymentMethod) and other PENDING payments → EXPIRED (collect their `providerRef`s); for `late`/`second`, `Order.refundRequired = true`.
  5. Expired: PENDING → EXPIRED else `already-applied`.
- **After commit:** `closeSession` for collected refs (best effort; `logGatewayFailure("payment.close_after_paid", code)`).
- Database errors → `logSafeFailure("Reconcile payment", error)`, `error`. Logs the result through `logPaymentEvent` (`payment.reconcile` when no event; the route logs `payment.webhook`, so reconcile takes a `logAs` from the caller to emit exactly one line).
- `afterStep` seam: `"tx-open"` (first statement in the callback), `"event"` (after the insert, for H14's forced failure), `"tx-closed"` (after `$transaction` resolves). H17's spy gateway throws if called between `tx-open` and `tx-closed`.
- `revalidateTag` not needed (stock unchanged).

## Step 5 — Handler, route, fake

- [lib/payments/events.ts](lib/payments/events.ts): `handlePaymentEvent({ headers, body }, options)` (async) replaces `deliverPaymentEvent`. Order: token (`callbackTokenMatches`, headers read case-insensitively; a `Headers` object or a record) → 401; byte length > 64 KB → 413; `parseWebhook` → 400 / 200 ignored; `reconcileSession(sessionId, { event, … })`; returns `{ status: webhookStatus(outcome), outcome }`; one `logPaymentEvent` line per call. Update `events.test.ts` (K1–K7) and keep the unit side free of the database by injecting `reconcile` in options.
- `app/api/webhooks/xendit/route.ts`: `export async function POST(request)`; `export const dynamic = "force-dynamic"` only if the Next 16 docs still want it for POST handlers (check `node_modules/next/dist/docs/` route handler page first); read `await request.text()` after checking `content-length` when present; pass `request.headers`; `return new Response(null, { status })`. Non-POST methods get Next's own 405.
- [lib/payments/fake-page.ts](lib/payments/fake-page.ts): `send` becomes `await handlePaymentEvent(...)` (after the fake session's write, outside any transaction); non-200 answers are logged, redirect unchanged (behavior 26).
- [lib/env.ts](lib/env.ts) / [lib/payments/env-schema.ts](lib/payments/env-schema.ts): require `XENDIT_WEBHOOK_TOKEN` for both gateways (E8, E9); update comments; `.env.example` comment.

## Step 6 — Order page and Pay now

- [lib/orders/view.ts](lib/orders/view.ts) `OrderPageData` gains `paidAt`, `paymentMethod`, `refundRequired`, `payments: { latest: "pending"|"expired"|"paid"|null; needsCheck: boolean }`; [lib/orders/get-order.ts](lib/orders/get-order.ts) `getOrderForPage` selects them (one extra `payments` include ordered by `createdAt desc`, selecting `status`, `problem`).
- [app/(store)/orders/[number]/page.tsx](app/(store)/orders/[number]/page.tsx): pass the new inputs to `paymentView`.
- [components/orders/order-view.tsx](components/orders/order-view.tsx): Paid line under the timeline when `paidAt`; refund line (late text for CANCELLED/REFUNDED, second-payment text otherwise) when `refundRequired`; `"needs-check"` renders only the message (no banner, no Pay by, no panel). Extend `order-view.test.tsx` markup tests.
- [lib/payments/start-payment.ts](lib/payments/start-payment.ts): after the lock, refuse `needs-check` if a payment of the order has `problem = AMOUNT_MISMATCH` (before any gateway call); add the reason to `StartResult`. [components/orders/payment-panel.tsx](components/orders/payment-panel.tsx): `needs-check` → `router.refresh()`. S9 in `start-payment.db.test.ts`.

## Step 7 — Replay script

- `scripts/webhook-replay-args.ts` (pure `parseReplayArgs(argv)`, W1–W4) + `.test.ts`; `scripts/webhook-replay.ts` (dotenv `.env.local` like `xendit-check.ts`, W5, builds the body, `fetch` with `x-callback-token`, prints `{status} {statusText}`). `package.json`: `"webhook:replay": "tsx scripts/webhook-replay.ts"`.

## Step 8 — Integration tests (`lib/payments/reconcile.db.test.ts`, `app/api/webhooks/xendit/route.db.test.ts`)

Following `start-payment.db.test.ts` (`resetCatalog`, `orderData`, `paymentData`, `fakeGateway({ now })`, sessions created via `startPayment` + `completeFakeSession` / `expireFakeSession`): H1–H17, C1–C6; the route file covers H1 and H16 through a real `Request`, plus the log line assertions for H7/H7a/H7b/H8. Update `fake-page.db.test.ts` F2 (Pay now leaves the order Paid) and add Let it expire → Payment Expired.

## Step 9 — E2E

- [e2e/place-order.spec.ts](e2e/place-order.spec.ts): X4 becomes X5 (Pay → timeline current step "Paid", "Paid on … with the test payment page.", no banner, no Pay now); add X6 (Let it expire → Retry, still after reload without `payment=`), X7 (Retry → Pay → Paid).
- X8: `e2e/payments.ts` helper `setFakeSessionAmount(sessionId, centavos)` reusing `withPool` (export it from [e2e/stock.ts](e2e/stock.ts)); place → read session id from the URL → set amount 1 centavo lower → Pay → "We received a payment that needs checking…", no Pay now / Retry.

## Step 10 — Docs

- `docs/setup/payments.md`: token required with both gateways; "Replaying a webhook locally"; Q3 result; post-deploy check (Q2).
- CLAUDE.md Paying paragraph: `reconcileSession` (the only writer of Paid; gateway calls never inside a transaction), derived event id, ignored events log but write no `PaymentEvent`, `webhook:replay` in Commands, `PaymentEvent` in the reset list sentence.
- PRD data model (`Payment` without `rawEvent`, plus `paidAt`/`problem`; `PaymentEvent.eventId` derived; `Order.paidAt`). Spec 032 status → Implemented at the end, with "Changed while building" notes for anything that moved.

## Verification

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit: K, B, L, V, W, E, outcome tables).
2. `pnpm test:db:up`, then `pnpm test:db` with the inline `TEST_DATABASE_URL` (Docker Postgres): H1–H17, C1–C6, S9, schema, reset.
3. `pnpm db:drift` against an empty shadow database.
4. `pnpm test:e2e` locally (`PAYMENT_GATEWAY=fake`, `ORDERS_ENABLED=true`): X5–X8 plus the existing payment specs.
5. Manual: `pnpm dev`, place an order, Pay on the fake page → Paid; `pnpm webhook:replay <that ps-…>` → `200` (duplicate); `--url https://example.com` refused.
6. After merge (Production): a test-card payment reaches Paid through the real webhook; a local session's webhook shows `ignored-environment` in Vercel logs (Q2 check).

Commit as one task commit on a branch (`git push -u origin HEAD`, PR body from the repo template) per the git workflow memory.
