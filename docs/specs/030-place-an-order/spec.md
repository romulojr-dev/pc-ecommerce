# 030 — Place an order

Status: **Implemented** · Issue: #78 (Sprint 6, Checkout epic #4; depends on #77, merged as spec 029, and #76, merged as spec 028) · PRD refs: FR-13 (stock re-checked at checkout), FR-20 (order status timeline), FR-24 (the reservation half: stock is held while the order waits for payment); NFR Reliability (stock decremented in a transaction; orders never hard-deleted); Data model › `Order`, `OrderItem`, `StockMovement`

## 1. Summary

This story turns the review's disabled Place order button into an order. In one database transaction the server re-checks the cart exactly as the review does, compares it with what the shopper reviewed, takes the stock (a held reservation, not a payment), writes the order with its snapshots, empties the cart and returns a private link, `/orders/{number}?key={token}`. That page is the shopper's only way back to the order until emails arrive (FR-21, Sprint 7), so it shows the status timeline, the items from their snapshots, the totals, the address or pickup details, when payment is due, and a prompt to save the link. Paying (#79), payment events (#80) and auto-cancel (#81) are the next three stories; this one stops at Pending payment. Because a placed order holds stock that nothing releases until #81, placing is behind an `ORDERS_ENABLED` switch that is off in Production (D13).

## 2. Behavior

### Place order, on the review (step 2)

1. **Place order is enabled** when `ORDERS_ENABLED` is on and the review has no problems (`canPlace`, spec 029). It replaces the disabled button. Under it: "Your parts are held for {n} hours after you place your order." (n is the settings' `orderExpiryHours`, which the review now returns as `holdHours`). **When the switch is off** (Production until #81 is live, D13) the review is exactly spec 029's: Place order disabled with "Placing orders is coming soon.", and no hold sentence. The review result carries `ordersEnabled` for this; the switch is read on the server only.
2. The review result also carries three values the browser sends back with Place order (D1):
   - the **review digest**: a fingerprint of what the shopper is looking at (§4 Digest);
   - an **idempotency key** (128 random bits, 22 base64url characters) and an **access token** (256 random bits, 43 base64url characters), both made by the server from the crypto source, new on every review (every arrival and every Check again). The server later accepts only exactly that shape (§4 Formats). Neither is ever logged (§4 Logging). The review is still read-only: it writes nothing, takes no lock and sets no cookie.
3. **Clicking Place order** sends one server action with the saved step-1 details, the digest, the key and the token. The cart comes from the cookie, never from the request. **The server action checks the switch first**: when it is off the action answers `disabled` before it reads the body, the cookie or the database (Z2). While it works the button is busy ("Placing your order…", announced by step 2's polite live region) and the page ignores further clicks. A second click, a double-click or a second tab replaying the same key cannot create a second order (Behavior 15).
4. **On success** the browser, in this order: clears `pc-silicon-checkout` from `sessionStorage` (spec 029 Behavior 28 made this #78's job), sets the header's cart count to 0, and replaces the URL with the order's link. Back from the order page therefore does not return to a stale review (and `/checkout` with an empty cart redirects to `/cart` anyway).
5. **When the server refuses** nothing is written (Behavior 6) and the review shows what happened:
   - `changed`: the notice **"Your order changed. Review it again."** appears above the review, which reloads at once (new digest, key and token). The reloaded review lists any problem and shows current prices, fee and stock. This one outcome covers: a difference from what was reviewed, any problem the checks now find (a line out of stock or no longer sold, a build with errors, no rate), and the last unit going to another shopper between the checks and the decrement. The shopper reads the new review and clicks Place order again.
   - `invalid`: the details no longer pass (spec 029 Behavior 17, pickup turned off): back to step 1 with the field errors, as the review does.
   - `empty`: the cart is gone or empty (placed from another tab, emptied elsewhere): the browser goes to `/cart`.
   - `disabled`: the switch is off (a forged call, or it was turned off after the review loaded): the review reloads and shows the disabled button and "Placing orders is coming soon.".
   - `error` (the transaction failed and was rolled back): "We couldn't place your order. Nothing was ordered. Try again." The button is enabled again; **the same key and token are reused**, so a retry after a failure that actually committed returns that order (Behavior 15).
   - A network failure (no answer): "We couldn't confirm your order. Try again: if it went through, you'll go straight to it." Same button, same key and token.
6. **Placement is atomic.** Anything that fails or refuses, at any step, leaves no `Order`, `OrderItem`, `StockMovement`, stock change, cart change or `Build` change (§4 Placement). A refusal never renews the cart cookie.

### What placing does (the transaction, in order)

Each step stops the whole placement on failure, and the transaction rolls back.

7. **Lock the cart** row (`FOR UPDATE`, as every cart write does), so a placement and a cart change run one after the other. No cart row: `empty`.
8. **Replay check** (D2, D14): if an order with this idempotency key **placed from this same cart** exists (matched on the key and the cart's id hash, both), answer with it (Behavior 15) and stop; nothing else runs. An order with that key from another cart is not a match.
9. **Re-run every review check** (spec 029 Behavior 20) on the locked cart with the details sent: the details parse (`checkoutInputSchema`), the pickup setting, `resolveAddress` and `normalizeAddress`, the cart view, the weights, `buildReview`. Any problem (unavailable, over stock, build errors, no rate) refuses with `changed`; invalid details or pickup turned off refuse with `invalid`; an empty cart with `empty`. It is the review's own code, so what blocks the review blocks the order.
10. **Compare with what the shopper reviewed.** The digest of the fresh review must equal the digest sent. Any difference in lines, prices, quantities, fee or total refuses with `changed`.
11. **Take the stock.** Each product's total across its single line and every build group is subtracted with a conditional update, `stock >= total` and still active, products in id order (so two placements never wait on each other in a cycle). The update reports the product's price and status as it saw them; a product that doesn't update, or whose price or status differs from what step 9 used, refuses with `changed`.
12. **Insert the order** and its items, with the order number from the generator, `ON CONFLICT DO NOTHING` with no conflict target (ADR 0007), retrying a new number on a collision (§4 Order number). The step is before the movements because a movement carries the order's id (D3).
13. **Write the stock movements**: one per product, change −(its total), reason `order-reserved`, the order's id.
14. **Delete the cart's `CartItem`s.** The `Cart` row stays, and so does the cookie, so the shopper can keep shopping. The `Build` snapshots stay (`OrderItem.buildId` and `CartItem.buildId` both point at them).

After the commit, `revalidateTag(PRODUCTS_TAG, "max")` runs once, because the home page shows stock. If it throws, the order stands, the error is logged and the shopper still lands on the order page (the home page revalidates on its own within 10 minutes).

### Double submit and retries (the idempotency key)

15. The key makes placing **idempotent**, for the cart that made it: the same key with the same token, from the same cart, always answers with the same order. Each order stores the SHA-256 of the cart id it was placed from (`cartIdHash`; the cart id is a bearer secret, so it is not stored as is), and every key lookup also matches that hash (D14).
    - First request with a key: places the order as above.
    - Any later request from **the same cart** with that key and the **same token** (a double-click, a second tab on the same review, a retry after a lost response): `ok` with the same order link, whatever the cart holds now. Nothing is written and no stock is taken again.
    - From the same cart, that key with a **different token**: `duplicate`, no link and no data: "This order was already placed." (It cannot happen from the app.)
    - **A key that belongs to another cart's order** never replays: the lookup finds nothing for this cart, the placement goes on to the insert, which conflicts on the unique key, and the whole transaction rolls back with `duplicate` (stock it had taken is returned). The answer holds no link, number or other data, and gives no hint of whose order it was (P32, P33).
    - **Two requests racing** with one key from one cart are serialised by the cart lock: the second waits, then replays. Two racing from different carts with the same key: the insert of the second waits on the unique key, finds no row, and rolls back as `duplicate` (P27). This is why steps 11 and 12 are in the same transaction.

### The order page, `/orders/{number}?key={token}`

16. The page is **per request** (`connection()`), with no `loading.tsx` (so a 404 keeps its status), `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and not in the sitemap. It lives in the `(store)` group, so the header and footer stay.
17. **Access.** The number must match its shape (`PCS-` and 8 Crockford base32 characters, uppercase) and the key must be 43 base64url characters; otherwise the page is a 404 without a database read. Otherwise the order is read by number and the SHA-256 of the key is compared with `accessTokenHash` in **constant time**. A wrong key, a missing key and an unknown number give **the same 404** (the store's not-found page, same status, same body). No cookie is needed: anyone with the link sees the order, which is why the key is a bearer secret and the page says to save the link.
18. **What the page shows**, from the order's snapshots, never from the current product rows:
    - **Header**: "Order {number}", placed on {date} (Philippine time, same formatter), and the status in words.
    - **Timeline** (FR-20): an ordered list in a labelled navigation. Delivery: Pending payment → Paid → Processing → Shipped → Delivered. Pickup: Pending payment → Paid → Processing → Ready for pickup → Picked up. The current step carries `aria-current="step"`; earlier steps read as done. **Cancelled** is its own branch: the list stops where the order was and a separate "Cancelled" item shows (the same for **Refunded**). This sprint's orders are Pending payment, with Paid and Cancelled reachable by #80/#81, so the page renders every status (a unit test per status) even though only the first is placed here. "COD confirmed" joins the list in Sprint 7 (FR-25).
    - **Payment due**: while Pending payment, **"Pay by {time}"** from `expiresAt`, in Philippine time, always Asia/Manila whatever the server's zone (§4 The order page): "Pay by Sun 1 Nov 2026, 3:42 PM". After `expiresAt`, still pending: "The time to pay has passed. This order will be cancelled and its parts released." (the cancel is #81). Paid and later: nothing. Online payment isn't open until #79: a line "Paying online is coming soon." sits where its button will go.
    - **Save the link**: "Save this link: it's the only way to see your order until order emails arrive.", the full link in a read-only field (labelled "Your order link"), and a **Copy link** button. It copies `window.location.href` (so the key is exactly what the browser has). On success the button reads "Link copied" and a polite live region says so; if the clipboard is refused, "Couldn't copy. Select the link and copy it yourself." and the field is selected.
    - **Items**: from `OrderItem`, in cart order. Single lines: name, unit price, quantity, line total. A build group: "Custom PC build" (numbered when the order has two or more), its parts in builder slot order with the slot's shopper label, and the group's total. Names and prices are the snapshots, so a later rename, repricing or retirement of the product changes nothing here. No images or product links (nothing of those is snapshotted).
    - **Order summary**: Subtotal, Shipping ("Free (pickup)" for pickup; "Free" when a delivery fee is 0; else the fee), Discount (only when above 0; vouchers are Sprint 7), Total.
    - **Contact**: name, email, mobile (+639…).
    - **Delivery**: the street and then "{barangay}, {city}, {province}, {region} {zip}" from the stored names; or, for pickup, **Pick up at** with the store's current address and hours (D5) and "Bring your order number and a valid ID when you collect your order."
19. The page works the same whichever browser opens it; reloading it re-reads the order (a status changed by a later story shows).

### Sizes and states

20. The order page is built desktop-first (1024 px and up). It has no loading state of its own (server rendered). The Place order button's busy and error states are above. A 404 for any bad link.

## 3. Examples

Seed values unless stated; "[n]" sets a product's stock in the test database first. **Cart prices, fees and the ₱75,000.00 free-shipping threshold are spec 028/029's**: **AMD Ryzen 5 7600** ₱11,495.00 [12], 450 g; **Lian Li LANCOOL 216 Black** ₱5,795.00 [7], 9,000 g; **Build A** (8 parts, ₱69,060.00), **Build B** (₱74,560.00, status Warnings). Contact `ana@example.com`, "Ana Santos", "0917 123 4567". **QC** and the other addresses are spec 029's. "Fresh review" means the digest, key and token the review returned for the cart as it stood. Money is centavos in the database.

### Placing (`placeOrder`, integration against the test database)

| # | Cart and state | Request | Expected |
| --- | --- | --- | --- |
| P1 | Ryzen 5 7600 × 2 | Delivery, QC, fresh review | `ok`. One `Order`: status Pending payment, delivery, zone `metro-manila`, 900 g, subtotal 2,299,000, shippingFee 12,000, discount 0, total 2,311,000, email/name/`+639171234567`, the address names and codes (province "Metro Manila", code `null`, `provinceIsGeographic` false), `expiresAt` = placement + 24 h, `accessTokenHash` = SHA-256 of the sent token (the token appears in no row). One `OrderItem`: product, "AMD Ryzen 5 7600", 1,149,500, quantity 2, `buildId`/`slot` null. Ryzen stock 12 → 10; one `StockMovement` (−2, `order-reserved`, the order's id, `actorId` null). The cart has no `CartItem`s; the `Cart` row remains. Result link `/orders/PCS-XXXXXXXX?key=<token>` |
| P2 | Build A group | Store pickup, fresh review | `ok`. Fulfillment pickup, no address columns, zone null, weight 15,860 g, shippingFee 0, total 6,906,000. Eight `OrderItem`s, each with the group's `buildId` and its slot, price = its `effectivePrice`, quantity 1, in builder slot order; each of the 8 products −1; eight movements |
| P3 | Build A group + Ryzen 5 7600 × 1 single | Delivery, QC | `ok`. Subtotal 8,055,500, shippingFee 0, total 8,055,500. Nine `OrderItem`s (the Ryzen appears twice, once with `buildId` null). **One** Ryzen movement of −2 and stock 12 → 10 |
| P4 | Ryzen 5 7600 × 1 | The same request twice in a row (same key, same token) | First `ok`. Second `ok` with **the same link**. One order, one movement, stock −1 once |
| P5 | Same | The same request twice at once (`Promise.all`) | Both `ok` with the same link; one order, stock −1 once |
| P6 | After P4's first | Same cart, same key, a different token | `duplicate`; no link in the answer; nothing written |
| P7 | Two carts, both Ryzen × 1, each with its own fresh review | Both place at once | Both `ok` (12 in stock): two orders, stock 10 |
| P8 | LANCOOL 216 [1]; two carts, each LANCOOL × 1, both reviewed clean | Both place at once | **Exactly one** `ok`; the other `changed`. Stock 0, one order, one movement. The loser's cart still has its line (now flagged "Out of stock"); nothing of the loser's was written |
| P9 | Ryzen [12]; 13 carts, each Ryzen × 1 | All 13 place at once | 12 `ok`, 1 `changed`; stock 0; 12 orders; never negative |
| P10 | One cart of Ryzen + LANCOOL, another with the same two added in the other order | Both place at once, repeated 20 times | No deadlock or serialization error; both succeed each time (stock allows) |
| P11 | Ryzen × 3 reviewed at [12]; then [2] | Place | `changed`. No order, no movement, stock 2, cart unchanged |
| P12 | Ryzen × 2 reviewed; then its sale price set to ₱10,995.00 | Place | `changed`; nothing written. A fresh review shows 2 × ₱10,995.00 and a different digest |
| P13 | Ryzen × 1 single, QC, reviewed (₱120.00 fee); then Metro Manila ≤ 1 kg raised to ₱150.00 | Place | `changed`; nothing written |
| P14 | Ryzen reviewed; the test adds a second Ryzen to the cart (another tab) | Place | `changed` (the lines differ); nothing written |
| P15 | A Build A× group (inserted directly: socket and memory-type errors) | Place with any digest | `changed`; nothing written |
| P16 | Build A group; the RTX 4060 set to draft after the review | Place | `changed`; nothing written; the fresh review says "No longer sold" |
| P17 | Ryzen × 1, delivery Davao reviewed; then the Mindanao rates deleted | Place | `changed` (no-rate); nothing written |
| P18 | Ryzen × 1, pickup reviewed; then `pickupEnabled` false | Place | `invalid`, `method` "Store pickup isn't available right now. Choose delivery."; nothing written |
| P19 | Build B group (BIOS warning), QC, fresh review, no acknowledgment | Place | `ok`: warnings don't block and need no confirmation. Subtotal 7,456,000, fee 45,000, total 7,501,000 |
| P20 | Empty cart; and no cart row | Place | `empty` both times; nothing written |
| P21 | Ryzen × 1 | Request carries `subtotal: 1`, `total: 1`, `status: "PAID"`, `fee: 0`, `userId`, an extra `cartId` | Ignored; the order has the server's numbers and status; the cart is the cookie's |
| P22 | Ryzen × 1 | A digest that is not a hash (`"x"`, 64 `z`), a missing field | `invalid` (shape), no database write and no lock |
| P23 | Ryzen × 1, fresh review | A digest from another cart's review | `changed` |
| P24 | Same state | The transaction fails at its last step (test seam: the cart delete throws) | `error`; no order, no movement, stock unchanged, cart unchanged |
| P25 | Same | The order number generator returns a number that exists, then a free one | `ok` with the free number; no error, the transaction not aborted (no P2002) |
| P26 | Same | The generator returns existing numbers 3 times | `error`; nothing written |
| P27 | Ryzen × 1 in two carts; both requests carry the same key (and token) | Both place at once | Exactly one order; the other is `duplicate` (rolled back, nothing of it left); stock −1 once |
| P28 | Settings `orderExpiryHours` 48 | Place at a fixed clock | `expiresAt` = placement + 48 h |
| P29 | Ryzen × 1, `revalidateTag` mocked | Place | Called once with `"products"`, `"max"` after the commit; not called for any refusal or replay; when it throws, `ok` is still returned |
| P30 | Placed order P1, then the product renamed and repriced | Read the order | `nameSnapshot` and `priceSnapshot` unchanged |
| P31 | Placed order P2, then a part retired (draft) | Read the order | Still readable (`OrderItem.productId` is `Restrict`; the product row remains) |
| P32 | Cart C1 placed P4's order. Cart C2 holds Ryzen × 1 with its own clean review | C2 sends **C1's key and C1's token** | `duplicate`. No link, number or order data in the answer; no new order; C2's cart and the stock unchanged. C1's order is not returned |
| P33 | Same | C2 sends C1's key with **its own** token | `duplicate`; nothing written; stock unchanged (the placement rolled back after trying the insert) |
| P34 | Ryzen × 1, cart C1 | Key of 21 or 23 characters; a key with a character outside the base64url alphabet or a `=`; a 22-character key whose last character isn't canonical (it decodes to 16 bytes but re-encodes differently); a 43-character key; a token of 42 or 44 characters, or non-canonical in the same way; a token sent as the key and the key as the token | Each: `invalid` (shape); no lock, no database read, no write |
| P35 | Ryzen × 1; the transaction fails with a Postgres error whose detail repeats the key (a unique violation on `idempotencyKey`, as in P27's loser) and with an error thrown in the last step (P24) | The input carries a recognisable key, token, email, name, mobile and street; `console.error`, `console.warn`, `console.info`, `console.log` and `console.debug` are spied on | None of the calls contains the key, the token, the digest, the cart id, the email, the name, the mobile number or the street, as text or as any property of a logged object. What is logged names the step and the error's name and code, and nothing from its message |
| P36 | A review (`reviewCheckout`) that fails (the settings row is missing) with the same recognisable input | Same spies | The same: no key, token or detail in any log (the existing `Checkout review failed:` line logs the error name and code only) |
| P37 | The first request of P4 succeeded | The order row is read back | `cartIdHash` is the SHA-256 of the cart id (64 hex) and the cart id itself is in no `Order` column; `accessTokenHash` is the SHA-256 of the token and the token is in no column |

### The `ORDERS_ENABLED` switch (D13)

| # | State | Request | Expected |
| --- | --- | --- | --- |
| Z1 | Switch off; a clean Ryzen × 1 review | Open the review (component test of the review view with `ordersEnabled: false`) | Place order is disabled; "Placing orders is coming soon." is shown; the hold sentence is not |
| Z2 | Switch off | `placeOrderAction` with a valid, fresh payload | `{ ok: false, reason: "disabled" }`. No cart lock, no read, no write, no cookie; stock, orders and the cart unchanged |
| Z3 | `ORDERS_ENABLED` unset | `ordersEnabled()` | `false` (fails closed) |
| Z4 | `ORDERS_ENABLED` is `true` / `false` / `TRUE`, `1`, `yes`, `""` | env validation | `true` and `false` accepted; every other value fails at startup with the env error naming the variable |
| Z5 | Switch off, an order placed earlier | Open its link | The order page works as in V1: the switch only gates placing |
| Z6 | Switch on | A valid placement (P1) | Works; `reviewCheckoutAction` returns `ordersEnabled: true` |
| Z7 | The repository's own config | `.env.example`, `docs/setup/payments.md` and `.github/workflows/ci.yml` | The first two document the variable (on locally and in Preview, off in Production, turn on after #81); CI sets it to `true` for its build and E2E |

### The review's new fields (`reviewCheckout` and the digest, unit and integration)

| # | Input | Expected |
| --- | --- | --- |
| D1 | Ryzen × 2, QC, review twice | Same digest; **different** key and token each time; the key decodes to exactly 16 random bytes (22 characters), the token to exactly 32 (43), both canonical base64url |
| D2 | D1's cart, quantity 3 / price changed / fee changed / a line added | A different digest each time |
| D3 | The same cart with a warning added by a rule change | The same digest (warnings aren't part of it) |
| D4 | The same lines in a different cart order | The same digest (§4 Digest) |
| D5 | The review of a cart with problems | Still returns a digest (the browser won't send Place order, and the server refuses it anyway) |
| D6 | A review | Writes nothing: row counts and the cart's `updatedAt` unchanged (spec 029's test, extended) |

### Order number, token, key (unit)

| # | Input | Expected |
| --- | --- | --- |
| U1 | `newOrderNumber()` × 1,000 | Each matches `^PCS-[0-9A-HJKMNP-TV-Z]{8}$`; none contains I, L, O or U; all differ; built from the crypto source (a stubbed source gives a known number) |
| U2 | `orderNumberShape("PCS-7K3M9QXZ")`, lowercase, `PCS-` + 7 or 9 characters, `PCS-IIIIIIII`, "", `pcs 12345678` | True for the first; false for the rest |
| U3 | `newAccessToken()` | 43 base64url characters that decode to exactly 32 bytes and re-encode to the same text; 1,000 differ; `hashToken(token)` is 64 lowercase hex and equals SHA-256 of the token; `tokenShape` refuses the cases of P34 |
| U4 | `tokenMatches(token, hash)` | True for the right token; false for a wrong one, a different length, an empty string; uses a constant-time compare (the comparison function is `timingSafeEqual` over equal-length buffers; a test checks that unequal lengths are handled without throwing) |
| U5 | `newIdempotencyKey()`; `keyShape()`; `hashCartId(id)` | The key is 22 canonical base64url characters (exactly 16 bytes); the shape check rejects the cases of P34; `hashCartId` is SHA-256 hex and differs for different cart ids |
| U6 | `reviewDigest(review)` | Examples D2–D4 |

### Database (integration)

| # | Check | Expected |
| --- | --- | --- |
| S1 | `UPDATE "Product" SET "stock" = -1` | Fails the `CHECK (stock >= 0)` |
| S2 | Order CHECKs: `total <> subtotal + shippingFee − discount`; a negative amount; delivery with no address columns; pickup with an address; a delivery with no zone | Each insert fails |
| S3 | `OrderItem`: quantity 0; `buildId` set with no `slot`; the same product twice as single lines in one order; the same product twice in one build | Each fails |
| S4 | `Order.orderNumber`, `idempotencyKey`, `accessTokenHash` | Each unique |
| S5 | Deleting a `Product` or a `Build` that an `OrderItem` or `StockMovement` uses | Fails (`Restrict`) |
| S6 | `resetCatalog()` after orders exist | `Order`, `OrderItem` and `StockMovement` are empty afterwards, and the guard still refuses production |
| T1 | The search trigger is narrowed: plant a sentinel in a product's `searchVector` with triggers off for that transaction (`SET LOCAL session_replication_role = replica`), then `UPDATE "Product" SET "stock" = "stock" - 1` | `searchVector` is still the sentinel (the old trigger would have overwritten it) |
| T2 | Update `name`, `sku`, `specs`, `brandId` or `categoryId` | `searchVector` is recomputed, and an insert still sets it |
| T3 | Rename a brand or a category | The products' vectors refresh (spec 014 unchanged); and a keyword search finds a product after a stock-only update, with the same ranking (spec 014's tests pass untouched) |
| T4 | The `effectivePrice` trigger | Unchanged: a stock-only update leaves it correct; a `salePrice` update recomputes it |

### The order page (`/orders/{number}?key={token}`, integration for access, component and E2E for the view)

| # | Request | Expected |
| --- | --- | --- |
| V1 | P1's link | 200. "Order PCS-…", "Pending payment" current, one item "AMD Ryzen 5 7600 ×2 ₱22,990.00", Subtotal ₱22,990.00, Shipping ₱120.00, Total ₱23,110.00, the QC address, "Pay by {placement + 24 h}", the save-the-link text and the Copy link button |
| V2 | The right number, a wrong key | 404, identical to V3 |
| V3 | An unknown number with a well-formed key | 404, identical body and status to V2 |
| V4 | The right number, no `key` | 404, identical to V2 |
| V5 | A malformed number (`abc`, lowercase, `PCS-` + 9 characters) or a key of the wrong length | 404 with no database read |
| V6 | Headers on V1 | `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; `<meta name="robots" content="noindex">`; no `sitemap.xml` entry; no canonical tag (D6) |
| V7 | P2's link (pickup) | "Pick up at" with the settings' address and hours, "Bring your order number and a valid ID…", no street line, "Free (pickup)"; the timeline shows Ready for pickup / Picked up as the last two steps |
| V8 | P3's link | One single line (Ryzen × 1) and "Custom PC build" with eight parts in slot order and ₱69,060.00; no number (one group) |
| V9 | An order with two groups (inserted directly) | "Custom PC build 1" and "Custom PC build 2" |
| V10 | The status set to PAID / CANCELLED / REFUNDED / each other status (component test on fixtures) | The current step moves; Cancelled and Refunded show as their own item; "Pay by" is gone for Paid and later |
| V11 | Pending payment with `expiresAt` in the past | "The time to pay has passed. This order will be cancelled and its parts released." |
| V12 | P30's order after the rename and repricing | The page shows the old name and price |
| V13 | P31's order with a retired part | Still renders |
| V14 | Copy link with the clipboard allowed / denied | "Link copied" in the live region / "Couldn't copy. Select the link and copy it yourself." with the field selected |
| V15 | The same link in a browser with no cart cookie | The same page |
| V16 | Pay-by formatting, `payByText(expiresAt)`, run under `TZ=UTC` and `TZ=America/Los_Angeles` | Placement 2026-10-31 15:42 Manila + 24 h (`expiresAt` 2026-11-01T07:42:00Z): "Sun 1 Nov 2026, 3:42 PM". The same text under both zones, and on the server render and the client (no hydration mismatch) |
| V16b | **Deadline crosses midnight in Manila.** `expiresAt` 2026-11-01T17:30:00Z (placed 2026-10-31T17:30:00Z, which is Sun 1 Nov 1:30 AM in Manila) | "Pay by Mon 2 Nov 2026, 1:30 AM". The UTC date is still 1 Nov; a formatter that uses the server's zone prints "Sun 1 Nov 2026, 5:30 PM" and fails this test. "Placed on" for the same order reads "Sun 1 Nov 2026" |
| V16c | `expiresAt` 2026-11-01T16:00:00Z, and 2026-11-01T15:59:00Z | "Mon 2 Nov 2026, 12:00 AM" and "Sun 1 Nov 2026, 11:59 PM" (midnight and noon read 12, not 0) |
| V16d | `expiresAt` 2026-12-31T20:00:00Z | "Fri 1 Jan 2027, 4:00 AM" (month and year roll over in Manila, not in UTC) |
| V16e | The past-due text (V11) around the deadline, with a fixed clock | Compared as instants: at `expiresAt` minus 1 s the pay-by line shows; at `expiresAt` the past-due text shows, in any server zone |

### End to end (Playwright)

| # | Journey | Expected |
| --- | --- | --- |
| X1 | A part no other spec uses (known stock set through `e2e/stock.ts`, restored in `finally`) × 1 → Checkout → details (Quezon City) → review → **Place order** | Lands on `/orders/PCS-…?key=…`; the order's items and total are shown; the URL has the key; "Save this link…" is there |
| X2 | After X1 | The header cart count is 0; `/cart` is empty; `sessionStorage["pc-silicon-checkout"]` is gone; `/checkout` redirects to `/cart`; the product page shows the reduced stock |
| X3 | X1 with Place order double-clicked | One order (one link); the browser ends on it |
| X4 | Review open, then the test sets the stock to 0 (`e2e/stock.ts`), then Place order | "Your order changed. Review it again." above a reloaded review that blocks with "Out of stock" and links Back to cart; no order |
| X5 | The order link opened with the wrong key | The 404 page |
| X6 | Copy link | The button reads "Link copied" |
| X7 | Pickup order | The order page shows the store's address and hours |

## 4. Rules and edge cases

### Placement

- **One transaction, one path.** `placeOrder` is the only writer of an order. The server action only forwards to it, passing the cart id from the cookie (as every cart action does). It takes no price, total, status, user id or cart id from the request (P21).
- **Input** (one Zod schema, browser and server): the checkout input of spec 029 (`checkoutInputSchema`), plus `digest` (64 lowercase hex), `idempotencyKey` and `accessToken` (§4 Formats). Unknown fields are dropped; a field of the wrong shape is `invalid` before any database work (P22, P34).
- **Formats** (D14): the key must be **exactly 22 base64url characters that decode to exactly 16 bytes (128 bits) and re-encode to the same text**; the token **exactly 43 that decode to exactly 32 bytes (256 bits) and re-encode to the same text**. Anything shorter, longer, padded, outside the alphabet or non-canonical is refused as `invalid`, before the lock, so no weaker value can ever be stored. The server can check length and shape but not randomness; a browser that picks a guessable token for its own order exposes only its own order (D1).
- **Locks, in one order**: the cart row first, then the products in ascending id order (the conditional updates take the row locks). Two placements for one cart run one after the other; two placements that share products can't wait on each other in a cycle (P10). The cart lock is the same one every cart write takes, so a cart change in another tab either lands before the checks or waits.
- **Isolation.** The checks read the cart under its lock, so its lines can't change underneath them. Stock, price and status can (a seed re-run, later Admin), so the conditional update is the authority: it takes the quantity only if `stock >= total` and the product is active, and reports the price and status it saw. The prices written to `OrderItem` are the ones the checks and the digest used; a price that moved before the update refuses (`changed`) instead of being written.
- **Quantities.** A product in a single line and in groups loses the sum, in one update (P3). The cart already caps the total at `min(stock, 99)` per product at add time; placement doesn't rely on that.
- **What is snapshotted** (columns in §6): contact, the address names and codes (the spec 029 shape: province code null for independent cities and pseudo-provinces, `provinceIsGeographic` for the geographic case; the PSGC version), zone and weight, the money, `expiresAt`, each item's name and price, and the build id and slot of a group's parts. The shipping rate table and the settings are **not** snapshotted beyond the resulting fee.
- **The totals**: subtotal = Σ unit price × quantity over the items; shippingFee from `shippingFee()`; discount 0; total = subtotal + shippingFee − discount. The database holds the identity (S2). Subtotal here is the review's (every line is sold, because a problem refuses), so it equals the `/cart` subtotal.
- **Money is integers**; weights are whole grams.
- **Pre-order, draft and out-of-stock parts** can't be ordered: they are cart problems (spec 027), so the checks refuse them.
- **Nothing here reads `NODE_ENV`**; the test-mode banner stays as spec 029 has it.

### Order number, token, key

- **Number**: `PCS-` and 8 characters from Crockford's base32 alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`: no I, L, O, U), drawn from the crypto source, 40 bits. A collision is expected rarely (a 1-in-a-trillion pair per order at this scale), so it is handled by retry, not prevented: the insert is `ON CONFLICT DO NOTHING RETURNING`, no conflict target, as ADR 0007 requires (Postgres aborts a transaction after any error, so catching `P2002` can't work inside one). A no-row result is read as "the key already placed an order" (look the key up: replay) or else "the number was taken" (retry with a new number, three tries, then `error`).
- **Access token**: 256 random bits as 43 base64url characters; **only `accessTokenHash` (SHA-256, 64 hex) is stored; the token is never stored or logged in plain text**. It is compared in constant time. It is a bearer secret, so it is never put in markup other than the page's own URL and the Copy link field. A token the browser invents is its own risk: the server doesn't check that it made it (D1).
- **Idempotency key**: 128 random bits as 22 base64url characters (the cart id's shape and source), unique on `Order`, and honoured only for the cart that placed the order (Behavior 15, D14). Not a secret, but still never logged: next to the cart's hash it identifies an order.
- **Cart id hash**: `cartIdHash` is the SHA-256 (64 hex) of the cart id. The cart id is the cart's bearer cookie, so it is never copied into an order.

### Logging

- **Never logged**, by `placeOrder`, `reviewCheckout`, the actions or the order page: the idempotency key, the access token, the digest, the cart id, and the shopper's email, name, mobile number and address. A failure logs a fixed line with the step and the error's **name and code only** (a Prisma code or a Postgres SQLSTATE), never `error.message`, never the error object: Postgres's duplicate-key detail repeats the key's value, and Prisma errors can echo arguments. Placement does not use the cart module's `logFailure(action, error)` (it logs the whole error), and `reviewCheckout`'s `Checkout review failed:` line is cut down the same way. P35 and P36 are the tests.
- **The URL is the exception the app can't control.** The order link carries the token in its query string, so the hosting platform's request log (Vercel) can record it. The app never logs it, but the platform's log is outside this story; the alternative, a `#fragment` the server never sees, would need the page to be fetched by script and is not the issue's design (D15).
- **Order number lookup is exact**: the page doesn't fold case or map look-alike characters. The number is on the page for pickup and support; nobody types the link.

### Digest

- The digest is the SHA-256 (64 hex) of one canonical text of what the shopper was shown that costs money: the entries' lines as `[entry kind, buildId or "", slot or "", productId, quantity, unit price]`, sorted by those values as strings, then the shipping fee, the subtotal and the total, `JSON.stringify`ed. It leaves out names, flags, stock, warnings and the address text (the address is validated and its zone fixes the fee, which is in the digest). Sorting makes cart order irrelevant. It is computed by one pure function that the review and the placement both call (D1), so they can't drift.
- The browser can't forge a useful digest: a digest that doesn't equal the fresh one is refused, and one that does equal it only confirms the shopper accepts the current state.

### The order page

- Unknown, malformed and wrong-key links are the same response (V2–V5). Timing: the shape check is cheap and differs from a database lookup, which only leaks that a link was malformed, not whether an order exists; a well-formed number and key always cost one read and one constant-time compare (a missing row compares against a fixed dummy hash).
- The page never calls any Server Action and writes nothing. It re-reads on every request, so a status changed elsewhere shows on reload.
- **Pay-by time** follows the `manilaToday` pattern in `lib/stock.ts`: one module-level `Intl.DateTimeFormat` with `timeZone: "Asia/Manila"` and a pure function that takes the `Date`, so servers running in UTC and a developer's laptop print the same text. The text is assembled from the formatter's parts ("{Weekday} {d} {Mon} {yyyy}, {h}:{mm} {AM|PM}", 12-hour clock, midnight "12:00 AM"), so ICU's punctuation can't change it. `expiresAt` and `createdAt` are stored as instants (UTC); "Placed on" and "Pay by" use this formatter, and whether the deadline has passed compares instants, never formatted text (V16–V16e).
- Refunded and Cancelled hide the payment line. "Paid / COD confirmed" is one step in the list until Sprint 7.
- Personal data (name, email, mobile, address) is on the page for anyone with the link. That is the design (D1); the link is shown once, saved by the shopper, and the page says so.

### Stock reservation

- Stock decremented here is a **reservation held until payment or expiry**. This story never releases it. Releasing on cancel/expiry is #81; a paid order keeps it. Until #81 ships an unpaid order would hold its parts indefinitely, which is why placing is behind `ORDERS_ENABLED`, off in Production (D13); turning it on there is a release step after #81 is deployed.
- A `StockMovement` row is written for every decrement. `actorId` is plain text (null here); it becomes a foreign key when `User` exists (#65).

### The search trigger

- `product_search_vector` fires on `INSERT` and on `UPDATE OF "name", "sku", "specs", "brandId", "categoryId", "searchVector"` only. `searchVector` is in the list so a value written straight to it is still overwritten (ADR 0005; spec 014's test "overrides a value written straight to the column" needs it; the issue's list of five columns would have broken that test, D11). Postgres decides by the columns named in the statement's `SET` list, not by whether the value changed, so the seed (which sets them all) still recomputes. The brand and category triggers update `searchVector` itself and are unaffected. `pnpm db:drift` doesn't compare triggers, so T1–T3 are what keeps this true.

### Cart and header after placing

- The cart is empty (count 0). `cartCountStore` is set from the action's result like every cart action's. The cookie is neither renewed nor cleared by placing.
- A cart refused for any reason is untouched.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Review, under Place order (clean) | "Your parts are held for {n} hours after you place your order." ("1 hour" when n is 1) |
| Place order | Button "Place order"; busy "Placing your order…" (the polite live region) |
| Switch off (`ORDERS_ENABLED`) | Button disabled; "Placing orders is coming soon." (spec 029's text, unchanged) |
| Refused: changed | "Your order changed. Review it again." |
| Refused: server error | "We couldn't place your order. Nothing was ordered. Try again." |
| No answer | "We couldn't confirm your order. Try again: if it went through, you'll go straight to it." |
| Duplicate (different token) | "This order was already placed." |
| Order page title / description | "Order {number}" / "Your PC Silicon order." |
| Order page headings | "Order {number}", "Order status", "Items", "Order summary", "Contact", "Delivery address" (delivery) / "Pick up at" (pickup) |
| Placed on | "Placed on {date}" |
| Timeline labels | "Pending payment", "Paid", "Processing", "Shipped", "Ready for pickup", "Delivered", "Picked up", "Cancelled", "Refunded"; `aria-label="Order status"` |
| Pay by | "Pay by {time}" |
| Past due | "The time to pay has passed. This order will be cancelled and its parts released." |
| Payment not open | "Paying online is coming soon." |
| Save the link | "Save this link: it's the only way to see your order until order emails arrive." |
| Link field / button | Label "Your order link"; "Copy link"; "Link copied"; "Couldn't copy. Select the link and copy it yourself." |
| Groups and totals | "Custom PC build" / "Custom PC build {n}", "Subtotal", "Shipping" ("Free", "Free (pickup)"), "Discount", "Total" |
| Pickup | "Bring your order number and a valid ID when you collect your order." |
| Not found | The store's existing 404 |

## 6. Data and interfaces

### Schema (one migration)

- **Enums**: `OrderStatus` (the whole FR-20 set: PENDING_PAYMENT, PAID, COD_CONFIRMED, PROCESSING, SHIPPED, READY_FOR_PICKUP, DELIVERED, PICKED_UP, CANCELLED, REFUNDED), `Fulfillment` (DELIVERY, PICKUP), `StockMovementReason` (ORDER_RESERVED; the others are added by the stories that use them: released by #81, received/damaged/correction by Admin). Zones reuse `ShippingZone`.
- **`Order`**: `id`; `orderNumber` (unique); `accessTokenHash` (unique); `idempotencyKey` (unique) and `cartIdHash` (SHA-256 hex of the cart it was placed from; with the key it is what the replay check matches, D14); `status` (default PENDING_PAYMENT); `fulfillment`; contact `guestEmail`, `contactName`, `contactMobile`; delivery address snapshot (all null for pickup): `regionCode`/`regionName`, `provinceCode` (nullable even for delivery, D14 of spec 029) / `provinceName` / `provinceIsGeographic`, `cityCode`/`cityName`, `barangayCode`/`barangayName`, `street`, `zip`, `psgcVersion`; `zone` (null for pickup) and `weightGrams`; `subtotal`, `shippingFee`, `discount` (default 0), `total`; `expiresAt`; `createdAt`, `updatedAt`. The migration adds the `CHECK`s of S2 (Prisma can't express them): non-negative amounts, `total = subtotal + shippingFee − discount`, address and zone present exactly for delivery. `userId`, `paymentMethod`, `refundRequired`, `courier` and `trackingNumber` (PRD data model) arrive with the stories that use them (Accounts, #79/#80, Admin).
- **`OrderItem`**: `id`; `orderId`; `productId` (`Restrict`); `nameSnapshot`; `priceSnapshot` (centavos); `quantity` (`CHECK >= 1`); `buildId` (nullable, `Restrict`) and `slot` (nullable; both set or both null, a `CHECK`); `position` (the item's place in the order, D4). Unique per order and product where `buildId` is null, and per order, product and build (the cart's pair of indexes; declared like `CartItem`'s partial index).
- **`StockMovement`**: `id`; `productId` (`Restrict`); `change` (an integer, negative here); `reason`; `orderId` (nullable, a foreign key to `Order`); `actorId` (nullable text, no foreign key yet); `createdAt`. Indexed by product and by order.
- **`Product`**: `CHECK (stock >= 0)` (migration only). If a database holds a negative stock the migration fails loudly; none is expected.
- **Search trigger**: `product_search_vector` is dropped and recreated as `BEFORE INSERT OR UPDATE OF "name", "sku", "specs", "brandId", "categoryId", "searchVector"`, calling the same function. No backfill.
- **`resetCatalog()`** (`test-support/db.ts`) and the seed's `--reset` (`prisma/seed/write.ts`) add `"Order"` and `"StockMovement"` to their `TRUNCATE` lists, by name (`OrderItem` follows by cascade from `Order`). Both are tested by S6.

### Pure (`lib/orders/`, no database, no `next`)

- Number, token and key: `newOrderNumber()`, `orderNumberShape(text)`, `newAccessToken()`, `hashToken(token)`, `tokenMatches(token, hash)`, `newIdempotencyKey()`, `keyShape(text)`, `tokenShape(text)`.
- `reviewDigest(review)`: the digest of §4 (in `lib/checkout/`, next to `buildReview`).
- `placeOrderInputSchema`: the checkout input plus `digest`, `idempotencyKey`, `accessToken` (the exact shapes of §4 Formats); `hashCartId(id)`; `ordersEnabled()` (`lib/orders/enabled.ts`, reads `env.ORDERS_ENABLED`; everything else in `lib/orders` and `lib/checkout` stays env-free so tests don't depend on it).
- `orderTimeline(order)`: the ordered steps for the order's fulfillment, which is done / current / upcoming, and the Cancelled or Refunded branch.
- Copy and formatting next to `lib/cart/copy.ts`: the pay-by time (Asia/Manila), the address line, the shipping value, the group label.

### Server

- `placeOrder(cartId, input: unknown): Promise<PlaceResult>` (`lib/orders/place-order.ts`, server-only):
  `{ ok: true; orderNumber; accessToken }` (the caller builds the link), `{ ok: false; reason: "changed" | "empty" | "duplicate" | "disabled" | "error" }` or `{ ok: false; reason: "invalid"; fields }` (the review's field map). Tested directly with a cart id and a transaction seam for P24–P26.
- `placeOrderAction(input)` in `app/(store)/checkout/actions.ts`: answers `disabled` first when `ordersEnabled()` is false; otherwise reads the cart id from the cookie and forwards; never takes a cart id from the request; sets no cookie. It returns the link path (`/orders/{number}?key={token}`) and the new cart count (0).
- `reviewCheckout` returns, on `ok`, `digest`, `idempotencyKey`, `accessToken` and `holdHours` too. It stays read-only and env-free; `reviewCheckoutAction` adds `ordersEnabled` to an `ok` result.

### Configuration

- **`ORDERS_ENABLED`** (D13), a server variable in `lib/env.ts`: `"true"` or `"false"`, any other value fails startup, unset means `false`. **On** in `.env.local`, the Vercel Preview environment and CI; **off** (unset or `false`) in Production. Changing it on Vercel needs a redeploy. It is added to `.env.example` (as `true`, with a comment), to the CI workflow's `env` (the build and the E2E need it), and to `docs/setup/payments.md`: a row in the variables table (Local `true`, Preview `true`, Production unset until #81 is deployed, CI `true`, Story #78) and a checklist line "After #81 is merged and deployed, set `ORDERS_ENABLED=true` in Vercel → Production and redeploy.". Existing orders stay viewable whatever the switch says (Z5).
- `getOrderForPage(number, key)` (`lib/orders/get-order.ts`): the shape checks, one read, the constant-time compare; returns the order and its items in position order, or `null`. Reads the store's settings for the pickup address and hours.
- The checks of step 9 and the review are one function (the review's server code, run on the locked cart inside the transaction), not a copy.

### Routes and components

- `app/(store)/orders/[number]/page.tsx`: per request; `noindex`; metadata with no canonical (D6); `notFound()` on a `null`. `next.config.ts` sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer` for `/orders/:path*`. The page doesn't run `resolveAddress`, so it needs no `outputFileTracingIncludes` key; `placeOrder` does (it calls `resolveAddress`), and it runs in `/checkout`'s function, which already has the key.
- Client: `ReviewStep`/`ReviewView` get the enabled Place order and its outcomes (`checkout-flow` clears the draft and navigates); `OrderTimeline`, `OrderItems` (groups from the snapshots), `OrderSummary`, `CopyLink` on the order page; the rest are server components.
- `lib/sitemap.ts` is unchanged (no order URL is ever listed).

### Docs

- CLAUDE.md: a paragraph for orders (`placeOrder`'s steps and locks, the token and key, the digest, `OrderItem` snapshots, the order page, the narrowed trigger, `resetCatalog` naming `Order`, `StockMovement`), and the `db:seed --reset` line (it also deletes orders).
- Spec 029 gets a "Changed by spec 030" note on Behavior 19's Place order (disabled → enabled), Behavior 28 (the draft is now cleared), the review's new fields, and N11.
- ADR 0009: "Place orders in one transaction, held by an access token" — the placement protocol (lock order, digest, idempotency), the bearer link and its safeguards (cart-scoped key, exact formats, hashes only, no logging, the platform-log caveat) and the `ORDERS_ENABLED` switch with the reservation it guards. Written with the plan.
- The issue's wording is updated: "the token is never stored or logged in plain text" (done at review).
- PRD: no change (its `Order` table lists the later columns for the stories that add them).

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | Number, key and token functions, hash, constant-time compare | U1–U5 |
| Unit | `reviewDigest` | D2–D4, U6 |
| Unit | `placeOrderInputSchema` (shapes, extra fields) | P21, P22 |
| Unit | `orderTimeline` for every status and both fulfillments | V10 |
| Unit (markup) | Order page view: timeline, items grouped, summary, pickup block, pay-by text, past-due, copy block | V1, V7–V11, V16 |
| Integration (`*.db.test.ts`) | `placeOrder` against the test database: every row of P1–P31 (concurrency with real parallel transactions), including nothing-written assertions (row counts, stock, cart) | P1–P31 |
| Integration | `reviewCheckout` returns the new fields and still writes nothing | D1, D5, D6 |
| Integration | Constraints and the reset | S1–S6 |
| Integration | Cart-scoped key: another cart's key and token get nothing; both formats refused when off-shape; no secret or detail in any log; hashes only in the row | P27, P32–P37 |
| Unit / component | The `ORDERS_ENABLED` switch: env validation, `ordersEnabled()`, the action refusing, the disabled review | Z1–Z4, Z6 |
| Unit | Pay-by formatter under two server zones, midnight, noon and year crossings | V16–V16e |
| Integration | Order page still works with the switch off | Z5 |
| Config check | `.env.example`, `docs/setup/payments.md` and CI carry the variable | Z7 |
| Integration | The narrowed trigger, and spec 014's search tests unchanged | T1–T4 |
| Integration | `getOrderForPage` and the route: access, the same 404, headers | V1–V6, V12, V13, V15 |
| E2E (Playwright) | Place an order and land on its page; the cart, header, draft and stock afterwards | X1, X2 |
| E2E | Double click; stale review; wrong key; copy; pickup | X3–X7 |
| Preview deploy | One order placed with a delivery address (the tracing key) | §6 |
| Manual | Look at 1024 px and 1280 px; screen reader on the timeline and the copy button | — |

The E2E places real orders in the app's database and takes real stock (`e2e/stock.ts` sets a known stock first and restores it in `finally`; the `Order` rows stay, as the cart rows do). Moving local E2E off the Neon dev branch is #74.

## 8. Out of scope

| What | Owner |
| --- | --- |
| Paying: the payment page, method choice, PayMongo, the fake adapter, the Test mode instructions | #79 |
| Payment events and setting Paid | #80 |
| Auto-cancelling unpaid orders and releasing stock; the `released` movement reason | #81 |
| Emails (order confirmation, FR-21) | Sprint 7 |
| COD and its limits, "COD confirmed" | FR-25, Sprint 7 |
| Vouchers (the discount stays 0) | FR-17, Sprint 7 |
| Accounts: `userId` on an order, order history, claiming a guest order after sign-up, "create an account after ordering" | Accounts epic #65, FR-18, FR-19 |
| Rate limiting Place order and the order page | #64 |
| Turning `ORDERS_ENABLED` on in Production | A release step after #81 is merged and deployed (`docs/setup/payments.md`) |
| Admin: status transitions, tracking number, cancel, refund, stock adjustments, the packing slip | Sprint 8 (AD-5, AD-6) |
| `Payment`, `PaymentEvent`, `paymentMethod`, `refundRequired` | #79–#81 |
| Moving local E2E to the Docker test database | #74 |
| Mobile layouts below 1024 px | Phase 2 |

## 9. Decisions

- **D1 — The server mints the idempotency key and the access token at review time; the browser sends them back with Place order.** Both are random and un-stored until an order exists, so the review stays read-only. Because the browser holds the pair for the whole review, a retry after a lost response, a double-click and a second tab all send the same key and token, and the server answers the same order each time (Behavior 15): placing is idempotent in the usual sense, not "second request fails". The link can be rebuilt on the retry, which a token made only at placement could not do (that order's token is gone). The token still appears to the shopper only in the order URL, and only its hash is stored. *Rejected:* minting both at placement (a lost response would leave the shopper with reserved parts and no link, and a duplicate could only say "already placed"); deriving the token from the key with a server secret (a new secret to keep and rotate, and a token that is no longer purely random). *Issue wording:* the issue said the token "appears only in the returned URL and is never stored"; here it also travels in the review and placement requests of the same browser (not persisted, never logged), so the issue now reads "the token is never stored or logged in plain text". Approved at review, with the safeguards of D14.
- **D2 — The replay check runs right after the cart lock, before the checks.** After a first placement the cart is empty, so a second request that ran the checks first would answer `empty` instead of the order. Doing it after the lock (not before) means a request that waited on the lock sees the first one's committed order.
- **D3 — The order is inserted before the stock movements; the issue lists the movements first.** A movement's `orderId` is a foreign key, so the order row must exist. Both are in the one transaction, so the outcome is the same; no lock order changes (the insert takes no product lock). *Rejected:* a deferred foreign key (a rule only this table would need), and writing movements with a null order id and updating them. *(Approved at review.)*
- **D4 — `OrderItem.position` keeps cart order.** The issue asks for groups to show grouped and in slot order, but nothing else orders singles and groups the way the cart and the review do; slot names alone give no cross-group order. *Rejected:* singles first then groups (the page would disagree with the review).
- **D5 — The pickup store's address and hours on the order page are the settings' current ones, not a snapshot.** A shopper collects from where the store is now; the issue and PRD list no store snapshot. *Rejected:* copying the text onto the order (stale after a move, and the data model has no field for it).
- **D6 — The order page has no canonical tag and no social tags.** The only URL that works contains the secret: a canonical with the key would write the secret into the HTML, and one without it would point at a 404. The page is `noindex` and unlisted, so a canonical earns nothing. This differs from the other `noindex` pages (spec 022, 025, 029), which each set their own; those have URLs that aren't secret.
- **D7 — One `StockMovement` per product, with the summed quantity.** A product in a single line and a group is one decrement, so its movement matches the stock change exactly and a later release can undo it row for row. *Rejected:* one movement per line (two rows for one stock change).
- **D8 — Any refusal that depends on the cart or the shop's state is `changed`.** The shopper only needs one action ("review again"), and the reloaded review already names what is wrong, with the spec 029 problem list. Separate reasons for "the last unit went", "the fee changed" and "a build broke" would need three more messages for the same click. *Rejected:* a reason per refusal.
- **D9 — The digest carries prices, quantities, fee and total, not names or warnings.** It answers "would the shopper pay something different?". A warning that appears after review is shown on the next review without a new acknowledgment (spec 029 D10), so it doesn't need to change the digest.
- **D10 — The order page is a Server Component with a small client `CopyLink`.** The order is read once on the server; only the clipboard needs the browser. *Rejected:* a client page fetching the order (the link's secret would go through a second request).
- **D11 — Narrowing the search trigger goes in this story's migration, as the issue says, with `searchVector` itself added to the `UPDATE OF` list.** Stock writes become frequent here; the old trigger recomputed the vector, a text-search build, on every one. A sentinel test (T1) is the check, because `db:drift` doesn't see triggers. *Deviation from the issue's list of five columns, found when the existing search tests ran:* spec 014 has a test that a value written straight to `searchVector` is overwritten (ADR 0005's guarantee); with only the five columns, an update that sets just `searchVector` would no longer fire the trigger and the test fails, which the issue also forbids ("the existing search tests still pass"). Adding the column keeps both. A stock-only update still skips the rebuild. *Rejected:* dropping the old test (it protects a real invariant).
- **D12 — The page renders every status even though only Pending payment is placed here.** #80 and #81 only change data; the timeline code and its tests are written once, here, with fixtures. *Rejected:* Pending payment only, which would leave Paid and Cancelled for stories that are about payments.

- **D13 — Placing is behind an `ORDERS_ENABLED` switch, off in Production, on in Preview and locally (review decision).** Until #81 releases unpaid orders, every order placed in Production would hold stock for good, and `db:seed` keeps the stock of existing products, so a drained product would stay drained. The switch lets #78 merge and deploy without exposing that. It fails closed (unset is off), is enforced on the server in the action (a hidden button alone would not stop a direct call), and gates only placing: the review, the digest and existing order pages are unchanged. *Rejected:* accepting unreleased reservations in Production; holding deploys until #81; deriving it from `VERCEL_ENV` (a named variable can be flipped on one environment without a code change, and CI and local runs need it too).
- **D14 — The idempotency key is honoured only for the cart that placed the order; both values have exact formats (review decision).** A bare "key already exists" lookup would let any request that guessed or saw a key learn that the order exists, or fetch its link by also holding the token. Matching on the key and the cart's id hash (`cartIdHash`, a hash because the cart id is itself a bearer cookie) means another cart gets `duplicate` and nothing else (P32, P33). The key stays globally unique, so the database also stops two orders sharing one. Exact formats (key 128 bits, token 256 bits, canonical base64url) keep a short or oddly encoded value from ever becoming an order's secret. *Rejected:* making the key unique per cart only (two carts could then share a token and collide on `accessTokenHash`); storing the raw cart id (copies a bearer secret into a table that support and Admin will read).
- **D15 — Secrets and personal details are never logged; the platform's request log is the one gap (review decision).** Postgres and Prisma errors can repeat the values that failed, so placement logs a name and a code and nothing from the message (P35, P36). The token is in the order link's query string (the issue's design), which the host's request log can record; moving it to a fragment would avoid that but make the page client-fetched. *Rejected:* logging `error.message` for debugging; a fragment link.
- **D16 — Pay-by and placed-on times use a fixed Asia/Manila formatter (review decision).** Vercel runs in UTC, so a formatter that took the server's zone would print a time eight hours off and the wrong date near midnight (V16b). It copies `manilaToday`'s approach: one module-level `Intl.DateTimeFormat`, a pure function of a `Date`. *Rejected:* `toLocaleString` with no zone; formatting on the client only (a hydration mismatch and a flash).

Decisions **D5, D6 and D7 were agreed at review.**

Flags against earlier documents:

- **Spec 029 Behavior 19 / N11 and CLAUDE.md** say Place order is disabled ("Placing orders is coming soon."). This spec replaces that (the issue) whenever `ORDERS_ENABLED` is on; with it off the text stays (D13). They get a "Changed by spec 030" note.
- **Spec 029 Behavior 28** ("this story only reads and writes the draft"): the draft is now cleared on success, as it asked.
- **Spec 029 §6** says the review keeps nothing and returns `review`, `contact`, `address`, `store`: it now also returns `digest`, `idempotencyKey`, `accessToken` and `holdHours`. It remains read-only.
- **Issue, step order**: the order insert comes before the movements (D3). **Issue, "token appears only in the returned URL"**: see D1.
- **Spec 029 D14 / Behavior 31:** the stored province code is `null` for independent cities and pseudo-provinces, so `provinceCode` is nullable (spec 029 asked #78 to allow it).
- **PRD data model** lists `userId`, `paymentMethod`, `refundRequired`, `courier`, `trackingNumber` on `Order`; they are left to the stories that use them (§6). The PRD's scope is unchanged.

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| `Order`: number short, random, unique; token hash only; FR-20 enum; delivery or pickup; contact; address, zone and weight snapshots; money; `expiresAt`; idempotency key; timestamps | §4 Order number/Access token, §6 Schema, P1, P2, P28, U1–U4, S2, S4 |
| `OrderItem`: product (Restrict), name and price snapshots, quantity, nullable build and slot, grouped in slot order | §6 Schema, D4, P1–P3, P30, P31, S3, S5, V8, V9 |
| `StockMovement`: product, change, reason, nullable order and actor, `createdAt` | §6 Schema, D7, P1–P3, P9 |
| Placement is one transaction in that order; a refusal writes nothing | Behavior 6–14, §4 Placement, D2, D3, D8, P4–P27, P24 |
| Lock the cart | Behavior 7, P8–P10 |
| Re-run every review check | Behavior 9, P15–P18, P20 |
| Compare with what the shopper reviewed; "Your order changed. Review it again." | Behavior 5, 10, §4 Digest, P11–P14, P23, D2–D4, X4 |
| Decrement with conditional updates, products locked in id order | Behavior 11, §4 Locks, P8–P10, P12 |
| Write the movements | Behavior 13, P1–P3 |
| Insert with `ON CONFLICT DO NOTHING`, retry a new number, never catch P2002 | Behavior 12, §4 Order number, P25, P26, P27 |
| Delete the cart's `CartItem`s | Behavior 14, P1, X2 |
| `CHECK (stock >= 0)` as a backstop | §6, S1 |
| After commit `revalidateTag(PRODUCTS_TAG, "max")`; header count 0 | Behavior 4, §4 Cart and header, P29, X2 |
| Double submit creates one order | Behavior 3, 15, D1, D2, P4–P6, P27, X3 |
| Search trigger narrowed to `UPDATE OF` the columns; stock-only update leaves `searchVector`; search tests pass | §4 The search trigger, §6, D11, T1–T4 |
| `/orders/[number]?key=`: per request, `noindex`, `no-store`, no-referrer, not in the sitemap | Behavior 16, D6, V6 |
| Wrong or missing key = same 404 as unknown number; constant-time compare | Behavior 17, §4 The order page, V2–V5, U4 |
| The page shows the timeline (Pending payment current, Cancelled its own branch) | Behavior 18, D12, V1, V10 |
| Items from snapshots, grouped by build; totals; address or pickup store and hours | Behavior 18, D5, V1, V7–V9, V12, V13 |
| "Pay by {time}" | Behavior 18, V1, V11, V16 |
| "Save this link…" with a copy button | Behavior 18, V1, V14, X6 |
| New tables added to `resetCatalog()` | §6, S6 |
| Tests: unit number and token; integration concurrency, price changed, group with errors, cart cleared, nothing written, double submit; E2E place and land | §7, U1–U5, P4–P27, X1 |

### Review requirements → where

| Requirement from the review | Covered by |
| --- | --- |
| Idempotency lookup only for the same cart; another cart's key gets no order | Behavior 8, 15, D14, P32, P33, P27, P37 |
| Exact format and length of both values, refuse anything else | §4 Formats, D14, P34, U3, U5, D1 |
| Neither value is ever logged; a test | §4 Logging, D15, P35, P36 |
| The issue's wording: "never stored or logged in plain text" | D1, §6 Docs (issue updated) |
| `ORDERS_ENABLED`: off in Production, on in Preview and local; the button says "coming soon"; the server refuses too; env, `.env.example`, `docs/setup/payments.md` | Behavior 1, 3, 5, D13, §6 Configuration, Z1–Z7 |
| ADR 0009 covers the safeguards and the switch | §6 Docs |
| Pay-by in Asia/Manila, `manilaToday` pattern, midnight-crossing example | §4 The order page, D16, V16–V16e |

## 10. Open questions

None left. The review resolved the six that were open:

1. Q1 (mint the key and token at review): **yes**, with the safeguards of D14 and D15 and the issue's wording changed.
2. Q2 (order insert before the movements): **yes** (D3).
3. Q3 (`OrderItem.position`): **yes** (D4).
4. Q4 (merging before #79 and #81): resolved by the `ORDERS_ENABLED` switch instead of accepting unreleased reservations or holding deploys (D13).
5. Q5 (ADR 0009): **yes**, now also covering the safeguards and the switch (§6 Docs).
6. Q6 ("Paying online is coming soon." until #79): **yes** (Behavior 18).

## 11. Notes from building it

Things that came up while implementing, none of which change the behavior above:

- **`searchVector` stays in the trigger's `UPDATE OF` list** (D11): a spec 014 test needed it.
- **The checks run through the transaction client.** `getCartView`, `loadGroups`, `getBuilderParts` and `getShippingConfig` take an optional `client` (default `db`). A read through `db` inside a transaction holds a second pooled connection, so 13 concurrent placements (P9) would starve a pool of 10.
- **`getShippingConfig` runs its two queries one after the other.** Inside a transaction they share a connection.
- **pg 8's deprecation notice** ("Calling client.query() when the client is already executing a query") is printed when `getCartView` runs through a transaction client, because Prisma issues its nested reads in parallel. They still run in order. Check it before upgrading to pg 9 (ADR 0009).
- **`placeOrderAction` returns the link and a count of 0**; `orderLink` lives in `lib/orders/link.ts` because a `"use server"` file can only export async functions.
- **The review view's `ReviewOk` type** is the action's success result, which adds `ordersEnabled`.
- **The E2E** uses the Fractal Design Ridge Black (₱6,995.00, 5,000 g, seed stock 2), and compares the shopper-visible text of the 404s, because the raw HTML carries each request's own URL.
