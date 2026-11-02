# 034 — Start a payment with no gateway call inside a transaction

Issue: [#88](https://github.com/romulojr-dev/pc-ecommerce/issues/88). PRD: FR-23 (a payment record per attempt), NFR Performance; CLAUDE.md working rule "No gateway or other network calls inside a database transaction". Origin: [spec 032](../032-payment-webhooks/spec.md) Q6. Depends on [spec 031](../031-pay-with-xendit/spec.md) (`startPayment`), [spec 032](../032-payment-webhooks/spec.md) (`reconcileSession`, orphan sessions) and [spec 033](../033-release-unpaid-orders/spec.md) (the release, which takes the same order lock).

## 1. Summary

`startPayment` (Pay now, Retry payment and the step after Place order) today locks the order row and calls Xendit up to three times (close, read, create) inside one transaction of up to 25 s. This story splits it into **a short claim transaction** that records the attempt as **opening**, **the gateway calls with no transaction open**, and **a short attach transaction** that makes the attempt Pending with its session id or marks it Failed. So a slow or failing Xendit never holds a pooled connection or the order lock that the webhook (spec 032) and the release (spec 033) need. The shopper sees the same pages, buttons and copy as in spec 031.

## 2. Behavior

### Starting a payment (server)

1. **Claim** (one transaction, the order row locked `FOR UPDATE`, no gateway call). The lock query also reads the **database clock** (`now()`, the transaction's start time); that one value judges an existing attempt's age and is the new attempt's `createdAt`, so the server's clock never takes part in abandonment. In this order, each refusal writing nothing:
   1. Unknown order → `not-found`. Not Pending payment → `not-pending`. Under 10 minutes before `expiresAt` (`canStartSession`) → `expired`. A payment with `problem` `AMOUNT_MISMATCH` → `needs-check`. (Unchanged from spec 031 and 032.)
   2. **An attempt is already opening** for the order:
      - if it is **fresh** (created less than `OPENING_ABANDONED_AFTER_MS`, 60 s, before the database's `now()`) → `opening`, nothing written;
      - if it is **abandoned** (60 s or older) → it becomes **Failed**, and the claim goes on.
   3. Build the session request (`sessionRequest`: reference id `{orderNumber}-{attempt}` with attempt = 1 + the order's Payment count, failed attempts included; amount; requested `expires_at`). Not buildable → `expired`.
   4. Insert the **opening attempt**: a `Payment` with status Opening, provider, reference id, amount, currency, the requested `expiresAt`, `createdAt` = the database's `now()` from step 1, and **no session id**. Remember the order's open (Pending) payment, if any, and its session id.
   5. Commit.
2. **Gateway calls** (no transaction open, no row locked):
   1. If there was an open payment, **close its session** exactly as spec 031 behavior 14 and spec 033 define: `cancelled` → closed; `not-active` → read the session: Expired or Canceled → closed, **Completed → stop with `confirming`**; a failed close or a failed or empty read → stop with `error`. A stop goes to *Finish as failed* with the old payment untouched.
   2. **Create the session** (spec 031 §6, unchanged request). A failure goes to *Finish as failed*, with the old payment marked Expired when step 2.1 closed it. This includes a **lost response** (a timeout, a dropped connection, a 5xx): Xendit may have made the session anyway, but its id never reached us, and Xendit has no way to find a session by `reference_id` (D11), so nothing is closed. That session is an orphan nobody holds the link to; it expires on its own no later than the order's `expiresAt`, and `reconcileSession` records it if it is ever completed (B7a).
3. **Attach** (one transaction, the order row locked):
   1. If step 2.1 closed the old session, the old payment becomes Expired (only if it is still Pending; a webhook may have expired it already).
   2. If the order is **no longer Pending payment**, or the attempt is **no longer Opening** (it was taken over as abandoned, behavior 1.2): the attempt (if still Opening) becomes Failed; commit; then, outside the transaction, **close the new session** (best effort) and log it as orphaned; answer `not-pending` (order not pending) or `error` (attempt taken over).
   3. Otherwise the attempt becomes **Pending** with the session id as `providerRef` and the session's `expiresAt`. Commit and answer `{ ok: true, url }`.
4. **Finish as failed** (one short transaction, the order row locked): the attempt becomes Failed if it is still Opening, and the old payment Expired when it was closed; commit; answer the stop's reason (`error` or `confirming`). The order is free for a later Retry at once.
5. **The attach or the finish fails** (a database error after the gateway made a session): answer `error`, log `payment.session_orphaned` with the session id only, try once more to mark the attempt Failed in its own transaction, then close the new session at the gateway (best effort, outside any transaction). If the database is down for all of it, the attempt stays Opening and counts as abandoned after 60 s; the session is never shown to anyone, expires by the order's `expiresAt` at the latest, and `reconcileSession` records it if it is ever paid (its `metadata.order_id`, spec 032 orphan path).

### What the shopper sees

6. **Pay now and Retry payment** keep spec 031's busy label "Opening the payment page…". When the action answers `opening` (another tab, a second click that got past the disabled button, a replayed Place order), the panel **stays busy and asks again** every 1 s (`OPENING_RETRY_MS`) for up to 30 s (`OPENING_WAIT_MS`) after the click. The next answer that isn't `opening` is handled as spec 031 says (a URL goes to the payment page; `confirming`, `expired`, `not-pending`, `needs-check`, `error` as today). Still `opening` after 30 s → the error view "We couldn't open the payment page. Try again." and the button.
7. Because a retry after the first attempt attached closes that session and opens a new one (spec 031 rule *One open session*), two tabs both end on a payment page, and only the newest session is open, as in spec 031 A3.
8. **Place order's payment step** runs the same `startPayment`. On `opening` (only a replayed Place order can meet one), the browser keeps "Placing your order…" and runs the same wait through `startPaymentAction` with the order link's number and key, then goes to the payment page, or to the order link with `payment=error` after 30 s or any refusal spec 031 sends there (Q2, decided).
9. **The order page** never shows an opening or failed attempt. The payment area's "latest payment" (spec 032 behavior 21, used for "the last session expired → Retry") is the newest payment **that has a session**; opening and failed attempts are skipped, so every view in spec 031 and 032 reads as before.

### Other paths that meet an opening attempt

10. **Webhook** (`reconcileSession`): unchanged. It finds payments by session id, which an opening attempt doesn't have. A completed session whose attempt is still Opening is an orphan and gets its own row through spec 032's orphan path; the stale Opening attempt then counts as abandoned, and an attach still running finds the order Paid (behavior 3.2).
11. **Release** (spec 033): step 1 (closing the Pending sessions of due orders) is unchanged. Step 2, when it cancels an order, also moves its **Opening** attempts to Failed. An opening attempt on a due order is always abandoned (rule *An opening attempt never outlives its order*), so the release never waits for one.
12. **Loading and errors at a glance**

| State | Where | What shows |
| --- | --- | --- |
| Another start is opening | Pay now / Retry / Place order | The busy label stays ("Opening the payment page…" / "Placing your order…") while the page asks again |
| Opening for over 30 s | Order page | "We couldn't open the payment page. Try again." + the button |
| Create or close failed | Order page | As spec 031: "We couldn't open the payment page. Try again." |
| Old session already paid | Order page | As spec 031: "Confirming your payment…" |
| Attach failed after the session was made | Order page | As spec 031 A11: the error text; Retry works once the attempt is Failed (at once) or abandoned (60 s) |

## 3. Examples

Values as in spec 031: P1 (AMD Ryzen 5 7600 × 2, delivery to QC, total **2,311,000** centavos), order **PCS-7KQ2M9XD**, placed 2026-11-01T07:00:00Z, `expiresAt` 2026-11-02T07:00:00Z. "Now" for a start is 2026-11-01T08:00:00Z unless stated (the server's clock, for `canStartSession` as in spec 031). Ages of Opening attempts are relative to the **database's** `now()`: "created 30 s ago" means the test wrote `createdAt = now() - interval '30 seconds'`. Integration examples use the fake gateway and Docker Postgres, with `guardTransactions` (test-support/release.ts) failing the test if a gateway call runs while a transaction is open.

### Attempt states (unit, pure)

| # | Input | Expected |
| --- | --- | --- |
| U1 | Status Opening, created 08:00:00.000Z, database now 08:00:59.999Z | `opening` (fresh) |
| U2 | Status Opening, created 08:00:00.000Z, database now 08:01:00.000Z | `abandoned` (60 s is abandoned: the boundary is included) |
| U3 | Status Opening, created 08:00:00Z, database now 07:59:00Z (a `createdAt` after now, which one clock shouldn't produce) | `opening` (never abandoned early) |
| U4 | Status Pending / Paid / Expired / Failed, any age | `pending` / `paid` / `expired` / `failed`; age doesn't matter |
| U5 | `OPENING_ABANDONED_AFTER_MS` vs. the longest start path | 60,000 ≥ claim `maxWait` 5,000 + close 6,000 + read 6,000 + create 6,000 + attach `maxWait` 5,000 (28,000) plus a margin. A test fails if the gateway timeout or the waits grow past half of it |
| U6 | Payments summary for the view: [Expired "…-1" with session, Failed "…-2" without] | `latest` `expired` (the failed attempt is skipped), so the view is `cancelled` (Retry), as spec 031 A7 left it |
| U7 | Summary: [Pending "…-1", Opening "…-2"] | `latest` `pending` |
| U8 | Summary: [Failed "…-1"] only | `latest` null → `pay` |

### Starting a payment (integration)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| B1 (was A1) | P1, no Payment | Place order's payment step | One Payment, Pending, `referenceId` "PCS-7KQ2M9XD-1", `providerRef` `^ps-[0-9a-f]{24}$`, amount 2,311,000, `expiresAt` 2026-11-02T07:00:00Z; URL `/test-payment/{providerRef}?key=…`; one fake session Active. Two transactions ran (claim, attach), no gateway call inside either |
| B2 (was A2) | B1, cancelled on the fake page | Retry payment | "…-1" Expired, its fake session Canceled; "…-2" Pending with a new `providerRef`; one Pending payment |
| B3 (was A3) | B1 | Two `startPayment` at once (`Promise.all`) | One answers `{ ok: true }`, the other `opening`. Two Payments: "…-1" Expired, "…-2" Pending. **One** new fake session (the fake records one create). No error, no deadlock |
| B3a | B3, then the second caller asks again | `startPayment` | `{ ok: true }`: "…-2" Expired (closed), "…-3" Pending; one Pending payment (spec 031's two-tab result) |
| B4 (was A4) | B1, fake session Completed | Retry payment | `confirming`; "…-1" still Pending; "…-2" **Failed** with no `providerRef`; no create; no Opening attempt left |
| B5 (was A5) | B1, fake session Expired | Retry payment | Close `not-active`, read Expired; "…-1" Expired; "…-2" Pending |
| B6 (was A6) | B1, the fake's close fails (500) | Retry payment | `error`; "…-1" still Pending, its fake session Active; "…-2" Failed; no create. A later Retry (fake fixed) gives "…-3" Pending and "…-1" Expired |
| B7 (was A7) | B1, the fake's create fails after the close | Retry payment | `error`; "…-1" Expired (closed at the gateway); "…-2" Failed; no Opening attempt; a later Retry gives "…-3" Pending |
| B7a | No Payment; the fake **makes** the session, then answers like a timeout (`{ ok: false, code: "timeout" }`) | Pay now | `error`; "…-1" Failed with no `providerRef`; the fake session Active (nothing closes it: no lookup by reference id); a later Pay now gives "…-2" Pending, so Xendit holds two Active sessions until the orphan expires (its `expires_at` ≤ 2026-11-02T07:00:00Z). If the orphan is then marked Completed, `reconcileSession` records it through the orphan path (as B12) |
| B8 | No Payment, the fake's create fails | Pay now | `error`; "…-1" Failed; an immediate Pay now (fake fixed) gives "…-2" Pending: no 60 s wait |
| B9 | B1; the fake's create is held open on a promise | While the create waits, another connection runs `SELECT … FROM "Order" WHERE id = … FOR UPDATE NOWAIT` | The lock is taken at once (no error 55P03): no transaction holds the order while Xendit answers. Releasing the promise then completes the start: "…-2" Pending |
| B9a | No Payment; an orphan fake session for P1 (an earlier crash, B12's setup); Pay now with its create held | The orphan is marked Completed and `reconcileSession` runs while the create waits | The webhook commits without waiting for the start (orphan row Paid, order Paid). The start's attach then sees the order Paid: its attempt Failed, its new fake session Canceled, answer `not-pending` |
| B10 | An Opening attempt "…-1" created 30 s ago, no fake session | Pay now | `opening`; nothing written |
| B11 | An Opening attempt "…-1" created 60 s ago | Pay now | "…-1" Failed (abandoned), "…-2" Pending; one fake session |
| B11a | An Opening attempt created 30 s ago by the database, while the server's `now` option is set an hour ahead | Pay now | `opening`: the server's clock doesn't make it abandoned |
| B12 | An Opening "…-1" created 60 s ago **with** a fake session made for it (the crash after the create) | Pay now, then that orphan session is marked Completed and `reconcileSession` runs | The start: "…-1" Failed, "…-2" Pending. The reconcile: a new Payment row from the gateway's values (spec 032 orphan path), Paid; the order Paid; "…-2" Expired and its session closed after the commit |
| B13 (was A11) | Create succeeds, then the attach transaction fails (forced through `afterStep("attach")`) | Pay now | `error`; the attempt Failed (the second try); the new fake session Canceled; one log line `payment.session_orphaned` with the session id only; no Pending payment |
| B13a | B13, but the second try fails too | Pay now | `error`; the attempt stays Opening; the session is closed; Pay now 60 s later works |
| B14 | The start is paused after its create (`afterStep("create")`); meanwhile the test backdates its attempt's `createdAt` by 61 s and another `startPayment` takes it over (B11) and attaches "…-2" | The first start resumes | Its attach finds "…-1" Failed: answer `error`, its session Canceled, "…-2" still the one Pending payment |
| B15 (was A8) | Order Cancelled | Pay now | `not-pending`; no transaction writes; no gateway call |
| B16 (was A9, A9a, A9b) | Now 2026-11-02T06:51:00Z (9 min left), with and without an open payment; and Place order then the clock moved | Pay now / Retry / Place order | `expired`; no gateway call; nothing written; the open session not closed |
| B17 (was A10) | B1, then a replayed Place order | Place order | Same order; "…-1" Expired; "…-2" Pending |
| B17a | Place order's payment step is opening (held create), then a replay | Place order (replay) | The replay's `startPayment` answers `opening`; its browser waits (behavior 8) and ends on the payment page of "…-3", with "…-2" Expired |
| B18 (was S9) | A payment with `AMOUNT_MISMATCH` | Pay now | `needs-check`; no gateway call; nothing written |
| B19 | Release (spec 033) of a due order with an abandoned Opening attempt | `releaseExpiredOrders` | Order Cancelled; the Opening attempt Failed; stock back as spec 033 |
| B20 | Schema | Insert a second Opening for an order; an Opening with a `providerRef`; a Pending without one; an Opening and a Pending for the same order | The first three fail (unique index, CHECK, CHECK); the fourth succeeds |

### Pages (unit with fake timers, and E2E)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| W1 | `startPaymentAction` answers `opening`, then `{ ok: true, url }` | Click Pay now | Busy "Opening the payment page…" throughout; one more call after 1 s; then the page goes to the URL |
| W2 | Answers `opening` every time | Click Pay now | 30 calls over 30 s (one per second, the first at the click), then "We couldn't open the payment page. Try again." and the button enabled |
| W3 | Answers `opening`, then `confirming` | Click Retry payment | "Confirming your payment…" (spec 031 behavior 7) |
| W4 | E2E: two tabs on P1's order page | Click Pay now in both | Both end on a fake payment page; the first tab's page, reloaded, shows "This test payment is closed."; the order has one Pending payment |
| W5 | E2E: X1–X4 from spec 031 and spec 032's checkout → paid | As written | Unchanged |

## 4. Rules and edge cases

- **No gateway call while a transaction is open**, in every path of `startPayment`: claim, finish, attach and the second try are database work only; every `closeSession`, `getSession` and `createSession` runs between them. B1–B19 run under `guardTransactions`, like `reconcile.db.test.ts` H17. CLAUDE.md's "known exception" notes go.
- **At most one opening attempt per order**, decided under the order lock in the claim and backed by a partial unique index `Payment(orderId) WHERE status = 'OPENING'`. The existing `Payment(orderId) WHERE status = 'PENDING'` stays. **An Opening and a Pending can coexist** during a Retry (the old session is still open while the new one is created), which is why this is a second index and not the issue's "extend the partial unique index" (D2).
- **One open session per order** (spec 031) still holds: a session becomes Pending only in the attach, under the order lock, after the old one was closed; and only one attempt can be between claim and attach. Xendit never holds two live sessions of ours with known ids (the old one is closed **before** the create). The one exception is an orphan from a lost create response or a crash (D11, B7a), which nobody holds the link to and which expires on its own.
- **Abandoned** is derived from `createdAt` and the database's `now()`, never stored: age ≥ `OPENING_ABANDONED_AFTER_MS` (60 s). Both values come from the database clock (the claim writes `createdAt` from the same `now()` it judges by), so app servers with different clocks agree. A future `createdAt` is fresh. The claim turns an abandoned attempt Failed before inserting the new one, in the same transaction, so the index never sees two.
- **An attempt that was taken over can't come back.** Every move out of Opening is conditional on the row still being Opening; a late attach finds it Failed, closes its own session and answers `error`.
- **The attach re-checks the order** under the lock: a webhook (Paid), the release (Cancelled) or anything else that changed the status between claim and attach makes the attempt Failed and its session closed. Time left isn't re-checked: the session was created with at least 10 minutes and never outlives the order.
- **An opening attempt never outlives its order.** A claim needs 10 minutes before `expiresAt`, and an attempt is abandoned after 60 s, so on every due order the Opening attempts are abandoned. Their sessions (if Xendit made one) expire no later than the order and their URL never reached a shopper (only the attach hands out a URL). The release therefore needs no gateway call for them and marks them Failed (B19).
- **Reference ids stay unique per attempt** (Xendit has no idempotency key; [create-session](https://docs.xendit.co/apidocs/create-session.md), checked 2026-11-01): the number is taken under the lock in the claim, and Failed attempts keep theirs, so a retried create never reuses a reference.
- **Failed means "no session of ours"**: an attempt whose create failed, whose close or read stopped it, that was abandoned, or that was taken over. A Failed attempt never has a `providerRef`; a session that existed for it was closed, or is an orphan (a lost create response or a crash, D11).
- **A lost create response leaves an orphan** that nothing closes (D11): Xendit's Sessions API has only `POST /sessions`, `GET /sessions/{id}` and `POST /sessions/{id}/cancel`, no list or search by `reference_id`, and no idempotency key. Such a session's link was never shown, it expires by the order's `expiresAt` at the latest, and a completed one is recorded by `reconcileSession`. Its reference id ("…-n") stays taken by the Failed attempt, so the next attempt's reference differs. `PaymentStatus.FAILED` exists since spec 031 and was unused (spec 032 D3), so no meaning changes.
- **`confirming` writes the attempt Failed**, not nothing (spec 031 A4 wrote nothing): the attempt was recorded in the claim and must leave Opening so the next start isn't blocked.
- **The old payment becomes Expired only after its session was closed** (cancel accepted, or read as Expired/Canceled), in the attach or the finish, and only while it is still Pending.
- **Transactions** use Prisma's defaults sized for database work (`maxWait` 5 s, `timeout` 5 s); spec 031's 25 s limit goes.
- **Logging** is unchanged in kind: `payment.close` / `payment.create` failure codes, `payment.session_orphaned` with the session id only; never the key, token, URLs or bodies. A best-effort close of an orphan that fails logs `payment.close` with its code.
- **The waits in the page** are bounded (30 s, 30 calls at most) and stop on the first non-`opening` answer. They run only after a click, never on page load.
- **`ORDERS_ENABLED`** doesn't gate `startPayment` (spec 031); unchanged.

## 5. Messages and copy

No new strings. `opening` reuses the existing busy labels "Opening the payment page…" (order page) and "Placing your order…" (checkout); the 30 s timeout reuses "We couldn't open the payment page. Try again."

## 6. Data and interfaces

### Schema (one migration)

- `PaymentStatus` gains `OPENING`.
- `Payment.providerRef` becomes nullable (null while Opening, and on Failed attempts). The unique `(provider, providerRef)` stays (Postgres treats nulls as distinct).
- `Payment.expiresAt` stays required: the requested `expires_at` while Opening, the gateway's on attach.
- New partial unique index `Payment(orderId) WHERE status = 'OPENING'` (declared with `partialIndexes`, like the Pending one).
- Migration-only CHECK: `providerRef` is null **exactly when** status is `OPENING` or `FAILED`. Covered in `lib/payments/schema.db.test.ts` (B20). No backfill: nothing has written `FAILED` yet, and Production has no payments (`ORDERS_ENABLED` off).

### Functions

- `startPayment(orderId, accessToken, options)`: same signature and callers. `StartResult`'s refusals gain `"opening"`. `StartStep` becomes `"claim" | "close" | "create" | "attach"` (the `afterStep` seam runs after each, inside its transaction for claim and attach).
- `attemptState(payment, dbNow)` (pure, `lib/payments/attempt.ts`): `opening` | `abandoned` | `pending` | `paid` | `expired` | `failed`; `OPENING_ABANDONED_AFTER_MS = 60_000`. `dbNow` is the database's `now()` read by the claim's lock query.
- `startPaymentAction` passes `opening` through. `placeOrderAction`'s result, when the payment step answered `opening`, tells the browser to wait (Q2): `payUrl: null` plus `paymentOpening: true`.
- A client helper shared by `PaymentPanel` and `CheckoutFlow` that calls `startPaymentAction` until the answer isn't `opening` (`OPENING_RETRY_MS = 1_000`, `OPENING_WAIT_MS = 30_000`), testable with fake timers.
- The payments summary behind `paymentView` (`getOrderForPage`) takes `latest` from payments with a `providerRef`.
- `releaseExpiredOrders` also sets the released orders' `OPENING` payments to `FAILED`.
- `reconcileSession`, `checkExpiredOrders`, the gateway adapters, `sessionRequest` and the fake gateway: unchanged.

### Documents

- CLAUDE.md: the Paying paragraph (three steps, Opening/Failed, the waits) and drop "spec 031's `startPayment` is the known exception until #88" there, in the webhooks paragraph and in *Working rules*.
- ADR 0010: *One open session per order* no longer says the lock is held across the calls; the orphan consequence notes the attempt.
- Spec 031: a "Changed by spec 034" note on behavior 13, the rule about gateway calls inside the lock, and A3, A4, A6, A7, A11. Spec 032: Q6 resolved by #88.

## 7. Test plan

| Level | Examples |
| --- | --- |
| Unit (Vitest, pure) | U1–U8 (`attemptState`, the summary's `latest`, the timing budget); W1–W3 (the wait helper and `PaymentPanel` with fake timers); the `paymentView` tests stay green |
| Integration (Vitest + Docker Postgres, fake gateway, `guardTransactions` on) | B1–B20: the rewritten A1–A11 (B1–B7, B13, B15–B18), double click (B3), slow call with the lock free (B9, B9a), failing create (B7, B8), lost create response (B7a), failing close (B6), abandoned (B10–B12, B14, with B11a on the database clock), attach failure (B13, B13a), release (B19), schema (B20); `startPaymentAction` and `placeOrderAction` tests pass `opening` through |
| E2E (Playwright, fake gateway) | W4 (two tabs), W5 (spec 031 X1–X4 and spec 032's checkout → paid unchanged) |
| Manual (preview) | Pay now, Retry after Cancel, and Let it expire then Retry on the fake page; locally with Xendit test mode, Pay now and Retry once (`pnpm payments:check` not needed) |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Finding an orphan session at Xendit by reference id (to close it after a lost create response or a crash) | Not possible: Xendit documents no lookup by `reference_id` (D11); orphans expire with the order and the webhook records any payment |
| Admin view of Failed attempts and orphan sessions | Admin epic (Phase 2) |
| Rate limiting `startPaymentAction` | #64 |
| Moving reconcile's post-commit close or the release's checks | Already outside transactions (specs 032, 033) |
| Cleaning up stale Opening rows on orders that are Paid | Not needed: they read as abandoned and the view skips them (D6) |

## 9. Decisions

- **D1 — Opening is a `PaymentStatus` value with a nullable `providerRef`** (the issue offers both). The status makes the index and the CHECK simple and the state visible in queries. *Rejected:* only a null `providerRef` with status Pending (Pending would mean two things, and the Pending index would block the claim during a Retry).
- **D2 — A second partial unique index for Opening, not one index over Opening and Pending.** *Disagrees with the issue's wording* ("extend the partial unique index"): during a Retry the old Pending payment must stay Pending until its session is closed (a failed close leaves it open, B6), while the new attempt is Opening, so one index would forbid every Retry. The issue's goal, at most one attempt in flight, holds. *Rejected:* marking the old payment Closing in the claim (a fourth state and a path back to Pending when the close fails). Approved in review (Q1).
- **D3 — Close before create, as today** (spec 031 behavior 13). Keeps Xendit at one live session per order. *Rejected:* create first then close (two live sessions for seconds, and a failed close would leave both).
- **D4 — Abandoned after 60 s, derived from `createdAt`, measured on the database clock** (review decision, Q3). About twice the longest path (28 s, U5), so a slow but live start isn't taken over, and a crash blocks Retry for a minute at most. The claim reads `now()` in its lock query and writes the new attempt's `createdAt` from it, so two app servers with drifting clocks can't disagree about an attempt (B11a). *Rejected:* a stored lease or heartbeat (more writes for a crash case); 30 s (too close to the path); the server's `Date` (each instance's clock may differ, and Prisma fills `@default(now())` on the app side).
- **D5 — The second caller answers `opening` at once and the page waits**, as the issue says. `startPayment` never sleeps or polls. *Rejected:* waiting inside `startPayment` (a server action held for up to 30 s, and the integration test could no longer see the "opening" answer).
- **D6 — `reconcileSession` stays unchanged**; the attach re-checks the order instead, and stale Opening rows on Paid orders are left (abandoned by age, skipped by the view). *Rejected:* having reconcile's Paid path mark Opening attempts Failed (a change to merged webhook code for a case the attach already covers).
- **D7 — A late or failed attach closes the session it made** (best effort, after the commit). Its URL never reached anyone, so closing it is safe and tidier than spec 031 A11, which left the orphan Active. *Changes spec 031 A11.* Approved in review (Q4).
- **D8 — `confirming`, a failed close and a failed create each leave one Failed row.** FR-23 asks for a record per attempt, and the row must leave Opening. *Changes spec 031 A4, A6, A7* ("nothing written" / "no new Payment"); the shopper sees the same.
- **D9 — The view's "latest payment" skips attempts with no session**, so the Failed row from D8 doesn't turn spec 031 A7's Retry view into Pay now. *Rejected:* leaving the summary as it is (a visible change after a failed create).
- **D10 — The release marks a cancelled order's Opening attempts Failed in its step 2**, with no gateway call (rule *An opening attempt never outlives its order*). *Rejected:* skipping orders with an Opening attempt (it would hold stock for a crash).
- **D11 — A session made behind a lost create response is accepted as an orphan** (review item 5). Xendit's API reference ([llms.txt](https://docs.xendit.co/llms.txt) index; [create-session](https://docs.xendit.co/apidocs/create-session.md), [get-session](https://docs.xendit.co/apidocs/get-session.md), [cancel-session](https://docs.xendit.co/apidocs/cancel-session.md); read 2026-11-02) lists three session operations: `POST /sessions`, `GET /sessions/{session_id}` (a path parameter and the `for-user-id` header, no query parameters) and `POST /sessions/{session_id}/cancel`. There is no list or search, no `reference_id` filter and no idempotency key, and reusing a session `reference_id` isn't documented either way. So the attach can't find the session to close it. It is accepted because its link was never shown (only the attach hands out a URL), it expires on its own no later than the order's `expiresAt`, and a completed one is recorded by `reconcileSession`'s orphan path (spec 032; B7a). *Rejected:* retrying the create with the same `reference_id` in the hope that Xendit dedupes (undocumented); storing the session id before the create (Xendit makes the id).
- **D12 — A replayed Place order waits for the opening attempt** with the same 30 s helper and ends on the payment page (review decision, Q2), so spec 031 behavior 3 holds. *Rejected:* the order link with `payment=error`.

**Disagreements flagged:** the issue's single extended index (D2); spec 031's behavior 13 (one transaction with the lock held across calls), its rule on gateway calls inside the lock, its 25 s timeout and its A3, A4, A6, A7, A11 expectations (D7, D8, B3); spec 032's Q6 recommendation (leave `startPayment` as it is), now superseded by the issue; ADR 0010's *One open session per order* wording.

### Acceptance criteria → examples and rules

| Acceptance criterion | Where |
| --- | --- |
| No gateway call while a transaction is open; a spy test like H17 | Rule *No gateway call*; B1–B19 under `guardTransactions`; B9 |
| A second click while opening doesn't start another; at most one opening or pending attempt (index); the second answers "opening" and the page waits | Behavior 1.2, 6–8; rule *At most one opening attempt*; D2, D5; B3, B3a, B10, B17a, B20; W1–W4 |
| A failed create marks the attempt failed and leaves no open attempt; a later Retry works. A failed close leaves the old session open and the new attempt failed | Behavior 2, 4; B6, B7, B8 |
| A crash between create and attach: an opening attempt older than the timeout plus a margin is abandoned; Retry opens a new one; the orphan is recorded by `reconcileSession` if paid | Behavior 1.2, 2.2, 5, 10; rule *Abandoned*, *A lost create response*; D4, D11; U1–U5; B7a, B11, B11a, B12, B13a, B14 |
| The close step's "already completed" still stops with `confirming` | Behavior 2.1; B4; W3 |
| Place order, Pay now and Retry all use it; spec 031's behavior and copy unchanged | Behavior 6–9; §5; D9; B1, B2, B17, B17a; W5 |
| Tests: integration double click, slow call, failing create, failing close, abandoned, A1–A11; unit attempt states and abandonment | §7; B1–B20; U1–U8 |

## 10. Open questions

### Resolved in review (2026-11-02)

- **Q1 — Two indexes:** a separate partial unique index for Opening; the Pending one stays (D2).
- **Q2 — A replayed Place order meeting `opening`:** it waits with the same 30 s helper and ends on the payment page (behavior 8, D12, B17a).
- **Q3 — Timings:** 60 s abandonment and 30 s page wait, with an attempt's age measured on the database clock (`now()` in the claim's query), not the server's (D4, B11a).
- **Q4 — Closing the session after a failed attach:** yes (D7, B13).
- **Review item 5 — Lost create response:** Xendit has no lookup by reference id, so the orphan is accepted (D11, B7a).

No open questions remain.
