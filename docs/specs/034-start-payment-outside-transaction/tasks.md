# 034 — Tasks: Start a payment with no gateway call inside a transaction

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md) · Issue: #88. One commit per task.

- [x] 1. **Docs scaffold.** Branch `88-startpayment-no-xendit-calls-inside-the-transaction` from an up-to-date `main`. Commit the spec, plan and tasks with the "Changed by spec 034" notes in spec 031 and ADR 0010.
- [x] 2. **Enum migration.** `payment_opening_status`: `ALTER TYPE "PaymentStatus" ADD VALUE 'OPENING'` only, and `OPENING` in `schema.prisma` with its comment.
- [x] 3. **Attempt migration.** `payment_attempts`:
  - `providerRef` nullable
  - the partial unique index on Opening (named so it doesn't clash with `Payment_orderId_key`)
  - the `Payment_attempt_session_check` CHECK
  - the nullable-ref type fixes in `reconcile.ts`, `release.ts` and `get-order.ts`
  - B20 in `lib/payments/schema.db.test.ts`

  `pnpm db:drift` must be clean and `pnpm typecheck` must pass.
- [x] 4. **Attempt states.** `lib/payments/attempt.ts`: `attemptState`, `OPENING_ABANDONED_AFTER_MS`, `START_PATH_BUDGET_MS`, with unit tests U1–U5 written first.
- [x] 5. **Wait helper.** `lib/payments/wait-for-session.ts`: `waitForSession`, `OPENING_RETRY_MS`, `OPENING_WAIT_MS`, with fake-timer unit tests for W1–W3's logic (retry, 30 calls then `error`, stop on `confirming`, a throw is `error`).
- [x] 6. **Link after a start.** `lib/payments/pay-link.ts`: `linkAfterStart` moves out of `placeOrderAction` unchanged, with a unit test for each refusal.
- [x] 7. **Order page summary.** `getOrderForPage` takes `latest` from payments with a session and `needsCheck` from all payments. Unit tests U6–U8; the `paymentView` tests stay green.
- [x] 8. **Fake gateway seams.** `holdCreate` and `fail.createLost` in `lib/payments/fake.ts`, and `guardTransactions` also guards `createSession`. Small tests for the seams in `fake.db.test.ts`.
- [x] 9. **Claim.** In `startPayment`: the lock query with the database's `now()`, today's checks, `opening` / abandoned → Failed, the attempt number, `sessionRequest`, and the Opening insert with `createdAt` from the database. `StartResult` gains `opening`, and `StartStep` is renamed.
- [x] 10. **Gateway steps and settle.** In `startPayment`:
  - the close and read outside any transaction
  - the create, including a lost response
  - `settleAttempt` for the attach and for finish-as-failed
  - the best-effort close of an orphan on `not-pending` or taken-over
  - the second try and close when settle throws
  - remove the 25 s `TRANSACTION` and rewrite the header comment
- [x] 11. **Integration tests for `startPayment`.** Rewrite `start-payment.db.test.ts` with B1–B18 under `guardTransactions`:
  - B1–B8, the old A1–A7 plus the lost-response and failing-create cases
  - B9 and B9a, the lock is free during a slow create
  - B10–B12, B11a and B14, abandoned attempts on the database clock
  - B13 and B13a, the attach fails
  - B15–B18, the old A8–A10 and S9
  - the log spy
- [x] 12. **Release.** `releaseExpiredOrders` marks Opening attempts Failed; B19 in `release.db.test.ts`.
- [x] 13. **Actions.** `placeOrderAction` answers `paymentOpening: true` on `opening` and uses `linkAfterStart`. Cases in `startPaymentAction` and `placeOrderAction` integration tests that pass `opening` through.
- [x] 14. **Order page waits.** `PaymentPanel.pay()` runs `waitForSession` and stays busy throughout; update the `order-view.test.tsx` stub type.
- [x] 15. **Checkout waits.** `CheckoutFlow.goToOrder` and `ReviewStep.onPlaced` carry `paymentOpening`. The wait keeps "Placing your order…" and ends on the payment page or on `linkAfterStart`'s link (B17a, browser side).
- [x] 16. **E2E.** `e2e/payment-start.spec.ts` covers two tabs clicking Pay now (W4). Run the existing payment, release and checkout specs (W5).
- [x] 17. **Docs close-out.**
  - CLAUDE.md: the Paying paragraph, and remove both #88 exception notes
  - spec 032 Q6 and spec 033's #88 row
  - `docs/setup/payments.md`
  - spec 034's status line
- [ ] 18. **Checks.** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`. Then the manual pass on the preview URL: Pay now, Cancel then Retry, Let it expire then Retry, two tabs, checkout → paid.
