# 032 — Payment webhooks

Status: **Approved with changes** (review 2026-11-01, §11) · Issue: #80 (Sprint 6, Checkout epic #4; depends on #79, merged as spec 031) · PRD refs: FR-22 (Paid is set only from the gateway; reworded by this story, D16), FR-23 (idempotent handler, a record per attempt), FR-26 (the refund flag only; refunds are Sprint 8); NFR Security (webhook verification), Observability (structured payment logs); Data model › `Order`, `Payment`, `PaymentEvent`; ADR 0010

**Gateway: Xendit, not PayMongo.** Issue #80 was written for PayMongo. The gateway is Xendit in test mode (ADR 0010, spec 031). Spec 031 §8 listed how #80 changes for Xendit; this spec is the behavior, and D1 maps every PayMongo criterion to its Xendit form.

## 1. Summary

Xendit tells the store about a payment session through `POST /api/webhooks/xendit`. The store checks the request's verification token, then hands the session id to **`reconcileSession`**, one reusable function that asks Xendit's API what happened to the session (outside any transaction) and then applies that result in one transaction that locks the order: it marks the order **Paid** (with the time and the method) exactly once, and records the webhook's event in the same transaction (FR-22, FR-23). #81 calls the same function before releasing an order, so a payment whose webhook was missed still makes the order Paid instead of Cancelled. A payment that arrives for a cancelled order, or a second payment for an order that is already paid, is recorded and flags the order for a refund (FR-26). A payment whose amount doesn't match is recorded, and the order page says it needs checking. An expired session marks its `Payment` Expired, and the order page offers Retry payment. Sessions from another environment on the shared test account, and sessions the store doesn't know, are ignored. The fake gateway's Pay button now runs this same handler, so CI and E2E reach "paid" (the epic's done-when). A `pnpm webhook:replay` script posts a test event to a local server.

## 2. Behavior

### Receiving a webhook

1. Xendit sends `POST /api/webhooks/xendit` with a JSON body `{ event, business_id, created, data }` (`data` is the payment session) and the account's verification token in the `x-callback-token` header.
2. **Verify the token first.** The route compares the header with `XENDIT_WEBHOOK_TOKEN` in constant time (`callbackTokenMatches`, already in `lib/payments/events.ts`: both sides hashed with SHA-256, then `timingSafeEqual`). A missing, wrong, empty or repeated header → **401**, an empty body, one log line (`outcome: "unauthorized"`), and nothing else: no body parse, no database read, no gateway call.
3. **Read the raw body as text**, at most 64 KB (larger → 413, nothing else). A body that isn't JSON, or whose `event` isn't a string → **400**, logged, nothing written.
4. **Unknown event type** (anything other than `payment_session.completed` and `payment_session.expired`) → **200**, logged (`ignored-type`), nothing written.
5. A known type whose `data.payment_session_id` doesn't look like a session id (`ps-` and 24 hex characters) → **200**, logged (`ignored-unknown`), nothing written.
6. Otherwise the route calls **`reconcileSession(sessionId, { event })`** with the event (its derived id `{event}:{payment_session_id}`, its type and the body) and turns the result into an HTTP answer (the table at the end of this section). Only the event's type and session id are read from the body; everything else comes from Xendit.

### `reconcileSession`: ask Xendit, then apply

One function, two phases, for every caller: the webhook route (with an event) and #81's release (without one, §8). **No Xendit API call ever runs inside a database transaction** (rule *Gateway calls*).

**Phase 1, ask Xendit (no transaction, no lock):**

7. `gateway().getSession(sessionId)`:
   - unreachable, timed out or 5xx → result `retry` (the code kept for the log);
   - unknown session → `ignored-unknown`;
   - `metadata.environment` isn't this deployment's (`paymentEnvironment()`: `VERCEL_ENV` or `development`) → `ignored-environment`. Every webhook URL on the shared test account receives every session's events;
   - `metadata.order_id` isn't an order in this database, or that order's number isn't `metadata.order_number` → `ignored-unknown`.
8. By the session's status at Xendit:
   - **active** → `active`. Nothing to apply (Xendit hasn't caught up with its own webhook, or the shopper hasn't paid yet).
   - **expired** or **closed** → apply *Expired* (phase 2).
   - **completed** → the session must name a payment (`paymentId`; none → `not-yet`), read with `gateway().getPayment(paymentId)`: unreachable / 5xx → `retry`; unknown or **pending** → `not-yet`; **failed** → `unconfirmed` (Xendit contradicts itself; nothing applied); **succeeded** → apply *Completed* (phase 2), with the method from its `channel_code` (`GCASH`, `PAYMAYA`, `CARDS`; the fake says `FAKE`).
   Every result of phase 1 that doesn't go on to phase 2 writes **nothing**, not even a `PaymentEvent`, and logs one line (rule *Logging*).

**Phase 2, apply (one transaction, no gateway call):**

9. In order:
   1. lock the order row (`SELECT … FOR UPDATE`, the lock `startPayment` and #81 take);
   2. **with an event:** insert the `PaymentEvent` (`eventId`, type, the body as received, `receivedAt`, the session's `Payment` once known) with `ON CONFLICT DO NOTHING`; **no row back → a repeat: result `duplicate`, nothing else changes**;
   3. apply the change below;
   4. commit. Any database error rolls everything back (the event row included) → `error`, so Xendit's retry processes it again.
10. **The apply step is idempotent on its own**, because #81 calls it without an event: if the session's `Payment` already has the status the result would give it (Paid for a completed session, anything but Pending for an expired one), nothing changes and the result is `already-applied`. With an event, the event row is still inserted (a first delivery after #81 already reconciled the session) and the answer is 200.

**Apply *Completed*:**

11. **Find the attempt.** The `Payment` with this provider and `providerRef` = the session id. None (an **orphan session**: created at the gateway while our transaction failed, spec 031 A11) → insert one from the session (amount, currency, reference id, expiry from the gateway; never from the body). It is inserted straight into its final status, so the one-open-payment index is never hit.
12. **Which amount counts.** The received amount and currency are the session's and the payment's, in centavos (`fromProviderAmount`, never rounded). They **match** when the session amount, the payment amount, the `Payment` row's amount and the order's `total` are all equal and both currencies are `PHP`.
13. **The change**, with the order row locked, by the order's status at that moment:

| Order status | Amounts | Order | Payment | Result |
| --- | --- | --- | --- | --- |
| Pending payment (even past `expiresAt`, see §4) | match | **Paid**; `paidAt` = now; `paymentMethod` = the method | **Paid**; `paidAt`, `gatewayPaymentId`, `method`, `receivedAmount`, `receivedCurrency` | `paid` |
| Pending payment | don't match | status unchanged (still Pending payment); the page shows *needs checking* and no Pay now or Retry (behavior 24) | **Paid**, received values set, `problem` = `AMOUNT_MISMATCH` | `mismatch` |
| Cancelled or Refunded (a **late payment**) | either | status and stock unchanged; `refundRequired` = true | **Paid**, received values, `problem` = `LATE` | `late` |
| Paid or any later status (a **second payment**) | either | unchanged; `refundRequired` = true | **Paid**, received values, `problem` = `SECOND_PAYMENT` | `second` |

The paid session's `Payment` becomes Paid whatever its status was (Pending, or Expired because a retry or #81 closed it after the shopper had paid).
14. **When the order becomes Paid**, any *other* Pending `Payment` of the order (a session the shopper opened with Retry after paying on an older one) is marked **Expired** in the same transaction. **After the commit**, outside the transaction, its session is closed at the gateway (`closeSession`), best effort, logged on failure. If the gateway answers that it too completed, its own webhook arrives and takes the second-payment path.
15. Stock never changes here: placement already took it (spec 030), and #81 gives it back only for an order it cancels.

**Apply *Expired*:**

16. The session's `Payment`, if it is Pending, becomes **Expired** (result `expired`). Any other status is left alone (already Expired by a retry, or Paid). The order is never changed. A session with no `Payment` row → the event (if any) is recorded and nothing else (an orphan that expired unpaid needs no row).
17. Xendit has **no session-level failure**: a failed card or wallet attempt is retried inside the hosted page. `payment_session.expired` takes the place of the issue's `payment.failed`; `PaymentStatus.FAILED` stays in the enum, unused (D3).

### The webhook's answer

18. The route answers from `reconcileSession`'s result, with an empty body. What Xendit says decides what is applied, whatever event type the body named (a body that says "completed" for a session Xendit reports expired applies *Expired*):

| Result | HTTP | Why |
| --- | --- | --- |
| `paid`, `mismatch`, `late`, `second`, `expired`, `duplicate`, `already-applied` | 200 | Processed |
| `ignored-unknown`, `ignored-environment`, `unconfirmed` | 200 | Permanent: a retry would get the same answer |
| `active` | 503 | The body announced a change Xendit doesn't show yet; Xendit's retry checks again |
| `not-yet`, `retry` | 503 | Transient |
| `error` | 500 | Transient (database) |

Every answer is fast. The route is `POST` only (others → 405), `dynamic`, Node.js runtime, never cached.

### What the shopper sees

19. **Coming back from paying** (spec 031 behavior 7–8): the page polls `GET /api/orders/{number}/status`; once the webhook commits, it answers `PAID`, the page refreshes and shows spec 030's timeline with Paid current. With the fake gateway the handler runs before Pay redirects, so the order page usually renders Paid on arrival.
20. **The Paid order page** adds one line under the timeline: "Paid on {date, time} with {method}." (`paidAt` in Asia/Manila, spec 030's formatter; method names in §5). An unknown method code → "Paid on {date, time}." No Test mode banner, no payment area (spec 031 V7).
21. **Pending payment, the latest session expired** (the order's newest `Payment` is Expired and none is Pending, and no payment needs checking), no `payment=` value: the payment area shows "Payment not completed. You haven't been charged." and **Retry payment**, as spec 031's `payment=cancelled` view does, subject to *payable* (under 10 minutes left still shows the too-late text). `payment=return` still shows "Confirming…" (spec 031 behavior 7 is unchanged).
22. **Cancelled with `refundRequired`:** spec 030's Cancelled view plus "Payment received after this order was cancelled. We'll refund it." (the issue's wording).
23. **Paid (or later) with `refundRequired`:** the Paid view plus "We received a second payment for this order. We'll refund it."
24. **An amount mismatch is shown** (D6). While the order has a `Payment` with `problem` = `AMOUNT_MISMATCH` and is Pending payment or Cancelled, the payment area shows only "We received a payment that needs checking. We'll contact you." This view wins over every other payment view and every `payment=` value: **no Pay now, no Retry payment**, no "Confirming…", no too-late or past-due text, and no Test mode banner (there is nothing to pay). `startPayment` refuses such an order too (`needs-check`, nothing written, no gateway call), so a Pay now from a page opened earlier can't open a new session; the panel then refreshes and shows this view. On a Cancelled order the line sits under spec 030's Cancelled view. A Paid order with a mismatched second payment is behavior 23 (its `refundRequired` covers it).

### The fake gateway

25. The event seam `deliverPaymentEvent` becomes the real handler (`handlePaymentEvent`: token, body, then `reconcileSession`), and the route and the fake both call it: the fake page's **Pay** completes the fake session, builds the `payment_session.completed` body, hands it to the handler **and waits for its answer**, then goes to the success return URL. **Let it expire** does the same with `payment_session.expired`. `reconcileSession`'s `getSession` and `getPayment` read the fake's own table (spec 031 D8), so the fake exercises the same confirmation path as Xendit. The fake page's action calls the handler after the fake session's own write has committed, never inside a transaction.
26. A handler answer other than 200 (a test seam forcing a failure) is logged, and the fake page still goes to the return URL: the order then stays Pending, as with a lost webhook.

### `pnpm webhook:replay`

27. `pnpm webhook:replay <sessionId> [--event completed|expired] [--url http://localhost:3000]` builds a Xendit-format body for that session (`event`, `business_id` "replay", `created` now, `data.payment_session_id` and `data.status`), sends it with `x-callback-token` from `.env.local`, and prints the HTTP status and nothing else (never the token or the body).
28. `--url` must be `http://localhost`, `http://127.0.0.1` or `http://[::1]` with any port; anything else is refused before sending (the script never posts to Production or a preview). Default event `completed`, default URL `http://localhost:3000`.
29. Because the handler confirms through the gateway, a replay only marks Paid when the gateway agrees: with the fake, for a fake session that was paid (or a repeat, answered as a duplicate); with real Xendit locally (a tunnel origin, spec 031 Q3), for a session paid on Xendit's test page, whose real webhook went to Production and was ignored there. A replay of a session that is still active → 503 (`active`), printed as such; of an expired one → 200, and its Payment becomes Expired.

### Errors and states, at a glance

| Situation | Answer | Written |
| --- | --- | --- |
| Token missing / wrong | 401 | nothing |
| Body over 64 KB | 413 | nothing |
| Not JSON / no `event` | 400 | nothing |
| Unknown event type, malformed session id | 200 | a log line only |
| Unknown session, unknown order, other environment | 200 | a log line only |
| Gateway unreachable, Xendit not caught up yet, session still active | 503 | a log line only |
| Completed session whose payment failed | 200 | a log line only |
| Body names one outcome, Xendit reports another | 200 | Xendit's outcome is applied |
| Repeat of a processed event | 200 | nothing more |
| Database error | 500 | nothing (rolled back) |
| Processed | 200 | `PaymentEvent` + the change |

Every row writes exactly one structured log line (rule *Logging*), the ignored ones included.

## 3. Examples

Values from specs 030 and 031: order **PCS-7KQ2M9XD**, P1 (AMD Ryzen 5 7600 × 2, delivery to Quezon City), total **2,311,000** centavos (₱23,110.00), placed 2026-11-01T07:00:00Z, `expiresAt` 2026-11-02T07:00:00Z. Its first session `ps-0123456789abcdef01234567`, `referenceId` "PCS-7KQ2M9XD-1", payment `py-…`, environment `development` unless stated. "Now" for the webhook: 2026-11-01T07:05:00Z.

### Verification (unit, pure: `callbackTokenMatches` and the route's header read)

| # | Header | Expected |
| --- | --- | --- |
| K1 | `x-callback-token` = the token | accepted |
| K2 | a different token of the same length | 401 |
| K3 | missing | 401 |
| K4 | the token plus one character (different length) | 401 (no early return: both sides hashed) |
| K5 | sent twice (the `Headers` value becomes "token, token") | 401 |
| K6 | empty string, or `XENDIT_WEBHOOK_TOKEN` unset | 401 |
| K7 | Header name in another case (`X-Callback-Token`) | accepted (header names are case-insensitive) |

### Parsing (unit, pure: `parseWebhook(body)`)

| # | Body | Expected |
| --- | --- | --- |
| B1 | `{"event":"payment_session.completed","data":{"payment_session_id":"ps-0123456789abcdef01234567"}}` | `{ type: "completed", sessionId: "ps-0123…", eventId: "payment_session.completed:ps-0123456789abcdef01234567" }` |
| B2 | The same with `payment_session.expired` | `type: "expired"`, eventId `payment_session.expired:ps-…` |
| B3 | `{"event":"payment.capture", …}` | `ignored-type` |
| B4 | `not json` / `[]` / `{"data":{}}` | `malformed` (400) |
| B5 | `payment_session_id` "abc" / missing / a number | `ignored-unknown` (200) |
| B6 | 65,537 bytes | 413, not parsed |

### Handler (integration, Vitest + Docker Postgres, fake gateway)

| # | Given | Event | Expected |
| --- | --- | --- | --- |
| H1 **paid** | P1 Pending; fake session paid (Completed, `py-…`) | completed | 200. Order **Paid**, `paidAt` = now, `paymentMethod` "FAKE". Payment Paid, `gatewayPaymentId` = the `py-…`, `method` "FAKE", `receivedAmount` 2,311,000, `receivedCurrency` "PHP", `problem` null. One `PaymentEvent` `payment_session.completed:ps-0123…` with the body. Stock unchanged. Log `{ outcome: "paid", orderNumber: "PCS-7KQ2M9XD", sessionId }` |
| H2 **duplicate** | H1 done | the same body again | 200, `duplicate`; still one `PaymentEvent`; order and payment rows' `updatedAt` unchanged |
| H2a | H1's state before commit | the same body twice at once (`Promise.all`) | One 200 `paid`, one 200 `duplicate`; one `PaymentEvent`; no error, no deadlock |
| H3 **mismatch** | P1 Pending; the fake session's amount set to 2,310,000 | completed | 200. Order **still Pending payment**, `refundRequired` false. Payment Paid, `receivedAmount` 2,310,000, `problem` `AMOUNT_MISMATCH`. One `PaymentEvent`. Log `mismatch` |
| H3a | The fake session's currency "USD" | completed | Same as H3 |
| H4 **late payment** | P1 set to Cancelled; its Payment Expired (as #81 leaves it); the fake session Completed | completed | 200. Order **still Cancelled**, `refundRequired` **true**, stock unchanged, no `StockMovement`. Payment Expired → **Paid**, `problem` `LATE`. Log `late` |
| H5 **second payment** | P1 Paid by session 1 (H1); session 2 (`…-2`, Expired by a retry) also Completed at the fake | completed for session 2 | 200. Order still Paid, `paidAt` and `paymentMethod` unchanged, `refundRequired` **true**. Payment 2 Paid, `problem` `SECOND_PAYMENT`. Log `second` |
| H6 **paid on an older session** | Session 1 Completed, then Retry made session 2 (Pending; session 1's row Expired) | completed for session 1 | Order Paid; Payment 1 Paid; Payment 2 **Expired**; after commit the fake session 2 is Canceled |
| H7 **unknown reference** | No such session at the fake | completed for `ps-ffffffffffffffffffffffff` | 200, `ignored-unknown`; **no `PaymentEvent`**, nothing written; log line L3 |
| H7a | Session's `metadata.order_id` names no order | completed | Same as H7; log line L4 |
| H7b | `metadata.order_id` is P1's id but `metadata.order_number` is another number | completed | Same as H7; log line L4 |
| H8 **other environment** | P1 and its session with `metadata.environment` "production"; this run is `development` | completed | 200, `ignored-environment`; **nothing written, no `PaymentEvent`**; order Pending; log line L5 |
| H9 **matching environment** | The same session with `environment` "development" | completed | Processed as H1 |
| H10 **orphan** | P1 Pending; a Completed fake session for it with no `Payment` row (spec 031 A11) | completed | A `Payment` inserted (FAKE, the session id, "…-1" from the gateway, 2,311,000) directly as Paid; order Paid |
| H10a | Orphan, and the order has an open Pending Payment for another session | completed | Orphan row inserted as Paid (no unique-index clash); the other Payment Expired, its session closed after commit |
| H11 **expired** | P1 Pending; Payment 1 Pending; fake session Expired ("Let it expire") | expired | 200. Payment 1 **Expired**; order unchanged; one `PaymentEvent` `payment_session.expired:ps-…` |
| H11a | Payment 1 already Expired (a retry closed it) | expired | 200; event recorded; nothing else changes |
| H12 | Body says completed; the fake session is Expired, Payment 1 Pending | completed | 200, `expired`: Xendit's outcome is applied (Payment 1 Expired, order unchanged); `PaymentEvent` `payment_session.completed:ps-…` recorded |
| H12a | Body says completed; the fake session is still Active | completed | **503**, `active`, nothing written; log line L6 |
| H12b | Body says expired; the fake session is Completed | expired | 200, `paid`: processed as H1, with `PaymentEvent` `payment_session.expired:ps-…` |
| H12c | Session Completed, the fake's payment reads failed (test seam) | completed | 200, `unconfirmed`, nothing written; log line |
| H13 | The fake's `getSession` fails (`fail.get`) | completed | **503**, `retry`; nothing written; the same event later (fail cleared) → processed as H1 |
| H14 | The transaction fails after the event insert (forced) | completed | 500; no `PaymentEvent`, order Pending; a retry processes it |
| H15 | P1 Pending, now 2026-11-02T08:00:00Z (past `expiresAt`, #81 not run yet), session Completed | completed | Order **Paid** (D4) |
| H16 | Wrong token | completed | 401; the fake's `getSession` was **not called**; nothing written |
| H17 **no API call in a transaction** | H1, H6, H11 and H13 with a spy that fails the test if a gateway method is called while a transaction is open | | Every gateway call happens before the transaction or after its commit |

### `reconcileSession` without an event (integration; how #81 calls it)

| # | Given | Call | Expected |
| --- | --- | --- | --- |
| C1 **missed webhook** | P1 Pending, past `expiresAt`; fake session Completed; no webhook ever arrived | `reconcileSession(id)` | `paid`; order **Paid**, Payment Paid; **no `PaymentEvent`** (there is no event); #81 then finds the order Paid and doesn't release it |
| C2 | P1 Pending, Payment Pending, fake session Active | `reconcileSession(id)` | `active`; nothing written (#81 goes on to close the session and release) |
| C3 | P1 Pending, fake session Expired | `reconcileSession(id)` | `expired`; Payment Expired; order unchanged |
| C4 | C1 done | `reconcileSession(id)` again | `already-applied`; nothing changes |
| C5 | C1 done, then the late webhook arrives | completed | 200; `PaymentEvent` recorded; order and Payment unchanged (`already-applied`) |
| C6 | C1's session, gateway unreachable | `reconcileSession(id)` | `retry`; nothing written (#81 decides what to do, §8) |

### Logging (unit, the log spy; every outcome writes exactly one line)

| # | Case | The one JSON line (fields not known at that point are left out) |
| --- | --- | --- |
| L1 | Wrong token (K2) | `{ "event": "payment.webhook", "outcome": "unauthorized" }` |
| L2 | Unknown type (B3) | `{ "event": "payment.webhook", "outcome": "ignored-type", "type": "payment.capture" }` |
| L3 | Unknown session (H7) | `{ "event": "payment.webhook", "outcome": "ignored-unknown", "type": "payment_session.completed", "sessionId": "ps-ffffffffffffffffffffffff" }` |
| L4 | Unknown order (H7a, H7b) | as L3, plus `"code": "unknown-order"` |
| L5 | Other environment (H8) | `{ …, "outcome": "ignored-environment", "sessionId": "ps-0123…", "code": "production" }` (the session's environment, never its order id) |
| L6 | Not caught up (H12a) | `{ …, "outcome": "active", "sessionId": "ps-0123…" }` |
| L7 | Paid (H1) | `{ …, "outcome": "paid", "sessionId": "ps-0123…", "orderNumber": "PCS-7KQ2M9XD" }` |
| L8 | Every case above | No console call (any method) contains the token, the body, the access token, a URL, an email or a mobile number |
| L9 | A malformed session id (B5) | `{ …, "outcome": "ignored-unknown", "type": "payment_session.completed" }` (the bad value itself is not logged) |

### Order page (unit, markup with fixtures; `paymentView` and `OrderView`)

| # | Order / URL | Expected |
| --- | --- | --- |
| V10 | Paid, `paidAt` 2026-11-01T07:05:00Z, method `GCASH` | Timeline at Paid; "Paid on Sun 1 Nov 2026, 3:05 PM with GCash."; no banner, no payment area |
| V11 | Paid, method `PAYMAYA` / `CARDS` / `FAKE` / `QRPH` | "…with Maya." / "…with a card." / "…with the test payment page." / "Paid on Sun 1 Nov 2026, 3:05 PM." |
| V12 | Cancelled, `refundRequired` | Cancelled view + "Payment received after this order was cancelled. We'll refund it." |
| V13 | Paid, `refundRequired` | Paid view + "We received a second payment for this order. We'll refund it." |
| V14 | Pending, 23 h left, newest Payment Expired, none Pending, no `payment=` | "Payment not completed. You haven't been charged." + **Retry payment** |
| V14a | V14 with `payment=return` | "Confirming your payment…" (spec 031 V2 unchanged) |
| V14b | V14 with 9 min left | The too-late text, no button |
| V15 | Pending, newest Payment Pending | **Pay now** (spec 031 V1 unchanged) |
| V16 **mismatch** | Pending, 23 h left, a Payment with `AMOUNT_MISMATCH` | "We received a payment that needs checking. We'll contact you."; **no Pay now, no Retry payment**, no Test mode banner |
| V16a | V16 with `payment=return` / `payment=cancelled` / `payment=error` | The same as V16 (no "Confirming…", no Retry) |
| V16b | V16 with 9 min left / past `expiresAt` | The same as V16 (no too-late or past-due text) |
| V16c | V16 and a newer Pending Payment (opened before the mismatch arrived) | The same as V16 |
| V16d | Cancelled (by #81), a Payment with `AMOUNT_MISMATCH` | Cancelled view + "We received a payment that needs checking. We'll contact you." |
| V16e | Paid with `refundRequired` and a mismatched second payment | V13's text only |
| S9 | V16's order, `startPaymentAction` (Pay now from a page opened earlier) | `needs-check`; no gateway call, nothing written; the panel refreshes into V16 (integration) |

### Replay script (unit, pure argument check)

| # | Arguments | Expected |
| --- | --- | --- |
| W1 | `ps-0123…` | POST to `http://localhost:3000/api/webhooks/xendit`, event `payment_session.completed` |
| W2 | `ps-0123… --event expired --url http://127.0.0.1:3001` | `payment_session.expired` to that URL |
| W3 | `--url https://pcsilicon.example` / `http://192.168.1.5:3000` | Refused before sending: "webhook:replay only posts to localhost." |
| W4 | No session id / `abc` | "Usage: pnpm webhook:replay <ps-…> [--event completed|expired] [--url http://localhost:3000]" |
| W5 | `XENDIT_WEBHOOK_TOKEN` not in `.env.local` | "XENDIT_WEBHOOK_TOKEN is not set in .env.local." |

### Environment (unit, the env schema)

| # | Variables | Expected |
| --- | --- | --- |
| E8 | `PAYMENT_GATEWAY=xendit`, a test key, no `XENDIT_WEBHOOK_TOKEN` | Startup fails: "XENDIT_WEBHOOK_TOKEN is not set" (now required with both gateways) |
| E9 | `XENDIT_WEBHOOK_TOKEN` of fewer than 16 characters, `PAYMENT_GATEWAY=xendit` | Valid (Xendit makes the token; we don't judge its length). With `fake` it stays any value (spec 031) |

### E2E (Playwright, fake gateway)

| # | Journey | Expected |
| --- | --- | --- |
| X5 **checkout → paid** | Place an order with spec 030's E2E part → fake page → **Pay** | Order page: timeline at **Paid**, "Paid on … with the test payment page.", no Test mode banner, no Pay now |
| X6 | Place → fake page → **Let it expire** | Order page: "Payment not completed. You haven't been charged." + Retry payment; reload without `payment=` → the same (V14) |
| X7 | X6 → Retry payment → Pay | Paid |
| X8 **mismatch** | Place → change the fake session's amount through an E2E helper (like `e2e/stock.ts`) → **Pay** | Order page: "We received a payment that needs checking. We'll contact you."; no Pay now, no Retry payment |

## 4. Rules and edge cases

- **Only `reconcileSession` sets Paid** (FR-22, as changed by this story: "set only from the gateway (verified webhook or server-side status check), never from the browser redirect"), and only after Xendit's own API says the session is completed and its payment succeeded. Its callers are the webhook route (after the token check) and #81's release. The body's `status`, `amount` and `payment_id` are never trusted; only its event type and session id are read.
- **Gateway calls: Xendit API calls never run inside a database transaction.** In this story that covers `reconcileSession` (`getSession` and `getPayment` before the transaction; `closeSession` of another open session after the commit), the webhook route, the fake page's Pay and Let it expire, and `pnpm webhook:replay`. No connection is held, and no row is locked, while waiting on Xendit. The reads can't go stale before the lock: a completed or expired session never becomes active again, and a completed payment never changes. H17 enforces it with a spy. (Spec 031's `startPayment` does call the gateway inside its order lock; see Q6.)
- **Idempotency** is the `PaymentEvent.eventId` unique index, in the same transaction as the change. Xendit sends no event id, so the key is derived: `{event}:{payment_session_id}` (a session completes or expires once). Two concurrent deliveries: the second insert waits on the first's uncommitted row and then gets no row back.
- **Only processed events are stored.** Ignored ones (unauthorized, malformed, unknown type or session, other environment, unconfirmed, transient) write no `PaymentEvent`, only their log line, so an attacker without the token, or another environment's traffic, can't fill the table, and a later retry of a transient one isn't blocked as a duplicate.
- **Retries:** 5xx only for what a later try can fix (gateway unreachable or not caught up, database error). Everything permanent is 200, so Xendit doesn't retry for 24 hours.
- **Pending past `expiresAt`** (H15): a completed session was paid before its own `expires_at`, which is never later than the order's (spec 031 §4), so the payment was on time and the webhook was late. The order becomes Paid. #81's release changes the status only if it is still Pending payment, under the same lock, so the two can't both win: whichever commits second sees the other's status (Paid → #81 skips it; Cancelled → this is a late payment).
- **The order lock** is the one `startPayment` and #81 take, so a webhook, a Retry and a release on the same order run one after another.
- **Amounts** are compared as integer centavos; a gateway amount that isn't a valid peso amount (`fromProviderAmount` → null) counts as a mismatch.
- **Refund flag:** `Order.refundRequired` is only ever set to true here; clearing it is Admin's refund (Sprint 8, FR-26). Late and second payments never change stock or status.
- **Mismatch:** Xendit charges exactly the amount we asked for, so this means a bug or tampering. The order's status stays Pending payment, but it is **no longer payable**: the page says the payment needs checking and offers no Pay now or Retry, and `startPayment` refuses it (`needs-check`), so the shopper can't pay a second time while it is being checked (D6). #81 may still cancel it at `expiresAt` (Q7).
- **Body size** is capped at 64 KB before parsing (Xendit's session bodies are under 2 KB).
- **Payload:** `PaymentEvent.payload` keeps the body as JSON. It holds no shopper details (spec 031 sends none to Xendit); it does hold the order id and number from metadata. Never logged.
- **Logging** (Observability): **every** webhook writes exactly one JSON line through `logPaymentEvent`, the ignored ones included (unknown session, unknown order, other environment, unknown type, malformed, unauthorized): `{ event: "payment.webhook", outcome, type, sessionId, orderNumber, code }`, the fields that are known at that point, nothing else (L1–L9). `reconcileSession` called without an event logs `{ event: "payment.reconcile", … }` the same way. Never the token, the body, the access token, a return URL or shopper details (spec 030's rule; the log spy test covers every console method). Outcomes: `paid`, `mismatch`, `late`, `second`, `expired`, `duplicate`, `already-applied`, `active`, `unconfirmed`, `ignored-type`, `ignored-unknown`, `ignored-environment`, `unauthorized`, `malformed`, `too-large`, `retry`, `not-yet`, `error`. Closing another session after Paid logs `payment.close_after_paid` with a failure code.
- **The status route, polling and `payment=` values** are unchanged (spec 031). Polling stops at the first non-pending status, so a Paid order refreshes once.
- **Preview deployments** get no real webhooks (Deployment Protection); the fake runs the handler in process. Production's handler ignores local and preview sessions by environment.
- **`ORDERS_ENABLED` off** doesn't affect webhooks: existing orders can still be paid and confirmed.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Paid line | "Paid on {Ddd D Mmm YYYY, h:mm AM} with {method}." / without a known method: "Paid on {…}." |
| Method names | `GCASH` → "GCash"; `PAYMAYA` → "Maya"; `CARDS` → "a card"; `FAKE` → "the test payment page" |
| Late payment (Cancelled) | "Payment received after this order was cancelled. We'll refund it." |
| Second payment (Paid or later) | "We received a second payment for this order. We'll refund it." |
| Payment needs checking (amount mismatch) | "We received a payment that needs checking. We'll contact you." |
| Latest session expired (Pending) | "Payment not completed. You haven't been charged." + "Retry payment" (spec 031's copy, reused) |
| Replay script | "webhook:replay only posts to localhost." · "Usage: pnpm webhook:replay <ps-…> [--event completed\|expired] [--url http://localhost:3000]" · "XENDIT_WEBHOOK_TOKEN is not set in .env.local." · "{status} {outcome}" (e.g. "200 OK", "401 Unauthorized") |

## 6. Data and interfaces

### Route

- `POST /api/webhooks/xendit` (`app/api/webhooks/xendit/route.ts`): reads `x-callback-token` and the body as text, forwards to `handlePaymentEvent`, answers its status with an empty body. No other methods. No `outputFileTracingIncludes` entry (it doesn't call `resolveAddress`).
- `xendit` is a reserved top-level slug already through `api`; nothing to add to `lib/reserved-slugs.ts`.

### Functions

- `handlePaymentEvent({ headers, body }, options?) → { status: 200 | 400 | 401 | 413 | 500 | 503, outcome }` (`lib/payments/events.ts`, replacing `deliverPaymentEvent`'s body): behavior 2–6 and 18 (token, size, parse, then `reconcileSession`, then the HTTP answer). Options for tests: `gateway`, `environment`, `now`, `expectedToken`.
- **`reconcileSession(sessionId, { event?, gateway?, environment?, now?, afterStep? }) → ReconcileResult`** (`lib/payments/reconcile.ts`, server only): behavior 7–17. Phase 1 calls the gateway with no transaction open; phase 2 is one transaction with no gateway call; a closing call for another open session runs after the commit. `event` is `{ eventId, type, payload }` from the webhook; without it (#81) no `PaymentEvent` is written. `ReconcileResult` is `{ outcome, orderNumber?, code? }` with the outcomes of rule *Logging*. Safe to call any number of times (behavior 10).
- `parseWebhook(body: string)` (pure): B1–B6.
- The decision inside phase 2 is pure: `completedOutcome(orderStatus, amountsMatch) → "paid" | "mismatch" | "late" | "second"` and `expiredOutcome(paymentStatus)`, tested on their own.
- `logPaymentEvent(fields)` (`lib/payments/log.ts`).
- `paymentView` gains two inputs (V14–V16e): the latest payment's status (`"pending" | "expired" | "paid" | null`) and whether any payment needs checking; it gains the view `needs-check`, which wins over every other view on a Pending or Cancelled order.
- `startPayment` gains the refusal `needs-check` (S9), checked with the order row locked, before any gateway call.
- `paidLine(paidAt, method)` and `methodName(code)` (pure, `lib/payments/copy.ts`).
- `PaymentGateway.getSession`'s `SessionDetails` gains `referenceId` and `expiresAt` (Xendit's `reference_id`, `expires_at`), needed to insert an orphan's `Payment` (H10). The fake already stores both.
- `scripts/webhook-replay.ts`, run as `pnpm webhook:replay` (`tsx`), reads `.env.local` itself (like `payments:check`).

### Schema (one migration)

- `Order`: `paidAt DateTime?`, `paymentMethod String?` (the gateway's channel code), `refundRequired Boolean @default(false)`. Migration CHECK: `status <> 'PENDING_PAYMENT' OR "paidAt" IS NULL` (a pending order was never paid).
- `Payment`: `paidAt DateTime?`, `gatewayPaymentId String?` (Xendit's `py-…`), `receivedAmount Int?` (centavos), `receivedCurrency String?`, `problem PaymentProblem?`; `method` (exists) is now set. CHECK: `status = 'PAID'` exactly when `paidAt IS NOT NULL`.
- `enum PaymentProblem { AMOUNT_MISMATCH, LATE, SECOND_PAYMENT }`.
- `PaymentEvent`: `id` (cuid), `eventId String @unique`, `type`, `payload Json`, `paymentId String?` → `Payment` (`Restrict`; null for an expired orphan), `receivedAt DateTime @default(now())`. Never deleted.
- `resetCatalog()` and `db:seed --reset` name `PaymentEvent`.

### Environment

| Variable | Change |
| --- | --- |
| `XENDIT_WEBHOOK_TOKEN` | Now **required with `xendit` too** (E8); was required with `fake` only. Production: the Dashboard's verification token (`docs/setup/payments.md` already says so). Never logged or printed |

No `PAYMONGO_WEBHOOK_SECRET` (D1).

### Documents

- `docs/setup/payments.md`: the Production webhook checklist confirmed against what was built; a "Replaying a webhook locally" section (`pnpm webhook:replay`, localhost only, paired with the fake or with a session paid on Xendit's test page); `XENDIT_WEBHOOK_TOKEN` "required with both gateways".
- **PRD** (`docs/prd.md`): FR-22 becomes "Payment status is set only from the gateway (verified webhook or server-side status check), never from the browser redirect." (D16; done with this review). Data model: `Payment` loses `rawEvent` (the body lives in `PaymentEvent.payload`, linked by `paymentId`) and gains `paidAt` and `problem`; `PaymentEvent.eventId` notes "derived for Xendit: `{event}:{session id}`"; `Order` gains `paidAt`. Flagged in D5.
- CLAUDE.md's Paying paragraph: the handler, the derived event id, "nothing writes a `PaymentEvent` for an ignored event".
- No new ADR: ADR 0010 already decided "the webhook is a hint, confirmed through the API".

## 7. Test plan

| Level | Examples |
| --- | --- |
| Unit (Vitest, pure) | K1–K7, B1–B6, `completedOutcome` and `expiredOutcome` for every status, V10–V16e (`paymentView`, `paidLine`, `OrderView` markup), W1–W5, E8–E9, `SessionDetails` mapping of `reference_id` / `expires_at` in the Xendit adapter (recorded JSON), L1–L9 (one line per outcome, ignored ones included; nothing secret in any console call) |
| Integration (Vitest + Docker Postgres, fake gateway) | H1–H17 (H7, H7a, H7b and H8 also assert their log line); C1–C6; S9; the route itself once through `POST` with a `Request` (H1 and H16); the new CHECKs; the `PaymentEvent.eventId` unique index; `resetCatalog()` empties `PaymentEvent`; the fake page's Pay and Let it expire now change the order and payment (spec 031 F2 updated) |
| E2E (Playwright, fake gateway) | X5 (the epic's checkout → paid), X6, X7, X8; spec 031's X4 changes from "stays Pending" to Paid |
| Manual | Preview: X5–X7. Production after deploy: a test card payment reaches Paid through the real webhook; a local session's webhook is ignored on Production (Vercel log shows `ignored-environment`); `pnpm webhook:replay` against a local real-Xendit session |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Cancelling expired orders, releasing stock, closing their sessions | #81 (this handler gives #81's race its late-payment path; #81 calls `reconcileSession` first, below) |
| Issuing refunds, clearing `refundRequired`, the Refunded status, an admin view of payment problems | FR-26, Sprint 8 (Admin) |
| "Payment received" email | FR-21, Sprint 7 |
| Xendit's v3 payment webhooks (`payment.capture`, `payment.failure`, …) | Not subscribed; session events cover the hosted page (D3) |
| Cash on delivery | Sprint 7 (FR-25) |
| Changing spec 031's `startPayment` so its gateway calls leave the transaction | Q6 |
| Rate limiting the webhook route | #64 (an unauthenticated request already costs one hash compare and nothing else) |
| Admin's view of payment problems and contacting the shopper about a mismatch | Admin, Sprint 8 |
| Polling's "Still confirming" text when a session expires during confirmation | Unchanged; a reload shows Retry (V14) |

### Note for #81 (added to the issue)

Before releasing an order, #81 calls **`reconcileSession`** for each of the order's sessions that could still have been paid: its Pending `Payment`, and its Expired ones (a retry or an earlier close may have raced a payment). Each call asks Xendit outside any transaction, then applies the result under the order lock, so a payment whose webhook was missed (Production down, Xendit's retries used up) makes the order **Paid instead of Cancelled** (C1). #81's own release then runs in its own transaction and changes the status only if it is still Pending payment. A result of `retry` (Xendit unreachable) is #81's to decide; the recommendation for #81's spec is to skip that order on this run and try again on the next one, since releasing it could cancel a paid order. These calls are Xendit API calls, so they too run outside every database transaction, including the purchase transactions in which #81's scoped release runs (`addToCart`, placement): the scoped release can only reconcile before its transaction opens, or leave reconciling to the global sweep and the cron. #81's spec decides which.

## 9. Decisions

- **D1 — Issue #80's PayMongo criteria map to Xendit like this.** `POST /api/webhooks/paymongo` → `/api/webhooks/xendit`; `Paymongo-Signature` HMAC-SHA256 of `{timestamp}.{body}` → the static `x-callback-token`, compared in constant time (Xendit signs nothing); the timestamp tolerance → **dropped** (Xendit sends no signed timestamp; replays are stopped by idempotency and by confirming through the API instead); the event id → derived `{event}:{session id}`; `checkout_session.payment.paid` → `payment_session.completed`; `payment.failed` → `payment_session.expired` (D3); `PAYMONGO_WEBHOOK_SECRET` → `XENDIT_WEBHOOK_TOKEN`; the signature unit tests (valid, tampered body, wrong secret, old timestamp) → K1–K7 plus H12 and H12b (a "tampered" body is caught by the API confirmation, not by the token). *Rejected:* keeping a PayMongo-shaped route for a gateway we don't use.
- **D2 — Confirm through the API before any write, and never inside a transaction.** The token is per account and shared by every environment, so it proves only that the sender knows it. Calling Xendit while a transaction is open would hold a pooled connection and the order's lock for up to the gateway's timeout. *Rejected:* trusting the body's status and amount (ADR 0010 already rejected it); reading inside the lock (no gain, since completed and expired are final).
- **D3 — `payment_session.expired` stands in for `payment.failed`**, and `FAILED` stays unused. Xendit retries a failed attempt inside its page and never ends a session as failed. *Rejected:* subscribing to v3 `payment.failure` (fires per attempt while the session is still payable; showing "failed" would be wrong).
- **D4 — A Pending order past `expiresAt` still becomes Paid.** The session couldn't be paid after its own expiry, which is never after the order's, so the payment was on time. *Rejected:* treating it as late (the shopper did everything right; a refund would be the store's fault).
- **D5 — The webhook body lives in `PaymentEvent.payload`, not `Payment.rawEvent`.** One payment can get several events, and the event row is what makes the handler idempotent. This changes the PRD's data model table (flagged; §6 *Documents*). *Rejected:* both columns (the same body twice).
- **D6 — A mismatch keeps the order's status but is shown, and stops payment** (review decision): "We received a payment that needs checking. We'll contact you.", no Pay now or Retry, and `startPayment` refuses (`needs-check`). The flag is `Payment.problem`, not `Order.refundRequired`. *Rejected:* staying silent (the shopper would see Pay now and could pay twice); setting `refundRequired` (the issue reserves it for late and second payments, and the payment may turn out to be acceptable).
- **D7 — Payment problems are an enum on `Payment`** (`AMOUNT_MISMATCH`, `LATE`, `SECOND_PAYMENT`), so Admin can list them. *Rejected:* a free-text note; separate booleans.
- **D8 — 503 when Xendit hasn't caught up** (session still active, payment pending) instead of ignoring. A retry 15 minutes later finds it consistent; ignoring would lose a real payment. *Rejected:* 200 and drop (a lost Paid); polling Xendit ourselves (more moving parts).
- **D9 — Ignored events write no `PaymentEvent`, but always a log line** (review decision). *Rejected:* recording every delivery (other environments' traffic would fill the table); ignoring silently (a misconfigured webhook would be invisible).
- **D10 — The fake's Pay waits for the handler** before redirecting, so E2E sees Paid without depending on poll timing. *Rejected:* fire and forget (flaky tests; serverless may stop the work after the response).
- **D11 — A paid order expires its other open sessions** (behavior 14), so a shopper can't pay twice by finishing a newer tab. *Rejected:* leaving them open until #81.
- **D12 — The Retry view appears when the latest session expired** (behavior 21), which is how the issue's "the order page offers Retry payment" works without a `payment=` value. It reuses spec 031's cancelled copy. *Rejected:* a new message for expiry (the shopper's situation is the same: not charged, try again).
- **D13 — `webhook:replay` only posts to localhost.** It holds the real token when `.env.local` has Production's; a typo shouldn't send events to Production. *Rejected:* any URL with a confirmation prompt.
- **D14 — One `reconcileSession` for every caller** (review decision): the webhook route and #81's release ask Xendit and apply the result the same way, so a missed webhook is recovered before an order is cancelled. The apply step is idempotent without an event (behavior 10), because #81 has none. *Rejected:* logic inside the route only (a missed webhook would cancel a paid order); #81 reading Xendit with its own code (two ways to decide Paid).
- **D15 — Xendit's answer decides, not the event type** (behavior 18): a "completed" body for a session Xendit reports expired applies Expired, and the reverse applies Paid. This follows from D14: reconcile reads the gateway's state, whatever prompted it. *Rejected:* ignoring a body whose type disagrees (it still told us the session changed).
- **D16 — FR-22 changes** (review decision) to "Payment status is set only from the gateway (verified webhook or server-side status check), never from the browser redirect." A scope wording change, so the PRD is edited first (§6 *Documents*).

**Disagreements flagged:** the issue names PayMongo, HMAC signatures and a timestamp tolerance throughout (D1); the issue's `payment.failed` → Failed becomes expired → Expired (D3); the issue's "order unchanged" on a mismatch now also stops payment and shows a message (D6); the PRD's `Payment.rawEvent` moves to `PaymentEvent.payload` (D5); the PRD's `PaymentEvent.eventId` is derived, since Xendit has none; the PRD's FR-22 wording changes (D16); spec 031's X4 ("the order stays Pending") changes to Paid, as spec 031 said it would; spec 031's `startPayment` calls Xendit inside its transaction, against this spec's rule (Q6); #81's issue text puts the release inside purchase transactions, where `reconcileSession` can't run (§8 note).

### Acceptance criteria → examples and rules

| Issue #80 criterion (mapped to Xendit by D1) | Covered by |
| --- | --- |
| Raw body; verify the callback (was: HMAC signature) in constant time | Behavior 2–3; K1–K7; H16 |
| Replay protection (was: timestamp tolerance) | Rules *Idempotency*, *Only `reconcileSession` sets Paid*; H2, H12, H12b; D1 |
| Failure → 401 and nothing else | Behavior 2; K2–K6; H16; L1 |
| Idempotent by event id, `PaymentEvent` with `ON CONFLICT DO NOTHING` in the same transaction; repeat → 200, no change | Behavior 9–10; H2, H2a, H14, C5; §6 Schema |
| Other environment → 200, log, no change, no `PaymentEvent`; same for unknown references | Behavior 7; H7, H7a, H7b, H8, H9; L3–L5; D9 |
| Paid event (`payment_session.completed`), order locked: Pending + match → Paid, `paidAt`, method; Payment Paid with the payment id | Behavior 8–13; H1, H6, H10, H15, C1; V10–V11 |
| Amount or currency mismatch → Payment recorded, order unchanged, flagged, logged (review: and shown, no Pay now or Retry) | Behavior 13, 24; H3, H3a; V16–V16e; S9; X8; D6 |
| Cancelled → Payment Paid, `refundRequired`, no status or stock change; page says "Payment received after this order was cancelled. We'll refund it." | Behavior 13, 22; H4; V12 |
| Already Paid (second session) → the same refund flag | Behavior 13, 23; H5; V13 |
| Failed (was `payment.failed`) → Payment Failed, page offers Retry | Behavior 16–17, 21; H11, H11a, C3; V14; X6; D3, D12 |
| Unknown event types → 200; only transient errors 5xx | Behavior 4, 18; B3; H12a, H13, H14; rule *Retries* |
| Structured logs for every payment event | Rule *Logging*; L1–L9 |
| `pnpm webhook:replay` signs (sends the token) and posts a test event to localhost | Behavior 27–29; W1–W5; D13 |
| Unit tests: signature (valid, tampered, wrong secret, old timestamp) | K1–K7, H12, H12b (D1) |
| Integration tests: paid, duplicate, mismatch, late, second, unknown reference, other environment, matching environment | H1, H2, H3, H4, H5, H7, H8, H9 |
| E2E checkout → paid with the fake | X5 |
| Task: the secret in `lib/env.ts`, `.env.example`, CI | §6 Environment; E8 (`XENDIT_WEBHOOK_TOKEN`, already in all three) |
| Task: order page late-payment and failed states | V12–V14 |
| Task: confirm the header format in the docs | Spec 031 §6 *Xendit, as documented* (`x-callback-token`); re-read during planning |
| Review: missed webhooks recovered through one reusable reconcile | Behavior 6–18; C1–C6; §8 note for #81; D14 |
| Review: Xendit API calls never inside a transaction | Rule *Gateway calls*; H17; D2 |
| Review: ignored webhooks still log | Rule *Logging*; L3–L5, L9; H7, H7a, H7b, H8 |

## 10. Open questions

### Resolved in review (2026-11-01)

- **Q1 — Issue #80:** fully edited: renamed "Payment webhooks (Xendit)", acceptance criteria rewritten in Xendit terms, with a link to this spec.
- **Q2 — `metadata` in session webhooks:** checked on one real webhook on Production after deploy; nothing depends on it.
- **Q3 — `GET /v3/payments/{payment_id}`:** confirmed during planning with `pnpm payments:check` (read the session and its payment after paying a test session by card).
- **Q4 — Method copy:** "Paid … with a card." / "with GCash" / "with Maya".
- **Q5 — Mismatch:** shown ("We received a payment that needs checking. We'll contact you."), Retry hidden (D6).

### Pending

- **Q6 — Spec 031's `startPayment` calls Xendit inside its transaction.** It locks the order row and closes and creates sessions while holding it (spec 031 behavior 13, timeout 25 s). That is what keeps one open session per order, and it disagrees with this spec's rule. **Recommendation:** keep the rule scoped to this story's code and leave `startPayment` as it is for now: making it lock-free needs a "starting" claim on the order (a status column and a recovery path for a crash between the claim and the create), which is a design change to a merged story. Open a follow-up issue to revisit it with a measured lock time. The alternative is to change it in this story.
- **Q7 — Should #81 cancel an order whose payment needs checking?** After a mismatch, the order stays Pending payment, so at `expiresAt` #81 would cancel it and release its stock; the page then shows Cancelled plus the needs-checking line (V16d). **Recommendation:** yes, cancel it as usual: stock shouldn't be held for a case only Admin (Sprint 8) can resolve, and the `Payment` keeps its problem for Admin. Noted for #81's spec.

## 11. Changes from review (2026-11-01)

1. **`reconcileSession`** (D14): the logic is one reusable function, called by the route; the API call is outside the transaction, which then locks the order and applies the result. §2 behaviors 6–18 restructured; C1–C6 added; a note for #81 (§8, and on the issue).
2. **FR-22** reworded in the PRD (D16).
3. **Issue #80** fully rewritten for Xendit (Q1).
4. Q2, Q3, Q4 settled as recommended.
5. **Mismatch is shown** and stops payment (behavior 24, D6, V16–V16e, S9, X8; copy in §5).
6. **Ignored webhooks log** one structured line each (rule *Logging*, D9, L1–L9; H7, H7a, H7b, H8 assert it).
7. **Xendit API calls never run inside a database transaction** (rule *Gateway calls*, D2, H17), with spec 031's `startPayment` flagged as Q6.
8. Side effects: a body whose event type disagrees with Xendit now applies Xendit's outcome (D15, H12, H12b changed); `active` is a result of its own (503); Q7 added.
