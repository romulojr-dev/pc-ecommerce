# 037 — Vouchers at checkout

Status: implemented (2026-11-04; approved with changes, see "Changes made by the review" at the end of §10, and "What changed while building" there). Issue: [#94](https://github.com/romulojr-dev/pc-ecommerce/issues/94) (parent epic [#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4), Checkout, Sprint 7). PRD: FR-17 (voucher codes: fixed or % off, min spend, expiry, usage limit), AD-8 (data only; the Admin screen is Sprint 9), Data model › `Voucher`, `Order`. Builds on [spec 029](../029-checkout-steps/spec.md) (the review), [spec 030](../030-place-an-order/spec.md) / [ADR 0009](../../adr/0009-place-orders-in-one-transaction-held-by-an-access-token.md) (`placeOrder`, the digest), [spec 033](../033-release-unpaid-orders/spec.md) (the release), [spec 028](../028-shipping-data-and-fee-rules/spec.md) (the fee; **D14 stays as it is**) and [spec 036](../036-order-emails/spec.md) (the Order placed email; **§8 changes**). Sibling: [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95) (COD), which touches the same review, digest, placement and release code and goes second.

Long form: the story touches a new table, the review, the digest, placement, the release, the order page and an email.

## 1. Summary

A shopper can enter one voucher code on the review step and get the advertised discount: a fixed amount or a percentage off the merchandise subtotal, checked against a start and end date, a usage limit and a minimum spend. The server decides everything: the review applies or refuses the code with a plain reason, the digest covers the code and the discount, and `placeOrder` re-checks the voucher and counts the use with one conditional update in its own transaction, so two shoppers racing for the last use cannot both win. The order snapshots the code and the discount, the release gives the use back when it cancels an unpaid order, and the order page and the Order placed email show "Discount ({code})". The shipping fee does not depend on the voucher: the free-shipping threshold still compares the subtotal before the discount (spec 028 D14), so a voucher can never raise what a shopper pays.

## 2. Behavior

### A voucher (data)

1. A voucher is a row: `code` (upper-case, unique), `type` (`FIXED` or `PERCENT`), `value` (centavos for fixed, a whole percent 1–100 for percent), `minSpend` (centavos, 0 for none), `startsAt`, `endsAt` (null: never ends), `usageLimit` (null: unlimited) and `usedCount`. There is no Admin screen yet (Sprint 9); rows come from the seed and from tests.
2. `db:seed` inserts three **demo codes**, each only when its code is missing, and never touches an existing row (Admin's edits and `usedCount` survive a re-seed): `WELCOME10` (10 % off, min spend ₱5,000.00), `SAVE500` (₱500.00 off, min spend ₱10,000.00) and `BUILD5000` (₱5,000.00 off, min spend ₱50,000.00, 100 uses). All start 2026-01-01 Manila time and have no end date. `--reset` and `resetCatalog()` empty the table and the seed fills it again. The codes are told to reviewers in the README and the story's Preview checklist, not in the app.

### The code box on the review (step 2)

3. The order summary (right column) gets a **Voucher code** field with an **Apply** button, above the totals. It is shown whenever the review is shown, including pickup, and not on step 1 or in the cart.
4. **Apply** with text: the button is busy, and the review is requested again with that code. The code is sent as part of the checkout details (`voucherCode`); the cart still comes from the cookie. Every review issues a new digest, idempotency key and access token (spec 030 Behavior 2), so an Apply is a review like Check again.
   - **Applied:** the field is replaced by "{CODE} applied" and a **Remove** button; the summary shows a **Discount ({CODE})** row with the amount (`−₱…`), the total as recomputed, and focus moves to Remove. The code is kept in this tab's saved step-1 details (`sessionStorage`), so going back to step 1 and returning keeps it.
   - **Refused:** the field keeps what was typed, shows the reason under it (§5, one of six), focus stays in the field, nothing else on the review changes (discount 0, total as before) and nothing is saved. Place order stays as the cart allows: a refused code is not a problem with the cart.
   - **Nothing typed:** "Enter a code." under the field; no request.
   - **The request fails:** the review stays on screen as it was, and the field says "We couldn't check that code. Try again."
5. **Remove** asks for the review again without the code, clears the saved code, returns the field (empty) and moves focus to it.
6. **Arriving, Check again or a reload with a saved code:** the review applies it again. If it is no longer good (ended, used up, the cart changed below the minimum spend), the box shows the field with the old text and the reason, the code is dropped from the saved details, and the totals show no discount. The shopper is told by the reason, never by a silent change.
7. **Place order** sends the code only when the review shown applied it. While placing, Apply and Remove are disabled. One code per order: there is one field, and applying another code (after Remove) replaces the first.

### What a code does

8. **Eligibility**, in this order, stopping at the first failure: the text isn't a known code (**unknown**); `now` is before `startsAt` (**not started**); `now` is at or after `endsAt` (**ended**); `usedCount` has reached `usageLimit` (**used up**); the subtotal is below `minSpend` (**min spend**, with how much more: `minSpend − subtotal`). The subtotal here is the review's merchandise subtotal **before** the discount (spec 028's `subtotal`: the lines still sold, at `effectivePrice`). Dates are exact instants; `startsAt` itself is allowed and `endsAt` itself is not.
9. **Matching:** the text is trimmed and compared case-insensitively. Anything that isn't 3–32 letters, digits, `_` or `-` is unknown without a database read.
10. **The discount** applies to the **subtotal only**, never to shipping. Percent: `floor(subtotal × value / 100)` in whole centavos, integer arithmetic. Fixed: `min(value, subtotal)`. It is one number for the order; the lines keep their own prices.
11. **Shipping does not depend on the voucher.** The fee is worked out exactly as in spec 028: the free-shipping threshold compares the subtotal **before** the discount (D14, kept; equal to the threshold is free), the tier comes from the zone and the weight, and pickup is free. The review's threshold note is unchanged. So a voucher never turns free shipping into a fee, and **a voucher never increases the total**: with a code the total is the same fee plus a smaller or equal merchandise amount.
12. **The total** is `subtotal − discount + shippingFee`. The order's `subtotal` stays the merchandise total, so `total = subtotal + shippingFee − discount` (the existing CHECK).
13. **A code that would bring the total below the lowest amount the gateway takes is refused** as **below-minimum** (§5). The lowest amount is **₱20.00** (2,000 centavos), because the checkout offers GCash, Maya and cards on one payment page and Xendit's Cards channel has a PHP 20 minimum (GCash and Maya: PHP 1; see D15 for the sources). A ₱0.00 total is the extreme case; a payment must also be above zero in the database (`Payment.amount > 0`). This can happen on any order: pickup, or a delivery order that ships free. The rule applies only when a code is applied; an order that is below ₱20.00 without a code is not this story's concern (nothing in the catalog costs that little). Placement is `changed` for the same reason (Behavior 14). **#95 (COD) must apply the same rule** to a voucher on a COD order, even though COD has no gateway payment, so the two payment options accept the same orders.

### Placing the order

14. `placeOrder` runs the review's own checks inside its transaction, **including the voucher** (read through the transaction's client): a code that is now refused, or a code the shopper's review did not apply, makes the placement `changed` ("Your order changed. Review it again."). The reloaded review shows the reason.
15. **The digest** covers the applied code (or none) and the discount, so a placement whose money differs from what was shown is `changed`. This changes every digest once: a review open during the deploy gets "Your order changed" on its first Place order, then works (accepted by the issue).
16. **Counting the use**, after the stock is taken and before the order is inserted: one conditional update, `usedCount + 1` where the voucher is the one reviewed, `usageLimit` is null or above `usedCount`, and the **same `now`** that the voucher check used lies within `startsAt`/`endsAt`. One `now` is read for the placement and passed both to the voucher validation (through `computeReview`) and into the update as a bound value; the database's `now()` is not used anywhere in that check. The update also returns the voucher's `type`, `value` and `minSpend` as it counted against them; if they differ from what the review used (an edit between the read and the update), the placement is `changed`, as for a stock price that moved (P16). No row updated: `changed`, and the whole transaction rolls back (stock, cart, everything). The update is the authority for the limit; the earlier read is only the early exit. Two placements racing for the last use: one commits, the other waits on the row, re-reads it, gets no row and is `changed`.
17. **The order** stores `voucherId` (`Restrict`), `voucherCode` (the stored upper-case code, a snapshot) and `discount`. A replay (same key and token, same cart) returns the existing order and counts nothing again. A placement that fails after the count rolls the count back with everything else.

### The release

18. When the release cancels an unpaid order that has a voucher, it gives the use back in the same transaction: `usedCount − 1` on that voucher, **whatever its dates now** (an ended voucher still gets its use back). An order the release skips, or loses to a webhook, gives nothing back. Orders cancelled by other means (Admin, Sprint 8) must call the same give-back; nothing else cancels an order today.

### The order page and the email

19. The order page's summary shows **Discount ({code})** `−₱…` between Shipping and Total, only when the discount is above zero (as now). The Order placed email shows the same row (spec 036's Discount row, now labelled with the code). The Payment received and Cancelled emails carry no totals and don't change.

### Empty, loading and error states

| State | What shows |
| --- | --- |
| Review loading | Spec 029's skeleton; the code box is part of the summary and appears with it |
| Apply / Remove in flight | The button busy ("Checking…" / "Removing…"), the review stays visible, the polite live region says so |
| Refused code | Reason under the field (§5), no discount |
| Apply request fails | "We couldn't check that code. Try again." under the field; the review keeps its last good state |
| Review itself fails (arrival, Check again) | Spec 029's "Couldn't load your review." and Try again |
| Place order → `changed` | Spec 030's notice and an automatic reload; the box shows the reason if the code is the cause |
| Voucher table empty | Every code is "unknown"; nothing else changes |

## 3. Examples

Seed values: **Ryzen 5 7600** ₱11,495.00 (450 g), **LANCOOL 216 Black** ₱5,795.00 (9,000 g), **Build A** ₱69,060.00, **Build B** ₱74,560.00; the ₱75,000.00 free-shipping threshold; Metro Manila rates 1 kg ₱120.00, 20 kg ₱450.00; Mindanao's open-ended tier ₱1,450.00; QC and the contact are spec 030's. The three demo codes of Behavior 2. "Test code" means a row the test inserts; "test product" means one the test creates with the stated price and weight. Clock fixed at 2026-11-04 10:00 Manila.

### Pure functions (unit, `lib/vouchers` and `buildReview`)

| # | Input | Expected |
| --- | --- | --- |
| U1 | Percent 10, subtotal 199,999 (₱1,999.99) | Discount 19,999 (₱199.99), not 20,000: floor |
| U2 | Percent 10, subtotal 2,299,000 | 229,900 |
| U3 | Percent 100, subtotal 2,299,000 | 2,299,000 (the subtotal) |
| U4 | Percent 1, subtotal 99 | 0 |
| U5 | Percent 99, subtotal 99,999,999,999 (₱999,999,999.99) | 98,999,999,999: exact, no float error |
| U6 | Fixed 50,000, subtotal 579,500 / 29,000 / 50,000 | 50,000 / 29,000 (capped) / 50,000 |
| U7 | Code text `" welcome10 "`, `"WelCome10"`, `"WELCOME10"` | All match WELCOME10 |
| U8 | `"WELCOME 10"`, `"WELCOME10!"`, `"ab"`, 33 characters, full-width letters, a dotless `ı` | unknown, no lookup |
| U9 | `startsAt` = now; `startsAt` = now + 1 ms | eligible; not started |
| U10 | `endsAt` = now; `endsAt` = now + 1 ms | ended; eligible |
| U11 | `usageLimit` 5 with `usedCount` 5 / 4; `usageLimit` null with 9,999 | used up; eligible; eligible |
| U12 | `minSpend` 1,000,000 with subtotal 1,000,000 / 999,999 | eligible; min spend, short by 1 (₱0.01) |
| U13 | A voucher both ended and used up; one not started and below the minimum spend | ended; not started (the order of Behavior 8) |
| U14 | `buildReview` for a delivery order, subtotal 7,500,000, threshold 7,500,000, FIXED 10,000; and subtotal 7,499,999 with the same code | Shipping Free (threshold on the subtotal before the discount); the tier fee. The fee is the same with and without the code in both |
| U15 | **Property:** for random subtotals, weights, zones, methods and valid codes (fixed and percent) | `total with the code ≤ total without` always, and shipping equal with and without. (The case that broke the other rule: ₱75,050.00 to Mindanao, V5) |
| U16 | Total exactly 2,000 / 1,999 / 0 after a code | applied; below-minimum; below-minimum |

### The review (integration, `reviewCheckout` against the test database)

| # | Cart | Code | Expected |
| --- | --- | --- | --- |
| V1 | Ryzen × 2 (₱22,990.00), delivery QC | none | As today: shipping ₱120.00, total ₱23,110.00, no Discount row |
| V2 | The same | `welcome10` | Applied. Discount ₱2,299.00; shipping ₱120.00; total **₱20,811.00**; the digest differs from V1's |
| V3 | Build A + Ryzen single (₱80,555.00, 16,310 g), delivery QC | none | Shipping Free, total ₱80,555.00 (spec 029 R5) |
| V4 | The same | `WELCOME10` | Discount ₱8,055.50; shipping **still Free** (₱80,555.00 is at or above the threshold); total **₱72,499.50**; no threshold note |
| V5 | A test product of ₱75,050.00 weighing 21,000 g, delivery Davao (Mindanao, open-ended tier ₱1,450.00) | none | Shipping Free (₱75,050.00 ≥ ₱75,000.00), total ₱75,050.00 |
| V5a | The same | Test code FIXED ₱100.00 | Discount ₱100.00; shipping **still Free**; total **₱74,950.00**, lower than V5's. (Under "threshold after the discount" it would have been ₱74,950.00 + ₱1,450.00 = ₱76,400.00, a higher total with a code: the reason D14 stays, D2) |
| V6 | Build B (₱74,560.00, below the threshold), delivery QC | `BUILD5000` | Discount ₱5,000.00; shipping ₱450.00 (the same without the code); total **₱70,010.00** |
| V7 | Build A, pickup | `WELCOME10` | Discount ₱6,906.00, shipping "Free (pickup)", total ₱62,154.00 |
| V8 | LANCOOL × 1 (₱5,795.00), pickup | `SAVE500` | Refused: "Spend ₱4,205.00 more to use this code."; discount 0, total ₱5,795.00, `canPlace` unchanged |
| V9 | LANCOOL × 2 (₱11,590.00), pickup | `SAVE500` | Applied: discount ₱500.00, total ₱11,090.00 (the minimum compared ₱11,590.00, the subtotal before the discount) |
| V10 | Build B, pickup | `BUILD5000` | Applied, ₱5,000.00 off (min ₱50,000.00 met by ₱74,560.00) |
| V11 | LANCOOL × 1, pickup | `NOPE` | Refused: unknown |
| V12 | Any | Test codes: starts tomorrow / ended an hour ago / `usageLimit` 3 with `usedCount` 3 | not started / ended / used up |
| V13 | LANCOOL × 1 (₱5,795.00), pickup | Test code PERCENT 100 / FIXED ₱5,775.01 / FIXED ₱5,775.00 | Refused below-minimum (total ₱0.00) / refused (total ₱19.99) / **applied** (total ₱20.00, the boundary) |
| V13a | Build A + Ryzen (₱80,555.00, ships free), delivery QC | Test code FIXED ₱80,555.00 / FIXED ₱80,535.00 | Refused below-minimum (total ₱0.00: free shipping and a full discount) / applied (total ₱20.00) |
| V14 | A cart with a line gone out of stock | `WELCOME10` | The cart's problems list as before; the voucher result is independent and still shown |
| V15 | Ryzen × 2 | Code of 300 characters | `invalid` (a malformed request, not a refusal) |
| V16 | Ryzen × 2 | Code `"   "` | Treated as no code |

### Placing (integration, `placeOrder`)

| # | Cart and state | Action | Expected |
| --- | --- | --- | --- |
| P1 | V2's cart, fresh review | Place | `ok`. Order: subtotal 2,299,000, shippingFee 12,000, discount 229,900, total 2,081,100, `voucherId` = WELCOME10's, `voucherCode` "WELCOME10"; `usedCount` 0 → 1; items, stock and movements as spec 030 P1 |
| P2 | P1 | The same request again | `ok`, same link; one order; `usedCount` still 1 |
| P3 | Test code `usageLimit` 1; two carts reviewed with it | Both place at once | Exactly one `ok`; the other `changed`. `usedCount` 1; one order; the loser's stock, cart and rows untouched; its next review says "used up" |
| P4 | Test code `usageLimit` 5; 13 carts, each reviewed with it | All place at once | 5 `ok`, 8 `changed`; `usedCount` 5; never above the limit |
| P5 | Reviewed with `WELCOME10`; then the code's `endsAt` set to the past | Place | `changed`; nothing written, `usedCount` unchanged |
| P6 | Reviewed with a code; then `usedCount` raised to the limit | Place | `changed` |
| P7 | Reviewed with no code | Place with `voucherCode` added | `changed` (the digest differs) |
| P8 | Reviewed with `WELCOME10` | Place with no `voucherCode` | `changed` |
| P9 | Review refused `NOPE` | Place with `NOPE` anyway (a forged call) | `changed`, nothing written |
| P10 | P1 with a step after the count forced to fail (`afterStep`) | Place | `error`; no order, **`usedCount` unchanged**, stock unchanged |
| P11 | A pickup order of LANCOOL × 2 with `SAVE500` | Place | `ok`; order subtotal 1,159,000, discount 50,000, total 1,109,000 |
| P12 | A voucher with a minimum spend; the cart's price drops below it between review and placement | Place | `changed` |
| P13 | Two carts racing for the last use while a third order's release gives a use back | Run together, repeated 20 times | No deadlock, never above the limit, `usedCount` equals the live orders holding the code |
| P14 | LANCOOL × 1, pickup; the test code FIXED ₱5,775.01 (total ₱19.99) sent in a forged call | Place | `changed`, nothing written |
| P15 | A placement with a fixed `now`; a voucher whose `endsAt` equals that `now` | Place | `changed`: the validation and the update agree because both got the same `now` (the update's bound value is asserted, not the database clock) |
| P16 | Reviewed with `WELCOME10`; its `value` changed to 20 between the placement's read and its update (through `afterStep`) | Place | `changed`; nothing written, `usedCount` unchanged (the update returns the values it counted against, and they must equal the ones the review used) |

### The release (integration)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| R1 | P1's order, past `expiresAt` | `sweepExpiredOrders` | Order Cancelled; `usedCount` 1 → 0; `voucherId`, `voucherCode` and `discount` stay on the order |
| R2 | R1 again; and a second sweep | Sweep | `usedCount` stays 0 (one give-back per cancelled order) |
| R3 | P1's order, then the voucher's `endsAt` set to the past, then released | Sweep | Use given back (0) although the voucher has ended |
| R4 | A due order whose session turns out paid (reconcile inside the check) | Sweep | Order Paid; `usedCount` stays 1 |
| R5 | A due order with a payment `problem` | Sweep | Skipped; `usedCount` stays 1 |
| R6 | A purchase's release cancels the order, then the purchase rolls back (thrown refusal) | — | Order still Pending; `usedCount` unchanged |
| R7 | Two orders with the same code released in one run | Sweep | `usedCount` down by 2 |
| R8 | An order with no voucher | Sweep | No voucher touched |

### Database and seed (integration)

| # | Given | Expected |
| --- | --- | --- |
| D1 | Insert a code in lower case / with a space / 2 characters | Refused by the database (stored upper-case, shape CHECK) |
| D2 | Insert PERCENT 0, 101; FIXED 0, −1; `minSpend` −1; `usageLimit` 0; `usedCount` −1; `usedCount` above `usageLimit`; `endsAt` not after `startsAt` | Each refused |
| D3 | A second row with the same code in another case | Refused (unique) |
| D4 | An order with `discount` above `subtotal`; with `discount` above 0 and no voucher; with a code and no id | Each refused |
| D5 | Delete a voucher an order points at | Refused (`Restrict`) |
| D6 | `db:seed` on an empty database; again; after editing `WELCOME10`'s value and `usedCount`; after deleting `SAVE500` | Three rows; no change; the edit survives; `SAVE500` comes back, the others untouched |
| D7 | `--reset` (guarded) | The table is emptied and refilled; a production host is refused as for the other tables |

### Order page, email, UI

| # | Given | Expected |
| --- | --- | --- |
| O1 | P1's order | Order page summary: Subtotal ₱22,990.00, Shipping ₱120.00, **Discount (WELCOME10) −₱2,299.00**, Total ₱20,811.00 |
| O2 | The Order placed email for P1 | A "Discount (WELCOME10)" row of "−₱2,299.00"; no row for an order with no voucher |
| O3 | An order with a voucher whose discount is 0 (unit only) | No Discount row |
| O4 | The review with a code applied (component) | Summary rows in order; "WELCOME10 applied" and Remove; no Apply button; the threshold note exactly as before |
| O5 | The review with a refusal (component) | Field keeps the text; the reason is announced in a polite live region and tied to the field; `aria-invalid` |
| O6 | Apply with an empty field | "Enter a code." and no request |
| O7 | The below-minimum refusal (component) | The message names ₱20.00 from the same constant the rule uses |

### E2E (Playwright, fake gateway and transport)

| # | Flow | Expected |
| --- | --- | --- |
| X1 | Ryzen × 2, pickup, `WELCOME10`, Place order | Summary shows the discount before placing; the order page shows **Discount (WELCOME10)**; the Order placed email (the helper reads it by recipient) shows the row |
| X2 | Apply `NOPE`, then `WELCOME10`, then Remove | The unknown message, then the discount, then no discount and an empty field |
| X3 | Apply `WELCOME10`, go back to step 1, return | The code is still applied |
| X4 | Reload step 2 after a test code's `endsAt` was moved to the past through a helper | The reason shows and no discount |

### Acceptance criteria → examples

| Issue criterion | Where covered |
| --- | --- |
| `Voucher` model and migration CHECKs (percent 1–100, fixed > 0, 0 ≤ usedCount ≤ usageLimit) | Behavior 1; §6; D1–D3 |
| Seed inserts demo codes only when missing, never overwrites; `--reset` and `resetCatalog()` name the table | Behavior 2; D6, D7 |
| Review: code field, Apply / Remove, reasons (unknown, not started, ended, used up, "Spend ₱X more"); min spend on the subtotal before the discount | Behavior 3–8; V8, V9, V11, V12, U9–U13, O4–O6, X2 |
| Trimmed, case-insensitive; one code per order | Behavior 7, 9; U7, U8, V2, V16 |
| Discount on the subtotal only; percent floor in integer centavos; fixed capped | Behavior 10; U1–U6, V2, V7 |
| ~~Free-shipping threshold after the discount; spec 028 D14 and CLAUDE.md updated~~ **Reversed by the review:** the threshold keeps comparing the subtotal before the discount; D14 and the fee paragraph stay | Behavior 11; U14, U15, V4, V5, V5a, V6; D2 |
| Code and discount in `reviewDigest` | Behavior 15; V2, P7, P8 |
| `placeOrder` re-validates and counts with a conditional update; no row → `changed` | Behavior 14, 16; P3–P6, P9, P12, P13, P15, P16 |
| Order stores `voucherId` (`Restrict`), `voucherCode`, `discount`; CHECK `discount ≤ subtotal` | Behavior 17; P1, D4, D5 |
| The release gives the use back, even after the voucher ended | Behavior 18; R1–R8 |
| Order page and Order placed email show "Discount ({code})" | Behavior 19; O1–O3, X1 |
| Tasks: pure `lib/vouchers/` with unit tests (rounding, cap, dates, case, min-spend boundary) | U1–U13 |
| Tasks: DB tests (two placements racing for the last use; use given back on release) | P3, P4, P13, R1–R8 |
| Tasks: E2E (apply, place, see the discount on the order page) | X1–X4 |
| Tasks: spec; PRD Voucher / Order rows | This spec; §6 Docs, D1 |
| *Review additions:* a voucher never raises the total; no code takes the total below the gateway's minimum (also for COD, #95) | Behavior 11, 13; U15, U16, V5a, V13, V13a, P14, O7; D15 |

## 4. Rules and edge cases

**Matching and input**

- The code is part of the checkout details (`checkoutInputSchema`, both fulfillment shapes), optional. The schema normalizes (trim, empty means none) and never rejects a mistyped code: a typo is a refusal on the review, not a trip back to step 1. Only a payload over 200 characters is `invalid`. The field itself limits typing to 32.
- Codes stay ASCII: the shape is tested before upper-casing, so a character that changes under case folding (`ß`, `ı`, a ligature) cannot match a code. The stored form is the upper-case string; the database shape CHECK is `^[A-Z0-9_-]{3,32}$`.
- Voucher rows are read fresh on every review and placement, never cached (like the shipping config), so an ended or used-up code is refused at once.

**Money**

- All amounts are whole centavos and the discount is computed once, by the pure function, from the review's subtotal. The percent product `subtotal × value` stays far below 2^53 for any real cart (a subtotal is capped well under 15 digits, `MAX_CENTAVOS`); U5 pins it.
- The discount is `0 ≤ discount ≤ subtotal`. It never reduces shipping, **never changes it**, and is never spread over the lines: `OrderItem.priceSnapshot` stays the price paid per unit before the voucher, and the order page shows one Discount row.
- **Invariant:** the fee is a function of the method, zone, weight and the subtotal before the discount only. So for a given cart and address, the total with any valid code is the total without it minus the discount, which is never negative. U15 checks it as a property.
- **The total floor (Behavior 13):** the applied total must be at least `MIN_ONLINE_TOTAL` (₱20.00, 2,000 centavos), one constant next to the amount helpers in `lib/payments`, read by the review and by the copy. A code that fails it is refused whole; it is not capped to leave ₱20.00. A shopper who wants it can add to the cart, because the floor is on the total.
- A voucher on a cart with unsold lines discounts only the subtotal of what is still sold, as that is the review's subtotal.
- A percent discount that floors to 0 (a ₱0.99 subtotal) is "applied" with discount 0: it still counts a use. Unreachable with the catalog (nothing costs under ₱1); the order page and email hide a zero row.
- A sale price and a voucher stack: the subtotal is already at `effectivePrice`.

**Limits and counting**

- `usedCount` is the number of orders holding the code that are not cancelled. A use is taken at placement, so an **unpaid** order holds one for up to the order's hold time (24 h by default), and a person can hold a limited code's uses by placing orders they never pay. This is the issue's design (count at placement, give back on release); the 24 h expiry is the mitigation, and rate limiting is [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).
- Lock order: a placement (and the release) locks products by id first, then the voucher row. Nothing locks them the other way, so there is no cycle (P13). The release gives back with one update per voucher in id order, after its stock updates.
- The give-back is `usedCount − 1` per cancelled order with a voucher, in the same transaction that cancels it, so it happens exactly once per order. The `usedCount ≥ 0` CHECK is the backstop; a give-back that would go below zero is a bug and fails the release transaction.
- A late or second payment (spec 032) doesn't touch a voucher. A refunded or Admin-cancelled order after payment is Sprint 8's, with the give-back above.

**Dates and time (one `now`)**

- A review reads `now` once. A placement reads **one** `now` (its existing `now` option, the application clock) and hands the same value to `computeReview` (so the eligibility test and the below-minimum test use it) and to the conditional update as a bound parameter. The check never mixes in the database's `now()`, so a boundary such as `endsAt` equal to `now` gives the same answer in the read and in the update (P15). The limit, not the clock, is what the update serializes.
- Dates are stored as instants; the demo codes are written as Manila midnights. `startsAt` is required (the seed uses 2026-01-01 Manila time); `endsAt` null means no end; when both are set `endsAt > startsAt`.

**Review and placement**

- The refusal reasons are the shopper's only feedback, and they reveal whether a code exists (unknown versus ended versus used up). The issue asks for these reasons; guessing codes through the public review action is a rate-limiting matter ([#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64)).
- The review's voucher result is independent of the cart's problems and of `canPlace`; nothing about a voucher blocks Place order. A code the shopper didn't get is never silently dropped at placement: it is `changed` (Behavior 14).
- No log line carries a voucher code, a discount or a use count with an order; the existing `order.release` and placement failure logs are unchanged.
- The saved step-1 draft gains one text field (`voucherCode`, default empty). An older saved draft without it reads as before; the storage key and version stay.

**Concurrency summary:** the conditional `UPDATE … RETURNING` is the only thing that decides the last use; the review's read is an early exit. Replays are served before any count (spec 030 Behavior 15). A cart lock serializes one cart's placements; different carts serialize on the voucher row.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Field label | Voucher code |
| Apply button / busy | Apply / Checking… |
| Remove button / busy | Remove / Removing… |
| Applied | {CODE} applied |
| Summary row | Discount ({CODE}) · −₱… |
| Empty submit | Enter a code. |
| Unknown | We don't recognize that code. Check it and try again. |
| Not started | That code isn't active yet. |
| Ended | That code has ended. |
| Used up | That code has been used up. |
| Min spend | Spend {₱X} more to use this code. |
| Below the minimum total | This code would bring your total below {₱20.00}, the least we can take online. Add to your cart or use another code. |
| Apply request failed | We couldn't check that code. Try again. |
| Order page and email, discount label (was "Discount") | Discount ({CODE}) |
| Live region | Checking your code… (reuses spec 029's polite region) |

The threshold note ("Free shipping on orders of ₱75,000.00 or more.") is **unchanged**. `Place order` → `changed` keeps spec 030's "Your order changed. Review it again."

## 6. Data and interfaces

**Schema (one migration)**

- `enum VoucherType { FIXED PERCENT }`.
- `Voucher`: `id`, `code` (unique), `type`, `value`, `minSpend` (default 0), `startsAt`, `endsAt?`, `usageLimit?`, `usedCount` (default 0), `createdAt`, `updatedAt`. CHECKs (migration-only): `code` matches `^[A-Z0-9_-]{3,32}$` (therefore upper-case); `PERCENT` → `value` 1–100; `FIXED` → `value` > 0; `minSpend` ≥ 0; `usageLimit` null or ≥ 1; `usedCount` ≥ 0 and (`usageLimit` null or `usedCount` ≤ `usageLimit`); `endsAt` null or > `startsAt`.
- `Order`: `voucherId?` → `Voucher` (`Restrict`, indexed), `voucherCode?`. CHECKs: `discount ≤ subtotal`; `(voucherId IS NULL) = (voucherCode IS NULL)`; `discount > 0` implies `voucherId IS NOT NULL`. `discount` and the total CHECK already exist (spec 030). No database CHECK for the ₱20.00 floor: it belongs to the gateway, and a tighter CHECK on `total` would also refuse orders for reasons unrelated to vouchers.
- The seed writes the three demo codes with `INSERT … ON CONFLICT (code) DO NOTHING`. `--reset` and `resetCatalog()` add `"Voucher"` to their `TRUNCATE` (CASCADE from `Product` doesn't reach it; `Order` is already named).

**Pure `lib/vouchers/`** (no database, env, `next` or `react`; also run by client code): `normalizeVoucherCode(text)` → the upper-case code or `null` (empty or wrong shape); `voucherDiscount({type, value}, subtotal)` → whole centavos; `checkVoucher(voucher | null, subtotal, now)` → `{ ok: true, discount }` or `{ ok: false, reason: "unknown" | "not-started" | "ended" | "used-up" | "min-spend" (+ shortBy) }`. The below-minimum test needs the total, so it lives in `buildReview`, not here. Copy for the reasons lives beside the checkout copy. `MIN_ONLINE_TOTAL` (2,000) lives in `lib/payments/amount.ts` with a comment citing the sources (D15).

**Review and digest**

- `checkoutInputSchema` gains optional `voucherCode` (both shapes); the saved draft gains `voucherCode`, and `draftPayload` includes it only when non-empty.
- `computeReview` takes the `now` of its caller, reads the voucher by normalized code through its client (the transaction at placement) and passes the result to `buildReview`, which now returns `discount`, `voucher` (`none`, `applied` with code, or `refused` with the reason, `below-minimum` included) and a `total` of `subtotal − discount + shipping`. **The fee is computed exactly as today, from the subtotal before the discount** (`shippingFee` and its comment are unchanged). `buildReview` applies the floor as a second pass: an applied code whose total is under `MIN_ONLINE_TOTAL` becomes `refused`, discount 0.
- `reviewDigest` adds the applied code (or null) and the discount to what it hashes.
- `placeOrder`: refuses `changed` for a refused or unreviewed code; passes its `now` to `computeReview`; after the stock step and before the order insert, runs the conditional update with that same `now`; the insert gets `voucherId`, `voucherCode`, `discount`; `PlaceStep` gets one more step name for the seam (P10). The order total is the review's.
- `releaseExpiredOrders`: after the stock updates, one `usedCount − 1` per cancelled order with a voucher, grouped by voucher, in id order.
- `OrderPageData` and `EmailOrder` gain `voucherCode`; the Discount label becomes `Discount ({code})` in `ORDER_COPY` and `EMAIL_COPY`.
- No new route, environment variable or reserved slug; the review action and `placeOrderAction` keep their shapes (the code travels inside `details`).

**Docs to update with the story**

- [spec 028](../028-shipping-data-and-fee-rules/spec.md): a pointer on D14 ("kept by spec 037; a voucher never changes the fee") where it says Sprint 7 may change it. The rule itself and `CLAUDE.md`'s fee paragraph do not change, and neither does PRD FR-16.
- [spec 029](../029-checkout-steps/spec.md): the review gets the code box and Discount row. [spec 030](../030-place-an-order/spec.md): the order summary line "Discount (only when above 0; vouchers are Sprint 7)"; the digest list. [spec 036](../036-order-emails/spec.md): T4's label and §8 ("#94 needs no email change").
- `CLAUDE.md`: a short vouchers paragraph, the spec 030 digest and placement bullet (voucher in the digest, the conditional update, the give-back) and the reset table lists. Not the fee paragraph.
- `docs/prd.md`: the `Voucher` row's detail (value units, null `endsAt` and `usageLimit`); the `Order` row already names `voucherId`, `voucherCode` and `discount`. README: the demo codes. `docs/setup/payments.md`: a line that the ₱20.00 floor comes from the Cards channel's minimum.
- No new ADR: the use is one more conditional update inside [ADR 0009](../../adr/0009-place-orders-in-one-transaction-held-by-an-access-token.md)'s transaction.

## 7. Test plan

| Level | What |
| --- | --- |
| Unit (pure) | U1–U16 (`lib/vouchers`, `buildReview` with a voucher including the floor, the property U15); `reviewDigest` covers code and discount (changes with either); `checkoutInputSchema` and the draft (normalization, empty, 200-character limit, an old draft); copy strings; order-page and email rows (O1–O3); review component states O4–O7 |
| Integration (`*.db.test.ts`, Docker Postgres) | V1–V16 through `reviewCheckout` (V5 and V5a build their own product); P1–P16 through `placeOrder` (the race P3, P4 and P13 with `Promise.all`, repeated; P15 with a fixed `now`); R1–R8 through the release and the sweep; D1–D7 (CHECKs, unique, `Restrict`, seed and reset); the `guardTransactions` helper still passes (no gateway call inside any transaction); a console spy shows no code in any log |
| E2E (Playwright, fake gateway and transport) | X1–X4; X1 gives its order its own recipient (the email cap, spec 036) and uses `WELCOME10`, which has no limit, so repeated runs don't exhaust it; X4 moves a test voucher's `endsAt` through a helper next to `e2e/stock.ts` that carries the same production guard |
| Manual (once, not blocking) | `pnpm payments:check` created a ₱19.99 session in test mode (spec 031 Q8), so session creation does not enforce the Cards minimum. Before relying on ₱20.00 in demos, open a `--keep` session below ₱20.00 and see whether the payment page still offers Cards; record the finding in `docs/setup/payments.md`. The floor stays at ₱20.00 either way (it is the safe side) |

Definition of done also needs: acceptance criteria checked on the Preview URL (including a first deploy where an open review gets "Your order changed" once), desktop widths (1024 px and up), lint and type check green, and the docs in §6 updated.

## 8. Out of scope

- The Admin screen to create, edit and track vouchers (AD-8): Sprint 9. Until then rows come from the seed.
- Cancelling or refunding a paid order and giving its use back: Admin, Sprint 8 (it must call the release's give-back).
- A voucher field in the cart, on the product page or in the builder; entering a code before step 2.
- More than one code per order, per-customer limits, first-order-only, category or product vouchers, free-shipping vouchers, vouchers on shipping, stacking rules, auto-applied codes: not in FR-17.
- Zero-total or below-minimum orders (a free order with nothing to pay): refused by the floor in Behavior 13. A "no payment needed" path would be its own story.
- An order that is below ₱20.00 **without** a code, and orders above a channel's maximum (GCash and Maya take up to PHP 100,000, Cards up to PHP 700,000): existing behavior, not changed here.
- Rate limiting of the review action (guessing codes): [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).
- COD orders and their email: [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95); it reuses the same discount rows and **must apply the same ₱20.00 floor to a code** (Behavior 13).
- A discount line per item, discount in the Payment received email, discount in `OrderItem`.

## 9. Decisions

| # | Decision | Reason | Rejected |
| --- | --- | --- | --- |
| D1 | The PRD's `Voucher` and `Order` rows already hold the fields; only detail is added (units, nulls) | The issue's "PRD PR" task is a small clarification, not new scope | Rewriting the rows |
| D2 | **Review change:** the free-shipping threshold keeps comparing the subtotal **before** the discount (spec 028 D14 stays); a voucher never changes the fee | With the threshold after the discount a voucher can raise the total: ₱75,050.00 to Mindanao ships free, but with a ₱100.00 code the subtotal is ₱74,950.00 and the ₱1,450.00 fee makes the total ₱76,400.00 (V5a, U15) | Comparing after the discount (my first draft and the issue's wording) |
| D3 | **Supersedes spec 036 §8** ("#94 needs no email change"): the email's Discount row is labelled with the code | The issue asks for "Discount ({code})" on the email too | Leaving the email unlabelled |
| D4 | A refused code never blocks Place order and is not saved; a code the shopper didn't get is `changed` at placement | Shopper decides whether to continue without it; the server never places an order that silently lacks a discount asked for | Blocking Place order on any refusal; dropping a refused code silently at placement |
| D5 | The code travels inside the checkout `details` and Apply is a review request | One schema and one server path; the digest, key and token stay tied to the exact money shown | A separate voucher action and endpoint (a second path to keep in step with placement) |
| D6 | The applied code is kept in the tab's saved step-1 draft | Going back to edit details shouldn't lose it; it holds text only, like the rest of the draft | Component state only (lost on any step change) |
| D7 | `startsAt` required, `endsAt` and `usageLimit` nullable, `usageLimit` ≥ 1, `endsAt > startsAt`, `minSpend` 0 for none | The issue lists the columns without nullability; this makes "no end" and "unlimited" explicit and rules out never-usable rows | `startsAt` nullable; allowing `usageLimit` 0 |
| D8 | Code shape `^[A-Z0-9_-]{3,32}$`, tested before upper-casing | Keeps look-alike and case-folding characters out; "stored upper-case" becomes a database fact | Free-form text with `upper()` matching |
| D9 | Eligibility reasons are checked in the order unknown → not started → ended → used up → min spend | The issue's order; the more fundamental failure is reported first | Reporting every failure at once |
| D10 | **Review change:** a placement reads one `now` and gives it to both the voucher validation and the conditional update; the database's `now()` is not used in that check | The read and the update then agree at every boundary (`endsAt` equal to `now`), and tests fix the clock (P15) | Database `now()` in the update (the two could disagree by milliseconds); a separate `now` per step |
| D11 | Demo codes are seeded per code (`ON CONFLICT DO NOTHING`), unlike rates (only when the table is empty) | The issue says "only when missing"; each code is independent | Seeding only into an empty table |
| D12 | Totals are listed Subtotal, Shipping, Discount, Total on the order page and in the email, and the review matches | It keeps the existing order page and email rows where they are | Moving Discount above Shipping everywhere |
| D13 | Extra CHECKs beyond the issue: voucher/discount consistency on `Order`, `endsAt > startsAt`, the code shape | They make the invariants the code relies on hold in the database | App-level checks only |
| D14 | No new ADR | The use is a conditional update inside ADR 0009's transaction; D2 keeps spec 028's rule | An ADR for one rule |
| D15 | **Review change:** a code is refused when the total with it would be under **₱20.00** (`MIN_ONLINE_TOTAL`), applied to any order and, by #95, to COD too | Xendit documents per-channel limits: Cards PHP 20 to 700,000, GCash and Maya PHP 1 to 100,000 ([Cards](https://docs.xendit.co/docs/cards-8), [GCash](https://docs.xendit.co/docs/gcash), [Maya](https://docs.xendit.co/docs/maya); recorded in `docs/setup/payments.md`, "Confirmed in Xendit's docs"). The payment page offers all three, so the order must be payable on each; and `Payment.amount` must be above zero | A ₱0.00 floor only (my first draft: the Cards channel would still fail between ₱0.01 and ₱19.99); a ₱1.00 floor (the e-wallet minimum, wrong for Cards); capping the discount to leave ₱20.00 (changes the advertised discount) |

## 10. Open questions

None open. The review of 2026-11-04 settled both questions of the first draft:

1. **Q1 (zero-total orders):** refuse the code, and also any code that takes the total under Xendit's documented minimum. Xendit does document minimums (D15), so the floor is ₱20.00, not ₱0.00. #95 applies the same rule to COD.
2. **Q2 (showing the demo codes):** in the README and the Preview checklist only (Behavior 2).

### Changes made by the review

- **Threshold:** D2 reversed. The threshold compares the subtotal before the discount; spec 028 D14 stands. The Mindanao case is added as V5 / V5a with the property U15, and the worked example is now ₱80,555.00 with `WELCOME10` → ₱72,499.50 with free shipping (V4). Dropped from the doc list: PRD FR-16, `CLAUDE.md`'s fee paragraph and the threshold-note copy.
- **Minimum total:** the zero-total refusal became a ₱20.00 floor from Xendit's Cards minimum (Behavior 13, D15, U16, V13, V13a, P14, O7), and it can apply to delivery orders that ship free, not just pickup.
- **Demo codes:** README and Preview checklist only (Behavior 2).
- **One `now`:** Behavior 16, §4 "Dates and time", D10 and P15.
- **Noted for #95:** the floor applies to COD (Behavior 13, §8).

### What changed while building

- `computeReview` hands the placement the applied voucher's `id` and the terms the review used (`type`, `value`, `minSpend`), not just an id, so P16 compares them without a second read. None of it reaches the browser (a test checks the row id is absent from the review result).
- The voucher CHECK tests live in `lib/orders/voucher-schema.db.test.ts`, not `lib/vouchers/`: the pure folder's import limits forbid the test database helper.
- The `Order` CHECK is `discount = 0 OR voucherId IS NOT NULL` together with the id and code being set or null together (D13); a voucher worth ₱0.00 is allowed on an order.
- The seed prints "Vouchers: n added." or "Vouchers: kept (already set).", and `writeSeed` takes the vouchers as an optional argument, so the older seed tests are unchanged.
- The placement and release steps were committed together: the race test P13 needs the release's give-back.
- The E2E ran against a scratch database in the Docker Postgres (not the Neon dev branch), in dev and against the production build. Four fake-payment-page specs (`place-order`, `order-emails`, `release`) fail now and then in that setup, **on the commit before this story as well** (two of three baseline runs lost "Pay marks the order Paid"), so that flakiness is not from vouchers.
- Still open and not blocking: whether the payment page hides Cards below ₱20.00 (`docs/setup/payments.md`).
