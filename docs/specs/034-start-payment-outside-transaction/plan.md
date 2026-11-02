# 034 — Plan: Start a payment with no gateway call inside a transaction

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #88

Branch `88-startpayment-no-xendit-calls-inside-the-transaction`, from `main` (#81 merged as PR #90). Commit after each task (subject-only Conventional messages, no attribution trailer).

## Context

`startPayment` ([lib/payments/start-payment.ts](../../../lib/payments/start-payment.ts)) locks the order and calls Xendit up to three times inside one 25 s transaction. Spec 034 (approved with changes, 2026-11-02) splits it into:

- **Claim:** a short transaction that locks the order, reads the database's `now()`, runs today's checks and records an **Opening** `Payment`.
- **Gateway calls**, with no transaction open: close the old session, then create the new one.
- **Settle:** a short transaction that either attaches the session (Pending) or marks the attempt **Failed**, and expires the old payment once its session is closed.

A second start while an attempt is opening answers `opening`. The page, and the checkout after a replayed Place order, wait and ask again: every 1 s, for 30 s at most. An Opening attempt is abandoned once it is 60 s old by the database clock.

## Reuse

- [lib/payments/payable.ts](../../../lib/payments/payable.ts) `canStartSession`; [lib/payments/session-request.ts](../../../lib/payments/session-request.ts) `sessionRequest`, unchanged.
- [lib/payments/log.ts](../../../lib/payments/log.ts) `logGatewayFailure`, `logOrphanedSession`; [lib/orders/log.ts](../../../lib/orders/log.ts) `logSafeFailure`.
- [lib/payments/fake.ts](../../../lib/payments/fake.ts) `fakeGateway({ fail, closeDelayMs, now })`. The existing `fail.code` seam gives B7a's timeout code.
- [test-support/release.ts](../../../test-support/release.ts) `guardTransactions`, `heldOrder`, `openSession`; [test-support/payments.ts](../../../test-support/payments.ts); [test-support/db.ts](../../../test-support/db.ts) `resetCatalog`.
- [lib/orders/release.ts](../../../lib/orders/release.ts) `releaseExpiredOrders`, with one more `updateMany`.
- Order page summary in [lib/orders/get-order.ts](../../../lib/orders/get-order.ts) (`LATEST`, `payments` include).
- [lib/payments/xendit.ts](../../../lib/payments/xendit.ts) `XENDIT_TIMEOUT_MS` (6,000) for the U5 budget test.

## Step 1 — Schema (two migrations)

Postgres can't use a new enum value in the transaction that adds it (`unsafe use of new value`), and the index and CHECK both name `OPENING`. So the enum value goes in its own migration:

1. `pnpm db:migrate --create-only --name payment_opening_status`: `ALTER TYPE "PaymentStatus" ADD VALUE 'OPENING';` only.
2. `pnpm db:migrate --create-only --name payment_attempts`:
   - `Payment.providerRef` nullable (`String?`), with its comment updated ("null while Opening and on Failed attempts").
   - `@@unique([orderId], where: { status: "OPENING" })` beside the Pending one, named in a comment ("at most one start in flight", spec 034). Check the generated name doesn't clash with `Payment_orderId_key`. If it does, give both a `map:` and rename the old one in SQL. Run `db:drift` either way.
   - Hand-added CHECK `Payment_attempt_session_check`: `("providerRef" IS NULL) = ("status" IN ('OPENING', 'FAILED'))`, under the usual "Prisma can't express CHECKs" comment.
3. `PaymentStatus` in the schema gains `OPENING` with a comment (an attempt recorded before its session exists).
4. `lib/payments/schema.db.test.ts`: B20, i.e. a second Opening for an order fails, Opening with a ref fails, Pending without a ref fails, Opening plus Pending succeeds. Run `pnpm test:db:migrate` and `pnpm db:drift`.

**Type fallout from the nullable `providerRef`** (fix in the same task so typecheck passes):
- `reconcile.ts` `toClose` and `release.ts` step 1 filter on `status: "PENDING"`, so the values are non-null at runtime but typed `string | null`. Add `providerRef: { not: null }` to those `where`s and narrow, rather than using `!`.
- `reconcile.ts` `findUnique({ provider_providerRef })` takes a string (`session.id`), so it is unchanged. Confirm that Prisma 7 still offers the compound unique input with a nullable column, and fall back to `findFirst` if it doesn't.
- `get-order.ts` `LATEST` needs an `OPENING` key or the filter in Step 3. Do the filter there and keep the map exhaustive by type.

## Step 2 — Pure pieces (unit, test-first)

`lib/payments/attempt.ts` (no database imports):
- `OPENING_ABANDONED_AFTER_MS = 60_000`.
- `attemptState({ status, createdAt }, dbNow)`, which answers `opening` | `abandoned` | `pending` | `paid` | `expired` | `failed` (U1–U4). Opening with `dbNow - createdAt >= 60_000` is abandoned, and a future `createdAt` is `opening`.
- `START_PATH_BUDGET_MS`: claim `maxWait` 5,000 + 3 × `XENDIT_TIMEOUT_MS` + attach `maxWait` 5,000. U5 asserts it is at most half of `OPENING_ABANDONED_AFTER_MS`.

`lib/payments/wait-for-session.ts` (client-safe, no server imports):
- `OPENING_RETRY_MS = 1_000`, `OPENING_WAIT_MS = 30_000`.
- `waitForSession(start, { skipFirst?, sleep?, now? })`: calls `start()` (skipped when `skipFirst`, for checkout after the place action already answered `opening`) until the answer isn't `opening` or the wait has run 30 s since the call began. It then answers that last result, or `{ ok: false, reason: "error" }`. `sleep` and `now` are injectable for fake timers (W1–W3 logic). A thrown `start()` counts as `error` and stops, matching `PaymentPanel` today.

`lib/payments/pay-link.ts`: `linkAfterStart(link, result)` is the rule `placeOrderAction` uses today (`error` / `expired` → `&payment=error`, other refusals → the plain link). It moves out of the action so the checkout's wait can use it too.

## Step 3 — Order page summary skips sessionless attempts

`get-order.ts`: the `payments` include filters `providerRef: { not: null }` for `latest` (U6–U8). `needsCheck` must still see every payment: a mismatched one always has a ref, but take `needsCheck` from a separate `some` or from the unfiltered list, so the filter can never hide it. Unit tests for the summary mapping, and the `paymentView` tests stay green.

## Step 4 — `startPayment` in three steps

Rewrite [lib/payments/start-payment.ts](../../../lib/payments/start-payment.ts), same signature:
- `StartResult` refusals gain `"opening"`. `StartStep = "claim" | "close" | "create" | "attach"`. `afterStep` runs inside the transaction for `claim` and `attach`, outside for `close` and `create`.
- **Claim** (`db.$transaction`, Prisma defaults):
  - The lock query is `SELECT …, now() AS "dbNow" FROM "Order" WHERE "id" = … FOR UPDATE`.
  - Checks in today's order: `not-found`, `not-pending`, `expired`, `needs-check`.
  - The Opening attempt, if any, goes through `attemptState`. Fresh → refuse `opening`. Abandoned → `updateMany({ where: { id, status: "OPENING" }, data: { status: "FAILED" } })`.
  - Then the open Pending payment (`providerRef: { not: null }`) and `attempt = count + 1`, then `sessionRequest`, refusing `expired` if it can't be built.
  - Insert the Opening row with `createdAt: dbNow` set explicitly, because Prisma fills `@default(now())` on the app side. Return `{ attemptId, open, request }`.
- **Gateway** (no transaction):
  - Close and read exactly as today's branch: `cancelled` → closed; `not-active` → `getSession`; `completed` → stop `confirming`; failure → stop `error`.
  - Then `createSession`. Any `ok: false`, the timeout included, stops with `error`; `logGatewayFailure` as today.
- **Settle** `settleAttempt({ attemptId, closedOldId, session? })`, one transaction:
  - Lock the order.
  - If `closedOldId`, `updateMany` old `PENDING` → `EXPIRED`. This comes first, because unique indexes are checked per statement.
  - With a session, the order `PENDING_PAYMENT` and `updateMany({ id, status: "OPENING" } → PENDING, providerRef, expiresAt })` count 1 → `attached`.
  - Otherwise `updateMany` OPENING → FAILED, answering `not-pending` when the order moved or `taken-over`.
  - Used for the attach and for *Finish as failed* (no session).
- **After settle:**
  - `attached` → `{ ok: true, url }`.
  - `not-pending` / `taken-over` with a session: `closeSession` best effort (log `payment.close` on failure) and `logOrphanedSession`. Answer `not-pending` or `error`.
  - A stop → its reason (`confirming` / `error`).
- **Settle throws** (behavior 5):
  - `logSafeFailure`, plus `logOrphanedSession` when a session exists.
  - One more `settleAttempt` with no session, in a try.
  - Then `closeSession` best effort when a session exists. Answer `error`.
- Delete `TRANSACTION` and the `Refusal` class if the claim can return refusals as values, which it can since the claim writes nothing on refusal.
- Rewrite the header comment: three steps, the rule, why `opening`.

Fake gateway seams in [lib/payments/fake.ts](../../../lib/payments/fake.ts):
- `holdCreate?: () => Promise<void>`, awaited before `createSession` answers. B3 holds only the first call, so the second claim surely sees Opening. B9 and B9a use it too.
- `fail.createLost?: boolean`: makes the session, then answers `{ ok: false, code: fail.code ?? "timeout" }` (B7a).

`guardTransactions` also guards `createSession`.

## Step 5 — Integration tests

Rewrite `lib/payments/start-payment.db.test.ts` with B1–B19 (B20 is in Step 1), every test with `guardTransactions`. Notes:
- Ages are written relative to the database clock: `UPDATE "Payment" SET "createdAt" = now() - interval '…'`. B11a sets the `now` option an hour ahead.
- B9 is a `FOR UPDATE NOWAIT` on a second connection (`db.$transaction`) while `holdCreate` is pending, and expects no 55P03.
- B9a and B12 build the orphan with the fake's `createSession` directly (no `Payment` row), then `completeFakeSession` and `reconcileSession`.
- B14 pauses in `afterStep("create")` on a promise, backdates, runs a second `startPayment`, then releases.
- B13 and B13a throw from `afterStep("attach")`, the first call only for B13 and every call for B13a.
- Log spy on every console method: only session ids and codes.

`app/(store)/orders/[number]/actions.db.test.ts` and `app/(store)/checkout/actions.db.test.ts` get `opening` pass-through cases. B19 goes into `lib/orders/release.db.test.ts` after Step 6.

## Step 6 — Release marks Opening attempts Failed

`releaseExpiredOrders` gets one more `updateMany({ where: { orderId: { in: ids }, status: "OPENING" }, data: { status: "FAILED" } })` beside the Pending → Expired one, with a comment citing spec 034 D10. Step 1 of the release is unchanged. Add B19 to `release.db.test.ts`.

## Step 7 — The page and the checkout wait

- [app/(store)/checkout/actions.ts](../../../app/(store)/checkout/actions.ts) `placeOrderAction`:
  - On `opening` → `{ ok: true, link, payUrl: null, paymentOpening: true, count: 0 }`. Otherwise `linkAfterStart`.
  - `PlaceActionResult` gains `paymentOpening?: true`.
- [components/orders/payment-panel.tsx](../../../components/orders/payment-panel.tsx) `pay()` calls `waitForSession(() => startPaymentAction({ orderNumber, key }))` and handles its result as today. The button stays busy throughout.
- [components/checkout/checkout-flow.tsx](../../../components/checkout/checkout-flow.tsx) `goToOrder(link, payUrl, paymentOpening)`:
  - While opening, keep "Placing your order…" busy.
  - Read the number and key from `link` (`new URL(link, location.origin)`), then `waitForSession(…, { skipFirst: true })`.
  - A URL → the existing `replaceState` + `assign`. Otherwise `router.replace(linkAfterStart(link, result))`.
  - [components/checkout/review-step.tsx](../../../components/checkout/review-step.tsx) passes the flag through `onPlaced`.
- Unit tests: `wait-for-session.test.ts` (W1–W3 with fake timers and a stub `start`), `pay-link.test.ts`. A `PaymentPanel` markup or behavior test where the existing ones allow, keeping the `order-view.test.tsx` stub's type in step.

## Step 8 — E2E

`e2e/payment-start.spec.ts` (W4): one context, two pages on the same order link (the key in the URL), click Pay now in both. Both land on `/test-payment/…`. The first page reloaded shows "This test payment is closed.", and the order has one Pending payment (read through `withPool`, as in `e2e/orders.ts`). Use the dedicated part and stock helpers as `place-order.spec.ts` does. Run the existing payment and checkout specs (W5) and fix only what this story broke.

## Step 9 — Docs close-out

- CLAUDE.md:
  - The Paying paragraph: the three steps, Opening / Failed, the two indexes, the database clock for age, `opening` and the waits, the accepted orphan.
  - Remove "spec 031's `startPayment` is the known exception until #88" (webhooks paragraph) and "`startPayment` still breaks this rule until #88" (*Working rules*).
- Spec 032: Q6 "resolved by spec 034 (#88)". Spec 033's mention of #88 in Out of scope gets the same note.
- [docs/setup/payments.md](../../setup/payments.md): check for lock or 25 s wording.
- Spec 034: a status line at the top (implemented), plus any "Changed while building" notes.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`.

## Risks

- **Enum value in a transaction:** handled by the two migrations. Check that `prisma migrate deploy` on CI's fresh database applies both in order.
- **Prisma compound unique with a nullable column** (`provider_providerRef`): verify in Step 1, with `findFirst` as the fallback.
- **B3 determinism:** without `holdCreate` the first start could finish before the second claim reads. The hold makes it certain.
- **`createdAt` from the app:** every Opening insert must pass `dbNow`. A test (B11a) fails if it doesn't.
- **Vercel function time:** a waiting page makes up to 30 short action calls, each a claim transaction and nothing else. Rate limiting stays #64.

## Verification

- Every B, U and W example passes at its level. `guardTransactions` is on in every `startPayment` integration test.
- `pnpm db:drift` is clean. `schema.db.test.ts` covers the CHECK and both indexes.
- On the preview URL: Pay now, Cancel then Retry, Let it expire then Retry, two tabs, and a checkout → paid run.
