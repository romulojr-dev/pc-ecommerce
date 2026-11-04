# 038 — Cash on delivery, confirmed by email

Status: approved with changes (2026-11-04; see "Changes made by the review" at the end of §10). Issue: [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95) (parent epic [#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4), Checkout, Sprint 7, size L). PRD: FR-25 (COD limits), FR-20 (status timeline), FR-21 (emails), AD-9 (settings data only; the Admin screen is Sprint 9), Payments and fulfillment table, Data model › `Order`, `StoreSettings`. Builds on [spec 029](../029-checkout-steps/spec.md) (the review), [spec 030](../030-place-an-order/spec.md) / [ADR 0009](../../adr/0009-place-orders-in-one-transaction-held-by-an-access-token.md) (`placeOrder`, the digest), [spec 033](../033-release-unpaid-orders/spec.md) (the release), [spec 035](../035-email-foundation-signed-links/spec.md) / [ADR 0011](../../adr/0011-signed-order-links-beside-the-access-token.md) (the outbox, the `cod-confirm` link), [spec 036](../036-order-emails/spec.md) (the email templates), [spec 037](../037-vouchers-at-checkout/spec.md) (vouchers; its ₱20.00 floor "must apply to COD").

Long form: the story adds an order status, a payment option, five settings, a review choice, a placement path, a release path, an email, a public page with a POST, and a timeline. **It changes three earlier specs** (035 D9, 030's timeline note, 036's cancelled-email reason); see "Conflicts with earlier specs" in §9.

## 1. Summary

At the review step a shopper chooses **Online** or **Cash on delivery** (**Pay on pickup** for a pickup order). Cash on delivery is offered only when the store allows it for this order: it is switched on, the total the courier would collect (after the discount, with shipping) is within the limit, and the zone (delivery) or the pickup switch (pickup) allows it. A cash order reserves stock like an online one, never touches Xendit, starts as **Pending confirmation** with a shorter deadline, and emails a **Confirm order** link; the shopper confirms with a button on that page (a POST, so a link scanner's GET changes nothing), and the order becomes **COD confirmed**. An order not confirmed in time is released by the same release as unpaid online orders, with no gateway step, and the shopper is told it wasn't confirmed in time. Confirmed cash orders never expire.

## 2. Behavior

### The settings (data)

1. `StoreSettings` gains five columns, read fresh with the shipping config (never cached, spec 028 D16): `codEnabled` (the master switch), `codMaxTotal` (centavos; null means no limit), `codZones` (the delivery zones where cash is allowed; empty means none), `codPickupEnabled` (pay on pickup), `codConfirmHours` (hours to confirm; at least 1).
2. **Demo values**, written by the migration's column defaults (so the settings row that already exists gets them) and by `db:seed` when it creates a missing row; the seed never overwrites an existing row: on, limit **₱50,000.00**, zones **Metro Manila and Luzon**, pay on pickup on, **24 hours**. There is no Admin screen until Sprint 9.

### The payment choice on the review (step 2)

3. The review gets a **Payment** section with two radio options, always both shown: **Pay online** (GCash, Maya or card, paid on the next page, as today) and **Cash on delivery** (labelled **Pay on pickup** when the order is pickup). **Pay online** is selected on arrival unless the saved details hold a cash choice (point 7).
4. Cash is **offered** when all hold, checked in this order, stopping at the first failure: `codEnabled` is on (**disabled**); for pickup `codPickupEnabled` is on (**pickup-off**); for delivery the order's zone is in `codZones` (**zone**); the review's total can be worked out, i.e. delivery has a rate (**no-total**); the **total** is at most `codMaxTotal` (**over-limit**, with how far over). The total is the review's own: `subtotal − discount + shipping`, so a voucher can bring an order under the limit and the limit compares exactly what the courier collects. Equal to the limit is allowed; one centavo more is not. A pickup order is judged by the same limit (its total has no shipping).
5. When cash is not offered, its radio is disabled and the reason shows under it (§5). Pay online stays available and is unaffected.
6. **Choosing Cash on delivery** is a review request, like Apply in spec 037: the option shows busy, the review stays on screen, every review issues a new digest, idempotency key and access token (spec 030 Behavior 2), and the answer settles the section. **Choosing Pay online** is the same. Focus stays on the radio the shopper chose.
7. The choice is kept in this tab's saved step-1 details (`sessionStorage`) so going back to step 1 and returning keeps it. **Arriving, Check again or a reload with a saved cash choice** reviews it again: if cash is no longer offered (the cart grew past the limit, the settings changed), the review shows **Pay online** selected, the section says why cash isn't offered, and the saved choice is reset. The shopper is told by the reason, never by a silent change; the review never silently places an online order for a shopper who chose cash (point 14).
8. With cash chosen the review changes only where payment shows: the summary gets a **Payment** row ("Cash on delivery" or "Pay on pickup"), the note under Place order says how long the parts are held and that the order must be confirmed from the email (§5), and the test-mode banner with the gateway's instructions is not shown (nothing is paid online). Totals, fee, voucher box and problems are the same as for an online order. **A voucher on a cash order follows spec 037 in full**, including its ₱20.00 floor (a code that would take the total under ₱20.00 is refused as below-minimum whatever the payment option); nothing in this story changes the voucher rules.
9. **Place order** with cash goes to the order page, not to a payment page. The success path is the existing one (clear the saved details, header count 0, `router.replace` the order link) and the link carries no `payment=` value.

### Placing a cash order

10. The payment choice is part of `checkoutInputSchema` (`payment`: `online` or `cod`, optional, default `online`; any other value is `invalid` with a message on `payment`), part of the digest, and checked again at placement.
11. `placeOrder` runs the review's own checks inside its transaction (spec 030 Behavior 9), now including cash eligibility with the settings read through the transaction's client. A request for cash that the fresh review does not offer, or a digest that differs, is `changed` ("Your order changed. Review it again."). The reloaded review shows the reason.
12. A cash placement is the online placement with these differences, in the same transaction and order of steps: the order's status is **Pending confirmation** (a new `OrderStatus`) and its payment option is **COD** (a new column, §6); `expiresAt` is `now + codConfirmHours`; the email enqueued is `COD_CONFIRM` **only**, in place of `ORDER_PLACED` (D11); and no payment session is started. Stock reservation, the `StockMovement` rows, the voucher use, the order items, the snapshots and emptying the cart are unchanged. **A cash order has no `Payment` row, makes no gateway call, and never has a `paidAt` before delivery.**
13. After the commit `placeOrderAction` returns the order link with no `payUrl` (it does not call `startPayment`), and schedules the send of the email (as for the online email). A failed or skipped email never changes the order.
14. A replay of the same key and token returns the same order and enqueues nothing again (spec 030 Behavior 15), whichever payment option.

### The confirmation email and page

15. The `COD_CONFIRM` email (registered in the template registry; spec 036's three emails are unchanged) names its action in the subject and the first line ("[Demo] Confirm your cash-on-delivery order PCS-…", or "…pay-on-pickup order…" for pickup), then says **when to confirm by**, that the shopper pays the total in cash on arrival (or at the store), the items, totals and where it goes, and has one primary button, **Confirm order**, to `/orders/{number}?sig=…&exp=…&p=cod-confirm`, plus the usual **View your order** link (a `view` link, 90 days). The `cod-confirm` link's `exp` is the order's `expiresAt` in whole seconds (rounded down); it is minted when the email is built, from the order row, so the same order always yields the same link. Like every email it is built from the order **as it is when sent**: the button shows only while the order is Pending confirmation and before `expiresAt`; otherwise a status line (`Status: COD confirmed`, `Status: Cancelled`) replaces it.
16. The email is subject to spec 035's rules unchanged: the per-recipient cap (five a day), the 24-hour too-old rule, retries by the sweeps. **A skipped confirmation email leaves the order to expire and be released normally**; nothing else is sent or changed. (Orders with a confirmation window over 24 hours can't be emailed after 24 hours of retries; accepted.)
17. **Opening the link** (a GET, the only thing a mail scanner does) renders the confirmation page and **changes nothing**. What it shows depends on a valid signature (purpose `cod-confirm`, for this order) and the order:
    - Pending confirmation, link not expired, before `expiresAt`: the **confirm view**: order number, items, totals, where it goes, what the shopper will pay and when, and a **Confirm order** button. It shows no contact details.
    - COD confirmed or any later status (not cancelled): the **confirmed view** ("already confirmed"), with no button.
    - Cancelled, or Pending confirmation at or after `expiresAt`, or the link expired: the **cancelled view** ("not confirmed in time"), with no button and a link to the shop.
    - A bad signature, another purpose, a malformed link, an unknown order, and an order that is not a cash order: the same 404 as any wrong order credential (spec 035 Behavior 10.2), one read, the same cost.
18. **Confirm order** is a server action (a POST). It repeats the checks of point 17 and, only for a confirmable order, moves it **Pending confirmation → COD confirmed** with one conditional update (`status = Pending confirmation AND expiresAt > now`), which holds the order's row lock and sets **`confirmedAt`** to the action's `now` in that same statement. It answers `confirmed` (it did), `already` (it was confirmed, including by a double click or a second tab: **a no-op**, nothing written), or `expired` (the cancelled view). The page then shows the confirmed or cancelled view without a reload. No email is sent on confirming (Out of scope).
19. **Confirm racing the release: exactly one wins.** Both lock the order row and re-check its status under the lock; confirming holds the lock first → the release finds a confirmed order and skips it; the release first → the conditional update finds no row and the answer is `expired`. The order is never both, and a cancelled order's stock and voucher use go back exactly once.

### The release of unconfirmed orders

20. The release (spec 033) also takes **Pending confirmation** orders at or after `expiresAt`: the same query, lock, cancellation (`CANCELLED`, `cancelledAt`, `cancelReason` `EXPIRED`), stock return (`ORDER_RELEASED` movements row for row), voucher use give-back and `ORDER_CANCELLED` email. A cash order has no payment, so **there is no gateway step**: it is cleared without any call. The partial index covers both statuses.
21. The purchases that run `prepareRelease` (cart, build, placement) and the sweeps after pages and the cron release cash orders the same way, so a shopper racing for the last unit is not blocked by an unconfirmed cash order past its deadline.
22. **COD confirmed orders never auto-expire**: they are not due whatever `expiresAt` says. They hold their stock and voucher use until Admin handles them (Sprint 8/9; Admin's cancel must call the same stock and voucher give-back).
23. The "Order cancelled" email for a cash order says it "wasn't confirmed in time"; for an online order it still says "wasn't paid in time".

### The order page and the timeline

24. A cash order's timeline is **Pending confirmation → COD confirmed → Processing → Shipped → Delivered**; for pickup **… → Ready for pickup → Picked up**. The online timeline is unchanged (Paid is still its step). Cancelled and Refunded are the same separate branch as now. `COD confirmed` is its own step: it no longer shares Paid's place. Once the order is confirmed that step also reads **Confirmed {Manila time}** (from `confirmedAt`, in the fixed Asia/Manila format of `lib/orders/time.ts`).
25. A Pending confirmation order, before its deadline, says: **"Check your email (from {sender address}) to confirm this order. If it doesn't arrive, the order cancels itself at {Manila time} and you can place a new one."** The sender address is the address part of `EMAIL_FROM` (`orders@mail.pcsilicon.tech` by default), so the text is true in every environment; the time is `expiresAt`. There is **no Pay now, no payment panel and no test-mode banner**, and no confirm button on the order page (confirming is only from the email's link, which is what proves the shopper owns the address). A Pending confirmation order at or after `expiresAt` **reads as Cancelled whatever the row says** (as an online one does), with "This order was cancelled because it wasn't confirmed in time." A COD confirmed order past `expiresAt` stays COD confirmed.
26. The summary gets a **Payment** row: "Cash on delivery" or "Pay on pickup". Online orders show no new row.

### Empty, loading and error states

| State | What shows |
|---|---|
| Review loading | Spec 029's skeleton; the Payment section is part of the review |
| Choosing an option in flight | The option busy, the review stays visible, the polite live region says "Checking your order…" |
| Cash not offered | Radio disabled, the reason under it (§5) |
| Choosing request fails | The review stays as it was; the section says "We couldn't update your payment choice. Try again." |
| Place order → `changed` | Spec 030's notice and automatic reload; the section shows the reason if cash is the cause |
| Place order for cash, email later skipped or failed | The order page as normal: it tells the shopper to check the email and that the order cancels itself at the deadline (point 25). No resend yet ([#101](https://github.com/romulojr-dev/pc-ecommerce/issues/101)); the order expires and is released |
| Confirm page, request in flight | Button busy ("Confirming…") |
| Confirm page, request fails | The view stays; "We couldn't confirm your order. Try again." |
| Confirm page, bad link | The standard order 404 |
| Settings row missing | Setup error as today (`getShippingConfig` throws) |

## 3. Examples

Seed values: **Ryzen 5 7600** ₱11,495.00 (450 g), **LANCOOL 216 Black** ₱5,795.00 (9,000 g), **Build A** ₱69,060.00 (15,860 g), **Build B** ₱74,560.00; the ₱75,000.00 free-shipping threshold; Metro Manila rates 1 kg ₱120.00 and 20 kg ₱450.00; Mindanao 1 kg ₱210.00; vouchers `WELCOME10` (10 %, min ₱5,000.00), `BUILD5000`; QC, Davao and the contact are spec 029/030/037's. COD settings are the demo values of point 2 unless a row says otherwise ("test settings" means the test sets them). Clock fixed at 2026-11-04 10:00 Manila; a cash order placed then expires 2026-11-05 10:00 Manila.

### Pure functions (unit)

| # | Input | Expected |
|---|---|---|
| U1 | `codEligibility`: delivery, zone Metro Manila, total 2,311,000, demo settings | offered |
| U2 | Same with `codMaxTotal` 2,311,000 / 2,310,999 | offered (equal) / `over-limit`, over by 1 centavo |
| U3 | `codMaxTotal` null with total 99,999,999 | offered |
| U4 | Delivery, zone Mindanao / Visayas / Luzon with zones [Metro Manila, Luzon] | `zone` / `zone` / offered |
| U5 | `codZones` empty, delivery Metro Manila | `zone` |
| U6 | Pickup with `codPickupEnabled` off; pickup with it on and `codZones` empty | `pickup-off`; offered (zones don't apply to pickup) |
| U7 | `codEnabled` off, delivery Metro Manila and pickup | `disabled` for both (first in the order) |
| U8 | Failures stack: off + wrong zone + over limit | `disabled` (the order of point 4) |
| U9 | Delivery with no rate (total null) | `no-total` |
| U10 | Timeline, delivery, COD: each of the six statuses; and with `confirmedAt` 2026-11-04 12:30 Manila / null | steps Pending confirmation → COD confirmed → Processing → Shipped → Delivered with the current one marked; Cancelled has the branch; pickup shows Ready for pickup, Picked up. The COD confirmed step reads "Confirmed Wed 4 Nov 2026, 12:30 PM" when `confirmedAt` is set and no time when it is null; no other step ever shows one |
| U11 | Timeline, online: unchanged for every status (existing tests) | Paid still its step; `COD confirmed` label is "COD confirmed", not "Paid" |
| U12 | Displayed status: Pending confirmation at `expiresAt − 1 ms` / at `expiresAt`; COD confirmed 30 days past `expiresAt` | Pending confirmation / Cancelled; COD confirmed |
| U13 | Due rule: Pending confirmation past `expiresAt`; COD confirmed past `expiresAt`; Pending payment past `expiresAt` | due; **not due**; due |
| U14 | Confirm-page decision table (signature ok/expired/bad, purpose, status, time) | the five outcomes of point 17, one assertion per row; a non-cash order is "not found" |
| U15 | `checkoutInputSchema` with `payment` "cod", missing, "cash" | `cod`; `online`; `invalid` on `payment` |
| U16 | `reviewDigest` of the same review with payment `online` vs `cod` | different digests |
| U17 | `emailView("COD_CONFIRM")` for delivery and for pickup, pending / confirmed / cancelled / past deadline | Confirm button only for the first; status lines for the rest; "at the store" for pickup; every subject starts "[Demo] "; hostile text escaped |
| U18 | `cancelledLead` for `EXPIRED` on a COD order and on an online order | "wasn't confirmed in time"; "wasn't paid in time" |
| U19 | The `cod-confirm` link built for an order whose `expiresAt` has milliseconds | `exp` is `floor(expiresAt / 1000)`; verifies `ok` before it and `expired` at and after it |
| U20 | The sender address from `EMAIL_FROM`: `PC Silicon <orders@mail.pcsilicon.tech>`, a bare `orders@example.com`, a quoted name with a comma | `orders@mail.pcsilicon.tech`; `orders@example.com`; the address only, never the display name |
| U21 | `emailView("COD_CONFIRM")` subject and lead, delivery and pickup | "[Demo] Confirm your cash-on-delivery order PCS-…" / "[Demo] Confirm your pay-on-pickup order PCS-…"; the lead starts "Please confirm your …" |

### The review (integration, `reviewCheckout` against the test database)

| # | Cart and request | Expected |
|---|---|---|
| V1 | Ryzen × 2 (₱22,990.00), delivery QC, `payment` online | As today; cash offered; chosen online |
| V2 | The same, `payment` cod | Chosen cod; total ₱23,110.00 unchanged; hold hours 24; the digest differs from V1's |
| V3 | Build B (₱74,560.00, total ₱75,010.00 with ₱450.00 shipping), delivery QC, cod | Not offered, `over-limit`, ₱25,010.00 over; chosen online (fallback); a cod placement would be `changed` |
| V4 | Build B + `BUILD5000`, delivery QC, cod | Total ₱70,010.00: still `over-limit` |
| V5 | Ryzen × 2 with `WELCOME10`, test settings `codMaxTotal` 2,081,100 | Total ₱20,811.00 equals the limit: offered |
| V6 | The same without the code | Total ₱23,110.00: `over-limit` (the limit compares after the discount) |
| V7 | Ryzen × 2, delivery Davao (Mindanao), cod | `zone`; chosen online |
| V8 | LANCOOL × 1 (₱5,795.00), pickup, cod | Offered as Pay on pickup; total ₱5,795.00 |
| V9 | The same with `codPickupEnabled` off | `pickup-off` |
| V10 | The same with `codEnabled` off | `disabled` |
| V11 | Build A, pickup, cod | `over-limit` (total ₱69,060.00); pickup is judged by the limit too |
| V12 | LANCOOL × 1, pickup, `WELCOME10` is refused for min spend, cod | The voucher result is independent: refusal shown, cash still offered |
| V13 | LANCOOL × 1, pickup, test code FIXED ₱5,775.01, cod | The voucher is refused below-minimum (spec 037 floor), also for cash; total ₱5,795.00 |
| V14 | A cart with a line out of stock, cod | The cart's problems list as before; the payment section is independent |
| V15 | `payment` "cash" | `invalid` on `payment` |

### Placing (integration, `placeOrder`)

| # | Cart and state | Action | Expected |
|---|---|---|---|
| P1 | V2's cart, fresh review | Place | `ok`. Order: status Pending confirmation, option COD, `expiresAt` 2026-11-05 10:00 Manila, total 2,311,000, `paidAt` and `paymentMethod` null; stock −2 and one `ORDER_RESERVED` movement; cart emptied; **one `EmailOutbox` row `COD_CONFIRM`, none `ORDER_PLACED`**; no `Payment` row |
| P2 | P1 with a spying gateway | Place | The gateway is never called (no `createSession`, `closeSession`, `getSession`) |
| P3 | P1 | The same request again | `ok`, same link, one order, one outbox row, stock unchanged |
| P4 | Test settings `codConfirmHours` 2 | Place | `expiresAt` 2026-11-04 12:00 Manila |
| P5 | Reviewed as cod; then `codEnabled` set off | Place | `changed`; nothing written |
| P6 | Reviewed as cod; then `codMaxTotal` lowered below the total | Place | `changed` |
| P7 | Reviewed as cod; then `codZones` changed to exclude the zone | Place | `changed` |
| P8 | Reviewed as online | Place with `payment` cod added | `changed` (the digest differs) |
| P9 | Reviewed as cod | Place with `payment` online | `changed` |
| P10 | Build B delivery QC (not offered) | A forged place with `payment` cod and V3's digest | `changed`, nothing written |
| P11 | P1 with a step after the email forced to fail (`afterStep`) | Place | `error`; no order, no outbox row, stock unchanged |
| P12 | V5's cart with `WELCOME10`, cod | Place | `ok`; voucher `usedCount` 0 → 1; order carries `voucherCode` and `discount` |
| P13 | Two carts, one unit of stock, one cash and one online | Place at once | Exactly one `ok`; stock never negative |
| P14 | V8's pickup cart, cod | Place | `ok`; Pending confirmation, option COD, fulfillment pickup |
| P15 | ORDERS_ENABLED off | `placeOrderAction` cod | `disabled`, as for online |

### Confirming (integration, the confirm function and action)

| # | Given | Action | Expected |
|---|---|---|---|
| C1 | P1's order, a `cod-confirm` link minted with `exp` = `expiresAt` | GET the page | Confirm view; the order row unchanged |
| C2 | The same, clock 2026-11-04 12:30 Manila | POST confirm | `confirmed`; status COD confirmed; **`confirmedAt` = the action's `now`** (the bound value, not the database clock); stock still reserved; voucher use kept; no email sent; no other column changes but `updatedAt` |
| C3 | C2 done | POST confirm again, and twice concurrently | `already`; one status change; **`confirmedAt` keeps its first value**; nothing else written |
| C4 | A Pending confirmation order, clock after `expiresAt`, not yet released | GET / POST | Cancelled view; `expired`; the row unchanged |
| C5 | A cancelled (released) order | GET / POST | Cancelled view; `expired` |
| C6 | A link with one `sig` character changed; a `view` link with `p=cod-confirm`; a `cod-confirm` link for another order; malformed `exp` | GET / POST | The same 404 / `not-found`, one order read each |
| C7 | A `cod-confirm` link on an **online** order | GET / POST | 404 / `not-found`; nothing written |
| C8 | A `cod-confirm` link on the status route, the Pay now action, the fake payment page and the order page's body | Request | 404 on each (spec 035 K3 still holds: the purpose opens only the confirm page) |
| C9 | COD confirmed order past `expiresAt` | The sweep and the cron | Not released, not cancelled; stock and voucher use unchanged |
| C10 | **The race.** An order at its deadline: `confirm` (clock a moment before `expiresAt`) and `sweepExpiredOrders` (clock at `expiresAt`) started together, 20 times | Run together | Every run ends in exactly one of: COD confirmed with `confirmedAt` set, stock kept and no `ORDER_CANCELLED` outbox row, or Cancelled with `confirmedAt` null, stock returned once, voucher use returned once and one `ORDER_CANCELLED` row; never both, never a half state, no deadlock |

### The release (integration)

| # | Given | Action | Expected |
|---|---|---|---|
| R1 | P1's order, clock at `expiresAt` | `sweepExpiredOrders` | Cancelled, `cancelReason` EXPIRED; `ORDER_RELEASED` movement restores stock row for row; **no gateway call** (spy) |
| R2 | P12's order | Sweep | Voucher `usedCount` 1 → 0 |
| R3 | R1 | A second sweep | Nothing changes (one release per order) |
| R4 | R1 | The outbox | One `ORDER_CANCELLED` row; the sent email says "wasn't confirmed in time" |
| R5 | A due cash order and a due online order together | Sweep | Both released; the online order's session is closed, the cash order has none |
| R6 | A purchase of a product a due cash order holds | `addToCart` / `placeOrder` | The order is released inside the purchase and the shopper gets the stock |
| R7 | The cron endpoint with a due cash order | `runReleaseCron` | Released within its budget |
| R8 | A Pending confirmation order not yet due | Sweep | Untouched |
| R9 | The due query with 1,000 mixed rows | `EXPLAIN` | Uses the partial index on `expiresAt` for both statuses |
| R10 | The skipped-email case: the outbox row is `SKIPPED` (recipient cap) | Sweep at the deadline | Released normally; the `ORDER_CANCELLED` email is also capped and skipped without error |

### Database, seed and email (integration)

| # | Given | Expected |
|---|---|---|
| D1 | The migration on a database with the existing settings row | The row has the five demo values; nothing else changed |
| D2 | `db:seed` on empty; again; after Admin edits `codMaxTotal` and `codZones`; `--reset` | Settings created once with the demo values; no change on re-run; edits survive; reset recreates them |
| D3 | Insert `codMaxTotal` 0 / −1 / null; `codConfirmHours` 0 | Refused; refused; allowed; refused |
| D4 | An online order set to Pending confirmation or COD confirmed; a COD order set to Pending payment or Paid | Each refused by a CHECK |
| D5 | A COD order with `paidAt` set while Pending confirmation, COD confirmed, Processing, Shipped; and while Delivered | Refused for the first four; allowed at Delivered |
| D6 | A Pending confirmation order with `cancelledAt` set; a Cancelled COD order without it | Refused; refused (extends the existing checks) |
| D7 | A `Payment` row inserted for a COD order through `startPayment` | `not-pending`; no row (the guard is the order's status) |
| D8 | The registry sends `COD_CONFIRM` | The fake transport records one email with the confirm link, a `view` link and the demo subject; the outbox row is `SENT` |
| D9 | The migration applied twice in the Docker Postgres and `pnpm db:drift` | No drift |
| D10 | `confirmedAt` set on an online order; on a COD order in Pending confirmation; missing on a COD order in COD confirmed, Processing, Shipped, Ready for pickup, Delivered, Picked up; set on a COD order that is Cancelled (confirmed, then cancelled by Admin); null on a COD order that is Cancelled | Refused; refused; refused for each; allowed; allowed |

### Order page, email, UI

| # | Given | Expected |
|---|---|---|
| O1 | P1's order opened with its token link | Timeline Pending confirmation (current) → COD confirmed → …, no time on any step; no Pay now, no banner, no confirm button; Payment row "Cash on delivery"; the save-the-link prompt as usual |
| O1a | The same order, default `EMAIL_FROM` | The page says "Check your email (from orders@mail.pcsilicon.tech) to confirm this order. If it doesn't arrive, the order cancels itself at Thu 5 Nov 2026, 10:00 AM and you can place a new one." |
| O1b | The same with `EMAIL_FROM` set to `Shop <shop@example.com>` | "(from shop@example.com)"; the display name is not shown |
| O1c | The same order opened by a `view` link | The same text (the sender address and deadline don't depend on the credential) |
| O2 | The same after C2 | COD confirmed current with "Confirmed Wed 4 Nov 2026, 12:30 PM"; the check-your-email text is gone; "You confirmed this order. Pay ₱23,110.00 in cash when it arrives." |
| O3 | A pickup cash order | "Pay on pickup"; "...when you collect it."; the store address and hours as now |
| O4 | The same order past `expiresAt` (row still Pending confirmation) | Reads Cancelled with the not-confirmed text; a COD confirmed order past `expiresAt` reads COD confirmed |
| O5 | The review, cash offered and chosen (component) | Both radios; Payment row; the hold and confirm note; no banner; Place order enabled |
| O6 | The review, each of the five reasons (component) | Radio disabled, the reason text tied to it by `aria-describedby`; Pay online selected |
| O7 | The review, Place order and the choice in flight (component) | Radios disabled; live region says "Placing your order…" / "Checking your order…" |
| O8 | The confirm page in each view (component) | Confirm view has the button and no contact data; confirmed and cancelled have no button; hostile item names escaped |
| O9 | The email as plain text for P1 (snapshot of the text only) | Subject, lead, confirm-by line, the pay-on-arrival line, items, totals, both links |

### E2E (Playwright, fake gateway and transport)

| # | Flow | Expected |
|---|---|---|
| X1 | Ryzen × 2, delivery QC, choose Cash on delivery, Place order | Lands on the order page (no payment page); Pending confirmation; the fake outbox holds one email for the order's own recipient with a Confirm order link |
| X2 | Open the email's confirm link; click Confirm order | The confirmed view; the order page now shows COD confirmed with its "Confirmed {time}"; reloading the confirm link says already confirmed |
| X3 | An unconfirmed cash order whose deadline is moved to the past (`e2e/orders.ts`), then any page load | The order reads Cancelled with "wasn't confirmed in time"; the stock of the part is back to what it was before; the confirm link now shows the cancelled view |
| X4 | Build B, delivery QC | Cash option disabled with the over-limit reason; Pay online works |
| X5 | Pickup, LANCOOL × 1, choose Pay on pickup, place | Order page reads "Pay on pickup"; the email says "at the store" |
| X6 | Choose cash, go back to step 1, return | Cash is still chosen |
| X7 | After X1, the order page | Shows the check-your-email text with the sender address and the deadline |

### Acceptance criteria → examples

| Issue criterion | Where covered |
|---|---|
| `StoreSettings` gains `codEnabled`, `codMaxTotal`, `codZones`, `codPickupEnabled`, `codConfirmHours`; seeded with demo values, never overwritten | Behavior 1–2; D1–D3 |
| Review offers Online or Cash on delivery (Pay on pickup); offered only when enabled, total after discount including shipping ≤ limit, zone in `codZones` / `codPickupEnabled`; says why when not | Behavior 3–8; U1–U9; V1–V11; O5, O6; X4 |
| The payment choice is in `checkoutInputSchema` and the digest, and checked again at placement | Behavior 10–11; U15, U16; P5–P10 |
| COD placement reserves stock, sets `PENDING_CONFIRMATION`, `expiresAt` = now + `codConfirmHours`, enqueues `COD_CONFIRM` in the same transaction; no Xendit, no `Payment` | Behavior 12–14; P1–P4, P11–P14; D4, D7 |
| The `cod-confirm` link (expires at `expiresAt`) opens a page with Confirm order; only the POST moves the order; twice is a no-op; after the deadline shows the cancelled view | Behavior 15, 17–18; U14, U19; C1–C8; O8; X2, X3 |
| A skipped confirmation email leaves the order to expire and release normally | Behavior 16; R10 |
| The release takes `PENDING_CONFIRMATION` past `expiresAt`: no gateway step, Cancelled (EXPIRED), stock back, voucher use back, "not confirmed in time" email; the partial index covers both | Behavior 20–23; U13, U18; R1–R9 |
| COD_CONFIRMED orders never auto-expire | Behavior 22; U13; C9 |
| Order page: COD timeline, no Pay now, payment line "Cash on delivery" / "Pay on pickup" | Behavior 24–26; U10–U12; O1–O4; X5 |
| *Review additions:* only `COD_CONFIRM` is sent, with a subject that names the action | Behavior 12, 15; P1; U21; D11 |
| *Review additions:* the pending order page says to check the email (from the sender address) and when the order cancels itself | Behavior 25; U20; O1a–O1c; X7 |
| *Review additions:* nullable `Order.confirmedAt`, set by the confirm action under the order lock, shown as "Confirmed {time}" in the timeline | Behavior 18, 24; U10; C2, C3, C10; D10; O2; X2 |
| Confirm racing the release: exactly one wins (DB test) | Behavior 19; C10 |
| Tasks: pure `codEligibility` with boundary tests (limit equal / one centavo over, zones, pickup) | U1–U9 |
| Tasks: migration (status, settings, index, CHECKs: a COD order has no `paidAt` before delivery) | §6 Schema; D1–D6, D9 |
| Tasks: E2E (COD order → email in the fake outbox → confirm → COD confirmed; an unconfirmed order expires and its stock returns) | X1–X3 |
| Tasks: spec; PRD FR-20, payment-methods table, `StoreSettings` row | This spec; §6 Docs |
| *Carried from spec 037:* the ₱20.00 floor applies to a voucher on a COD order | Behavior 8; V13 |

## 4. Rules and edge cases

**Eligibility and money**

- Cash eligibility is a pure function of the review's method, destination zone and total, and the five settings. It is evaluated by the review and again by the placement on the same data, so what the shopper was offered and what is placed cannot differ (the digest and the `changed` answer cover the rest).
- The limit compares `total` (subtotal − discount + shipping), the amount the courier collects. The subtotal-based free-shipping rule and the voucher floor are unchanged; a voucher still never changes the fee (spec 037 D2), so for a given cart the total with a code is never higher.
- `codMaxTotal` is a plain integer in centavos like every price; null means no limit; the sentinel is never 0 (CHECK).
- Zones are the four `ShippingZone` values the shipping rates already use. Pickup has no zone and is judged only by `codPickupEnabled` (and `codEnabled`, and the limit).
- Cash is one choice per order. There is no partial COD or deposit (Phase 2 in the PRD).
- Both options are available to an order whose settings change between the review and the placement only if still true at placement; otherwise `changed`.

**Confirmation window and clocks**

- `expiresAt` is `now + codConfirmHours` where `now` is the placement's one clock (spec 037 D10). The confirm action reads one `now` and gives it to its checks and to the conditional update as a bound value; the database's `now()` is not used in the check.
- The deadline boundary is the release's: at `expiresAt` an order is due, so confirming requires `now < expiresAt`. The link's `exp` is `expiresAt` rounded **down** to whole seconds, so a link can stop working up to 999 ms before the order is due; in that last moment the page shows the cancelled view although the row is still Pending confirmation, and the release takes it within the same second. Accepted: rounding up would let a link outlive its order.
- The row, not the link, is the authority. A valid signature proves the shopper holds the emailed link; the status and `expiresAt` decide what the page offers and what the action does.

**Concurrency**

- Confirm is one conditional `UPDATE … SET status = 'COD_CONFIRMED', "confirmedAt" = now WHERE status = 'PENDING_CONFIRMATION' AND "expiresAt" > now RETURNING`. The statement takes the row lock, so the status and `confirmedAt` change together or not at all. A concurrent release holds the same row lock; whichever gets the lock first decides, and the other re-checks the status under the lock (the release already does, `FOR UPDATE OF o SKIP LOCKED`; a skipped order is picked up by the next run only if it is still due).
- Two confirmations at once: one updates, the other finds no row and re-reads the order: `already`.
- Placement of cash and online orders for the last unit race on the product row exactly as today.
- Lock order is unchanged: products by id, then vouchers, with the order row locked by the release first, as in spec 033/037.

**Links and security**

- A GET never writes: not the confirm page, not the order page. Scanners and prefetchers that open `p=cod-confirm` links change nothing. The POST is a Next server action, so it carries the framework's same-origin check; it takes the order number and the link's three values, nothing else, and verifies the signature on every call. Rate limiting for anonymous writes is [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).
- A `cod-confirm` signature opens the confirm page and its action only. It does not open the order page, the status route, Pay now or the fake payment page (spec 035 K3 stays true for all of those), and a `view` signature does not confirm. The confirm page shows no contact details; it never shows the order's access token or any link.
- An unknown order, a bad signature and a non-cash order are one 404, at the same cost (a read, and the HMAC computed whether or not the order exists), like every order credential.
- Logs carry the event `order.cod_confirm`, an outcome (`confirmed`, `already`, `expired`, `not-found`), and the order number; never the link, signature, token, email address or details. Failures go through `logSafeFailure`.

**Statuses and data integrity**

- A cash order is `PENDING_CONFIRMATION` → `COD_CONFIRMED` → the fulfilment statuses (Admin, later) or `CANCELLED` (release now, Admin later). It is never `PENDING_PAYMENT` or `PAID`. An online order is never `PENDING_CONFIRMATION` or `COD_CONFIRMED`. CHECKs enforce both, and that a cash order has no `paidAt` until delivery or pickup.
- `Order.confirmedAt` is set exactly once, by the confirm action, and never changed after (a repeat confirmation is a no-op). It is null for online orders and for cash orders not confirmed; once a cash order has reached COD confirmed or any later fulfilment status it is set (Admin cannot skip the confirmation). A confirmed order that Admin later cancels keeps it.
- `Order.paymentMethod` stays the gateway's channel and is null for cash. Admin marking a cash order delivered sets `paidAt` (Sprint 8/9); this story does not.
- A cash order's `ORDER_RESERVED` movements are undone by the release row for row, as for online.
- No `Payment` row ever exists for a cash order. If a webhook or the reconcile somehow met a session that names one, the existing outcome logic treats the order as already past payment (second payment, refund required): no change is needed, and a test pins it only in `payments/outcome`'s table.

**Email**

- `COD_CONFIRM` is written in the placement's transaction and sent after the commit, like the online emails. The send path, cap, retries, too-old rule and logs are unchanged. The outbox stores no link.
- Because the email is built when sent, a late send for an order already confirmed or cancelled shows its status instead of a button, and a `cod-confirm` link in an email stays valid until `expiresAt` even if the shopper opens the email days later (it then shows the cancelled view).

**Settings**

- COD settings are read fresh with the shipping config on every review and placement. Changing them changes what is offered from then on; an existing cash order keeps the `expiresAt` it was placed with.
- `codConfirmHours` is separate from `orderExpiryHours` (online). Both default to 24.

## 5. Messages and copy

| Where | Text |
|---|---|
| Section heading | Payment |
| Online option / hint | Pay online · GCash, Maya or card. You'll pay on the next page. |
| Cash option (delivery) / hint | Cash on delivery · Pay {total} in cash when your order arrives. |
| Cash option (pickup) / hint | Pay on pickup · Pay {total} at the store when you collect your order. |
| Not offered: disabled | Cash on delivery isn't available right now. |
| Not offered: pickup off | Pay on pickup isn't available right now. |
| Not offered: zone | Cash on delivery isn't available in {region}. |
| Not offered: over limit | Cash on delivery is for orders up to {₱50,000.00}. Your total is {₱X}. |
| Not offered: no total | Cash on delivery isn't available until we can deliver to this address. |
| Falls back after a saved choice | {the reason above} We've switched you to online payment. |

For a pickup order the "Cash on delivery" in the disabled, no-total and over-limit texts reads "Pay on pickup" (the option's own name); the pickup-off text always says "Pay on pickup".
| Choice request failed | We couldn't update your payment choice. Try again. |
| Summary row | Payment · Cash on delivery / Pay on pickup |
| Note under Place order (cash) | Your parts are held for {24 hours} after you place your order. Confirm your order from the email we send you, or it is cancelled. |
| Live region | Checking your order… (reuses spec 029's) |
| Order page: pending, before the deadline | Check your email (from {orders@mail.pcsilicon.tech}) to confirm this order. If it doesn't arrive, the order cancels itself at {Thu 5 Nov 2026, 10:00 AM} and you can place a new one. |
| Timeline, confirmed step | Confirmed {Wed 4 Nov 2026, 12:30 PM} |
| Order page: confirmed (delivery / pickup) | You confirmed this order. Pay {₱X} in cash when it arrives. / …when you collect it. |
| Order page: cancelled | This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts. |
| Order page: payment row | Payment · Cash on delivery / Pay on pickup |
| Timeline labels | Pending confirmation, COD confirmed (then the existing Processing, Shipped, Delivered, Ready for pickup, Picked up) |
| Confirm page: heading / lead | Confirm your order · Order {number}. Confirm it to keep your parts reserved until {time}. |
| Confirm page: pay line (delivery / pickup) | You'll pay {₱X} in cash when your order arrives. / …at the store when you collect it. |
| Button / busy | Confirm order / Confirming… |
| Confirmed (just now / already) | Order confirmed. Thank you. / This order is already confirmed. |
| Cancelled view | This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts. · Visit PC Silicon |
| Confirm failed | We couldn't confirm your order. Try again. |
| Email subject (delivery / pickup) | [Demo] Confirm your cash-on-delivery order {number} / [Demo] Confirm your pay-on-pickup order {number} |
| Email lead / details | Please confirm your cash-on-delivery order {number} to keep your parts reserved. (…pay-on-pickup order…) · Confirm by {time}. Orders not confirmed by then are cancelled. · You'll pay {₱X} in cash when your order arrives. (…at the store when you collect it.) |
| Email button / link | Confirm order · View your order |
| Email status lines | Status: COD confirmed / Status: Cancelled |
| Cancelled email lead (cash) | Your order {number} was cancelled because it wasn't confirmed in time. You haven't been charged. |

The test-mode sentence, the footer and the link note are the existing `EMAIL_COPY` ones. Order page and email headings are reused. Place order → `changed` keeps "Your order changed. Review it again."

## 6. Data and interfaces

**Schema** (migrations; the new enum value must be committed before anything uses it, so the enum value is its own migration and the rest follows)

- `OrderStatus` gains `PENDING_CONFIRMATION`.
- `enum PaymentOption { ONLINE COD }`; `Order.paymentOption` (default `ONLINE`, so existing orders read online). The PRD's `Order` row already names "payment option (online / COD)".
- `StoreSettings`: `codEnabled` Boolean (default true), `codMaxTotal` Int? (default 5,000,000), `codZones` `ShippingZone[]` (default Metro Manila, Luzon), `codPickupEnabled` Boolean (default true), `codConfirmHours` Int (default 24). CHECKs (migration-only): `codMaxTotal` null or > 0; `codConfirmHours` ≥ 1.
- `Order.confirmedAt` (nullable timestamp). CHECKs: set only on a COD order; null while Pending confirmation; set for COD confirmed, Processing, Shipped, Ready for pickup, Delivered and Picked up.
- `Order` index: the partial index on `expiresAt` is replaced by one covering `PENDING_PAYMENT` and `PENDING_CONFIRMATION`.
- `Order` CHECKs: `PENDING_PAYMENT` and `PAID` only with option `ONLINE`; `PENDING_CONFIRMATION` and `COD_CONFIRMED` only with `COD`; a `COD` order has `paidAt` null unless its status is `DELIVERED`, `PICKED_UP` or `REFUNDED`; the existing "pending order never paid" and "pending order not cancelled" checks cover both pending statuses.
- The seed's store block gains the five values (used only when the row is missing). `--reset` and `resetCatalog()` need no new table.

**Pure** (no database, env, `next` or `react`):

- `codEligibility(input, settings)` → `{ offered: true }` or `{ offered: false, reason: "disabled" | "pickup-off" | "zone" | "no-total" | "over-limit" (+ overBy) }`; input is the method, the zone (delivery), the total (or null); settings are the five COD fields.
- The order timeline takes the payment option and `confirmedAt`, and the COD confirmed step carries its "Confirmed {time}" text; the status labels gain `PENDING_CONFIRMATION` and own `COD_CONFIRMED`; a display-status function turns a Pending (either kind) order at or after `expiresAt` into Cancelled for the page.
- `isDue` covers `PENDING_CONFIRMATION`; `COD_CONFIRMED` is never due.
- `confirmView(link verdict, order, now)` → `confirm | confirmed | cancelled | not-found`.
- Email: `emailView` and `EMAIL_VIEW_TYPES` gain `COD_CONFIRM`; `EmailContext` gains `confirmUrl` (the `cod-confirm` link for the order's `expiresAt`, minted when the email is built); `cancelledLead` takes the payment option.

**Review and placement**

- `checkoutInputSchema`: optional `payment` (`online` | `cod`, default `online`) on both shapes; the saved draft gains `payment` (default `online`); `draftPayload` includes it.
- `getShippingConfig` returns the COD settings with the rest. `buildReview` takes the requested payment and returns `payment: { requested, chosen, cod: <eligibility> }`; `chosen` is `cod` only when requested and offered. `computeReview`'s `holdHours` is `codConfirmHours` when cash is chosen. `reviewDigest` adds `chosen`.
- `placeOrder`: refuses `changed` when cash was requested and not chosen; the order insert takes status, `paymentOption` and `expiresAt` from the chosen option; it enqueues `COD_CONFIRM` (cash) or `ORDER_PLACED` (online); `PlaceResult` ok gains the chosen option so `placeOrderAction` skips `startPayment` for cash and returns the plain link.
- `PlaceStep` is unchanged.

**Release**: `checkExpiredOrders` and `releaseExpiredOrders` select both pending statuses; a cash order has no payments to close, so it passes step 1 with no call; `afterRelease`, purchases and sweeps are unchanged. The cancelled email picks its reason text from the order's option.

**Confirm**

- `confirmCodOrder(orderNumber, link, now)` (in `lib/orders/`, like `placeOrder` the one writer): shape check with no read, one order read, HMAC computed whether or not the order exists, then the conditional update; answers `{ ok: true, outcome: "confirmed" | "already" }` or `{ ok: false, reason: "expired" | "not-found" }`.
- A server action `confirmCodOrderAction` (next to the order page's existing actions) only parses and forwards.
- The order page route handles `p=cod-confirm` by rendering the confirm page (a pure function of `confirmView`), per request, `noindex`, `no-referrer`, no canonical, not in the sitemap; the existing `Cache-Control: no-store` for `/orders/*` applies. The sweep after the response runs here too.
- `getOrderForPage`, the status route, Pay now and the fake page keep accepting `view` and the token only.
- `OrderPageData` gains `paymentOption` and `confirmedAt`; the order page's payment area for cash is the check-your-email line, the confirmed line or the cancelled line, never the payment panel. The sender address in the first comes from a pure helper that takes the address part of `EMAIL_FROM` (`lib/email`), passed to the page by the route, so `lib/orders` stays free of the environment.
- `logCodEvent` writes the one JSON log line.

**Docs to update with the story**

- `docs/prd.md`: FR-20 (spell out COD: Pending confirmation → COD confirmed → Processing → …, Paid only at delivery or pickup), the payments table's COD row (confirmation by a button on the emailed link; unconfirmed orders cancel after the configured hours), the `StoreSettings` row (the five columns with units and nulls), the `Order` row (status values, `confirmedAt`), FR-21 (a COD order gets the confirmation email in place of the order-placed one).
- [spec 035](../035-email-foundation-signed-links/spec.md): D9 and Behavior 9 (`cod-confirm` now opens the confirm page; still nothing else) and its COD tests. [spec 030](../030-place-an-order/spec.md): the timeline note ("Paid / COD confirmed is one step until Sprint 7"). [spec 036](../036-order-emails/spec.md): §5/§8 (the cancelled-email reason; `COD_CONFIRM` registered). [spec 033](../033-release-unpaid-orders/spec.md) and [spec 028](../028-shipping-data-and-fee-rules/spec.md): pointers (COD orders; COD settings arrived).
- Existing tests that assert the old behavior and must change: `lib/orders/signed-link.test.ts`, `lib/orders/credentials.db.test.ts`, `lib/payments/credential-payment.db.test.ts` (the 404s stay for every other consumer), `e2e/signed-link.spec.ts` (X2's COD link now shows the confirm page; X4's unregistered `COD_CONFIRM` row now renders), `lib/email/view.test.ts` (`COD_CONFIRM` is #95's), `lib/orders/release-cron.db.test.ts` (it uses `COD_CONFIRM` as its template-less row), `lib/orders/timeline.test.ts`.
- `CLAUDE.md`: a short paragraph for cash orders (statuses, the confirm POST, the release, the settings); the spec 030 digest and placement bullet (payment option in the digest); the spec 033 release bullet (both statuses); the spec 035 link bullet (`cod-confirm` opens only the confirm page); the email bullet (`COD_CONFIRM` registered). README: the demo COD values and how to try the flow with the fake outbox (`/dev/emails`).
- **No new ADR**: the link and its purpose are [ADR 0011](../../adr/0011-signed-order-links-beside-the-access-token.md), the transaction is [ADR 0009](../../adr/0009-place-orders-in-one-transaction-held-by-an-access-token.md), and the POST-only confirmation is a rule of this spec. ADR 0011 already says `cod-confirm` links expire at `expiresAt`.

## 7. Test plan

| Level | What |
|---|---|
| Unit (pure) | U1–U21 (`codEligibility` with every boundary, timeline, displayed status, due rule, confirm-page decision table, schema, digest, email view and text, cancelled lead, link `exp` rounding, the sender address, the email subject); copy strings; component states O5–O8 (review section, confirm page); order page rows O1–O4 including O1a–O1c as markup |
| Integration (`*.db.test.ts`, Docker Postgres) | V1–V15 through `reviewCheckout`; P1–P15 through `placeOrder` (the race P13 with `Promise.all`, a gateway spy for P2); C1–C10 through the confirm function and action (C10 repeated 20 times, with a fixed clock for the confirm side); R1–R10 through the release, the sweep, a purchase and the cron; D1–D10 (migration defaults, seed, CHECKs including `confirmedAt`, no-`Payment`, send, drift); `guardTransactions` still passes; a console spy shows no link, signature, token or address in any log |
| E2E (Playwright, fake gateway and transport) | X1–X7; each order gets its own recipient (the cap, spec 036), COD stock is set and restored through `e2e/stock.ts` on a part no other spec uses, the deadline is moved with `e2e/orders.ts`, and the confirm link is read from the fake outbox (the E2E helper that reads emails by recipient) |
| Manual (once) | Preview: place a cash order, open `/dev/emails`, confirm, and check the page at 1024 px and wider |

Definition of done also needs: acceptance criteria checked on the Preview URL, lint and type check green, desktop widths (1024 px and up) with empty, loading and error states, and the docs in §6 updated.

## 8. Out of scope

- The Admin screen to edit COD settings (AD-9): Sprint 9. Until then they come from the seed and the migration defaults.
- Admin marking a cash order Processing, Shipped, Delivered or Picked up, setting `paidAt` at delivery, cancelling a confirmed cash order and its stock and voucher give-back, refunds: Sprint 8/9.
- An email when the order is confirmed, or a reminder before the deadline: not in FR-21's list.
- Re-sending the confirmation email: [#101](https://github.com/romulojr-dev/pc-ecommerce/issues/101) (Backlog). Confirming from the order page: no. The confirmation link in the email is the proof of the address. Until #101 a shopper whose email never arrives waits for the deadline and places a new order; the order page says so (Behavior 25).
- Cancelling a cash order from the confirm page or the order page by the shopper.
- Partial COD or a deposit (PRD Phase 2); COD for builds or categories with different limits; per-customer limits; a COD fee.
- Rate limiting of the confirm action: [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).
- Anything in the ₱20.00 floor beyond what spec 037 already does for vouchers (V13 only pins it for cash).
- Accounts (an order tied to a user): Epic #65.

## 9. Decisions

| # | Decision | Reason | Rejected |
|---|---|---|---|
| D1 | The payment option is its own column (`Order.paymentOption`: online / COD), not a value of `paymentMethod` | `paymentMethod` is the gateway's channel (GCASH, …) and is null until paid; the PRD's `Order` row already lists "payment option (online / COD)"; CHECKs can then tie status to option | Reusing `paymentMethod = 'COD'` (null while pending, so the status could not be checked against it) |
| D2 | The confirmation window is its own setting (`codConfirmHours`), not `orderExpiryHours` | The issue and the PRD list it separately; a cash order may need a shorter or longer hold | One shared expiry |
| D3 | A requested cash choice that is no longer offered falls back to online with the reason, and placement for it is `changed` | The same shape as a refused voucher (spec 037 D4): the shopper is told, the server never places a different order than asked | Blocking Place order until the shopper re-chooses; silently placing online |
| D4 | Choosing the option is a review request (new digest, key and token) | The digest covers the choice and the hold time; one server path, as for vouchers (spec 037 D5) | Computing the digest in the browser for both options |
| D5 | The confirm page is a mode of `/orders/{number}` (`p=cod-confirm`), the link spec 035 already defines; the order page itself still takes `view` and the token only | The link shape and purpose are fixed by spec 035 and ADR 0011; keeping the page separate keeps `cod-confirm` from becoming a second view credential | A new path such as `/confirm/{number}` (a second link shape to sign and verify); letting `cod-confirm` open the full order page |
| D6 | Confirmation is a POST (server action) on that page, never a GET | Link scanners and prefetchers open every link in an email; the issue requires it | Confirming on page load; a GET API route |
| D7 | The order page has no confirm button, even for a `view` link | The email's `cod-confirm` link is the proof the shopper has the address; a token link in the browser is not | A button on the order page for the shopper who just placed it |
| D8 | The confirm page shows items, totals and where it goes, but no contact details | The shopper should see what they confirm; the contact block adds nothing and is more personal data on a bearer link | A bare "Confirm" page; the full order page |
| D9 | The release reuses the existing query, lock and give-back; cash orders pass the gateway step because they have no payments | Smallest change; the same code path means the same guarantees (SKIP LOCKED, once-only, vouchers) | A separate cash-order sweep |
| D10 | `exp` of the `cod-confirm` link is `expiresAt` rounded down to seconds; the row is the authority | ADR 0011: "expire at `expiresAt`"; a link must never outlive its order | Rounding up |
| D11 | **Settled by the review:** a cash order gets `COD_CONFIRM` and no `ORDER_PLACED`, and the subject and first line name the action | The Order placed email says "Pay now" and "unpaid orders are cancelled", which is wrong for cash; one email with the summary and the button is clearer | Both emails |
| D12 | **Added by the review:** `Order.confirmedAt`, set once by the confirm action in its conditional update, shown in the timeline | The timeline can say when the shopper confirmed, and Admin and audit need the time; setting it in the same statement as the status keeps the two consistent | No column (my first draft) || D13 | Demo defaults are the migration's column defaults, repeated in the seed's store block | The settings row already exists in every database, and the seed never overwrites it, so only a column default can fill it | A data migration that updates the row; a seed that overwrites |
| D14 | `codEligibility` evaluates `disabled` first, then `pickup-off`, `zone`, `no-total`, `over-limit` | The most general cause is reported first (like spec 037 D9) | Reporting every reason |
| D15 | No new ADR (confirmed by the review, `confirmedAt` included) | The decisions fit ADR 0009 (placement) and ADR 0011 (links) | An ADR for the POST rule |
| D16 | **Added by the review:** the pending order page names the sender address and the deadline, taking the address from `EMAIL_FROM` | Tells a shopper whose email is missing what to look for and what happens next, true in every environment | A hard-coded address; a resend before #101 |

### Conflicts with earlier specs (flagged, not quietly picked)

- **Spec 035 Behavior 9 and D9** say a `cod-confirm` link opens nothing and the page and its POST are #95's. This spec gives it the confirm page and its action and nothing else (D5). Spec 035's tests and the E2E X2/X4 change as listed in §6.
- **Spec 030's** "Paid / COD confirmed is one step until Sprint 7" ends here: COD confirmed is its own step (Behavior 24).
- **Spec 036** said "not confirmed in time" arrives with #95 and left `COD_CONFIRM` unregistered: both change here.
- **PRD FR-20** reads "Paid / COD confirmed" as one step; the payments table says COD confirmed becomes Paid at delivery. The issue's timeline shows COD confirmed as its own step and Paid only at delivery, so the PRD text is updated (§6), the PRD winning on scope and this spec on behavior.
- **PRD FR-21** says COD orders "also get a confirmation link". Settled by the review: the confirmation email replaces the order-placed one for cash orders (D11); the PRD is updated to say so.
- **Spec 037 Behavior 13** requires COD to apply the ₱20.00 voucher floor. It already holds, because the floor depends on the total and not on the payment option; V13 pins it.

## 10. Open questions

None open. The review of 2026-11-04 settled all four questions of the first draft:

1. **Q1 (the Order placed email):** a cash order gets only `COD_CONFIRM`; its subject and first line name the action, e.g. "[Demo] Confirm your cash-on-delivery order PCS-…" (D11).
2. **Q2 (demo values):** kept: ₱50,000.00, Metro Manila and Luzon, pay on pickup on, 24 hours (Behavior 2).
3. **Q3 (a missing confirmation email):** no resend in this story. The pending order page tells the shopper to check their email, from which address, and when the order cancels itself (Behavior 25, O1a–O1c, D16). The resend is a Backlog issue, [#101](https://github.com/romulojr-dev/pc-ecommerce/issues/101).
4. **Q4 (the link's last second):** accepted: the `cod-confirm` link's `exp` is rounded down (D10).

### Changes made by the review

- **Email:** only `COD_CONFIRM` for cash orders; subject "[Demo] Confirm your cash-on-delivery order {number}" (pickup: "pay-on-pickup"); the lead starts "Please confirm your …" (Behavior 12, 15; §5; U21; D11).
- **Order page:** the pending text is now "Check your email (from {sender}) to confirm this order. If it doesn't arrive, the order cancels itself at {time} and you can place a new one."; the sender is the address part of `EMAIL_FROM` (Behavior 25; U20; O1a–O1c; X7; D16). The "Confirm by" line is gone.
- **Resend:** out of scope, [#101](https://github.com/romulojr-dev/pc-ecommerce/issues/101) created in Backlog (§8).
- **`Order.confirmedAt`:** new nullable column, set once by the confirm action's conditional update under the order's row lock, shown in the timeline as "Confirmed {Manila time}" (Behavior 18, 24; §4; §6; U10, C2, C3, C10, D10, O2, X2; D12 reversed from "no column").
- **No new ADR** (D15).
