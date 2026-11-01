# 033 — Auto-cancel unpaid orders and release stock

Status: **Approved with changes** in review 2026-11-01 (§11) · Issue: #81 (Sprint 6, Checkout epic #4; depends on #78 = spec 030, #79 = spec 031, #80 = spec 032, all merged) · PRD refs: FR-24 (unpaid online orders auto-cancel after a set time and release reserved stock), FR-20 (Cancelled on the timeline), FR-22 (Paid only from the gateway); Risks › "Overselling on concurrent checkouts" (reservation with expiry); Data model › `Order`, `StockMovement`; ADR 0009, ADR 0010

**Gateway: Xendit, not PayMongo.** Issue #81 says "PayMongo session" throughout. The gateway is Xendit (ADR 0010): a session is cancelled with `closeSession` (`POST /sessions/{id}/cancel`), which sends no webhook, so the release marks the `Payment` Expired itself. The issue's two comments from spec 032 (reconcile before releasing; skip orders with a flagged payment) are part of this spec, with one change from review: open sessions are **cancelled first** and only reconciled when the cancel is refused (D1).

## 1. Summary

An order placed online holds its parts (spec 030 takes the stock at placement) until it is paid or until `expiresAt` (24 hours by default). This story cancels an order that is still Pending payment past `expiresAt` and puts its stock back, so held parts become buyable again (FR-24). Before cancelling, it cancels every open payment session at Xendit, so nothing can be paid on the order afterwards; a session Xendit refuses to cancel because it already ended is reconciled (`reconcileSession`, spec 032), so a payment whose webhook was missed makes the order Paid instead of Cancelled. Releasing happens inside the purchases that need the stock (add to cart, raise a quantity, add a build, place an order), after server-rendered pages that show stock, and once a day from a Vercel cron. The order page already shows a past-due order as cancelled, whatever the row says. This story lets Production turn `ORDERS_ENABLED` on (spec 030 D13).

## 2. Behavior

### What counts as expired

1. An order is **due for release** when, at the moment `now`:
   - its status is **Pending payment**;
   - `expiresAt ≤ now` (at the deadline it is expired; the boundary of `isPastDue`);
   - **no `Payment` of the order has a `problem`** (in practice `AMOUNT_MISMATCH`; the issue's comment superseding spec 032 Q7). Such an order keeps its stock for Admin's review (Sprint 8) and is never released by this story.
2. Once an order is past `expiresAt`, **no new session can start**: `startPayment` refuses (`expired`) with less than 10 minutes left (`canStartSession`, spec 031), checked under the order lock before any gateway call. So the open sessions the release cancels are all the sessions that can still be paid.
3. **An Expired `Payment` is final** and isn't checked again: it was set either by a cancel Xendit accepted or found ended (spec 031's Retry; `startPayment` keeps the row Pending and refuses `confirming` when the old session completed) or by a gateway-confirmed expiry (spec 032). This narrows spec 032 §8's "its Expired ones" (D2).

### The release: check, then release (two steps)

Every caller runs the same two steps. Step 1 calls the gateway and so never runs inside a database transaction (CLAUDE.md working rule; spec 032 rule *Gateway calls*). Step 2 is pure database work and runs in a transaction: the caller's own (a purchase) or its own (a sweep or the cron).

**Step 1, check (no transaction, no lock):** `checkExpiredOrders({ now, productIds?, limit, exclude?, gateway, budget? })`

4. One query finds up to `limit` orders due for release (behavior 1), oldest `expiresAt` first, leaving out `exclude` (ids already tried in this run). With `productIds`, only orders that hold one of those products (an `OrderItem` with that `productId`). It reads each order's **open sessions**: its `Payment`s with status Pending (normally one; spec 031's partial unique index).
5. For each order, for each open session, **cancel it at Xendit** (`closeSession`):

| Xendit's answer to the cancel | Then | The session counts as |
| --- | --- | --- |
| Cancelled (2xx) | nothing more | **ended unpaid**: can be released |
| Not active (422): the session already ended | `reconcileSession(id)` with no event (spec 032 behavior 7–17; it logs its own `payment.reconcile` line and applies what it finds) | by reconcile's outcome, below |
| Unreachable, timed out, 5xx, any other failure | nothing more | **unknown**: the order is skipped this run |

   | `reconcileSession` outcome | Means | The order |
   | --- | --- | --- |
   | `expired`, `already-applied` | The session ended unpaid (its Payment is now Expired), or what was paid is already recorded | can be released (step 2 re-checks the status) |
   | `paid` | Paid before the cancel: the order is now **Paid** | not released |
   | `mismatch` | Now has a flagged payment | not released |
   | `retry`, `not-yet`, `unconfirmed`, `error`, `active`, `ignored-unknown`, `ignored-environment` | Xendit can't say, or contradicts itself (a 422 for a session it reports active or doesn't know) | **skipped this run** |

6. An order is **cleared** when every open session ended unpaid (`releaseDecision`, pure). An order with no open session (it never opened one, e.g. `startPayment` failed after placement, or its sessions already ended) is cleared with no gateway call.
7. **In purchase paths** (behavior 17), each gateway call has a **2.5 s timeout** (`PURCHASE_GATEWAY_TIMEOUT_MS`), and the first failure or timeout **ends step 1**: that order is skipped, no further gateway call starts, and the orders cleared so far are still released. No new gateway call starts once step 1 has run for 3 s (`budget`). The sweep and the cron use the gateway's normal 6 s timeout and go on to the next order after a failure.
8. The result is the list of **cleared** order ids, the **cancelled sessions** (for step 2) and the skipped orders, each with a code (`timeout`, `http-500`, a reconcile outcome, `budget`). Step 1 writes nothing itself except what `reconcileSession` applies.

**Step 2, release (in a transaction):** `releaseExpiredOrders(tx, { now, orderIds })`

