# 044 — Cancel an order from Admin

Status: approved 2026-11-06 with the changes listed at the end of §10 (a separate `ORDER_CANCELLED_BY_STORE` email type exempt from the cap, a required note for "Other", every open session closed, a stricter "nothing was received"). Issue: [#109](https://github.com/romulojr-dev/pc-ecommerce/issues/109) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8; part 2 of 2, the other transitions are #108). PRD: AD-6 (cancel / refund), FR-20 (status timeline), FR-21 (order cancelled email), FR-24 (release reserved stock). Depends on [spec 043](../043-order-fulfillment-transitions/spec.md) (#108, merged: the Fulfillment section, the conditional-update guard, `completedAt` and the other new timestamps), [spec 033](../033-release-unpaid-orders/spec.md) (the release this story shares code with), [spec 037](../037-vouchers-at-checkout/spec.md) (`giveBackVoucherUses`), [spec 038](../038-cash-on-delivery/spec.md) (cash orders), [spec 032](../032-payment-webhooks/spec.md) (`reconcileSession`, payment problems), [spec 040](../040-admin-permissions-audit-masking/spec.md) (`adminAction`, `recordAudit`, `can()`). Feeds #110 (refunds) and #111 (flagged payments).

## 1. Summary

Owner and Staff can cancel an order that has not shipped. The cancel is one conditional update on the status the screen showed, written in the same transaction as its audit entry, its stock return (the same code the release uses), the voucher use going back, the open payments expiring and the "Order cancelled" email (its own type, `ORDER_CANCELLED_BY_STORE`, so the release's cancels stay capped). Every open payment session on the order is first closed at the gateway, outside any transaction; a session that turns out to be paid makes the order Paid and refuses the cancel. Cancelling an order that was paid flags it "Refund required" for #110, and the email and order page say a refund will follow instead of "You haven't been charged". A cancelled order's timeline shows how far it got.

## 2. Behavior

### Who can cancel what

1. **The cancel table** (pure) lists the statuses staff may cancel from: `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `PAID`, `COD_CONFIRMED`, `PROCESSING`, `READY_FOR_PICKUP`. Not from `SHIPPED`, `DELIVERED`, `PICKED_UP`, `CANCELLED` or `REFUNDED`. It does not depend on fulfillment or payment option beyond the status itself (a status that cannot exist for a combination never reaches it). It lives beside spec 043's `transitionsFor` and is not part of it: cancel is its own action, so the "next step" table keeps one move at most and never lists `CANCELLED`.
2. **An order with an unreviewed payment problem cannot be cancelled here.** A payment with `problem` `AMOUNT_MISMATCH`, `LATE` or `SECOND_PAYMENT` makes the order "Needs checking" (spec 041); its way out is #111. Until #111 exists, every payment with a `problem` counts as unreviewed (D3).
3. **Roles.** `orders.cancel` is already in spec 040's table (Owner and Staff yes, Demo no). Demo sees the Cancel button disabled with "This account is read-only" and sends nothing. The action is built with `adminAction`, so a Demo or foreign-origin request is refused before the database is read and is not audited.
4. **A reason is required.** Staff pick one of three: **Out of stock**, **Customer asked to cancel**, **Other**. They are stored as `OrderCancelReason` values `OUT_OF_STOCK`, `CUSTOMER_REQUEST`, `OTHER` next to the existing `EXPIRED`, which only the release writes: a request carrying `EXPIRED` or no reason is invalid. **"Other" needs a note** (3–200 characters, trimmed, no control characters, no line breaks). The note is stored in the audit entry only: Demo sees it as "Hidden in demo", and it never appears in a customer email or on the order page. A note sent with another reason is invalid.

### On the admin order page (`/admin/orders/[number]`)

5. The Fulfillment section (spec 043) gains a **Cancel order** button, secondary and destructive in style, beside the next-step button, for every status in B1 and for a role that may cancel. For a status not in B1 there is no Cancel button and the existing one-line reasons still hold (Shipped: "Shipped. Mark it as delivered when the courier reports delivery." and so on). An order with an unreviewed payment problem shows no Cancel button but a line: "This order has a payment that needs review. It can't be cancelled until that is resolved."
6. **Cancel order** opens a dialog: "Cancel order PCS-…?" with the three reasons as a required radio group (none preselected; choosing Other shows a required **Note** field, "Internal note, not shown to the customer."), then what will happen, as a list that depends on the order:
   - always: "The order becomes Cancelled. This can't be undone." and "Reserved stock goes back on sale."
   - when the order has a voucher: "The use of voucher {code} goes back."
   - always: "The customer is emailed."
   - unpaid (no payment received): "The customer has not been charged."
   - paid (`paidAt` set): "₱{total} was paid. The order will be marked Refund required. Return the money by hand, then record the refund." (recording is #110)
   - the order has an open payment session, at any status: "The open payment session is closed first."
   Buttons: **Back** (closes) and **Cancel order** (confirm). Nothing is sent until Confirm; Confirm with no reason chosen shows "Choose a reason." under the group, and Other with an empty or invalid note shows "Add a note (3 to 200 characters)." under the field; neither sends anything.
7. While the request runs, the confirm button is busy ("Cancelling…"), both buttons are disabled and the dialog cannot be closed by Escape or a double click into a second request.
8. **On success** the dialog closes, the page shows Cancelled, the reason and the time, an `aria-live` line says "Order cancelled. The customer will get an email shortly." and, for a paid order, adds "Refund required: record it once the money is returned." Focus moves to the Fulfillment heading. The Fulfillment section then shows "Cancelled." as for any cancelled order.
9. **If the order changed meanwhile** (its status is no longer the one the screen showed: shipped, cancelled by someone else, released, paid, confirmed), nothing is written and the dialog shows spec 043's "This order was changed by someone else. Reload to see its current status." with **Reload**.
10. **If the session turns out to be paid** (B15): "This order was just paid, so it wasn't cancelled. Reload to see it." with **Reload**. After the reload the order is Paid and can be cancelled as a paid order.
11. **If the payment provider can't be reached** (closing a session fails or times out): "Couldn't reach the payment provider, so the order wasn't cancelled. Try again." Nothing changed in the order. (A session the provider did close stays closed; the customer can still Retry payment.)
12. **Other failures** show "Couldn't cancel the order. Try again." and change nothing. A request the table refuses shows "That change isn't allowed for this order." An order number that no longer exists says "This order wasn't found." A problem payment found at the time says the B5 line.
13. The detail's events list gains a "Cancelled" entry with the time, the reason label and "Refund required" when set. The orders list already shows the true status and the Refund required badge (spec 041); nothing else changes there.

### What the system does on a cancel

14. **Read, no transaction.** The action reads the order (status, payment option, `paidAt`, `refundRequired`, payments). It stops with stale (status differs from the screen's), not-allowed (B1) or needs-review (B2) **before any gateway call**.
15. **Gateway step, no transaction, for every status.** For each of the order's `PENDING` payments that has a session, whatever the order's status (Pending payment normally; a Paid or later order can still hold a stray open session), `closeSession`: `cancelled` clears it; `not-active` goes to `reconcileSession`, and `expired` or `already-applied` clear it. **Any other outcome refuses the cancel**: `paid` (the order became Paid, or the session is a second payment on an already Paid order), `mismatch`, or a flagged late or second payment. The refusal for a session that was paid is B10; one that leaves a payment `problem` is B12's needs-review. A failure to close, or to read what happened, refuses the cancel as in B11. The first refusal ends the step, and sessions closed so far stay closed. Unlike the release's sweep there is no skipping an order: staff are waiting, so they see the answer. An order with no open session (every cash order, and most Paid ones) skips this step.
16. **The transaction (database work only).** Through `adminTransaction`: lock the order row and make one `UPDATE … WHERE id = … AND status = {expected}` that sets `CANCELLED`, `cancelledAt` (the call's one `now`) and the reason, plus `refundRequired = true` when `paidAt` is set. No row changed means stale and nothing else runs (no audit row, no stock, no voucher, no outbox row). Then, in the same transaction and only after that update changed a row:
    1. re-check that no payment has a `problem` (a payment could have been flagged since B14); one that has rolls the transaction back as needs-review;
    2. the order's `PENDING` payments become `EXPIRED` and its `OPENING` attempts `FAILED` (as the release does);
    3. `undoReservations` returns the stock (B17);
    4. `giveBackVoucherUses` gives the voucher use back, whatever the voucher's dates are now (spec 037 Behavior 18);
    5. `recordAudit` (`order` / `cancelled`; before `{ status }`, after `{ status, cancelReason, refundRequired, note }`; `note` only for Other);
    6. `enqueueEmail(tx, order.id, "ORDER_CANCELLED_BY_STORE")` (the release keeps `ORDER_CANCELLED`).
    After the commit: `scheduleEmailSend` for the queued row and, **when stock was returned** (the order had a reservation), one `revalidateTag(PRODUCTS_TAG, "max")`, which never fails the cancel. An order with nothing to return revalidates nothing.

    16a. **If the conditional update loses after a session was closed** (the order moved between B15 and the update, for example the release or a confirm got there first), the closed session stays closed; the gateway call cannot be undone. Nothing else is written. An order that is still Pending payment (the cancel failed on a database error, or lost to something that did not end it) keeps its Retry payment path: the order page offers it, and starting a payment opens a new session as after any lapsed session. The cancel can simply be tried again.
17. **`undoReservations` is extracted from `releaseExpiredOrders`** into a shared function that both the release and the cancel call. Given the transaction and order ids it reads each order's `ORDER_RESERVED` movements, adds the stock back with **one `UPDATE` per product in product-id order** (retired products included), and writes the matching `ORDER_RELEASED` movements row for row. It reports which orders had a reservation. The release's behavior and tests do not change; the cancel passes the acting staff member so its `ORDER_RELEASED` rows carry `actorId` (the release passes none).
18. **Cancelling a paid order** (`paidAt` set: online Paid, Processing or Ready for pickup after payment) sets `refundRequired`. It does not touch `Payment.status` (the payment stays Paid) and records no refund; #110 does that. A cash order is never paid before delivery, so a cash cancel (Pending confirmation, COD confirmed, Processing, Ready for pickup) never sets it.
19. **One email, once.** `ORDER_CANCELLED_BY_STORE` is unique per order (an order has `ORDER_CANCELLED` only when the release cancelled it), and an order leaves its cancellable status once, so an order cancelled by Admin cannot be released afterwards (the release only takes Pending orders and re-checks under its lock) and the reverse is stale. Stock and voucher uses return exactly once.

### On the customer's side

20. **The email** ("[Demo] Order PCS-… was cancelled" for both types) is built from the order as it is when sent. Staff cancels use the new type `ORDER_CANCELLED_BY_STORE` with its own template; the release keeps `ORDER_CANCELLED` and its template. Both leads are "Your order PCS-… was cancelled" plus the reason phrase when there is one, then one of two closing sentences: when **nothing was received**, "You haven't been charged."; otherwise "We'll refund your payment." Never both. **Nothing was received** means `paidAt` is null **and** no `Payment` of the order is in a paid state (status Paid, which includes payments with `problem` `LATE` or `SECOND_PAYMENT`). **The cap:** only `ORDER_CANCELLED_BY_STORE` is exempt from the skip (it still counts toward the cap). `ORDER_CANCELLED` stays capped: the release cancels unpaid orders anyone can place with any email address, and exempting it would reopen the email-bombing hole the cap closes (#64, rate limiting, does not exist yet). Staff-reason phrases never appear in a release email, and the note appears in no email. The stored `EXPIRED` keeps its two existing sentences by payment option.
21. **The order page** for a cancelled order shows the reason ("This order was cancelled because …" for the staff reasons; spec 033 / 038's existing sentence for `EXPIRED`) and the same two closing sentences by the same rule, **for every cancelled order, expired ones included**. Where something was received, "We'll refund your payment." replaces the late-payment line ("Payment received after this order was cancelled. We'll refund it.") for an order that was paid before it was cancelled (`paidAt` set); that line stays for an order cancelled *before* a payment arrived (`refundRequired`, no `paidAt`, a Paid payment with `LATE`). #110 changes this copy once a refund is recorded.
22. **The timeline** of a cancelled order shows how far it got. The prior status isn't stored, so it is read from what is: no step of the order's own sequence is "current" (the Cancelled branch is); steps up to the furthest reached are done, later ones upcoming. Furthest reached, in this order: `readyAt` set → Ready for pickup; else `processingAt` → Processing; else `confirmedAt` (cash) → COD confirmed; else `paidAt` (online) → Paid; else the first step (Pending payment or Pending confirmation). Times of reached fulfillment steps show as in spec 043 B20; the Cancelled item shows "Cancelled {time}" from `cancelledAt`. An order released before this story (reason `EXPIRED`) still shows only its first step, as today.

### Empty, loading and error states

23. **Loading:** the detail page has no `loading.tsx` (spec 041); the dialog's pending state is B7. **Error:** B9–B12. **Empty:** an order with no cancel (Shipped and later, or a problem payment) shows B5's lines.

## 3. Examples

Fixtures are throwaway orders from `e2e/admin-order-fixtures.ts` and `test-support/orders.ts`, each with its own recipient (spec 036's cap note). Parts are seed parts: `CPU-AMD-7600X` (Ryzen 5 7600X) and `GPU-NVIDIA-4060`; vouchers are the seed's `SAVE500` (fixed ₱500) and `WELCOME10`. Ana Reyes (`ana.reyes@example.com`) is the customer unless stated. "Gateway" means the fake gateway.

| # | Input | Result |
| --- | --- | --- |
| E1 | The cancel table over **every status × fulfillment × payment option** (11 × 2 × 2 = 44 combinations), including the combinations the database forbids | allowed for exactly Pending payment, Pending confirmation, Paid, COD confirmed, Processing, Ready for pickup; refused for Shipped, Delivered, Picked up, Cancelled, Refunded; a type-level check fails when a new status is added without a decision |
| E2 | Online delivery order Pending payment, 2 × `CPU-AMD-7600X` (stock 8 after the reservation), one open session; Staff cancels, reason Out of stock | session closed at the gateway before the transaction; order Cancelled, `cancelledAt` = the call's `now`, reason `OUT_OF_STOCK`, `refundRequired` false; payment Expired; stock 10; one `ORDER_RELEASED` movement of +2 with the staff member as `actorId`; `ORDER_CANCELLED_BY_STORE` queued; products tag revalidated; audit row with before `Pending payment` and after Cancelled / `OUT_OF_STOCK` |
| E3 | E2's order, session already ended (`closeSession` answers `not-active`, the gateway says expired) | reconcile settles the payment as Expired; the cancel then goes through as in E2 |
| E4 | E2's order, but the session is already paid when `closeSession` answers `not-active` | `reconcileSession` makes the order Paid (and enqueues "Payment received"); the cancel is refused as paid-meanwhile; no cancel audit row, no stock change, no cancel email; after a reload a cancel is allowed as a paid order (E6) |
| E5 | Pending payment order; the session is paid by webhook **between** the gateway step and the transaction | the conditional update finds status Paid, not Pending: stale; nothing written; the order is Paid |
| E6 | Online order Paid (`paidAt` set), 1 × `GPU-NVIDIA-4060` reserved, voucher `SAVE500` (used count 3); Owner cancels, reason Customer asked to cancel | Cancelled, `refundRequired` true; the payment stays Paid; stock returned; `SAVE500` used count 2; no gateway call; email says "We'll refund your payment." and not "You haven't been charged." |
| E7 | Same, order is Processing (after #108's move) | same as E6; the timeline of the cancelled order shows Pending payment, Paid and Processing done and the Cancelled item |
| E8 | Cash pickup order Ready for pickup (`readyAt` set, no `paidAt`), voucher `WELCOME10`; Staff cancels, reason Other with note "Customer called, wrong address" | Cancelled, `refundRequired` false, no `Payment` rows touched; stock and voucher returned; email: "Your order … was cancelled. You haven't been charged." (no reason phrase for Other, and the note appears nowhere in it); the audit entry holds the note; timeline shows COD confirmed, Processing, Ready for pickup done |
| E9 | Cash delivery order Pending confirmation, 1 part; Staff cancels | no gateway step; Cancelled; stock back; email queued |
| E10 | Cancel from each of Shipped, Delivered, Picked up, Cancelled, Refunded, as a hand-made request with that status as `expectedStatus` | not-allowed; no row changes; no audit entry |
| E11 | Paid order whose payment has `problem` `SECOND_PAYMENT`; Owner opens the page and tries a hand-made cancel | the page shows the B5 line and no button; the action answers needs-review before any gateway call; nothing written |
| E12 | A payment is flagged `AMOUNT_MISMATCH` after the action's read but before its transaction | the transaction's re-check rolls everything back (status, stock, voucher, email, audit); answer needs-review |
| E13 | Cancel with no reason, with `EXPIRED`, with an unknown value, with Other and no note, with a 2-character or 201-character note, with a note and the reason Out of stock | invalid at the schema; nothing read beyond the session; the form shows "Choose a reason." or "Add a note (3 to 200 characters)." |
| E14 | Race: Staff cancels a Pending confirmation order while the customer confirms it (spec 038), forced both ways | exactly one wins; the loser is stale (cancel) or a no-op ("no longer confirmable"); stock returns once if the cancel wins; no stock change if the confirm wins |
| E15 | Race: Staff cancel against a webhook that pays the same order, forced both ways | cancel first: webhook finds Cancelled → `LATE` payment, `refundRequired`, order stays Cancelled, no second stock return; webhook first: cancel is stale |
| E16 | Race: Staff cancel against the release for an order past `expiresAt`, forced both ways | exactly one cancels; stock returns once; one `ORDER_CANCELLED` row; the loser skips or is stale; voucher use returns once |
| E17 | Race: Staff cancel against a Start processing move (spec 043) on a Paid order | exactly one wins (both are conditional on `PAID`); a cancel after Processing wins on a fresh screen is a separate, valid cancel |
| E18 | Double submit, or two tabs, of the same cancel | the second is stale; one audit row, one email row, stock back once |
| E19 | The release run on an order already cancelled by Admin, and the cancel on an order already released | no change either way |
| E20 | Order with a retired product (`status` not Active), cancelled | the stock still goes back to that product |
| E21 | `undoReservations` on three orders sharing two products | one `UPDATE` per product in id order; movements row for row; the release's existing tests pass unchanged |
| E22 | `giveBackVoucherUses` on a voucher whose `endsAt` is yesterday | the use still goes back |
| E23 | Email content for `ORDER_CANCELLED_BY_STORE`: unpaid / Out of stock; unpaid / Customer asked; unpaid / Other (note absent); paid / Customer asked; and for `ORDER_CANCELLED`: `EXPIRED` online and cash; an expired order that later received a late payment (`paidAt` null, a Paid payment with `LATE`) | exactly the sentences in §5; never both closing sentences; "[Demo] " prefix and test-mode sentence kept |
| E24 | Order page (token link and signed link) for a cancelled unpaid order, a cancelled paid order, an expired order, an expired order that received a late payment | reason line and the right closing sentence for each; no "Pay" controls; "We'll refund your payment." and the late-payment line only for the last; "You haven't been charged." on the expired unpaid order too |
| E25 | `orderTimeline` for cancelled orders: online unpaid, online with `paidAt`, online with `processingAt`, cash with `confirmedAt`, pickup with `readyAt`, delivery with `processingAt`, legacy `EXPIRED` | steps done up to the furthest reached, none current, Cancelled branch with its time |
| E26 | Migration: `OrderCancelReason` gains the three values; a Cancelled row with neither `cancelledAt` nor a reason, and a Pending row with `cancelledAt` | the existing CHECKs still refuse both |
| E27 | Demo calls the cancel action; Demo opens a cancelled order's detail and its RSC payload | refused with "This account is read-only", no table changed; no raw customer value appears (`expectNoRawValues`) |
| E28 | The cancel action under `guardTransactions` | no gateway call runs inside a transaction |
| E29 | Gateway down: `closeSession` fails on a Pending payment order | refused as in B11; order, stock, voucher unchanged; no audit row |
| E31 | Six unpaid online orders for one address, all released by the release | the sixth `ORDER_CANCELLED` is SKIPPED by the cap (`ORDER_CANCELLED` stays capped) |
| E32 | The same address already has five other emails sent in 24 hours; Staff cancels an order for it | `ORDER_CANCELLED_BY_STORE` is sent despite the cap, and counts toward it (the next release email to that address is skipped) |
| E33 | Pending payment order with an open session; the session is closed, then the conditional update loses (the release or a confirm got there first) | the session stays closed; nothing else written; if the order is still Pending payment its order page offers Retry payment and starting one opens a new session |
| E34 | Paid order that still holds a stray `PENDING` payment with a session; Staff cancels | the session is closed first; the cancel then goes through; if that session reports paid, `reconcileSession` flags it `SECOND_PAYMENT` and the cancel is refused as needs-review |
| E35 | Cancel that returns no stock (an order with no reservation row) | the cancel succeeds, `PRODUCTS_TAG` is not revalidated; with a reservation it is, once |
| E30 | Staff on the detail page: Cancel is offered on Paid, Processing, Ready for pickup, Pending payment, Pending confirmation, COD confirmed; absent on Shipped; the dialog lists the right effects for a voucher order and a paid order | as B5–B6 |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| `undoReservations` extracted; release and cancel both use it (`ORDER_RELEASED`, one `UPDATE` per product in id order, retired products included) | B17; E2, E20, E21; R1, R2, R21 |
| Voucher use goes back via `giveBackVoucherUses`, same transaction, whatever the dates | B16(4); E6, E8, E22; R3 |
| Cancel requires a reason (and a note for Other); `OrderCancelReason` gains staff reasons; migration CHECKs hold | B4, B6; E13, E26; R4, R5 |
| Cancellable from the six statuses, not from the five | B1; E1, E10; R6 |
| Pending payment closes its session before the transaction; `not-active` → `reconcileSession`; a paid session makes the order Paid and refuses the cancel | B14, B15, B16a; E2–E5, E29, E33, E34; R7, R8 |
| Conditional on the expected status; sets `cancelledAt` and `cancelReason`, expires open payments, returns stock, gives back the voucher, enqueues `ORDER_CANCELLED`; `PRODUCTS_TAG` revalidated after commit | B16; E2, E5, E18, E35; R9, R10 |
| Cancelling a paid order sets `refundRequired` | B18; E6, E7, E8; R11 |
| An order with an unreviewed payment `problem` can't be cancelled here | B2, B5, B14; E11, E12; R12, D3 |
| Email and page copy right for paid and unpaid; "You haven't been charged" only when nothing was received; a paid cancel says a refund will follow | B20, B21; E23, E24, E31, E32; R13, R20 |
| Timeline shows how far it got | B22; E7, E8, E25; R14 |
| Races: cancel against COD confirm, webhook and release; exactly one wins, stock returns once | B19; E14–E17, E19; R9, R15 |
| `adminAction`, audit in the same transaction, `can()` action in the table, demo-rejection enumeration test | B3, B16(5); E27; R16 |
| No network call inside a transaction | B14–B16; E28; R7 |
| (DoD) Empty, loading, error states; desktop 1024 px and up | B7–B12, B23; R17 |

## 4. Rules and edge cases

- R21. **The extraction is a refactor.** Moving the reservation undo out of `releaseExpiredOrders` changes no behavior: every existing release test (`release.db.test.ts`, `release-cod.db.test.ts`, `release-purchases.db.test.ts`, `release-voucher.db.test.ts` and the cron tests) passes with **no change to any expectation**. The extraction lands in its own commit, before the cancel is added.
- R1. **One shared stock function.** `undoReservations(tx, orderIds, { actorId? })` is the only code that undoes `ORDER_RESERVED` movements. The release and the cancel call it and nothing else does. The movements it writes are exactly the reversal of what was reserved, row for row, so cancelling an order whose reservation is missing (older data) returns nothing and says so in the result rather than inventing stock.
- R2. **Lock order** is unchanged: orders, then products by id, then vouchers (`giveBackVoucherUses` after the stock updates).
- R3. **The voucher use** goes back once per cancelled order that holds a voucher, with no check of the voucher's dates or limit; the `usedCount >= 0` CHECK remains the backstop.
- R4. **Reasons.** The staff reasons are `OUT_OF_STOCK`, `CUSTOMER_REQUEST`, `OTHER`. The cancel input takes only those; `EXPIRED` is written only by the release. The customer-facing phrase is a pure map from reason (and payment option for `EXPIRED`) to text; an unknown or null reason produces no phrase and never throws.
- R5. **Migration.** `ALTER TYPE "OrderCancelReason" ADD VALUE` for the three values. The existing CHECKs (a cancelled order has `cancelledAt` and a reason; a pending order has no `cancelledAt`) are unchanged and tested. `db:drift` stays clean. No new column or table.
- R6. **One pure cancel table**, written for every `OrderStatus` value so a new status is a type error until someone decides. The page (whether to show the button), the action and the tests all use it.
- R7. **No network call inside a transaction.** The gateway step (B15) runs before the transaction opens and every call has the gateway adapter's own 6 s timeout; the transaction holds database reads and writes only. A session closed at the gateway and then followed by a stale or failed transaction stays closed (B16a); a still-pending order can start a new payment. `reconcileSession` runs outside the transaction like the rest of the gateway step.
- R8. **A session that turns out paid never cancels.** Only `reconcileSession` sets Paid (spec 031); the cancel never sets it. A `mismatch` outcome leaves the payment flagged and the order Pending, and the cancel is refused.
- R9. **The conditional update is the lock.** Every status change away from a cancellable status is an `UPDATE … WHERE status = …`: the cancel (this story), spec 043's moves, the webhook's Paid, the customer's COD confirm and the release. Zero rows changed means nothing else runs. The race tests (E14–E17) force both interleavings in `*.db.test.ts` with two connections, as `confirm-cod.db.test.ts` does.
- R10. **Revalidation** runs once after the commit, only when stock was returned, and a failure is logged through `logSafeFailure`; it never fails or reverses the cancel.
- R11. **`refundRequired`** is set by the cancel's own `UPDATE` (same statement as the status) when the order row has `paidAt`. It is never cleared here (#110 clears it). A cancel of an unpaid order leaves it as it is (false).
- R12. **Problem payments** are checked three times: the page hides the button, the action stops before the gateway, the transaction re-checks under the order lock. The predicate is "has a payment with a `problem`" now and becomes "has an unreviewed problem" when #111 adds review (D3).
- R13. **"Nothing was received"** is one pure function: `paidAt` is null and no `Payment` of the order has the Paid status (late and second payments are Paid payments with a `problem`). The email and the order page both use it, so they cannot disagree. `refundRequired` is not part of it.
- R14. **The timeline** reads only stored fields (`paidAt`, `confirmedAt`, `processingAt`, `readyAt`, `cancelledAt`, `cancelReason`) and stays pure. An inconsistent combination (`readyAt` on a delivery order) falls back to the furthest step that exists in that order's own sequence.
- R15. **Exactly-once effects.** Stock return, voucher return, email row and audit row are all written inside the transaction that wins the conditional update, so they cannot happen twice or without the cancel.
- R16. **Guard and audit.** `adminAction("orders.cancel", schema, handler)` in the admin `actions.ts` under `app/admin`, so spec 040's enumeration tests find it by reading the directive, and the `.db` version calls it as Demo and checks no table changed. No new `can()` action. The audit entry stores the reason and the flags, never customer fields. A refused or stale cancel writes no audit row.
- R17. **Desktop-first**, usable from 1024 px: dialog with focus trapped and returned to the opening button, fields labelled, the radio group with `aria-describedby` for its message, the result an `aria-live` region (not `role="status"`).
- R18. **Stock really goes back even if the parts were already packed.** A Processing or Ready for pickup order has had its parts picked, but stock was reserved at placement and not moved since, so cancelling returns it; staff who find damaged or missing goods adjust inventory (#116). A refund does not restock (#110).
- R20. **Email types and the cap.** `ORDER_CANCELLED_BY_STORE` is added to `CAP_EXEMPT_TYPES` and nothing else changes in the cap rules; `ORDER_CANCELLED` is not exempt. A unit test of the list names both. Spec 035's "changed by" note is extended.
- R19. **Reading is not logged.** The customer pages read the cancel reason and timestamps without audit.

## 5. Messages and copy

Admin (`lib/admin/fulfillment-copy.ts`):
- Button: "Cancel order". Dialog title: "Cancel order {number}?". Reason group label: "Reason". Options: "Out of stock", "Customer asked to cancel", "Other". Empty: "Choose a reason."
- Effects: "The order becomes Cancelled. This can't be undone." · "Reserved stock goes back on sale." · "The use of voucher {code} goes back." · "The customer is emailed." · "The customer has not been charged." · "₱{total} was paid. The order will be marked Refund required. Return the money by hand, then record the refund." · "The open payment session is closed first."
- Note field (shown for Other): label "Note", hint "Internal note, not shown to the customer.", error "Add a note (3 to 200 characters)."
- Buttons: "Back", "Cancel order", busy "Cancelling…".
- Success: "Order cancelled. The customer will get an email shortly." · paid adds "Refund required: record it once the money is returned."
- Errors: "This order was changed by someone else. Reload to see its current status." · "This order was just paid, so it wasn't cancelled. Reload to see it." · "Couldn't reach the payment provider, so the order wasn't cancelled. Try again." · "This order has a payment that needs review. It can't be cancelled until that is resolved." · "That change isn't allowed for this order." · "This order wasn't found." · "Couldn't cancel the order. Try again." · Demo: "This account is read-only".
- Events list: "Cancelled" with the reason label ("Out of stock", "Customer asked to cancel", "Other", "Not paid in time", "Not confirmed in time").

Customer-facing phrase by reason (email lead and order page):
- `OUT_OF_STOCK`: "one of the parts is out of stock"
- `CUSTOMER_REQUEST`: "you asked us to cancel it"
- `OTHER`: none
- `EXPIRED`: "it wasn't paid in time" (online) / "it wasn't confirmed in time" (cash), unchanged

Email (`lib/email/copy.ts`): lead = "Your order {number} was cancelled" + (" because {phrase}" when there is one) + "."; then, when nothing was received, "You haven't been charged."; when it was, "We'll refund your payment." Subject unchanged ("[Demo] Order {number} was cancelled"), for both `ORDER_CANCELLED_BY_STORE` and `ORDER_CANCELLED`. The note is in no email.

Order page (`lib/orders/copy.ts`, `lib/payments/copy.ts`): "This order was cancelled because {phrase}." (staff reasons; none for Other: "This order was cancelled."), the two closing sentences above, and the unchanged spec 033 / 038 sentences for `EXPIRED`. The late-payment line stays only for an order cancelled before a payment arrived (`refundRequired`, no `paidAt`).

Timeline: Cancelled item gains "Cancelled {time}".

## 6. Data and interfaces

**Schema (one migration):** `OrderCancelReason` gains `OUT_OF_STOCK`, `CUSTOMER_REQUEST`, `OTHER`; `EmailType` gains `ORDER_CANCELLED_BY_STORE`. Nothing else (the note lives in the audit entry).

**Permissions:** no new action (`orders.cancel` exists: Owner, Staff yes, Demo no).

**Pure:** the cancel table and its status-complete type check (`canCancel(status)`, beside `lib/orders/transitions.ts`); `cancelInputSchema` (`orderNumber`, `expectedStatus`, `reason` of the three staff values, `note` required for Other and refused otherwise); `CAP_EXEMPT_TYPES` gains `ORDER_CANCELLED_BY_STORE`; the reason → phrase map and the "payment received" function; `orderTimeline` takes optional `cancelledAt` and uses the stored timestamps to choose the furthest reached step; `cancelledLead` takes the received flag.

**Server:**
- `lib/orders/undo-reservations.ts`: `undoReservations(tx, orderIds, { actorId? })` → the ids that had a reservation. `releaseExpiredOrders` calls it.
- `lib/admin/orders/cancel.ts`: `cancelOrder(actor, input, { now, gateway })` does B14–B16 and returns `{ kind: "done", refundRequired, emailId }`, or `stale`, `not-allowed`, `not-found`, `needs-review`, `paid-meanwhile`, `gateway-failed`. Name settled in the plan. The gateway step reuses `closeSession` and `reconcileSession` (the release's `checkSession` is shared, not copied) and treats every outcome except cleared as a refusal.
- `app/admin/(shell)/orders/[number]/actions.ts`: `cancelOrderAction`, built with `adminAction("orders.cancel", cancelInputSchema, …)`; after the commit it calls `scheduleEmailSend` and revalidates `PRODUCTS_TAG`.
- `getOrderDetail` / `OrderDetail` gain `cancel: { allowed, hasVoucher, voucherCode, paid, hasOpenSession }`, `cancelReason`, `cancelledAt`; selecting named fields only. The order-page DTO gains `cancelledAt`, `confirmedAt` and the fulfillment timestamps it already has for the timeline, plus `paidAt`.
- Email: `emailView("ORDER_CANCELLED_BY_STORE")` and its template (registered in `lib/email/templates.ts`, `EMAIL_VIEW_TYPES`, `EMAIL_TYPE_LABELS`, the dev emails page); both cancelled views use the nothing-received function (needs `paidAt` and the payments' statuses).

**UI:** a cancel dialog beside spec 043's transition dialog in `components/admin/` (client); the page stays server and imports no database.

**Reused:** `adminAction`, `adminTransaction`, `recordAudit`, `enqueueEmail`, `scheduleEmailSend`, `closeSession`, `reconcileSession`, `giveBackVoucherUses`, `PRODUCTS_TAG`, `logSafeFailure`, `guardTransactions`, `expectNoRawValues`, `Masked`.

## 7. Test plan

- **Unit (pure):** the cancel table over all 44 status × fulfillment × payment option combinations, refusals included, and its completeness check (E1); `CAP_EXEMPT_TYPES` names `ORDER_CANCELLED_BY_STORE` and not `ORDER_CANCELLED`; the nothing-received function (E23, E24); input schema (E13); reason phrases and the closing-sentence rule (E23); `orderTimeline` for cancelled orders (E25); admin copy completeness.
- **Integration (`*.db.test.ts`, Docker Postgres):** `undoReservations` alone and through the release, whose existing tests stay green (E21); the cancel for every cancellable status with audit, stock, voucher, payments, email row and `refundRequired` (E2, E6–E9, E20, E22); stale, not-allowed, needs-review including the in-transaction re-check (E10–E12, E18); the gateway step with the fake gateway: cancelled, not-active/expired, not-active/paid, mismatch, failure (E2–E5, E29); the three races each forced both ways with two connections, asserting stock returns once and one email row (E14–E17, E19); `guardTransactions` over the action (E28); Demo refusal and the enumeration test (E27); the migration CHECKs (E26); email content through `sendPending` and the `FakeEmail` table (E23); the cap: six released unpaid orders still capped, a staff cancel over the cap sent (E31, E32); a closed session followed by a lost update (E33).
- **E2E (`admin` project, `e2e/admin-cancel.spec.ts`, its own fixtures and recipients):** Staff cancels a Paid order with a voucher from the dialog (reasons required, effects listed, success line, Refund required badge in the list); Staff cancels a Pending payment order; a second tab shows the stale message and Reload; Shipped has no Cancel button; Demo sees it disabled; the customer's order page (token link) shows the right closing sentence and timeline; `/dev/emails` shows the cancelled email with "We'll refund your payment." for the paid one. Stock changes use the E2E stock helper's production guard.
- Lint, typecheck and `db:drift` pass. Preview check: the acceptance list at 1024 px and 1280 px.

## 8. Out of scope

- Recording a refund, clearing "Refund required", the "We'll refund it" copy changing once recorded, `REFUNDED`: #110.
- Reviewing flagged payments and the mismatch flow (cancel plus refund in one guided flow): #111.
- Partial cancel, cancelling Shipped (or later) orders, editing items (the issue).
- Calling a gateway refund API; restocking on refund; inventory adjustment for damaged goods (#116).
- Showing the note to anyone but Owner and Staff in the audit, resending the cancelled email, a shopper-facing cancel button (shopper accounts are Phase 2).
- Bulk cancel; cancelling from the orders list.

## 9. Decisions

- **D1 — Cancel is its own action and table, not a target of `transitionsFor`.** Spec 043 says the table has no cancelled target and "#109's cancel must use the same guard". Same guard (conditional update on the expected status), separate function. Rejected: adding `CANCELLED` to the 043 table (breaks its "never more than one move" and its test that staff can never reach Cancelled with it).
- **D2 — The gateway step is strict for staff, unlike the release's skip.** A failure refuses the cancel with a message rather than skipping the order. Rejected: cancel anyway and leave the session to expire (the customer could pay an order that is already cancelled, a `LATE` refund the cancel could have avoided).
- **D3 — Until #111, any payment `problem` blocks a cancel.** The issue says "unreviewed"; no review marker exists yet. **Flag, #111:** #111 requires the mismatch flow to "cancel using #109's path" after a review, so `cancelOrder` takes the "has an unreviewed problem" test from one place (R12) and #111 narrows it to `reviewedAt IS NULL` and calls the same function for a reviewed order. Rejected: letting Owner cancel a flagged order now (it would hide a payment that needs a decision; #111 owns that decision).
- **D4 — `refundRequired` is set in the cancel's own `UPDATE`, from the row's `paidAt`.** One statement, so a cancel can never leave a paid cancelled order unflagged. Rejected: a second update after (a crash between them loses the flag).
- **D5 — The payment stays Paid and no refund is recorded.** #110 states "recording a refund never changes `Payment.status`", so the cancel keeps the payment as it is. Rejected: marking the payment refunded here.
- **D6 — "Nothing was received" means `paidAt` is null and no payment is in a paid state.** That covers an order cancelled by the release and then paid late (spec 032), whose page should not say "You haven't been charged". An email sent at release time already said it and cannot be recalled. Rejected: `paidAt` alone (wrong for the late payment); `refundRequired` (set by the cancel itself, so circular).
- **D7 — The "You haven't been charged" line is separate from the reason sentence.** The old lead fused them and showed only for `EXPIRED`; the issue says it must follow "no payment received" whatever the reason. This changes spec 033 / 038 / 036's email lead for `EXPIRED` by nothing in text (same two sentences) and for an unknown reason by adding the line. Rejected: keeping per-reason full sentences (they multiply by reason × payment status).
- **D8 — Three staff reasons; Other needs a note kept in the audit entry only.** The issue says "for example". A required note stops "Other" being a blank; keeping it in the audit means staff text never reaches the customer (no email, no page) and Demo sees "Hidden in demo". Rejected: no note (Other says nothing); showing it to the customer.
- **D9 — The admin cancel writes `actorId` on its `ORDER_RELEASED` movements.** The column exists for staff stock changes; it lets stock history show who returned stock. The release stays null. Rejected: leaving it null (loses who).
- **D10 — The page shows the Cancelled branch as current and no step as current.** A cancelled order has no current step; the timeline only says how far it got. Rejected: marking the last reached step current (reads as if it were still in progress).
- **D11 — A closed session stays closed after a stale or failed cancel.** The gateway call cannot be rolled back; a still-pending order can start a new payment (B16a). Rejected: reopening a session (Xendit has no such call).
- **D12 — A separate email type for staff cancels, exempt from the cap; the release's type stays capped.** The release cancels unpaid orders anyone can place with any address, so exempting `ORDER_CANCELLED` would reopen the email-bombing hole the cap closes while rate limiting (#64) does not exist. Staff cancels only run for staff, so the new type may skip the cap (it still counts). Rejected: exempting `ORDER_CANCELLED` (the first draft's recommendation); no exemption (a paid customer's refund notice could be silently dropped).
- **D13 — Every open session is closed, at any order status.** A stray open session on a Paid order could take a second payment after the cancel; closing it first, and refusing the cancel if it was paid, keeps money and status consistent. Rejected: closing only for Pending payment (the first draft).
- **Flag, PRD:** FR-21 lists "order cancelled" generally; nothing in the PRD says paid and unpaid cancels read differently. The wording here follows the issue and FR-26's refund intent; the PRD does not need an edit.
- **Flag, spec 043 B13:** its no-button lines for Pending payment and Pending confirmation say "Cancel is the only change available." They now match a real button; the lines stay.
- **Flag, spec 033 / 035 / 036:** the cancelled email lead and the order-page sentences change as in B20–B21; spec 035's cap note gains the new exempt type; all three get a "changed by spec 044" note.
- **Flag, PRD:** the `Voucher` row's `usedCount` wording says uses come back when an order is cancelled "by expiry or by Admin"; this story edits it to say on any cancel, paid or unpaid. FR-21 gains "order cancelled by the store" as a separate email.

## 10. Open questions

None. The review settled the three from the first draft:
1. **A note on "Other"**: required for Other, stored in the audit entry only, shown to Demo as "Hidden in demo", never in a customer email (B4, D8).
2. **The cap**: `ORDER_CANCELLED` stays capped; a new `ORDER_CANCELLED_BY_STORE` type is exempt from the skip and still counts (B20, R20, D12).
3. **"You haven't been charged." on every cancelled order where nothing was received**, expired ones included, with the definition in R13 (B21).

Other review changes: every open gateway session is closed, whatever the order's status (B15, D13); revalidation only when stock was returned (B16, R10); the extraction is a pure refactor with no changed expectations (R21); the cancel table is unit-tested over 44 combinations (E1); what happens when the update loses after a session closed is written down (B16a, E33); the PRD voucher wording says "any cancel, paid or unpaid".
