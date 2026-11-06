# Plan: spec 044 — Cancel an order from Admin (#109)

Spec: [spec.md](spec.md) (approved 2026-11-06). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `109-cancel-an-order-from-admin`, from `main` (spec 043 is merged). One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `adminAction`, `adminTransaction`, `recordAudit`; `orders.cancel` already in the permissions table (Owner, Staff yes; Demo no); `enqueueEmail`, `scheduleEmailSend`, `sendPending` and the claim step; `closeSession`, `reconcileSession`, `timedGateway`; `giveBackVoucherUses`; `PRODUCTS_TAG`; `logSafeFailure`; spec 043's Fulfillment section, dialog pattern, `transitionOrder` (the model for `cancelOrder`), `fulfillment-copy.ts`, `fulfillment-view.ts`; `orderTimeline`; `guardTransactions`; `expectNoRawValues`; the audit masker, whose free-text key list already has `note` ("Hidden in demo").

Does not exist yet: `undoReservations` as its own function, the cancel table, `cancelOrder` and its action, the staff `OrderCancelReason` values, the `ORDER_CANCELLED_BY_STORE` type, the "nothing received" function, the cancel dialog and the cancelled timeline.

## Findings that shape the plan

- **`releaseExpiredOrders` inlines the reservation undo** and `giveBackVoucherUses` is already a separate function. The extraction (task 1) is a refactor: the existing release tests must pass with no changed expectation (R21), so it is its own commit with no other change.
- **The release's gateway step** is `checkExpiredOrders` → private `checkSession` (close, then reconcile on `not-active`). The cancel needs the same close-then-reconcile for every `PENDING` payment, but treating any outcome other than cleared as a refusal. `checkSession` is exported and reused; the cancel maps its `SessionCheck` itself (`cancelled`, or `reconciled` with `expired` / `already-applied`, clears; everything else refuses).
- **`EmailOrder` has no payments.** "Nothing received" needs the payments' statuses, so `send.ts` includes `payments: { select: { status } }` and `EmailOrder` gains it. The tests' order fixtures are casts and gain `payments: []`.
- **The order page already selects payments** (`status`, `providerRef`, `problem`); the DTO gains `paymentReceived`/`cancelledAt`, computed in `getOrderForPage` by the pure function. `OrderPageData.cancelReason` widens from `"EXPIRED"` to the four values.
- **Postgres enum values** (`ALTER TYPE … ADD VALUE`) can't be used in the transaction that adds them: the migration only adds the three `OrderCancelReason` values and `ORDER_CANCELLED_BY_STORE`.
- **The cancel is the second writer to `StockMovement.actorId`**; `undoReservations` takes an optional `actorId`.
- **The cap exemption** is the list `CAP_EXEMPT_TYPES` (spec 043 R9): one more entry, and `ORDER_CANCELLED` explicitly not in it (unit-tested).
- **`ORDER_CANCELLED_BY_STORE` views**: one view function shared with `ORDER_CANCELLED` for the lead and details (`cancelledLead` takes the received flag); the template file is separate (own registry entry) so the two types are visibly different.
- **No network inside the transaction.** `cancelOrder` reads, runs the gateway step, then opens `adminTransaction`; tests run under `guardTransactions`.

## Risks to settle early

1. **Races** (task 5): four races (confirm, webhook, release, transition) forced both ways with two connections, asserting stock returns once and one email row. Write them before the UI.
2. **The conditional update and the CHECKs** (task 5): setting `status`, `cancelledAt`, `cancelReason` and `refundRequired` in one statement must satisfy `Order_cancelled_check`; cash orders have no `paidAt`, so `refundRequired` is never set for them.
3. **Lock order**: the order row is locked by the conditional `UPDATE`; products by id then vouchers follow. The webhook (`reconcileSession`) locks the order row first, so the two cannot deadlock.
4. **Late payment after the session closed** (E15): the existing `LATE` path must still work for the cancelled order; covered by the race test.
5. **Email wording** (task 4): the closing sentences are decided by one function used by the email and the page.

## Steps

### 0. Housekeeping
Commit `spec.md`, `plan.md`, `tasks.md` and the PRD edits (the Voucher row's wording and FR-21).

### 1. Extract `undoReservations` (refactor only)
`lib/orders/undo-reservations.ts`: the reservation read, one stock `UPDATE` per product in id order, the `ORDER_RELEASED` rows, with an optional `actorId`; returns the ids that had a reservation. `releaseExpiredOrders` calls it. Add a focused db test (E21). All existing release tests unchanged.

### 2. Pure rules
`lib/orders/cancel.ts`: `canCancel(status)`, the staff reasons, `cancelInputSchema` (note rules), the reason → phrase map, `nothingReceived`. Unit tests: 44-combination table (E1), forged status, input (E13), phrases, nothing-received (E23, E24). Completeness check against the Prisma enum.

### 3. Schema and the cap
Migration (`OrderCancelReason` ×3, `EmailType` ×1), `schema.prisma` comments, `CAP_EXEMPT_TYPES` gains `ORDER_CANCELLED_BY_STORE`, `test-support` lists. Integration tests: the CHECKs still hold (E26); cap tests with the real claim step (E31, E32).

### 4. Emails
`cancelledLead` and `cancelled()` view use the received flag; `ORDER_CANCELLED_BY_STORE` in `EMAIL_VIEW_TYPES`, the registry, a template, `EMAIL_TYPE_LABELS`, the dev emails page; `send.ts` loads payments; `EmailOrder` gains `payments`. Tests E23, plus `sendPending` through `FakeEmail`.

### 5. The cancel (server)
`lib/admin/orders/cancel.ts` (`cancelOrder`), the action with `adminAction("orders.cancel", …)` after the commit scheduling the email and revalidating when stock came back. Integration tests E2–E12, E14–E20, E22, E27–E29, E33–E35; Demo refusal and the guard-enumeration test.

### 6. Customer timeline and order page
`orderTimeline` for cancelled orders, `Cancelled {time}`; DTO and `getOrderForPage`; `OrderView` copy for the reason, the closing sentences and the refund line. Tests E24, E25.

### 7. Admin detail and dialog
`OrderDetail` cancel fields, events list, Cancel button and dialog (reasons, note, effects), results and messages. Render tests for each role and state (E30); `no-db-in-pages` and `admin-pages` tests.

### 8. E2E
`e2e/admin-cancel.spec.ts` with its own fixtures.

### 9. Docs
CLAUDE.md bullet, "changed by spec 044" notes in specs 033, 035 and 036, the spec's "What changed while building", tick `tasks.md`.

### 10. PR
`git push -u origin HEAD`, then `gh pr create` with the repo template, "Closes #109".

## Verification

Each task ends with `pnpm lint`, `pnpm typecheck`, `pnpm test` and, from task 1 on, `pnpm test:db` (Docker Postgres, inline URL). Task 3 also runs `pnpm db:drift`. The E2E runs with `pnpm test:e2e` against the app's database before the PR.