9. Lock the cleared orders **that are still due**: `SELECT … FROM "Order" WHERE id IN (…) AND status = 'PENDING_PAYMENT' AND "expiresAt" <= now AND NOT EXISTS (a Payment of the order with a problem) ORDER BY id FOR UPDATE SKIP LOCKED`. The cancel is conditional: a webhook that made the order Paid, or flagged it, between the steps is never overwritten (G2, G4). An order another transaction holds (a webhook's reconcile, a `startPayment`, another release) is **skipped**, not waited for.
10. For every locked order:
    - status **Cancelled**, `cancelledAt` = now, `cancelReason` = `EXPIRED`;
    - every **Pending** `Payment` of the order → **Expired** (`WHERE status = 'PENDING'`: the sessions step 1 cancelled; one a webhook already moved is left as the webhook set it);
    - one `StockMovement` per product with reason **`ORDER_RELEASED`**, `change` = the opposite of the order's `ORDER_RESERVED` movement for that product, `orderId` = the order. Row for row, the release undoes the reservation (spec 030 D7).
11. Stock: each product's `stock` goes up by the released quantities, summed over all the orders released in this transaction, one `UPDATE` per product **in product id order** (the order placement uses). Stock goes back whatever the product's `status` is.
12. The **conditional status change is what releases**: running twice, or two runs at once, release an order once (the second skips the locked row or no longer finds it Pending).
13. Returns the released orders (id, number) and the products changed. Nothing released → no write at all.

**Step 3, after the commit (no transaction):**

14. `revalidateTag(PRODUCTS_TAG, "max")` once, if anything was released (the home page, cached under that tag, shows stock). It never fails the caller.
15. One log line per released order and per skipped order (rule *Logging*).
16. **No gateway call after the release.** Sessions were cancelled in step 1. A payment that still slips through (Xendit accepting a payment it had just cancelled, or an orphan session, spec 031 A11) arrives by webhook and takes spec 032's **late payment** path: the order stays Cancelled, `refundRequired`, the Payment Paid with `LATE` (G3).

### Where it runs

**A. Scoped, inside the purchase it protects** (`addToCart`, `setCartQuantity`, `addBuildToCart`, `placeOrder`):

17. Before its transaction opens, the purchase runs step 1 with the products involved (`limit` 10, purchase timeouts, behavior 7):
    - `addToCart`: the product being added;
    - `setCartQuantity`: the line's product (read by line id and the cookie's cart before the transaction; an unknown line skips the release and goes on to the purchase's own "not found");
    - `addBuildToCart`: the build's products;
    - `placeOrder`: the products in the cookie's cart (one read before the transaction).
18. Inside its own transaction, **right after it locks the cart row** and before its first stock read, it runs step 2 with the cleared ids. The release and the purchase's own stock check are one transaction: the stock the release frees is what the check sees, and a refusal or error rolls the release back with the purchase (the sessions stay cancelled; the next run releases the order with no gateway call).
    - `addToCart` with no cart yet runs step 2 as its first statement (there is no cart to lock).
    - `placeOrder` runs it after the replay check (a replay returns the earlier order and releases nothing), before `computeReview`.
19. After its commit, the purchase runs step 3, then answers as it does today.
20. **The release never decides the purchase's answer.** A step 1 failure or timeout (database or gateway) is logged and the purchase **continues normally** with what was cleared (possibly nothing). A step 2 failure is a database error inside the purchase's transaction, which already answers `error`.
21. `removeFromCart`, `removeBuildFromCart` and the read-only `reviewCheckout` don't release (they don't need stock; the review stays read-only, spec 029/030).

**B. The sweep, after server-rendered pages:**

22. The **product page**, **`/cart`**, **`/checkout`**, the **order page** (`/orders/[number]`) and **`GET /api/builder/candidates`** read `now` during the request and call `after(() => sweepExpiredOrders(now))`. The response is never delayed by it.
23. `sweepExpiredOrders(now, { limit = 10 })`: step 1 with no product filter, step 2 in its **own** transaction, step 3 (inside `after()` the phase is `'after'`, so `revalidateTag` is allowed and its tags are flushed, as verified in Next 16.4.1 per the issue). Any failure is logged and swallowed: a page is never affected.
24. The common case is **one indexed query that finds nothing** (a partial index on `Order (expiresAt) WHERE status = 'PENDING_PAYMENT'`), with no transaction and no gateway call.
25. The view that triggered the sweep may show stale stock (it rendered before the release). The next request is fresh. The order page doesn't depend on it (behavior 31).

**C. The daily cron:**

26. `GET /api/cron/release-orders`, listed in `vercel.json` under `crons` with the schedule `0 16 * * *` (16:00 UTC = midnight Manila). Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
27. The route compares the header with `CRON_SECRET` in constant time (both sides hashed, as `callbackTokenMatches`). A missing or wrong header, or `CRON_SECRET` not set → **401**, empty body, one log line, nothing read.
28. Otherwise it sweeps in batches of 25 (step 1, step 2 in its own transaction, step 3), each batch excluding the orders already tried in this run, until a batch finds nothing or **50 seconds** have passed. It answers **200** with `{ "released": n, "skipped": m }` and `Cache-Control: no-store`. A database failure → **500**, logged; what earlier batches released stays released.
29. **`maxDuration = 60`** is set explicitly on the route. The project is on the **Hobby** plan; with Fluid compute (on by default for new projects) Vercel's limit there is 300 s default and maximum (Vercel docs, *Configuring Maximum Duration* and *Limits*, read 2026-11-01), so 60 s is allowed and leaves 10 s after the 50 s budget for the last batch. Planning checks in the Vercel dashboard that Fluid compute is on for this project.
30. On Hobby, Vercel runs a cron job **at most once a day**, at some moment within the scheduled hour (Vercel docs, *Cron jobs › Usage and pricing*: "Per-hour (±59 min)"), and, per the issue, only on Production. Previews and local runs rely on the sweep (B) and the scoped release (A). It can be run by hand with `curl -H "Authorization: Bearer …"`.

### What the shopper sees

