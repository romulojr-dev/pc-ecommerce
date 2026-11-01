# 031 — Pay with a Xendit payment session

Status: **Implemented** (test-mode checks Q4, Q6 and Q8 pending) · Approved in review 2026-11-01 · Issue: #79 (Sprint 6, Checkout epic #4; depends on #78, merged as spec 030) · PRD refs: Payments and fulfillment (method table), FR-22 (the redirect never marks Paid), FR-23 (a payment record per attempt), FR-27 (Test mode banner with test instructions); Data model › `Payment`; Risks (mock provider adapter behind the same interface)

**Gateway decision (settled before this spec):** Xendit in test mode, not PayMongo. The PRD named Xendit as the fallback; the owner has a Xendit test account. Issue #79's text was written for PayMongo; this spec is the behavior, and D1 maps each PayMongo criterion to its Xendit equivalent.

## 1. Summary

Placing an order now goes straight to a Xendit-hosted payment page (a **Payment Session**, `session_type: PAY`, `mode: PAYMENT_LINK`) where a guest pays the order total in PHP with GCash, Maya or a test card. Coming back, the order page only says "Confirming your payment…" and waits: it never marks the order Paid, because only a verified webhook does that (FR-22, #80). A cancelled payment can be retried while the order is still Pending payment. Each attempt is a `Payment` row (FR-23). The gateway sits behind a small provider-neutral interface with two adapters, Xendit and a **fake** that speaks Xendit's format, so CI, E2E and Vercel previews (which get no real webhooks) can run the whole flow. The story also records the gateway choice: ADR 0010 "Payment gateway: Xendit (test mode)", a PRD change and a rewritten `docs/setup/payments.md` (§6, *Documents*).

## 2. Behavior

### Placing an order opens the payment page

1. **Place order** (spec 030) works as before, then the same server action starts a payment for the new order (*Starting a payment*, below). On success the browser:
   - clears the checkout draft and sets the header count to 0, as before;
   - **replaces** the checkout's history entry with the order link (`/orders/{number}?key={token}`), so the browser's Back button from Xendit lands on the order page, not on a checkout for an empty cart;
   - goes to the session's `payment_link_url` (a full navigation to `checkout-staging.xendit.co` for Xendit, to `/test-payment/{id}` for the fake).
   The button keeps its busy state ("Placing your order…") until the page unloads.
2. **The order is placed even if the payment can't start.** Placement commits first; starting the payment is a second step. If that step fails (Xendit unreachable, a 4xx/5xx, the order too close to expiry), the browser goes to the order link with `payment=error`, and the order page shows "We couldn't open the payment page. Try again." above **Pay now**. Nothing is lost: the order and its held stock are as spec 030 left them.
3. A **replay** of Place order (the same idempotency key and token, spec 030 D14) returns the same order and starts a payment the same way, which closes any session the first request opened (rule *One open session per order*). A double click therefore ends with one open session.

### The order page while Pending payment

4. The "Paying online is coming soon." line (spec 030) is replaced by a **Pay now** button whenever the order is **payable**: status Pending payment and at least `MIN_SESSION_MINUTES` (10) before `expiresAt` (§4 *Time left*). Pay now runs *Starting a payment* and goes to the new session's page, with the busy label "Opening the payment page…". On failure it stays on the page with "We couldn't open the payment page. Try again." next to the button (not a live region role; an `aria-live="polite"` container, like spec 026's results).
5. **Under 10 minutes before `expiresAt`** (Xendit's minimum session lifetime), still Pending payment: **no session is opened** (no gateway call, no `Payment` row), no button, and the line "This order expires in a few minutes and can't be paid. Place a new order." The same text answers Place order's payment step (behavior 2: the browser goes to the order link with `payment=error`, and the page shows this text instead of "We couldn't open…", because the order is no longer payable) and a Pay now or Retry clicked as the window closes (the action answers `expired`). After `expiresAt` the spec 030 past-due text shows, unchanged.
6. The **Test mode banner** (FR-27) shows on the order page while it is Pending payment, above the payment line, with the adapter's test instructions (§5). It shows on every checkout step too (spec 029), now with the same instructions. Paid, Cancelled and later statuses have no banner.

### Coming back from the payment page

The session's two return URLs are the order link plus a `payment` value: `payment=return` for `success_return_url`, `payment=cancelled` for `cancel_return_url`. The value only chooses what the page shows; it never changes data.

7. **`payment=return`, order still Pending payment:** the payment area shows only "Confirming your payment…" (with a spinner, in an `aria-live="polite"` container); no Pay now. The page polls the order's status through `GET /api/orders/{number}/status` (§6), every **3 s for 60 s**, then shows "Still confirming. This page updates when we hear from Xendit." and keeps polling every **15 s** until **10 minutes** have passed since the page loaded; then it stops (a reload checks again). Polling pauses while the tab is hidden and resumes on return.
8. When a poll answers a status other than Pending payment, the page refreshes (`router.refresh()`) and renders that status from the server, without the `payment` value's text: Paid shows the spec 030 timeline with Paid current. **Before #80 nothing sets Paid**, so in this story the page always ends at "Still confirming…".
9. **`payment=cancelled`, order still Pending payment:** "Payment not completed. You haven't been charged." and **Retry payment** (the same action as Pay now, with the label "Retry payment"), subject to *payable* (rule 4/5). Xendit sends the shopper to this URL when they stop the payment on its page.
10. **`payment=error`:** see behavior 2.
11. **Any `payment` value when the order is not Pending payment** (already Paid, Cancelled, …): ignored; the page shows its status as spec 030 does. An unknown `payment` value is ignored.
12. The `payment` value lives in the URL, so a reload repeats the same view; the order page links nowhere with it.

### Retry payment and Pay now (the same action)

13. **Starting a payment**, server side, in one transaction that **locks the order row** (`FOR UPDATE`):
    1. Check the order is payable (rule 4). If not: `expired` (too little time left or past due) or `not-pending` (any other status).
    2. If the order has an **open** `Payment` (status Pending): close its session at the gateway (*Closing a session*, below). If the gateway says that session is already **completed**, stop with `confirming`: no new session, and the page shows "Confirming your payment…" as in behavior 7 (a webhook is on its way). Otherwise mark that `Payment` Expired.
    3. Create a session (§6 *Session request*) and insert a `Payment` row: Pending, provider, the session id as `providerRef`, the reference id, the amount in centavos, currency PHP, the session's `expiresAt`.
    4. Commit and return the session's page URL.
    Because the order row is locked from step 1 to commit, a double click, a second tab or a replayed Place order waits for the first and then closes the session the first one opened, so **at most one session per order is open** at any time.
14. **Closing a session**: Xendit `POST /sessions/{id}/cancel`. A `200` (now `CANCELED`) closes it. A `422 INVALID_SESSION_STATUS` means it isn't `ACTIVE`, so the server reads it (`GET /sessions/{id}`): `EXPIRED` or `CANCELED` count as closed; `COMPLETED` is `confirming` (13.2). Any other error stops the action with `error`, writes nothing, and leaves the old session open.

### The fake payment page (CI, E2E, previews)

15. With the fake adapter, the session's page is `/test-payment/{sessionId}?key={token}` on the store itself, `noindex`, `no-store`, `Referrer-Policy: no-referrer`, labelled **"Test payment, not Xendit"**. It shows the order number, the amount, and three buttons:
    - **Pay**: marks the fake session Completed, builds a `payment_session.completed` event in Xendit's format with the `x-callback-token` header (§6 *Fake adapter*) and hands it to the event seam, then goes to the success return URL. **Until #80 the seam only records the event as delivered**, so the order stays Pending payment (behavior 8).
    - **Cancel**: goes to the cancel return URL; the session stays active, as on Xendit.
    - **Let it expire**: marks the fake session Expired and builds a `payment_session.expired` event the same way, then goes to the cancel return URL. (Lets #80 and #81 test expiry without waiting.)
16. The fake page answers 404 for an unknown session id, a key that doesn't open the session's order (the same constant-time check as the order page) and an order of another environment. A session that is no longer Active shows "This test payment is closed." with a link back to the order (built from the key), and no buttons.

### Errors and states, at a glance

| State | Where | What shows |
| --- | --- | --- |
| Opening a session | Place order / Pay now / Retry | Busy button ("Placing your order…" / "Opening the payment page…") |
| Session couldn't open | Order page | "We couldn't open the payment page. Try again." + Pay now |
| Confirming | Order page, `payment=return` | "Confirming your payment…", then "Still confirming…" |
| Cancelled on the gateway | Order page, `payment=cancelled` | "Payment not completed. You haven't been charged." + Retry payment |
| Under 10 minutes left | Order page | "This order expires in a few minutes and can't be paid. Place a new order." |
| Status route fails (network, 5xx) | Order page, polling | Keeps the current text and tries again at the next tick; never an error message, never Paid |

## 3. Examples

Seed parts and values as in spec 030 (P1: AMD Ryzen 5 7600 × 2, delivery to QC, subtotal 2,299,000, shipping 12,000, total **2,311,000** centavos). "Now" is fixed at placement, 2026-11-01T07:00:00Z (3:00 PM Manila), `orderExpiryHours` 24, so `expiresAt` is 2026-11-02T07:00:00Z.

### Session request (unit, pure: `sessionRequest(order, urls, env, now)`)

| # | Input | Expected |
| --- | --- | --- |
| S1 | P1, first attempt, environment `production`, site `https://pcsilicon.example` | `reference_id` "PCS-7KQ2M9XD-1"; `session_type` "PAY"; `mode` "PAYMENT_LINK"; `currency` "PHP"; `country` "PH"; `amount` **23110** (pesos, a number); `allowed_payment_channels` ["GCASH", "PAYMAYA", "CARDS"]; `metadata` { `order_id`: the order's id, `order_number`: "PCS-7KQ2M9XD", `environment`: "production" }; `description` "PC Silicon order PCS-7KQ2M9XD"; `success_return_url` "https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=…&payment=return"; `cancel_return_url` the same with `payment=cancelled`; `expires_at` "2026-11-02T07:00:00.000Z". No `customer`, no `items` |
| S2 | P1, third attempt | `reference_id` "PCS-7KQ2M9XD-3" |
| S3 | Amount conversion (`toProviderAmount`), centavos → the JSON number sent | 6,906,000 → `69060`; 1,999 → `19.99`; 2,311,099 → `23110.99`; 1,149,500 → `11495`; 100 → `1`; 2,000 → `20`; 5 → `0.05`; 10 → `0.1`. In each case `JSON.stringify` of the result prints exactly that text |
| S3a | The reverse (`fromProviderAmount`, for #80), the JSON number received → centavos | `69060` → 6,906,000; `19.99` → 1,999; `0.1` → 10; `19.999`, `-1`, `NaN`, `1e21`, the string `"19.99"` → refused (`null`), never rounded |
| S3b | Not an integer, zero or negative, or above `MAX_CENTAVOS` (999,999,999,999,999: a double keeps decimal text exactly only up to 15 significant digits) | `RangeError` (a bug: totals are checked integers). *Changed while building: the draft said `Number.MAX_SAFE_INTEGER`, whose peso text doesn't survive the round trip.* |
| S3c | **Only if the planning check finds Xendit refuses centavos in PHP sessions** (Q8): a total of 1,999 | No gateway call, no `Payment`; `startPayment` answers `fractional-amount`, logged; the page shows "This order can't be paid online because its total includes centavos. Contact us." Whole-peso totals (6,906,000) work as S1. Every seed price and shipping fee is whole pesos today, so this path is for data entered later |
| S4 | Locally, `VERCEL_ENV` unset | `metadata.environment` "development" |
| S5 | `VERCEL_ENV` "preview" | "preview" |
| S6 | Now 2026-11-02T06:50:00Z (10 min left) | `expires_at` 2026-11-02T07:00:00Z, accepted (exactly the minimum) |
| S7 | Now 2026-11-02T06:50:01Z | Not built: `expired` (under 10 minutes) |
| S8 | `orderExpiryHours` 48 and `SESSION_MAX_HOURS` 24 (Q2) | `expires_at` = now + 24 h, not `expiresAt` |

### Starting a payment (integration, fake adapter, Docker Postgres)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| A1 | P1 placed, no Payment | Place order's success path | One Payment: provider `FAKE`, `providerRef` matching `^ps-[0-9a-f]{24}$`, `referenceId` "…-1", amount 2,311,000, currency PHP, status Pending, `expiresAt` = order `expiresAt`. Result URL `/test-payment/{providerRef}?key=…`. One fake session, Active |
| A2 | A1, shopper cancels on the fake page | Retry payment | The first Payment Expired, its fake session Canceled; a second Payment Pending with `referenceId` "…-2" and a new `providerRef`; exactly one Pending Payment for the order |
| A3 | A1 | Two Retry payment calls at once (`Promise.all`) | Both succeed one after the other: three Payments in all, two Expired, one Pending; the second call closed the session the first opened. No error, no deadlock |
| A4 | A1, the fake session marked Completed (Pay clicked) | Retry payment | `confirming`. No session closed or created; the Payment stays Pending; still one Payment |
| A5 | A1, the fake session Expired ("Let it expire") | Retry payment | Close answers "not active"; the read says Expired; first Payment Expired; a new Pending Payment |
| A6 | A1, the fake's close fails with a 500 | Retry payment | `error`; nothing written; the first Payment still Pending and its session Active |
| A7 | A1, the fake's create fails after the close | Retry payment | `error`; the first Payment Expired (its session is closed at the gateway, so the row must say so), no new Payment; a later retry creates one |
| A8 | Order Cancelled (set directly) | Pay now | `not-pending`; nothing written |
| A9 | Now = `expiresAt` − 9 min | Pay now | `expired`; **no gateway call** (the fake records no create), no `Payment`; the page shows "This order expires in a few minutes and can't be paid. Place a new order." |
| A9a | An open Payment exists, now = `expiresAt` − 9 min | Retry payment | `expired`; the open session is **not** closed (it was created earlier and still works until `expiresAt`); nothing written |
| A9b | Place order commits, then the clock moves to `expiresAt` − 9 min before the payment step (`orderExpiryHours` is whole hours, so the test moves the clock) | Place order | Order placed; no session, no `Payment`; the browser goes to the order link with `payment=error`; the page shows the under-10-minutes text and no button |
| A10 | A replayed Place order (same key, token, cart) after A1 | Place order | Same order; A1's Payment Expired; a new Pending Payment ("…-2") |
| A11 | Gateway create succeeds, then the transaction fails to commit (forced) | Pay now | `error`; no Payment row; the orphan fake session stays Active with `metadata.order_id` set (#80 handles a payment on it, §8) and a log line `payment.session_orphaned` with the session id only |

### Order page (unit, markup, `OrderView` with fixtures; and the status route)

| # | Order / URL | Expected |
| --- | --- | --- |
| V1 | Pending, 23 h left, no `payment` | Test mode banner with the adapter's instructions; "Pay by Mon 2 Nov 2026, 3:00 PM"; **Pay now** |
| V2 | Pending, `payment=return` | Banner; "Confirming your payment…"; no Pay now |
| V3 | Pending, `payment=cancelled` | Banner; "Payment not completed. You haven't been charged."; **Retry payment** |
| V4 | Pending, `payment=error` | "We couldn't open the payment page. Try again."; Pay now |
| V5 | Pending, 9 min 59 s left | "This order expires in a few minutes and can't be paid. Place a new order."; no button; the banner still shows |
| V5a | Pending, exactly 10 min left | Pay now (the boundary is payable, as S6) |
| V5b | Pending, 9 min left, `payment=error` | The under-10-minutes text, not "We couldn't open the payment page." |
| V6 | Pending, past `expiresAt` | Spec 030's past-due text; no button |
| V7 | Paid (fixture), `payment=return` | Spec 030's Paid view; no banner, no confirming text, no button |
| V8 | Cancelled, `payment=cancelled` | Spec 030's Cancelled view; no Retry |
| V9 | Pending, `payment=bogus` | Same as V1 |
| R1 | `GET /api/orders/PCS-7KQ2M9XD/status` with the right `X-Order-Key` | 200 `{ "status": "PENDING_PAYMENT" }`, `Cache-Control: no-store` |
| R2 | Wrong key, no key, unknown number, malformed number | 404 `no-store`, the same body for all four (spec 030's rules; malformed → no database read) |
| R3 | The key in a `?key=` query instead of the header | 404 (the route reads only the header) |

### Polling (unit, fake timers)

| # | Given | Expected |
| --- | --- | --- |
| T1 | Route keeps answering Pending | Polls at 3, 6, … 60 s (20 calls); "Still confirming…" at 60 s; then every 15 s; last poll at 600 s; none after |
| T2 | Third poll answers PAID | One `router.refresh()`; polling stops |
| T3 | A poll fails (network) | No message change; the next tick polls again |
| T4 | Tab hidden at 10 s, shown at 40 s | No polls while hidden; one poll on becoming visible; the 600 s limit counts from page load |

### Fake page (integration + E2E)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| F1 | A1's URL | Open | "Test payment, not Xendit", "PCS-7KQ2M9XD", "₱23,110.00", Pay / Cancel / Let it expire |
| F2 | F1 | Pay | Fake session Completed; one event `payment_session.completed` built with `data.payment_session_id` = the session, `data.reference_id` "…-1", `data.status` "COMPLETED", `data.amount` 23110, `data.currency` "PHP", header `x-callback-token` = `XENDIT_WEBHOOK_TOKEN`; lands on `payment=return` showing "Confirming your payment…" |
| F3 | F1 | Cancel | Lands on `payment=cancelled`; Retry payment visible |
| F4 | F1 with a wrong key / an unknown id | Open | 404 |
| F5 | F2 done | Open the fake URL again | "This test payment is closed." and a link to the order |

### Environment check (unit, the env schema)

| # | Variables | Expected |
| --- | --- | --- |
| E1 | `PAYMENT_GATEWAY=fake`, `VERCEL_ENV=production` | Startup fails: "PAYMENT_GATEWAY must be xendit in production" |
| E2 | `PAYMENT_GATEWAY=xendit`, no `XENDIT_SECRET_KEY` | Fails: "XENDIT_SECRET_KEY is not set" |
| E3 | `XENDIT_SECRET_KEY=xnd_production_…` (any environment, any gateway) | Fails: "XENDIT_SECRET_KEY must be a test-mode key" (the value is never printed) |
| E4 | `PAYMENT_GATEWAY=xendit`, `XENDIT_SECRET_KEY=xnd_development_…`, `VERCEL_ENV=production` | Valid |
| E5 | `PAYMENT_GATEWAY=fake`, nothing else, `VERCEL_ENV` unset | Valid |
| E6 | `PAYMENT_GATEWAY=paypal` / unset | Fails: "PAYMENT_GATEWAY must be xendit or fake" / "is not set" |
| E7 | `PAYMENT_GATEWAY=xendit`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000` | Fails: "NEXT_PUBLIC_SITE_URL must be https with the xendit gateway" (Xendit requires HTTPS return URLs; Q3) |

### E2E (Playwright, fake adapter)

| # | Journey | Expected |
| --- | --- | --- |
| X1 | Place P1-style order (the spec 030 E2E part) → | Lands on the fake page ("Test payment, not Xendit"); Back goes to the order page, not checkout |
| X2 | X1 → Cancel | Order page: "Payment not completed…", Retry payment, the Test mode banner |
| X3 | X2 → Retry payment | A fake page with a different session id; Cancel again → Retry still offered |
| X4 | X1 → Pay | Order page: "Confirming your payment…"; the order stays Pending payment (nothing marks Paid before #80) |

## 4. Rules and edge cases

- **Nothing in this story sets Paid** (FR-22). The return URL, the `payment` value, the fake Pay button and the status route never change an order's status; only #80's handler will.
- **One open session per order.** Enforced by the order-row lock in *Starting a payment* and backed by a partial unique index on `Payment(orderId) WHERE status = 'PENDING'`, so a bug can't leave two open. (#80 may still see two payments for one order, e.g. a session paid between our cancel and Xendit's processing; its "second payment" path covers that.)
- **Time left.** A new session needs `expires_at` at least 10 minutes ahead (Xendit's minimum). `expires_at` is `min(order.expiresAt, now + SESSION_MAX_HOURS)`, never later than the order, so no session outlives its order (#81 then cancels the last open one). Payable means `expiresAt − now ≥ 10 min`, compared as instants (spec 030's V16e approach).
- **Amounts are converted exactly, with no floating-point division.** Stored and compared in integer centavos everywhere. Xendit's `amount` is a JSON number in pesos. `toProviderAmount` splits the integer with integer arithmetic (pesos = `(c - c % 100) / 100`, exact because the dividend is a multiple of 100; centavos = `c % 100`), writes the decimal text from those digits (`"19.99"`, `"69060"`, `"0.1"`: trailing zeros dropped) and parses that text, so the number sent is the double nearest the text and `JSON.stringify` prints the same text (S3). `fromProviderAmount` works the other way from the number's text: at most two decimals, non-negative, a safe integer result, otherwise `null` (S3a), never rounded; #80 compares integers. **Decimals for PHP:** the schema takes any non-negative number and Xendit's PHP payment-request examples carry centavos (`"request_amount": 10000.01`, [how-payments-api-work](https://docs.xendit.co/docs/how-payments-api-work.md)), but every session example is whole pesos and no page states a precision rule, so planning creates one test session for ₱19.99 (Q8). If Xendit refuses it, S3c applies.
- **Reference id** is `{orderNumber}-{attempt}`, attempt = 1 + the order's Payment count, ≤ 64 characters (Xendit's limit; ours is 16). Each session has its own reference, so a retry never reuses one (Xendit's rule on duplicate `reference_id` isn't documented; this avoids depending on it). The order number stays readable in Xendit's dashboard.
- **What goes to Xendit:** the order number, the order id, the environment, the amount, and the return URLs. **No name, email, mobile or address** (no `customer`, no `items`; D6). The return URLs carry the order's access token: Xendit stores them (ADR 0010, *Consequences*).
- **Base URL of the return URLs** is `NEXT_PUBLIC_SITE_URL`, never the request's `Host` header (a forged host would send the token elsewhere).
- **Environment** is `VERCEL_ENV` (`production`, `preview`, `development`), or `development` when unset (local runs, CI). It goes in `metadata.environment`; #80 ignores sessions of another environment (§8).
- **The status route** reads the key from the `X-Order-Key` request header only (not the URL, so the platform's request log doesn't record the token a second time), runs spec 030's shape checks and constant-time comparison, and returns only `{ status }`. Same 404 for every miss.
- **Polling is bounded** (10 minutes, ≤ 56 requests per page load) and stops on the first non-pending status.
- **The `payment` value is display state only.** A visitor with the key can type any value; at worst they see "Confirming…" or "Payment not completed" on their own order.
- **Gateway HTTP calls happen while the order row is locked**, with a per-call timeout (6 s) and a transaction timeout above the sum of the calls (25 s; up to three calls: close, the read after a "not active" answer, create). *Changed while building: the draft said 8 s and 20 s, which three calls could exceed.*, so a hung gateway can't hold the row or a pooled connection indefinitely. A timeout is `error` and rolls back. Placement itself (spec 030's transaction) never calls the gateway.
- **Orphan sessions.** If the gateway creates a session but our transaction then fails, the session exists with no `Payment` row. It carries `metadata.order_id`, which #80 uses to record the payment (§8). Its id is logged (`payment.session_orphaned`); nothing else.
- **Logging** follows spec 030's rule: `logSafeFailure` style, event name, provider, order number, session id and an error code; never the secret key, the access token, a return URL, the request or response bodies, or shopper details.
- **`ORDERS_ENABLED` off:** no order can be placed, so nothing is payable that wasn't already; Pay now on an existing pending order still works (paying for an order that holds stock is the way to release it from the hold).
- **Retired products** after placement don't matter: the order's total is its snapshot.
- **Xendit sends the shopper to a return URL after expiry too** ("after the session is completed or expired, or if the customer decide to stop"). An expired session that lands on `payment=return` shows "Confirming…" then "Still confirming…"; a reload without the value shows Pay now. Acceptable: a rare path, and never a false Paid.
- **Concurrency with #81** (later): the release takes the same order-row lock, so a session can't be created for an order being cancelled; whichever commits second sees the other's status.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Pay button | "Pay now" |
| Retry button | "Retry payment" |
| Busy | "Opening the payment page…" (Pay now, Retry); Place order keeps "Placing your order…" |
| Session failed | "We couldn't open the payment page. Try again." |
| Confirming | "Confirming your payment…" |
| Still confirming | "Still confirming. This page updates when we hear from Xendit." (fake: "…when we hear from the test payment page.") |
| Cancelled | "Payment not completed. You haven't been charged." |
| Under 10 minutes left | "This order expires in a few minutes and can't be paid. Place a new order." |
| Centavos refused (only if Q8 finds it) | "This order can't be paid online because its total includes centavos. Contact us." |
| Banner (checkout and pending order page), Xendit | **"Test mode."** "This is a demo store: no real payment is taken and no order is shipped. Pay with a test card: 4000 0000 0000 1000, any future expiry date, any CVV (4000 0000 0000 2503 shows a 3-D Secure step). For GCash or Maya, follow Xendit's test page." (The wallet sentence is confirmed in Q4.) |
| Banner, fake | **"Test mode."** "This is a demo store: no real payment is taken and no order is shipped. Payments here use a test page, not Xendit: choose Pay or Cancel." |
| Fake page title / heading | "Test payment, not Xendit" |
| Fake page body | "Order {number}" · "Amount {₱…}" · "This page stands in for Xendit in tests and previews. Nothing is charged." |
| Fake buttons | "Pay", "Cancel", "Let it expire" |
| Fake closed | "This test payment is closed." · link "Back to your order" |
| Session description (Xendit's page) | "PC Silicon order {number}" |

The fake's metadata title is "Test payment" (`noindex`). The spec 030 line "Paying online is coming soon." is removed.

## 6. Data and interfaces

### Xendit, as documented (read 2026-11-01)

| Fact | Source |
| --- | --- |
| Hosted one-time payment: `POST /sessions` with `session_type: "PAY"`, `mode: "PAYMENT_LINK"`; required `reference_id` (1–64), `currency` (PHP), `amount`, `country` (PH), `session_type`, `mode`; optional `allowed_payment_channels` (empty = every activated channel), `expires_at`, `metadata` (≤ 50 keys), `description`, `success_return_url`, `cancel_return_url` ("Must be HTTPS"). Response: `payment_session_id` (e.g. `ps-661f87c614802d6c402cd82d`), `payment_link_url`, `status` (`ACTIVE`, `COMPLETED`, `EXPIRED`, `CANCELED`) | [create-session](https://docs.xendit.co/apidocs/create-session.md), [payment-sessions-overview](https://docs.xendit.co/docs/payment-sessions-overview.md) |
| Lifetime: "By default the Session will expire 30 minutes after creation"; `expires_at` must be "at least 10 minutes in the future and must not exceed the maximum allowed expiry duration" (maximum not stated, Q2) | [create-session](https://docs.xendit.co/apidocs/create-session.md) |
| Expire now: `POST /sessions/{id}/cancel` "Cancels an ACTIVE Session. The Xendit Hosted Checkout URL will be invalid"; status becomes `CANCELED`; `422 INVALID_SESSION_STATUS` "Only ACTIVE sessions can be canceled." No webhook for a cancel | [cancel-session](https://docs.xendit.co/apidocs/cancel-session.md) |
| Read a session: `GET /sessions/{id}` (returns `status`, `amount`, `currency`, `metadata`, `payment_id`, `payment_request_id`) | [get-session](https://docs.xendit.co/apidocs/get-session.md) |
| A payment's real status: `GET /v3/payments/{payment_id}` (`status`: `SUCCEEDED`, `FAILED`, …; `channel_code`, `request_amount`, `currency`) and `GET /v3/payment_requests/{id}`, header `api-version: 2024-11-11` | [get-payment](https://docs.xendit.co/apidocs/get-payment.md), [get-payment-request](https://docs.xendit.co/apidocs/get-payment-request.md) |
| Session webhooks: `payment_session.completed`, `payment_session.expired`; body `{ event, business_id, created, data: <session> }`; no event id; metadata not listed in `data` | [session webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md) |
| Verification: a token "in each event's `x-callback-token` header", compared with the token from Dashboard webhook settings; respond 2xx quickly; "payment_id and capture_id will help you to identify unique events" | [handling-webhooks](https://docs.xendit.co/docs/handling-webhooks.md) |
| Retries: up to six, at 15 min, 1 h, 3 h, 6 h, 12 h, 24 h after the first attempt | [webhook-behavior](https://docs.xendit.co/apidocs/webhook-behavior.md) |
| Payment webhooks (v3): `payment.capture`, `payment.authorization`, `payment.expiry`, `payment.failure` (they carry `metadata`) | [payments-api-webhooks](https://docs.xendit.co/docs/payments-api-webhooks.md) |
| Channels: GCash `GCASH` (PHP 1–100,000), Maya `PAYMAYA` (PHP 1–100,000), cards `CARDS` (PHP min 20, max 700,000) | [gcash](https://docs.xendit.co/docs/gcash.md), [maya](https://docs.xendit.co/docs/maya.md), [cards](https://docs.xendit.co/docs/cards-8.md) |
| Test mode: "Requests made in the test environment will not interact with banking networks and incur no charges"; separate keys for test and live; Basic auth with the secret key as the username and an empty password | [quick-setup](https://docs.xendit.co/apidocs/quick-setup.md), [api-keys](https://docs.xendit.co/docs/api-keys.md) |
| Test cards: 4000000000001000 (Visa, no 3DS), 4000000000002503 (Visa, 3DS), 5200000000001005 / 5200000000002151 (Mastercard); any CVV, future expiry; amounts 10051–10059 simulate declines | [cards-simulate-card-scenarios](https://docs.xendit.co/docs/cards-simulate-card-scenarios.md) |
| Simulate a payment by API: `POST /v3/payment_requests/{id}/simulate` (test only; result arrives by webhook) | [simulate-payment-test-mode](https://docs.xendit.co/apidocs/simulate-payment-test-mode.md) |
| Invoices (`POST /v2/invoices`) are the legacy product; the migration guide (updated 2026-10-22) moves merchants to Payment Sessions, which have "Full channel and region coverage" | [migrate-to-payment-session](https://docs.xendit.co/docs/migrate-to-payment-session.md) |

**Not found in the docs** (each is checked in test mode during planning, and the answer goes into `docs/setup/payments.md`): an idempotency header for `POST /sessions`; the test/live key prefixes (`xnd_development_` / `xnd_production_`, from the SDKs' conventions); how a GCash or Maya test payment is completed or failed on the hosted page; whether session webhooks carry `metadata`; the maximum `expires_at`; whether a dashboard allows more than one webhook URL per event.

### The gateway interface (provider-neutral)

`PaymentGateway`, in `lib/payments/` (server only), the only thing the rest of the app calls:

- `createSession(input) → { ok: true, session } | { ok: false, code }` — input: reference id, amount in **centavos**, currency, description, metadata (order id, order number, environment), success and cancel URLs, `expiresAt`. Returns `{ id, url, status, expiresAt }`. Each adapter does its own unit conversion.
- `closeSession(id) → "closed" | "completed" | { error: code }` — *Closing a session* (behavior 14), including the read after a "not active" answer.
- `getSession(id) → { status, amountCentavos, currency, metadata, paymentId } | null` — used by behavior 14 and, in #80, to confirm before marking Paid.
- `getPayment(id) → { status, amountCentavos, currency, method } | null` — for #80 (declared here so the interface is complete; the Xendit adapter implements it against `/v3/payments`).
- `provider`: `"XENDIT" | "FAKE"`, and `testInstructions` (the banner text).

`gateway()` picks the adapter from `PAYMENT_GATEWAY`. Statuses use neutral names (`active`, `completed`, `expired`, `closed`); only the adapters know Xendit's.

**Xendit adapter:** `fetch` to `https://api.xendit.co` with Basic auth, an 8 s timeout, JSON. No SDK (D5).

**Fake adapter:** Xendit's shapes and statuses, stored in its own table `FakeGatewaySession` (id `ps-` + 24 hex, status, amount, currency, reference id, metadata JSON, expires at, payment id `py-…` once paid, timestamps), so `getSession` can answer `COMPLETED` after Pay without touching the app's `Payment`. Its page URL is `/test-payment/{id}?key={token}`: the fake reads the order link's key from the success URL it is given and keeps none of the URLs, so no token is stored in clear (ADR 0009). It can be told to fail (`FAKE_GATEWAY_FAIL`, test-only module state, never an env var) for A6, A7, A11. **The event seam** `deliverPaymentEvent({ headers, body })` is what Pay and Let it expire call in process; in this story it validates the token header and logs `payment.event_delivered` (type and session id only); #80 replaces its body with the webhook handler, so the fake exercises the same code path as `POST /api/webhooks/xendit`.

### Schema (one migration)

- `PaymentProvider` enum: `XENDIT`, `FAKE`.
- `PaymentStatus` enum: `PENDING`, `PAID`, `FAILED`, `EXPIRED`. (PAID and FAILED are set by #80; EXPIRED here by retry and by #81.)
- `Payment`: `id` (cuid); `orderId` → `Order` (`Restrict`); `provider`; `providerRef` (the session id); `referenceId`; `amount` (centavos); `currency` (`"PHP"`); `status` (default PENDING); `expiresAt` (the session's); `method` (nullable, #80); `createdAt`, `updatedAt`. Unique `(provider, providerRef)`; partial unique `(orderId) WHERE status = 'PENDING'` (declared with `partialIndexes`, as the cart's is); `CHECK (amount > 0)` in the migration. Never hard-deleted. `rawEvent` from the PRD arrives with #80 (it needs an event).
- `Order.payments Payment[]`.
- `FakeGatewaySession` as above, no foreign keys (a fake gateway knows nothing of our tables).
- `resetCatalog()` and `db:seed --reset` name `Payment` and `FakeGatewaySession` (a `TRUNCATE … CASCADE` from `Product` reaches `Payment` only through `Order`, which is already named; listing them keeps the rule "name every table of that kind").

### Server actions and routes

- `placeOrderAction` result on success gains `payUrl: string | null` (null = the session failed; the browser then goes to the order link with `payment=error`).
- `startPayment(orderId, accessToken, options)`: the token comes from the caller (Place order has it; Pay now reads it from the address bar), because only its hash is stored.
- `startPaymentAction({ orderNumber, key })` → `{ ok: true, url } | { ok: false, reason: "confirming" | "expired" | "not-pending" | "error" }`; an unknown number or wrong key is `not-found` with no other detail. Forwards to `startPayment(orderId, now)` in `lib/payments/start-payment.ts`. Rate limiting is #64.
- `GET /api/orders/[number]/status` (key in `X-Order-Key`) → `{ status }`, `no-store`.
- `/test-payment/[id]` page and its `payFakeAction`, `cancelFakeAction`, `expireFakeAction`; the route answers 404 in every request when `PAYMENT_GATEWAY` isn't `fake`. `next.config.ts` gives `/test-payment/:path*` the order page's `no-store` and `no-referrer` headers.
- `sessionRequest(...)` (pure, S1–S8), `toProviderAmount` / `fromProviderAmount` (pure, `lib/payments/amount.ts`, S3–S3c), `isPayable(order, now)` (pure), `paymentView(order, paymentParam, now)` (pure: which of the states in §2 to show).

### Environment variables (`lib/env.ts`, `.env.example`)

| Variable | Rule |
| --- | --- |
| `PAYMENT_GATEWAY` | `xendit` or `fake`, required. `fake` is refused when `VERCEL_ENV=production` (E1) |
| `XENDIT_SECRET_KEY` | Required with `xendit`; must start `xnd_development_` (E3); a key that starts `xnd_production_` fails startup anywhere. Never logged or printed |
| `XENDIT_WEBHOOK_TOKEN` | Required with `fake`: the fake's Pay sends it with its event (CI: any random value). #80 makes it required with `xendit` too. *Changed while building: the draft had it optional here.* |
| `VERCEL_ENV` | Read, not set: Vercel provides it. Unset → `development` |
| `NEXT_PUBLIC_SITE_URL` | Existing; with `xendit` it must be `https://` (E7, Q3) |

### Documents

- **ADR 0010 — Payment gateway: Xendit (test mode).** Context: the PRD recommended PayMongo with Xendit as fallback; the owner has a Xendit test account. Decision: Xendit Payment Sessions in `PAYMENT_LINK` mode, three channels, a provider-neutral `PaymentGateway` with Xendit and fake adapters, the fake refused in production and live keys refused everywhere; the webhook is a hint, confirmed through `GET /sessions` and `/v3/payments` before Paid (#80). Alternatives: PayMongo Checkout Sessions (the PRD's first choice; no test account); Xendit Invoices (legacy, fewer channels); Xendit Payment Requests directly (we'd build the method picker and handle each wallet's redirect); Components mode (embedded UI, more work, no benefit for a demo); the Xendit Node SDK (D5). Consequences: the access token travels to Xendit inside the return URLs and is stored there; webhooks carry a static shared token, not a signature, so a body can't be trusted on its own; one verification token per Xendit account, shared by local and production; return URLs must be HTTPS, so local runs with the real gateway need a tunnel origin; amounts cross the boundary in pesos.
- **PRD change** (`docs/prd.md`, scope, so here first): Payments and fulfillment names **Xendit** as the gateway in test mode, with **PayMongo as the alternative** (keeping the HitPay comparison link); the BNPL row becomes "where the gateway offers them (not in the MVP's allowed channels)"; the architecture diagram's `PM` node becomes "Xendit<br/>GCash, Maya, cards"; Stack › Payments "Xendit API (test mode) | Payment sessions + webhooks"; CI/CD: previews, CI and local runs use the fake adapter, and real Xendit webhooks reach Production only (Q5); Milestones row 6 and the sprint diagram say "Xendit sandbox".
- **`docs/setup/payments.md`**, rewritten for Xendit: the environment table (Local: `fake` by default, `xendit` with a tunnel origin; Preview: `fake`; CI: `fake`; Production: `xendit`); the variables table (`PAYMENT_GATEWAY`, `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_TOKEN`, `CRON_SECRET`, `ORDERS_ENABLED`); the account checklist (stay in test mode, create a secret key with Money-in write permission, check the key starts `xnd_development_` without pasting it anywhere, activate GCash, Maya and cards in test mode); **"Before merging #79: set `PAYMENT_GATEWAY` (and the key for Production) in every Vercel environment, or the deploy fails at startup"**; the webhook section for #80 (Dashboard → Webhooks: the URL for `payment_session.completed` and `payment_session.expired`, the verification token); the one-account-several-environments note (§8); CI's `PAYMENT_GATEWAY=fake` and a dummy token; and a "Confirmed in test mode" list replacing "To confirm in PayMongo's docs", filled in from the planning checks above.

## 7. Test plan

| Level | Examples |
| --- | --- |
| Unit (Vitest, pure) | S1–S8 (`sessionRequest`, amount conversion), V1–V9 (`paymentView` and `OrderView` markup), T1–T4 (polling hook with fake timers), E1–E7 (env schema, imported as a schema like `ordersEnabledSchema`), the Xendit adapter's request/response mapping against recorded Xendit-shaped JSON (create 201, cancel 200, cancel 422 → read, get), with `fetch` stubbed; the log spy test (no key, token, URL or body in any console call) |
| Integration (Vitest + Docker Postgres, fake adapter) | A1–A11, R1–R3, F2/F5 (fake state and event built), the partial unique index (a second PENDING insert fails), `Payment` `CHECK`, `resetCatalog()` empties the new tables |
| E2E (Playwright, fake adapter, CI and local) | X1–X4. Uses spec 030's dedicated part and stock helper |
| Manual (preview, then local with Xendit and a tunnel) | Preview: X1–X4. Local, real Xendit test mode: pay with 4000 0000 0000 1000 and land on "Confirming…"; cancel on Xendit's page and retry; GCash and Maya test flows (fills Q4); the session's `expires_at` accepted at 24 h (Q2); a ₱19.99 session (Q8) |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Marking Paid, recording the method, late and second payments, `PaymentEvent`, the webhook route, `pnpm webhook:replay` | #80 (changes below) |
| Cancelling expired orders, releasing stock, closing their sessions | #81 (it calls `closeSession`; Xendit's cancel sends no webhook, so #81 marks the Payment Expired itself) |
| BNPL, installments, QR Ph, other channels | Not in the MVP's allowed channels; PRD change above |
| Cash on delivery | Sprint 7 (FR-25) |
| Emails with the order or payment link | FR-21, Sprint 7 |
| Rate limiting the actions and the status route | #64 |
| Refunds | FR-26, Sprint 8 |
| Add build to cart from a shared build | #72 |
| Editing issues #79–#81 | The owner, after this review |

### What #80's issue must change for Xendit (not edited yet)

1. **Route and verification.** `POST /api/webhooks/xendit` (not `/paymongo`). Xendit sends a static token in `x-callback-token`, not an HMAC signature, and no timestamp. Verify by comparing it with `XENDIT_WEBHOOK_TOKEN` **in constant time** (SHA-256 both, then `timingSafeEqual`, so different lengths don't leak through an early return); missing or wrong → 401, nothing else. Drop the HMAC and timestamp-tolerance criteria; the signature unit tests become: right token, wrong token, missing header, different length, header repeated.
2. **Confirm through Xendit's API before marking Paid.** A valid token proves the sender knew the token, not that the body is true, and there is no signature over the body. So the body is only a hint carrying a session id: the handler calls `gateway().getSession(id)` and requires `COMPLETED`, `metadata.environment` = this deployment's, `metadata.order_id` = an order it knows, and amount and currency equal to the `Payment` row's (in centavos); then `getPayment(payment_id)` and requires `SUCCEEDED`, taking the method from `channel_code`. Only then Paid. A lookup that fails is transient → 5xx so Xendit retries (up to six times over 24 h).
3. **Idempotency without an event id.** Xendit's payloads carry none, so `PaymentEvent.eventId` is a derived key: `{event}:{payment_session_id}` for session events (a session completes or expires once), unique, inserted with `ON CONFLICT DO NOTHING` in the same transaction as the change. A repeat → 200, no change. `payload` keeps the body as received.
4. **Events.** `payment_session.completed` replaces `checkout_session.payment.paid`; `payment_session.expired` replaces `payment.failed` (→ Payment Expired; the order page offers Retry payment). Xendit has no session-level failure: a failed attempt is retried inside the hosted page. Don't subscribe to `payment.failure` for now.
5. **Environment from the API, not the body.** Session webhooks don't document `metadata`, so "another environment" is decided from `getSession`'s `metadata.environment`; another environment or an unknown session → 200, a log line, nothing written, no `PaymentEvent`.
6. **Orphan sessions** (A11): a completed session with no `Payment` row whose `metadata.order_id` is a known order of this environment → insert the `Payment` (from the session) and continue on the normal path.
7. **Variables and setup.** `XENDIT_WEBHOOK_TOKEN` replaces `PAYMONGO_WEBHOOK_SECRET`; it is one token per Xendit account, so local and production share it. The webhook URL is set in Xendit's Dashboard webhook settings and points at Production (Q5); local work uses the fake gateway and `pnpm webhook:replay`, so the real-webhook path is exercised on Production only.
8. **Replay and E2E.** `pnpm webhook:replay` posts a Xendit-format body with `x-callback-token`; for a real session it can't make `getSession` say COMPLETED, so locally it is paired with paying on Xendit's test page or with the fake gateway. The E2E checkout → paid uses the fake: Pay completes the fake session, the seam runs the real handler, and the handler's `getSession` reads the fake.
9. **Copy.** "…when we hear from PayMongo" → "…from Xendit"; late-payment text unchanged.

## 9. Decisions

- **D1 — Issue #79's PayMongo criteria map to Xendit like this.** Checkout Session → Payment Session (`PAY`, `PAYMENT_LINK`); `reference_number` = order number → `reference_id` = `{orderNumber}-{attempt}` (D4); metadata (order id, environment) → the same in `metadata`; success and cancel URLs → `success_return_url` / `cancel_return_url`; amount in centavos → amount in **pesos** (Xendit's unit; centavos stay our unit everywhere else); expire endpoint → `POST /sessions/{id}/cancel`; `sk_live_` refusal → `xnd_production_` refusal; `PAYMONGO_SECRET_KEY` → `XENDIT_SECRET_KEY`; "Test payment, not PayMongo" → "…not Xendit"; the fake's Pay and **Fail** → Pay, Cancel and Let it expire (D7). *Rejected:* keeping PayMongo's shapes in the fake, which would test a format we never receive.
- **D2 — Payment Sessions, not Invoices.** Xendit's migration guide (2026-10-22) moves merchants off Invoices to Sessions, which cover every channel; Sessions also have a documented cancel. *Rejected:* Invoices (legacy, an older channel set, and their expire endpoint isn't in the current docs).
- **D3 — Place order commits, then starts the payment outside that transaction.** An HTTP call inside the placement transaction would hold every product's stock row while waiting on Xendit. A failed start leaves a normal pending order with Pay now (behavior 2). *Rejected:* one transaction for both; a separate click to pay after placing (the issue says "straight to").
- **D4 — A new reference per attempt.** Xendit doesn't document whether `reference_id` must be unique; `-{attempt}` keeps the order number visible and never collides. *Rejected:* the bare order number.
- **D5 — `fetch`, not the Xendit SDK.** Four endpoints, typed by us; one less dependency on the server bundle; the adapter tests stub `fetch` with recorded shapes. *Rejected:* `xendit-node` (wraps the same calls, and its types follow its own release cadence).
- **D6 — No customer or items sent.** Not required for `PAY` sessions without saving a method; sending them would copy shopper details to a third party for nothing, and items would have to sum exactly to the amount across build groups. *Rejected:* items with a `FEE` line for shipping (nicer Xendit page, more ways to fail).
- **D7 — The fake mirrors Xendit, including "no failure redirect".** On Xendit a failed attempt is retried inside the session and the shopper leaves by cancelling; the fake's Cancel does the same, and "Let it expire" covers the only terminal non-paid event. *Rejected:* a Fail button that redirects with a failure, which Xendit never does.
- **D8 — The fake has its own table.** #80 confirms Paid by reading the gateway, so the fake must answer `COMPLETED` independently of our `Payment` rows. *Rejected:* deriving the fake's state from `Payment` (circular once #80 confirms through it); in-memory state (serverless instances don't share it).
- **D9 — The fake page carries the order key in its URL** instead of storing return URLs. Same exposure as the order link, on our own domain, with the same headers. *Rejected:* storing return URLs (the token in clear in our database, against ADR 0009).
- **D10 — Every Pay now / Retry closes the open session and opens a new one.** Simpler than deciding when to reuse, and the cancel answer is also how we learn a session already completed. *Rejected:* reusing an active session (would need its URL stored and a check that it isn't about to expire).
- **D11 — The status route takes the key in a header.** Keeps the token out of a second URL in request logs. *Rejected:* `?key=` (as the page does, because a link must), POST (it only reads).
- **D12 — `PAYMENT_GATEWAY` is required and explicit.** A missing value fails startup rather than silently using the fake; Production refuses `fake`. This makes setting it on Vercel a step **before merging** (in the setup doc). *Rejected:* defaulting to `fake` outside production (a forgotten variable on a preview would be fine, but locally it would hide that Xendit isn't configured); deriving it from `VERCEL_ENV` (previews and local runs need to choose).
- **D13 — Payable stops 10 minutes before `expiresAt`** (Xendit's minimum session lifetime): no session is opened, and the order page says to place a new order (review decision). The displayed "Pay by" time stays `expiresAt` (spec 030), since a session opened earlier still works until then. *Rejected:* showing `expiresAt − 10 min` as "Pay by" (changes spec 030's text for a rare case).
- **D14 — The banner carries the test instructions on checkout too** (FR-27 says "on checkout"); spec 029's banner gains the sentence. *Rejected:* instructions only on the order page.

**Disagreements flagged:** the issue names PayMongo throughout (D1 maps it); the issue's fake has "Pay and Fail" (D7 replaces Fail); the PRD Payments section and Stack name PayMongo (changed by this story, §6 *Documents*); spec 030's "Paying online is coming soon." line is removed here.

### Acceptance criteria → examples and rules

| Issue #79 criterion (PayMongo wording, mapped by D1) | Covered by |
| --- | --- |
| Placing goes straight to a new session: reference, metadata with environment, success/cancel URLs with the key, amount | Behavior 1–3; S1–S5, S3; A1, A10; X1 |
| A `Payment` row per attempt (provider, providerRef, amount, Pending, createdAt), never hard-deleted | §6 Schema; A1, A2, A3 |
| Return page shows only "Confirming…", polls a key-checked `no-store` route for a bounded time, then "Still confirming…"; never sets Paid | Behavior 7–8; V2, V7; R1–R3; T1–T4; X4; rule "Nothing sets Paid" |
| Cancel or failure → "Payment not completed" + Retry payment | Behavior 9; V3; F3; X2; D7 |
| Retry while Pending and not expired; expires the previous session first; order row locked, a double click makes one session | Behavior 13–14; A2–A9; V5, V6, V8; rule "One open session" |
| Test mode banner on checkout and the pending order page, with test card and wallet instructions | Behavior 6; §5 banner copy; V1–V3; X2; Q4 |
| Gateway interface with Xendit and fake adapters; fake page labelled, Pay runs the event through the handler in process; fake refused in production; live key refused anywhere | §6 interface, fake adapter, event seam; F1–F5; E1, E3 |
| Env vars in `lib/env.ts` and `.env.example`: secret key, adapter switch, `VERCEL_ENV` | §6 variables; E1–E7 |
| Tests: unit session payload; integration Payment rows and retry expiring the previous; E2E place → pay page → cancel → retry | §7; S1–S8; A1–A11; X1–X3 |
| Tasks: confirm methods, minimum, lifetime, expire endpoint, test cards in the docs | §6 *Xendit, as documented*; Q2–Q5 |
| Tasks: `docs/setup/payments.md` checked against what was built | §6 *Documents* |
| User request: ADR, PRD change, setup doc; #80's changes listed | §6 *Documents*; §8 *What #80's issue must change* |

## 10. Open questions

### Resolved in review (2026-11-01)

- **Q1 — Issue #79** is renamed "Pay with a Xendit payment session", with a line linking this spec; its body is otherwise unchanged. #80 and #81 are edited when their specs are written (§8 lists #80's changes).
- **Q2 — Session lifetime:** the order's remaining time, capped at 24 h (`SESSION_MAX_HOURS = 24`, S8). Under Xendit's 10-minute minimum no session is opened, with "This order expires in a few minutes and can't be paid. Place a new order." (behavior 5; A9, A9a, A9b, V5–V5b). The owner checks a 24 h session in test mode during planning.
- **Q3 — Local runs:** `PAYMENT_GATEWAY=fake` is the local default (`.env.example`); real Xendit locally means a tunnel's https origin as `NEXT_PUBLIC_SITE_URL` (E7).
- **Q5 — Webhook URL:** Production keeps it; local work uses the fake gateway (and `pnpm webhook:replay`, #80).
- **Q7 — Deploy order:** `PAYMENT_GATEWAY` stays required; Production's `PAYMENT_GATEWAY` and `XENDIT_SECRET_KEY` are set on Vercel before #79 merges (the first item of the PR checklist and of `docs/setup/payments.md`).
- **Q9 — The access token in the return links:** accepted; the reasoning is in ADR 0010 (a wallet payment can come back in a different browser, Xendit is the payment processor, and the order page sends no referrer).

### Pending, answered during planning

- **Q4 — GCash and Maya test steps.** The owner tries one of each and gives the steps; they replace "follow Xendit's test page" in the banner (§5) and go into `docs/setup/payments.md`.
- **Q6 — Key prefix.** The owner checks that the test key starts `xnd_development_` and says so only if it doesn't; E3 changes to match.
- **Q8 — Centavos in PHP sessions.** One test session for ₱19.99 (amount `19.99`). Accepted: S3 stands and S3c is dropped. Refused: S3c applies, and the refusal is recorded in `docs/setup/payments.md` and ADR 0010.