31. **The order page treats a Pending order past `expiresAt` as expired, whatever the row says** (released or not yet): the timeline shows the **Cancelled** item (spec 030's Cancelled branch: the list stops at Pending payment), then **"This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."**, and **no payment area**: no Pay now, no Retry payment, no "Confirming…", no Test mode banner, no pay-by line, whatever the `payment=` value. This replaces spec 030's past-due text "The time to pay has passed. This order will be cancelled and its parts released." and `paymentView`'s `past-due` view.
32. A **released** order (Cancelled, `cancelReason` `EXPIRED`) shows exactly the same. A late payment adds spec 032's "Payment received after this order was cancelled. We'll refund it." under it.
33. **Exception, a flagged order** (a Payment with `AMOUNT_MISMATCH`): it is never released, so past `expiresAt` it keeps spec 032's needs-checking view ("We received a payment that needs checking. We'll contact you.", V16b), not the expired one.
34. **Pay now from a page opened earlier** on an order now past `expiresAt`: `startPaymentAction` answers `expired` (no gateway call, nothing written; already the case, spec 031) and the panel refreshes into behavior 31's view.
35. A page polling with `payment=return` (spec 031) refreshes when the order's status changes. A shopper who reaches the order page after `expiresAt` sees behavior 31's view; if a payment completed in the last moments, the webhook makes the order Paid and a reload shows Paid (Q1).
36. The freed parts read as in stock on the product page, listings, the builder and `/cart` from the next request after the release. The cancelled order's parts don't go back into anyone's cart.

### Empty, loading and error states

| Situation | What happens |
| --- | --- |
| Nothing is due (almost every request) | One indexed query; no transaction, no gateway call, no log line |
| Xendit unreachable or slow in a purchase | After at most 2.5 s the purchase continues normally without that release (it may answer out of stock); logged `skipped`, code `timeout` |
| Xendit unreachable in a sweep or the cron | That order is skipped this run; the others go on |
| Order locked by a webhook or a Retry at that moment | Skipped by `SKIP LOCKED`; the next run takes it (its sessions are already cancelled, so no gateway call) |
| Sweep's database read or transaction fails | Logged; the page is unaffected |
| Scoped step 2 fails | The purchase's transaction rolls back and answers `error`, as any database error there does today |
| Cron without the secret | 401, nothing read |
| No loading state | Nothing the shopper waits on is added, except up to ~3 s of gateway time in a purchase, and only when an expired order with an open session holds the product being bought |

## 3. Examples

Values from specs 030–032. **P1** = order `PCS-7KQ2M9XD`: AMD Ryzen 5 7600 × 2 (₱11,495.00 each), delivery, total 2,311,000 centavos, placed 2026-11-01T07:00:00Z, `expiresAt` **2026-11-02T07:00:00Z** (Mon 2 Nov 2026, 3:00 PM Manila), reservation movement Ryzen −2; Ryzen stock 12 before placement, **10** after. Its first session `ps-0123456789abcdef01234567` (Payment 1, Pending, fake session Active unless stated). **P2** = order `PCS-3M8V1QZA`: Kingston FURY Beast DDR5-5600 16 GB (1×16 GB) CL40 × 1 (₱2,995.00), pickup, total 299,500, `expiresAt` 2026-11-02T09:00:00Z; Kingston stock 16 → 15. Fake gateway, environment `development`.

### Expiry boundary (unit, pure: `isDue(order, now)`)

| # | P1, now | Expected |
| --- | --- | --- |
| E1 | 2026-11-02T06:59:59.999Z | not due |
| E2 | 2026-11-02T07:00:00.000Z | **due** (at the deadline) |
| E3 | 2026-11-02T07:00:00.001Z | due |
| E4 | E3, status Paid / Cancelled / any other | not due |
| E5 | E3, a Payment with `problem` `AMOUNT_MISMATCH` | not due |
| E6 | E2 with the process under `TZ=Asia/Manila` and `UTC` | due in both (instants are compared) |

### Decision (unit, pure: `releaseDecision(sessions)`)

| # | The order's open sessions after step 1 | Expected |
| --- | --- | --- |
| D1 | none | release |
| D2 | one cancelled (2xx) | release |
| D3 | 422 → reconcile `expired` | release |
| D4 | 422 → `already-applied` | release |
| D5 | 422 → `paid` | not released (`paid`) |
| D6 | 422 → `mismatch` | not released (`mismatch`) |
| D7 | cancel failed (`timeout`, `http-500`) | skip, that code |
| D8 | 422 → each of `retry`, `not-yet`, `unconfirmed`, `error`, `active`, `ignored-unknown`, `ignored-environment` | skip, that code |
| D9 | two sessions (a stray second one): cancelled + 422 → `retry` | skip (`retry`) |

### Release (integration, Vitest + Docker Postgres, fake gateway)

| # | Given | Call | Expected |
| --- | --- | --- | --- |
| R1 **expired** | P1 Pending, Payment 1 Pending, fake session Active; now 2026-11-02T07:00:00Z | `sweepExpiredOrders(now)` | Fake session **Canceled** (step 1). P1 **Cancelled**, `cancelledAt` = now, `cancelReason` `EXPIRED`. Payment 1 **Expired** (step 2). Ryzen stock **12**. One `StockMovement` Ryzen **+2** `ORDER_RELEASED` for P1. `PRODUCTS_TAG` revalidated once. Log `order.release` `released` |
| R2 **not yet** | As R1, now 2026-11-02T06:59:59Z | sweep | Nothing changes; no transaction opened; no gateway call |
| R3 **run twice** | R1 done | sweep again | Nothing changes, no gateway call: still one `ORDER_RELEASED` movement, stock 12 |
| R3a | R1's state before release | two sweeps at once (`Promise.all`) | P1 released once: stock 12, one movement; the other run skipped it (locked) or no longer found it Pending; no error, no deadlock |
| R4 **Paid untouched** | P1 Paid (spec 032 H1), past `expiresAt` | sweep | Nothing changes; not selected by step 1; no gateway call |
| R5 **missed webhook** | P1 Pending, past due; fake session **Completed**, no webhook ever arrived | sweep | Cancel → not active → `reconcileSession` → P1 **Paid** (spec 032 C1); not released; stock 10; log `skipped` code `paid` |
| R6 **session already expired** | P1 Pending, past due; fake session Expired (its expiry passed), Payment 1 still Pending (no webhook yet) | sweep | Cancel → not active → reconcile `expired` (Payment 1 Expired); P1 released; stock 12 |
| R7 **gateway down** | As R1, the fake's `closeSession` fails (`http-500`) | sweep | P1 untouched (Pending, stock 10, Payment 1 Pending, session Active); log `skipped` code `http-500`. Fail cleared, sweep again → R1 |
| R8 **flagged** | P1 Pending, past due, Payment 1 Paid with `AMOUNT_MISMATCH` | sweep | P1 untouched; stock 10; no gateway call (left out by the query) |
| R9 **no open session** | P1 Pending, past due, no `Payment` rows | sweep | Released with no gateway call |
| R9a | P1 with Payment 1 Expired (a Retry closed it) and no Pending payment | sweep | Released with no gateway call (behavior 3) |
| R10 **after a rolled-back release** | S4a's state: session 1 Canceled at the fake, Payment 1 still Pending, P1 Pending | sweep | Cancel → not active → reconcile `expired` (Payment 1 Expired) → P1 released; stock back |
| R11 **scoped vs all** | P1 and P2 both past due; now 2026-11-02T09:00:00Z | `addToCart` of the Ryzen | Only P1 released (Ryzen 12); P2 untouched (Kingston 15, its session still Active) |
| R11a | R11 | `sweepExpiredOrders(now)` | Both released (Ryzen 12, Kingston 16), one `PRODUCTS_TAG` revalidation |
| R12 **retired product** | R1, the Ryzen's `status` set to retired before the release | sweep | Released; Ryzen stock 12 |
| R13 **many orders, one product** | Three past-due orders hold 2, 1 and 3 Ryzens (stock 0) | sweep | All three Cancelled; one `UPDATE` of the Ryzen, stock **6**; three `ORDER_RELEASED` movements (+2, +1, +3) |
| R14 **limit** | 12 past-due orders | sweep (limit 10) | The 10 oldest by `expiresAt` released; a second sweep releases the other 2 |

### Between the check and the release (integration; a test seam pauses after step 1)

| # | Given | Between step 1 and step 2 | Expected |
| --- | --- | --- | --- |
| G1 **paid just before the cancel** | P1 past due; the fake session is completed (paid) at the moment step 1 cancels it | — | Cancel → not active → reconcile `paid`: P1 **Paid**, Payment 1 Paid; step 2 never sees P1 (not cleared); stock 10 |
| G2 **payment completes after the check, webhook before the release** | P1 past due; step 1 cancelled session 1 and cleared P1 | The fake marks the session Completed anyway (seam: Xendit accepting a payment it just cancelled) and its webhook runs (`handlePaymentEvent`) | The webhook makes P1 **Paid** (spec 032: Pending → Paid). Step 2's conditional select doesn't find P1 Pending: **not cancelled**, stock 10, no `ORDER_RELEASED` movement, Payment 1 stays Paid (not overwritten to Expired) |
| G3 **payment completes after the check, webhook after the release** | As G2 | The fake marks the session Completed; the webhook is held until step 2 commits | Step 2 releases P1 (Cancelled, stock 12). Then the webhook: spec 032 H4, P1 stays **Cancelled**, `refundRequired` **true**, Payment 1 Expired → **Paid** `LATE`, stock 12 |
| G4 **expired webhook between the steps** | P1 past due; step 1 cancelled session 1 | A `payment_session.expired` webhook for session 1 runs: reconcile marks Payment 1 Expired | Step 2 releases P1; Payment 1 stays Expired (its `WHERE status = 'PENDING'` finds nothing); one `ORDER_RELEASED` movement |
| G5 **concurrent lock** | P1 past due, cleared by step 1 | A webhook's reconcile holds P1's lock (its `afterStep` pauses inside its transaction) while step 2 runs | Step 2 skips P1 (`SKIP LOCKED`, log `skipped` code `locked`); after the webhook commits, a later sweep releases or skips P1 by its new status |

### Scoped release inside purchases (integration)

| # | Given | Call | Expected |
| --- | --- | --- | --- |
| S1 **add frees stock** | Ryzen stock 0; P1 (holds 2) past due | `addToCart({ Ryzen, 1 })` | Session cancelled, P1 Cancelled, then the add succeeds: Ryzen stock 2, the cart line 1, result ok |
| S1a | S1, but P1 not yet due | `addToCart` | `unavailable` (out of stock), nothing released, no gateway call |
| S2 **raise** | Cart has Ryzen × 1, stock 0, P1 past due | `setCartQuantity(line, 3)` | P1 released (stock 2); the line becomes 2 with the cap note (spec 025) |
| S3 **build** | Ryzen stock 0; P1 past due; a valid build with the Ryzen | `addBuildToCart` | P1 released; the group is added (no `stock` refusal) |
| S4 **placement frees what it needs** | Ryzen stock 1; P1 (2 Ryzens) past due; shopper B's cart Ryzen × 1, reviewed (digest D); then another order takes the last unit (stock 0) | B's `placeOrder` with D | P1 released inside B's transaction (stock 2), B's decrement succeeds: B's order placed, Ryzen stock **1**; movements P1 +2 `ORDER_RELEASED`, B −1 `ORDER_RESERVED` |
| S4a | S4, but B's placement is refused (`changed`, a forced price change) | | Everything in the transaction rolls back: P1 still Pending, stock 0, no movements. P1's session stays cancelled at the fake (step 1 isn't undone). R10 then releases it |
| S5 **rollback** | S1 with the add's transaction forced to fail after step 2 | `addToCart` | `error`; P1 still Pending, stock 0 |
| S6 **step 1's query fails** | S1, the step 1 query forced to fail | `addToCart` | Logged; the add answers `unavailable` as today; nothing released |
| S7 **replay** | B's placement S4 done | the same key and token again | Returns B's order; releases nothing |
| S8 **no API call in a transaction** | R1, R5, R6, G1–G4, S1, S4 with spec 032 H17's spy | | Every gateway call happens before a transaction opens or after it commits |
| S9 **gateway timeout in a purchase** | Ryzen stock 0; P1 past due; the fake's `closeSession` answers `timeout` | `addToCart({ Ryzen, 1 })` | The add **continues normally** and answers `unavailable` (stock 0), as without a release; P1 untouched (Pending, session Active); log `order.release` `skipped` code `timeout`, `via` `purchase` |
| S9a | S9 with a slow fake (`closeSession` waits 10 s) | `addToCart` | Answers within about 2.5 s plus the add's own time; the same result as S9 |
| S9b | Two past-due orders hold the Ryzen; the first order's cancel times out | `addToCart` | No gateway call for the second order (step 1 ended at the first failure); both skipped, codes `timeout` and `budget` |
| S9c | S9's fake failure cleared | a sweep | P1 released (R1) |

### Order page (unit, markup with fixtures; `paymentView` and `OrderView`)

| # | Order, now | Expected |
| --- | --- | --- |
| V1 **released** | Cancelled, `cancelReason` `EXPIRED` | Timeline with the Cancelled item; "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."; no pay-by line, no payment area, no Test mode banner |
| V2 **past due, not released yet** | P1 Pending, now 2026-11-02T07:00:00Z | Exactly V1's view (the row still says Pending) |
| V2a | V2 with `payment=return` / `payment=cancelled` / `payment=error` | Same as V2: no "Confirming…", no Retry payment |
| V2b | P1 Pending, now 2026-11-02T06:59:59Z (1 s left) | spec 031's too-late view (unchanged): no button, pay-by line shown |
| V2c | V2, newest Payment Expired (V14's state) | Same as V2: no Retry payment |
| V3 | V1 with `refundRequired` | V1's view, then "Payment received after this order was cancelled. We'll refund it." |
| V4 | Cancelled with no `cancelReason` (fixture; Admin's cancel later) | Cancelled view, no expiry line |
| V5 **flagged** | Pending past `expiresAt`, a Payment with `AMOUNT_MISMATCH` | spec 032's needs-checking view (V16b), not V2 |
| V6 | Paid, any time after `expiresAt` | spec 032's Paid view (unchanged) |

### Paying after the deadline (integration)

| # | Given | Call | Expected |
| --- | --- | --- | --- |
| P1 | P1 Pending, now 2026-11-02T07:00:01Z (not released yet) | `startPaymentAction` (Pay now from a page opened earlier) | `expired`; no gateway call, nothing written |
| P2 | P1 Cancelled by the release | `startPaymentAction` | `not-pending`; no gateway call, nothing written |

### Cron route (integration, the handler called with a `Request`)

| # | Request | Expected |
| --- | --- | --- |
| T1 | No `Authorization` | **401**, empty body; no query run (spy) |
| T2 | `Bearer wrong`, `Bearer` + the secret + one character, `Basic …` | 401 |
| T3 | `CRON_SECRET` unset, any header | 401 |
| T4 | `Bearer ${CRON_SECRET}`, P1 and P2 past due | 200 `{ "released": 2, "skipped": 0 }`, `Cache-Control: no-store` |
| T5 | T4, nothing due | 200 `{ "released": 0, "skipped": 0 }` |
| T6 | 30 past-due orders, one whose cancel fails | 200 `{ "released": 29, "skipped": 1 }`; two batches; the failing order tried once |
| T7 | The route module | exports `maxDuration = 60` |

### Environment and config (unit)

| # | Case | Expected |
| --- | --- | --- |
| N1 | `CRON_SECRET` unset | Startup passes (the route refuses every call) |
| N2 | `CRON_SECRET` shorter than 16 characters | Startup fails: "CRON_SECRET must be at least 16 characters" |
| N3 | `vercel.json` | Has `crons: [{ "path": "/api/cron/release-orders", "schedule": "0 16 * * *" }]` (a test reads the file) |

### E2E (Playwright, fake gateway)

| # | Journey | Expected |
| --- | --- | --- |
| X1 **expired order releases** | Place an order with spec 030's E2E part (known stock through `e2e/stock.ts`); set its `expiresAt` into the past through a new helper (`e2e/orders.ts`, same production guard as `e2e/stock.ts`); open the order page | It shows Cancelled and "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts.", no Pay now. Open the product page, then reload it: the second load shows the stock from before the order |
| X2 | X1, but **Pay** on the fake page before moving `expiresAt` | The order stays **Paid**; stock unchanged |

## 4. Rules and edge cases

- **Gateway calls never run inside a database transaction.** Step 1 (cancel, reconcile) runs before the purchase's transaction or the sweep's; nothing calls the gateway after step 2. S8 holds it with spec 032's spy.
- **Why cancel first:** once Xendit accepts the cancel, nothing more can be paid on that session, so the release can't race a payment on it. When Xendit refuses because the session already ended, `reconcileSession` finds out how it ended: a payment whose webhook was missed makes the order Paid (R5, G1) instead of being cancelled with the money taken.
- **Skip, never guess:** any answer that doesn't prove every open session ended unpaid skips the order for this run (D7–D9, R7, S9). Holding stock a little longer is the cheaper mistake.
- **Cancelled sessions survive a rolled-back release.** Step 1's cancels are at Xendit and aren't undone if the purchase rolls back (S4a). The order then has an ended session whose `Payment` is still Pending, and is past `expiresAt`, so nobody can pay it; the next run's cancel gets "not active", reconcile marks the Payment Expired, and the order is released (R10).
- **The cancel is conditional** (behavior 9): step 2 changes an order only if it is still Pending, past `expiresAt` and unflagged, under its lock, and moves only Pending payments. A webhook between the steps wins (G2, G4); one after the release takes the late-payment path (G3).
- **Locks and order of locking.** Step 2 locks orders with `SKIP LOCKED` in id order, then updates products in id order. In a purchase it runs after the cart lock, so every purchase locks cart → orders → products, the order placement already uses. A release can still touch a product the purchase doesn't involve, so two transactions can occasionally wait on each other's product rows; Postgres detects the deadlock and aborts one, which answers `error` like any database error (accepted: it needs two expired orders and two concurrent purchases on crossed products).
- **Concurrency with `startPayment`:** it can't open a session for a past-due order (behavior 2) and takes the same order lock.
- **Concurrency between releases:** two runs can both pick an order and both try to cancel its session; the second gets "not active", reconciles to `expired` or `already-applied`, and is cleared too. `SKIP LOCKED` lets one release it; stock goes back once (R3a).
- **Purchases after a concurrent release:** a placement whose release skipped an order a sweep is releasing waits on the sweep's product row lock at its decrement and then sees the returned stock (READ COMMITTED re-reads the row), so it can still succeed.
- **Timeouts:** purchase paths 2.5 s per gateway call, the first failure ends step 1, no new call after 3 s (behavior 7); sweeps and the cron use the gateway's 6 s and continue. Worst case a purchase waits about 3 s plus one call.
- **Stock is returned from the reservation movements**, not recomputed from the order items. An order with no `ORDER_RESERVED` movement (none exist today) is cancelled with no stock change, logged with code `no-reservation`.
- **Retired products** get their stock back (R12); whether they're sold is still decided by `status`.
- **Flagged orders** are left out by the step 1 query and re-checked in step 2, so they are never locked, cancelled at Xendit or reconciled on every run, and the order page keeps their needs-checking view (V5).
- **Display vs data:** the order page decides "expired" from `status` and `expiresAt` at render time (`now`), so it never shows Pay now after the deadline even before the row is released (V2). The status route (`GET /api/orders/[number]/status`) keeps answering the row's status.
- **Limits:** a page sweep and a scoped release check at most 10 orders; the cron works in batches of 25 for up to 50 s within `maxDuration` 60. Anything left is taken by the next run.
- **`now`:** one instant per run, read on the server (the page reads it during render and passes it into `after()`; actions and the cron read it at the start). Tests pass it in.
- **What the cancel leaves alone:** `refundRequired` (only spec 032 sets it), the cart (already emptied at placement), `OrderItem`s and the snapshots. Orders are never deleted (spec 030).
- **`ORDERS_ENABLED`** doesn't gate releasing. Turning it on in Production is a release step after this story is deployed (`docs/setup/payments.md` already lists it).
- **Logging:** one JSON line per released or skipped order through `logReleaseEvent`: `{ "event": "order.release", "outcome": "released" | "skipped", "orderNumber", "via": "purchase" | "sweep" | "cron", "code"? }` (`code`: a gateway failure code, a reconcile outcome, `locked`, `budget` or `no-reservation`). A session cancelled in step 1 is part of its order's line, not a line of its own. The cron adds one summary line `{ "event": "order.release.cron", "released", "skipped" }`, and a refused call `{ "event": "order.release.cron", "outcome": "unauthorized" }`. Never the cron secret, an access token, a cart id, a shopper's details or a URL (spec 030's rule; the log spy covers every console method). Reconcile writes its own `payment.reconcile` line.
- **Previews and local runs** have no cron; the sweep and the scoped release cover them.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Order page, Pending past `expiresAt` or Cancelled with `cancelReason` `EXPIRED` | "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts." |
| Removed | Spec 030's "The time to pay has passed. This order will be cancelled and its parts released." (`ORDER_COPY.pastDue`) |
| Env error | "CRON_SECRET must be at least 16 characters" |

The cron route's JSON and the log lines aren't shopper copy.

## 6. Data and interfaces

### Schema (one migration)

- `Order`: `cancelledAt DateTime?`, `cancelReason OrderCancelReason?`. `enum OrderCancelReason { EXPIRED }` (Admin adds its own reasons in Sprint 8). Migration CHECKs: `status <> 'CANCELLED' OR ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL)`; `status <> 'PENDING_PAYMENT' OR "cancelledAt" IS NULL`.
- Partial index `Order ("expiresAt") WHERE status = 'PENDING_PAYMENT'`, declared in `schema.prisma` with the `partialIndexes` preview feature (as the cart's), so step 1's query is an index range scan.
- `StockMovementReason` gains `ORDER_RELEASED`.
- No new table, so nothing to add to `resetCatalog()` or `--reset`.

### Functions (server only, `lib/orders/release.ts` unless noted)

- `isDue({ status, expiresAt, flagged }, now) → boolean` (pure): E1–E6.
- `releaseDecision(sessions) → { release: true } | { release: false, code }` (pure): D1–D9.
- `checkExpiredOrders({ now, productIds?, limit, exclude?, gateway, purchase? }) → { cleared: string[], skipped: { orderNumber, code }[] }`: step 1 (behavior 4–8). No transaction. `purchase` turns on the 2.5 s timeouts, stop-at-first-failure and the 3 s budget.
- `releaseExpiredOrders(tx, { now, orderIds }) → { released: { id, orderNumber }[], productIds: string[] }`: step 2 (behavior 9–13), in the caller's transaction. *The issue's signature `releaseExpiredOrders(tx, { now, productIds? })` changes: the product scope moves to step 1, and step 2 takes the ids step 1 cleared (D3).*
- `afterRelease(result, { via })`: step 3 (behavior 14–15). Never throws; no gateway call.
- `sweepExpiredOrders(now, { limit?, exclude?, gateway? }) → { released, skipped, tried: string[] }`: steps 1–3 with its own transaction; used by `after()` on pages and by the cron. Never throws.
- `addToCart`, `setCartQuantity`, `addBuildToCart` and `placeOrder` gain `now` and `gateway` in their options (tests pass them) and call steps 1–3 as in behavior 17–20. Their inputs, results and refusals are unchanged.
- **`PaymentGateway.closeSession`'s outcome distinguishes the cancel from "not active"**: `cancelled` (Xendit accepted the cancel now) or `not-active` (422: the session had already ended or completed), with no session read inside it; the release then calls `reconcileSession`. `startPayment` keeps its behavior (it reads the session itself on `not-active` to tell completed from ended, or keeps using a helper with today's meaning; planning decides). The Xendit adapter takes a per-gateway `timeoutMs` already; purchase paths build one with 2,500 ms.
- The fake gateway: its `fail` seams can answer a chosen code (`timeout`) or wait (S9a); a seam completes a session after it was cancelled (G2, G3).
- `paymentView` gains the view **`expired`** (behavior 31), replacing `past-due`; it wins over every view except `needs-check`. The order view gains `cancelReason`. `ORDER_COPY.pastDue` is replaced by `cancelledExpired`.
- `logReleaseEvent(fields)` (`lib/orders/log.ts`). `cronSecretMatches(header, secret) → boolean` (pure, constant time).

### Routes and pages

- `GET /api/cron/release-orders` (`app/api/cron/release-orders/route.ts`): behavior 26–30. `dynamic`, Node.js runtime, **`export const maxDuration = 60`**. Under `api`, so nothing to add to `lib/reserved-slugs.ts`.
- `after(() => sweepExpiredOrders(now))` added to `app/(store)/[category]/[product]/page.tsx`, `app/(store)/cart/page.tsx`, `app/(store)/checkout/page.tsx`, `app/(store)/orders/[number]/page.tsx` and `app/api/builder/candidates/route.ts`. On the order, checkout and product pages it runs only after their `notFound()` / redirect checks, so those keep their HTTP status.

### Environment and config

| Item | Change |
| --- | --- |
| `CRON_SECRET` | New, in `lib/env.ts` (server, optional, at least 16 characters when set) and `.env.example` (empty, with a comment). Production: set in Vercel (`docs/setup/payments.md` already has the row). Never logged |
| `vercel.json` | Gains `"crons": [{ "path": "/api/cron/release-orders", "schedule": "0 16 * * *" }]` |

### Documents

- CLAUDE.md: a paragraph for releasing (cancel first, the two steps, the scoped calls and their timeouts, the sweep pages, the cron, `CRON_SECRET`, the order page's expired view).
- `docs/setup/payments.md`: the cron checklist confirmed against what was built, including "Fluid compute on" and the Hobby limits; the `ORDERS_ENABLED` Production step stays.
- Spec 030: V11 and its past-due copy are marked *Changed by spec 033*. Spec 032: §8's "and its Expired ones" and V16b's neighbours are noted as narrowed by D2. ADR 0009's "Nothing releases stock yet" gets "Released by spec 033". No new ADR: the release follows ADR 0009's lock model and spec 032's reconcile.

## 7. Test plan

| Level | Examples |
| --- | --- |
| Unit (Vitest, pure) | E1–E6 (the expiry boundary), D1–D9, V1–V6 (`paymentView`, order page markup), N1–N3, T7, `cronSecretMatches` (T1–T3's header cases), the Xendit adapter's `closeSession` on 2xx / 422 / timeout (recorded shapes), the log line shapes and the "nothing secret in any console call" spy |
| Integration (Vitest + Docker Postgres, fake gateway) | R1–R14, G1–G5, S1–S9c, P1–P2, T1–T6 (the route handler with a `Request`), the new CHECKs and the partial index's existence, S8's spy |
| E2E (Playwright, fake gateway) | X1, X2 |
| Manual | Preview: X1 by hand (place, move `expiresAt` with SQL, open the order page and a product page twice). Production after deploy: Fluid compute on; the cron listed under Project → Settings → Cron Jobs; a hand-run `curl` with the secret answers 200; then turn `ORDERS_ENABLED` on |

The `after()` wiring on pages isn't unit-tested (Next's request scope); X1 covers it end to end.

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Admin cancelling an order, other cancel reasons, restocking by hand | Admin, Sprint 8 |
| Releasing an order whose payment needs checking | Admin, Sprint 8 |
| Refunding a late payment | FR-26, Sprint 8 |
| "Order cancelled" email | FR-21, Sprint 7 |
| COD orders (no online payment; their expiry rules) | FR-25, Sprint 7 |
| Taking `startPayment`'s gateway calls out of its transaction | #88 |
| Putting a cancelled order's parts back in the shopper's cart | Not planned |
| Turning `ORDERS_ENABLED` on in Production | A release step after this story is deployed (`docs/setup/payments.md`) |
| Moving local E2E to the Docker Postgres | #74 |
| A schedule more often than daily (needs a paid plan or an outside scheduler) | Not planned; the sweep covers it |

## 9. Decisions

- **D1 — Cancel open sessions first, then release** (review decision). Step 1 cancels each open session at Xendit; a 2xx clears it, a 422 goes to `reconcileSession`, anything else skips the order. Nothing is closed after the commit. Once Xendit accepts the cancel, no payment can land on that session, so the release no longer races payments it could have prevented. *Rejected:* reconcile first and close after the commit (spec 032's recommendation and this spec's first draft: a payment could complete between the check and the close, and turn a cancel into a refund).
- **D2 — Only Pending payments are checked; Expired ones are final** (behavior 3), narrowing spec 032 §8 ("its Pending `Payment` and its Expired ones"). An Expired row exists only after a cancel Xendit accepted or reported ended, or a gateway-confirmed expiry. *Rejected:* reconciling every Expired session on every run (gateway calls that can't change anything).
- **D3 — `releaseExpiredOrders` takes the cleared order ids, not `productIds`** (changes the issue's signature). Step 2 must release only what step 1 cleared. *Rejected:* step 2 re-querying by product (it could pick an order whose sessions step 1 never cancelled).
- **D4 — The scoped release checks before the purchase's transaction and releases inside it** (Q1 in the draft, agreed). *Rejected:* leaving orders with sessions to the sweep and cron (nearly every order has one, so purchases would rarely release); calling Xendit inside the transaction.
- **D5 — Purchase paths: 2.5 s per gateway call, stop at the first failure, no new call after 3 s, then continue normally** (review decision: 2–3 s). Bounds what a slow Xendit can add to an add to cart. *Rejected:* the gateway's 6 s with every order tried (up to a minute on a bad day).
- **D6 — Step 2 runs after the cart lock, not "first"** (changes the issue's wording). Every purchase locks cart → orders → products. *Rejected:* releasing before the cart lock (a release and a placement on the same cart could deadlock).
- **D7 — Flagged orders are never released** (the issue's comment, superseding spec 032 Q7's "cancel as usual"), and past `expiresAt` they keep the needs-checking view, not the expired one. *Rejected:* cancelling them (the money is with Xendit and only Admin can settle it); showing them as cancelled (they aren't going to be).
- **D8 — The order page shows Pending past `expiresAt` as expired, whatever the row says** (review decision), replacing spec 030's "will be cancelled" text and `past-due`. Display no longer depends on when a sweep ran. *Rejected:* showing the row's status (a past-due order would read as payable-looking Pending until someone visits a page that sweeps).
- **D9 — Stock comes back from the `ORDER_RESERVED` movements**, one `ORDER_RELEASED` per product (spec 030 D7). *Rejected:* summing `OrderItem`s (two sources of truth).
- **D10 — `Order.cancelledAt` and `cancelReason`** record "reason: expired" as data. *Rejected:* inferring it from `expiresAt` (Admin cancels will need a reason anyway); free text.
- **D11 — The order page sweeps too** (Q4 in the draft, agreed).
- **D12 — Skip on any doubtful answer.** *Rejected:* releasing after N failed runs (Admin can act on a stuck order in Sprint 8).
- **D13 — Limits: 10 per page sweep and per scoped release; cron batches of 25 for 50 s; `maxDuration = 60` set explicitly** (Q2 in the draft, agreed). Hobby with Fluid compute allows up to 300 s. *Rejected:* relying on the platform default (it differs with and without Fluid compute).
- **D14 — `CRON_SECRET` is optional at startup and the route fails closed.** *Rejected:* required everywhere (only Production's cron calls the route).
- **D15 — Retired products get their stock back.** Stock is a physical count; `status` decides whether it's sold.

**Disagreements flagged:** the issue says PayMongo throughout (Xendit, ADR 0010); the issue's comment and spec 032 §8 say reconcile first and close after (D1); spec 032 §8 checks Expired sessions too (D2); the issue's `releaseExpiredOrders` signature (D3); "call it first" (D6); spec 032 Q7's "cancel as usual" (D7); spec 030's past-due text and V11 (D8); the sweep also runs on the order page (D11).

### Acceptance criteria → examples and rules

| Issue #81 criterion | Covered by |
| --- | --- |
| `releaseExpiredOrders` in the caller's transaction, `FOR UPDATE SKIP LOCKED`, Cancelled (reason expired), stock back, `order-released` movements, open Payments Expired | Behavior 9–13; R1, R13, G4; §6 Schema; D3, D9, D10 |
| Idempotent: the conditional status change releases, twice releases once | Behavior 12; R3, R3a |
| Scoped release in `addToCart`, `setCartQuantity`, `addBuildToCart`, placement, same transaction as the stock check | Behavior 17–21; S1–S7; D4, D6 |
| Global sweep from the product page, `/cart`, `/checkout`, the candidates route via `after()`, own transaction, `revalidateTag` | Behavior 22–25; R11a; X1; D11 |
| The triggering view may be stale; the sweep is one indexed query | Behavior 24–25; R2; §6 partial index |
| After commit: expire sessions best effort and logged (review: **cancelled before** the release instead); revalidate `PRODUCTS_TAG` | Behavior 5, 14, 16; R1, R5–R7, G1–G3; D1 |
| Daily cron `GET /api/cron/release-orders`, `vercel.json` `0 16 * * *`, refused without `Bearer ${CRON_SECRET}` | Behavior 26–30; T1–T7; N1–N3 |
| Webhook racing a release settled by the order row lock | Behavior 9; rules *The cancel is conditional*, *Locks*; G2–G5 |
| Comment: reconcile before releasing; `retry` skips | Behavior 5–6; R5, R6, G1; D1, D12 |
| Comment: Xendit API calls never inside a transaction | Rule *Gateway calls*; S8 |
| Comment: skip orders with a flagged payment, in the query | Behavior 1, 9; R8; E5; V5; D7 |
| Comment: `closeSession` sends no webhook, so the release marks the Payment Expired | Behavior 10; R1 |
| Tests: integration expired vs not, twice, Paid untouched, scoped vs all, placement frees stock, race | R1, R2, R3, R4, R11/R11a, S4, G2–G5 |
| Tests: route 401 without the secret | T1–T3 |
| Tests: unit expiry boundary | E1–E6 |
| Task: `CRON_SECRET` in `lib/env.ts` and `.env.example` | §6 Environment; N1, N2 |
| DoD: empty, loading and error states | §2 *Empty, loading and error states* |
| Review 1: cancel first; 422 → reconcile; unreachable → skip; conditional cancel; tests for a payment completing and a webhook arriving between the steps | Behavior 5–9, 16; D1; G1–G5 |
| Review 2: 2–3 s timeout in purchase paths; on timeout continue normally | Behavior 7, 20; S9–S9c; D5 |
| Review 3: explicit `maxDuration`, the plan's limit confirmed | Behavior 29; T7; D13 |
| Review 4: the cancelled copy | §5; V1, X1 |
| Review 5: order page sweeps; Pending past `expiresAt` shown as expired; `startPayment` refuses past `expiresAt` | Behavior 22, 31–34; V1–V6, P1–P2; D8, D11 |

## 10. Open questions

- **Q1 — A payment completed in the last seconds before `expiresAt`, seen before its webhook lands.** With D8, a shopper returning from Xendit just after the deadline (`payment=return`) sees "This order was cancelled…" until the webhook makes the order Paid; a reload then shows Paid. The window is the webhook's delay (usually seconds). **Recommendation:** accept it as written (the review asked for "whatever the row says"). The alternative is to show "Confirming your payment…" for `payment=return` within a short grace period (e.g. 15 minutes) after `expiresAt`, and the expired view after that.

## 11. Changes from review (2026-11-01)

1. **Cancel sessions before releasing** (D1): step 1 cancels each open session; 2xx clears it, 422 goes to `reconcileSession` (paid → Paid; expired → can be released), anything else skips the order. "Close any session still open after the commit" is removed (old behavior 12 and examples R8/R8a). Step 2's cancel is conditional on Pending, past `expiresAt` and unflagged, and moves only Pending payments. Added G1–G5 (a payment completing between the check and the release; webhooks before and after step 2; a held lock). Only Pending payments are checked now (D2). `closeSession`'s outcome splits `cancelled` / `not-active` (§6).
2. **Purchase timeouts** (D5): 2.5 s per gateway call, stop at the first failure, no new call after 3 s, then the purchase continues normally. Added S9–S9c.
3. **Cron limits** (D13): `maxDuration = 60` set explicitly (T7); Hobby with Fluid compute allows 300 s, confirmed in Vercel's docs; Fluid compute to be checked in the dashboard.
4. **Copy:** "This order was cancelled because it wasn't paid in time. Place a new order if you still want these parts."
5. **Order page** (D8, D11): it sweeps; Pending past `expiresAt` is shown as expired whatever the row says (V2–V2c), replacing the past-due text; flagged orders keep their view (V5); `startPayment` past `expiresAt` refuses with no gateway call (P1–P2). Q1 added for the last-seconds payment.
