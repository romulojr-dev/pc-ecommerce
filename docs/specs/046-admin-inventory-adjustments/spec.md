# 046 — Admin inventory: stock adjustments, low-stock threshold and movement history

Status: approved with five changes, folded in below (confirm step before → after; the 1,000,000 ceiling inside the `UPDATE`; `actorId` required on staff reasons; sign `CHECK`s for every reason; notes up to 500 characters, none on order movements; a "changes before …" line under the history) and the open questions settled. A refund's restock is a Correction with a note naming the order (D15). Issue: [#116](https://github.com/romulojr-dev/pc-ecommerce/issues/116) (Admin, Sprint 8). PRD: AD-5 (inventory), AD-10 (audit), AD-11 (roles), FR-13 and FR-24 (stock is never oversold). Depends on [spec 040](../040-admin-permissions-audit-masking/spec.md) (`adminAction`, `recordAudit`, `can()`, masking, merged) and [spec 045](../045-admin-products-create-edit/spec.md) (product edit; `editVersion`, "stock changes through Inventory"). Related: [spec 030](../030-place-an-order/spec.md) (placement takes stock), [spec 033](../033-release-unpaid-orders/spec.md) and [spec 044](../044-admin-cancel-order/spec.md) (give stock back, write `StockMovement`), [#113](https://github.com/romulojr-dev/pc-ecommerce/issues/113) (retire), [#120](https://github.com/romulojr-dev/pc-ecommerce/issues/120) (dashboard low-stock list). Number 046 follows 045.

## 1. Summary

Staff and the owner get an **Inventory** screen that lists every product's stock and low-stock threshold with a low-stock filter, and a per-product page where they adjust stock by a signed **delta** with a reason (Received, Damaged, Correction), edit the product's `lowStockAt`, and read the product's full movement history with orders linked. An adjustment is one conditional `UPDATE … WHERE stock + delta >= 0` plus a `StockMovement` (with the staff `actorId` and an optional note) plus an audit row, in one transaction, so it can never overwrite or oversell a concurrent order. Demo can open both screens read-only. The adjust form asks for confirmation first, showing stock before → after. The schema change is three new `StockMovementReason` values, a `note` column on `StockMovement`, and `CHECK`s that tie every reason to a sign, an actor and a note rule.

## 2. Behavior

### Who sees and does what

1. **Roles** (spec 040's table, unchanged): `inventory.view` is everyone; `inventory.adjust` is Owner and Staff. Demo opens both screens with every control disabled and the page saying "This account is read-only." No new `can()` action is added; both mutations use `inventory.adjust` (D1).
2. The admin nav gains **Inventory**, shown when `can(role, "inventory.view")` (so all three roles), after Products.
3. Product names on Inventory link to the Inventory detail page, **never** to `/admin/products/[id]` (Staff has no Products screen). Owner and Demo also get an "Edit product" link on the detail page (`products.view`).

### The list (`/admin/inventory`)

4. One row per product, drafts and every other status included (a status badge shows), 25 per page. Columns: name (link), SKU, category, status, **Stock**, **Low-stock at**, and a **Stock level** badge: **Out of stock** (stock 0), **Low stock** (1 ≤ stock ≤ `lowStockAt`), otherwise nothing. Raw numbers, no pre-order logic: this is the shelf count, not the shopper's label (D3).
5. **Filters** in the URL, parsed and written only by a pure `inventory-params` module (`q`, `category`, `level`, `page`; bad values fall back to defaults, a non-canonical URL redirects, a page past the last redirects to the last, a filter with no results renders page 1 with the empty state and no redirect; same rules as specs 041, 042 and 045):
   - **Search**: name, SKU and brand name, case-insensitive, 2 or more characters after trimming.
   - **Category**: `All categories` or any category that has products.
   - **Stock level**: `All`, `Low stock` (1 ≤ stock ≤ `lowStockAt`), `Out of stock` (stock = 0), and `Needs restocking` (stock ≤ `lowStockAt`, i.e. both). The three level filters apply to **Active products only**: a draft or retired product is not for sale, so it isn't "low" (D4). `All` shows every status.
6. **Order**: lowest stock first, then name, then `id` (D5). Ordering is stable across pages.
7. **Loading**: skeleton table (`loading.tsx` in a `(list)` group). **Empty**: "No products yet." / "No products match." with Clear filters. **Error**: `error.tsx` with "Couldn't load inventory. Try again." and a retry.

### The product page (`/admin/inventory/[id]`)

8. Shows the product's name, SKU, category, status, **current stock** (large), **Low-stock at**, and the stock-level badge. Per request (`connection()`); an unknown or malformed id is the usual 404 with no `loading.tsx` so the status code is kept.
9. **Adjust stock** form (Owner, Staff; disabled for Demo):
   - **Reason** (required, select): **Received** (stock arrived), **Damaged** (stock lost or written off), **Correction** (the count didn't match the shelf).
   - **Quantity** (required, whole number ≥ 1). For Received the delta is `+quantity`; for Damaged `−quantity`; the person never types a sign for those.
   - For **Correction** a **Direction** control appears (**Add** / **Remove**), required, and the delta is `+quantity` or `−quantity`. The transport is always the signed **delta** (D2); "set stock to N" does not exist anywhere in the UI or API.
   - **Note** (optional, up to 500 characters); **required for Correction**, 3 to 500 characters after trimming.
   - A live line under the form: "Stock would be {current + delta}." computed from the **loaded** stock, labelled as a preview ("based on the stock when this page loaded"), because the real stock may have moved.
10. **Review, then confirm.** "Review adjustment" (offered only when the form is valid on the client; the server checks again) replaces the form's fields with a **confirm step**: "Stock {before} → {after}. {Reason} {signed quantity}." (for example "Stock 12 → 112. Received +100."), the note if any, and two buttons, **Confirm** and **Back** (Back returns to the form with everything kept). Before and after are computed from the stock loaded with the page. Nothing is written until Confirm. If the figure would be below 0 or above 1,000,000, the review step says so and Confirm is not offered (the server still decides, R1). **Confirm** sends the delta once (the button is disabled while pending, D9); the server applies it atomically (R1) and answers with the **new stock**. The page shows "Stock is now {n}." (`aria-live`), refreshes the number and the history, clears the form, and moves focus to the result line. If the real stock differed from the figure the confirm step showed (an order moved it), the result says so: "Stock is now {n}. It was {m} when you confirmed, not {before}." (D16).
11. **A delta that would take stock below 0 is refused**, nothing is written, and the message shows the stock **as it is now** (read fresh when refusing): "Can't remove {q}: only {n} in stock." One that would take it **above 1,000,000** is refused the same way: "Stock can't go above 1,000,000. It is {n} now." The current-stock figure on the page is updated to that value, and the form returns to its editable step with what was typed.
12. **Validation errors** (missing reason, quantity not a positive whole number, too large, Correction without note, note too long) show under the field and in a summary; nothing is written. All problems are reported at once.
13. **Low-stock threshold**: a separate small form, "Low-stock at", a whole number 0 to 1000 (0 turns "Low stock" off, as `getStockStatus` already treats it), with Save. It is an absolute setting, not a count, so it is set, not added (D6). Saving the current value says "No changes to save." and writes nothing.
14. **Movement history**: a table under the forms, newest first, 25 per page (`?page=`, parsed again, canonical redirect), showing when (Asia/Manila, `lib/orders/time.ts`), **Reason** (Order placed, Order released, Received, Damaged, Correction), **Change** (signed, `+5` / `−2`), **Order** (the order number as a link to `/admin/orders/{number}` for movements with an order, else "—"), **By** (staff name, or "System" when `actorId` is null), and **Note** (empty when none). Order releases triggered by staff (spec 044) show the staff name; releases by the system show "System". **Empty**: "No stock movements yet." (D7: the seed's starting stock is not a movement.) When the product has any movement, a line under the table (every page) says "Changes before {date} aren't recorded." — the Asia/Manila date of the product's **oldest** movement (the seed's starting stock and any change made before movements were written aren't in the log; D17). Not shown on the empty state.
15. **Demo** sees the list, the product page and the history, but: no control works, the **Note** column reads "Hidden in demo" for non-empty notes (free text, spec 040), and the order link is kept (an order number is not customer data). Staff names are shown (they are the shop's own staff, as on the Audit screen).
16. **After any successful write** the server calls `updateTag(PRODUCTS_TAG)` (stock and the Low stock label are on the storefront, the home page and the sitemap's data), after the commit, never inside it.

### What the storefront and the rest of Admin do

17. Product saves (spec 045) still never touch `stock` or `lowStockAt`; an adjustment or a threshold change does **not** change `Product.editVersion`, so an open product edit form is not made stale (spec 045 E18/E18b). Both write `updatedAt` like placement does.
18. An adjustment is allowed on a product of **any status** (receiving stock for a draft before publishing, correcting a retired product's count). Stock on a pre-order product is its allocation; the same rules apply.

## 3. Examples

Seed parts are used where they exist; quantities are invented. `E…` become tests.

| # | Input | Result |
| --- | --- | --- |
| E1 | Staff opens `/admin/inventory` | Nav shows Inventory; every product listed, lowest stock first; no Products nav item |
| E2 | Level `Low stock` | Only Active products with 1 ≤ stock ≤ `lowStockAt`; a draft at stock 2 (`lowStockAt` 5) is not listed |
| E3 | Level `Out of stock` | Active products at stock 0 |
| E4 | Level `Needs restocking` | Union of E2 and E3 |
| E5 | Search `r` (1 character) | Ignored: URL redirects to the list without `q`; no query runs |
| E6 | Search `rtx 5070` with category `gpu` | Only graphics cards matching, e.g. Gigabyte GeForce RTX 5070 Windforce OC SFF 12 GB |
| E7 | Product with stock 10 and `lowStockAt` 5. Staff: Received, quantity 20 | `stock` 30; movement `{ change: +20, reason: RECEIVED, actorId: staff, orderId: null, note: null }`; audit `product` / `stock-adjusted` with before `{ stock: 10 }`, after `{ stock: 30 }`, reason; `updateTag("products")` once; page says "Stock is now 30." |
| E8 | Same product, Damaged, quantity 3 | `stock` 27, movement `change: −3`, reason DAMAGED |
| E9 | Correction, Remove, quantity 2, note "Shelf count was 25" | `stock` 25, movement `change: −2`, reason CORRECTION, note stored on the movement and in the audit row |
| E10 | Correction, Add, quantity 1, no note | Refused: "Add a note explaining the correction."; nothing written; no audit row; no `updateTag` |
| E11 | Correction with note "  " (spaces) or "ab" | Refused as missing / too short; nothing written |
| E12 | Stock 4. Damaged, quantity 5 | Refused: "Can't remove 5: only 4 in stock."; stock 4, no movement, no audit row |
| E13 | Quantity `0`, `-3`, `2.5`, `abc`, blank, `1e3`, 1,000,001 | Each refused as an invalid quantity; nothing written |
| E14 | Hand-made POST with `delta: 0`, or Received with a negative delta, or Damaged with a positive delta | Refused by the server's schema; nothing written |
| E15 | Hand-made POST with `stock: 50` / "set to N" fields | Not part of the input: rejected as invalid (strict schema) or ignored; stock unchanged |
| E16 | Adding 10 to a product at stock 999,995 | Refused: "Stock can't go above 1,000,000. It is 999,995 now."; nothing written (D8); a +5 on the same product is accepted (exactly 1,000,000) |
| E17 | Stock 5, `placeOrder` of 5 and an adjustment of −3 (Damaged) run concurrently | Exactly one outcome per interleaving: either the order takes 5 and the adjustment is refused with "only 0 in stock", or the adjustment applies (stock 2) and the order is refused as changed. Stock is never negative; every applied change has its movement; stock equals start + Σ movement changes |
| E18 | Stock 5, `placeOrder` of 2 and an adjustment of +10 (Received) concurrently | Both apply, in either order; final stock 13; both movements exist; the adjustment never overwrote the order's decrement |
| E19 | Two staff each record Received +5 at the same moment | Both apply; stock +10 (a delta cannot lose an update) |
| E20 | Adjustment while a release (spec 033) or Admin cancel (spec 044) gives stock back | Both apply; stock correct; lock order is products by id, no deadlock |
| E21 | Staff sets Low-stock at to 8 | `lowStockAt` 8; audit `product` / `updated` with before `{ lowStockAt: 5 }`, after `{ lowStockAt: 8 }`; `updateTag` once; no `StockMovement`; `editVersion` unchanged; the product page's Low stock label follows after revalidation |
| E22 | Low-stock at `0` | Accepted; the "Low stock" level badge and filter never match this product; shoppers never see "Low stock" for it |
| E23 | Low-stock at `-1`, `1001`, `2.5`, blank | Refused; nothing written |
| E24 | Low-stock at saved with the same value | "No changes to save."; no audit row, no `updateTag` |
| E25 | Product page open in tab A (stock 10); an order takes 4 (stock 6); A records Received +5 | Applies on top of the real stock: stock 11 (not 15); the result says "Stock is now 11." |
| E26 | Product with an order reservation, a release, a Received and a Correction | History lists all four newest first; the two order rows link to their order numbers; the staff rows show the staff name; the system release shows "System"; signs are shown |
| E27 | Owner opens an Admin-cancelled order's product | The `ORDER_RELEASED` row shows the staff member's name (spec 044 writes `actorId`) |
| E28 | 30 movements | Page 1 has 25, page 2 has 5; `?page=3` redirects to the last page; `?page=abc` to page 1 |
| E29 | Product never ordered or adjusted | "No stock movements yet." |
| E30 | Demo opens list, product page and history | All render; form controls disabled; no Save buttons; note column reads "Hidden in demo" for rows with notes; RSC payload contains no raw note (`expectNoRawValues`) |
| E31 | Demo calls the adjust and threshold actions directly | Refused ("This account is read-only"); no table changed (the enumeration `.db` test covers both) |
| E32 | Foreign `Origin` on either action | 403; nothing read or written |
| E33 | A forced error after the movement insert, before the audit insert | The whole transaction rolls back: stock, movement and audit unchanged |
| E34 | Product that was retired (#113) or is a draft | Adjustment works; the list shows its status; it is excluded from the level filters (E2) |
| E35 | Unknown or malformed product id on the product page | 404, with no database read for a malformed id |
| E36 | Double click on Confirm | The button is disabled while pending, so one request is sent; a second deliberate adjustment is a second movement (D9) |
| E38 | Stock 12. Received, quantity 100, Review | Confirm step reads "Stock 12 → 112. Received +100."; no write yet; Back returns to the form with the values kept; Confirm writes (stock 112) |
| E39 | Review with a Damaged quantity above the loaded stock, or a Received that passes the ceiling | The review step says why and offers no Confirm; posted by hand, the server refuses (E12, E16) |
| E40 | Page loaded at stock 12; an order takes 2 (stock 10); the person confirms Received +100 | Stock 110; the result says "Stock is now 110. It was 10 when you confirmed, not 12." |
| E41 | Stock 999,000; two adjustments of +600 run at once | Exactly one applies (stock 999,600); the other is refused "Stock can't go above 1,000,000. It is 999,600 now."; stock never exceeds 1,000,000 and equals start + the one applied movement |
| E42 | Stock 5; two Damaged −3 run at once | Exactly one applies (stock 2); the other is refused "only 2 in stock" |
| E43 | Product with movements, the first on 4 Nov 2026 | Under the history: "Changes before 4 Nov 2026 aren't recorded."; absent for a product with none |
| E44 | A 500-character note, then 501 | 500 accepted on any staff reason; 501 refused; a Correction note of 2 characters refused |
| E45 | Insert (by SQL) a `RECEIVED` movement with a negative change, a `DAMAGED` with a positive one, an `ORDER_RESERVED` with a positive one, an `ORDER_RELEASED` with a negative one, a staff reason with no `actorId`, a staff reason with an `orderId`, an order reason with a note | Each rejected by a `CHECK` |
| E46 | Migration run on a database holding a `StockMovement` that breaks a sign rule (forced in the test) | The migration stops with a message naming the rule and the number of rows; nothing is changed |
| E37 | Network or database failure on submit | "Couldn't record the adjustment. Try again."; the form keeps what was typed; nothing is claimed as saved |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| `StockMovementReason` gains `RECEIVED`, `DAMAGED`, `CORRECTION` | Data §6; E7–E9, E45 |
| Adjustment is a signed delta, never "set to N" | B9, B10; E14, E15, E25, E38–E40; R1, R2, D2 |
| One conditional `UPDATE … WHERE stock + delta BETWEEN 0 AND 1000000 RETURNING`, a `StockMovement` with `actorId` and optional note, and an audit entry, one transaction | B10; E7–E9, E33, E41, E42, E45; R1, R3, R4, R16 |
| A delta that would go negative (or over the ceiling) is refused with the current stock shown | B11; E12, E16, E41, E42; R5, R16 |
| `CORRECTION` requires a note | B9, B12; E9–E11; R6 |
| `/admin/inventory` shows stock, threshold and a low-stock filter; `lowStockAt` is editable | B4–B6, B13; E1–E4, E21–E24; R7 |
| Each product has a movement history, with orders linked, ending with what isn't recorded | B14; E26–E29, E43; R9 |
| Writes invalidate `PRODUCTS_TAG` | B16; E7, E21; R10 |
| A test runs an adjustment against a concurrent `placeOrder`, and stock stays correct (two adjustments can't pass the ceiling together) | E17–E20, E41, E42; R1, R8 |
| Staff and Owner can adjust; Demo can view | B1, B15; E1, E30, E31; R11 |
| `adminAction`, audit in the same transaction, `can()` action in the table, demo-rejection enumeration | B1; E21, E31, E32, E33; R3, R11, D1 |
| No network call inside a database transaction | R12 |
| (DoD) empty, loading, error states; desktop 1024 px and up | B7, B14; E29, E37; R13 |

## 4. Rules and edge cases

- **R1 — Atomic delta.** The write is one statement of the form `UPDATE "Product" SET stock = stock + delta, updatedAt = now() WHERE id = … AND stock + delta BETWEEN 0 AND 1000000 RETURNING stock` (the ceiling is in the statement itself, R16). It never reads stock first and then writes a computed value. The row lock the `UPDATE` takes serialises it against `placeOrder`'s conditional decrement and against the release's and cancel's `stock + n` updates; under Postgres's default isolation a waiting statement re-checks its `WHERE` on the new row version, so each interleaving is decided by the real stock, and two adjustments cannot both pass the ceiling. (Postgres evaluates the `WHERE` on the committed row first and waits for the row lock only when that passes, so a removal that already fails against the committed stock is refused straight away, without waiting; one that passes waits, then is checked again on the new version. Both outcomes are correct: the statement is decided on committed stock, never on a figure read earlier.) No row returned means refused (R5).
- **R2 — Signs.** Allowed deltas by reason: Received `> 0`, Damaged `< 0`, Correction `≠ 0`; the order reasons keep their signs: `ORDER_RESERVED < 0`, `ORDER_RELEASED > 0`. Zero is never allowed. `|delta|` ≤ 1,000,000. The server checks the sign against the reason; the form derives the sign from the reason (and Direction), so a mismatch can only come from a hand-made request.
- **R3 — One transaction, in order.** Inside `adminTransaction`: the conditional update; the `StockMovement` (`change` = delta, `reason`, `orderId` null, `actorId` = the staff user, `note`); then `recordAudit(tx, …)` (`product` / `stock-adjusted`, before and after holding only `stock`, plus the reason and, if given, the note). A failure of any step rolls back all three. `updateTag(PRODUCTS_TAG)` runs after the commit.
- **R4 — Movement equals the change.** For every product, current stock equals its starting stock plus the sum of its movements' `change` **for stock changed after movements started being recorded**; the test asserts this on a product created with stock 0 inside the test (D7).
- **R5 — Refusal.** The update matching no row means either the product doesn't exist (404-style "Product not found.", nothing written) or the stock is too low; the action then reads the stock **as it is now** (a separate read after the failed statement) and returns it in the message. The product page's displayed stock is updated from it.
- **R6 — Notes.** Trimmed; stored as typed otherwise; empty after trimming is no note. Correction requires 3 to 500 characters, the other staff reasons allow up to 500. Migration `CHECK`s enforce: `note` is null or 1–500 characters; a `CORRECTION` movement has a note; an order movement (`ORDER_RESERVED`, `ORDER_RELEASED`) never has one. The note is free text: Demo sees "Hidden in demo", on the history and on the Audit screen (the audit masker already hides free-text keys; `note` must be among them).
- **R7 — Threshold.** `lowStockAt` is an integer 0 to 1000. Changing it writes only `lowStockAt` and `updatedAt`, one audit row (`product` / `updated`, before and after of that field), no `StockMovement`, no `editVersion` change. It uses a conditional statement on nothing but the product id; two staff saving different values is last-write-wins and both are audited (it is a setting, not a count; D6).
- **R8 — Concurrency test.** The `.db` test runs the adjustment and `placeOrder` truly concurrently (forced both ways using a lock held by the test, as `confirm-cod.db.test.ts` does) and asserts E17 to E20: stock never negative, equals the starting stock plus the applied movements, and no deadlock. Placement locks products in id order; an adjustment touches one product, so it can't invert the order.
- **R9 — History.** Read through `lib/admin/queries/inventory.ts` only (role-aware), joining the staff `User` for the name and the `Order` for its number, selecting **named fields only** (no order token hash, no customer fields). Newest first with an `id` tiebreak; 25 per page. The history includes every reason, including the existing `ORDER_RESERVED` and `ORDER_RELEASED`. The first-movement date for the footer line comes from the same query (the product's oldest `createdAt`), not from the current page.
- **R10 — Cache.** `updateTag(PRODUCTS_TAG)` after a committed adjustment or threshold change only; never for a refused, invalid, no-change or rolled-back request; never inside the transaction. (`updateTag` works in server actions only, as in spec 045.)
- **R11 — Guard.** Both actions are `adminAction("inventory.adjust", schema, handler)`: origin, session, `can()`, then the schema, then the handler. A denied request does no database read beyond the session, reads no body, writes nothing and is not audited. The enumeration tests find both new actions automatically; the `.db` version calls each as Demo and checks no table changed. Pages call `requireAdminAccess("inventory.view")`. The list and history queries take the role and re-check `inventory.view`.
- **R12 — No network in a transaction.** There is no gateway, email or HTTP call anywhere in this story. `guardTransactions` runs in the `.db` tests.
- **R13 — States.** Desktop first (1024 px and up). Every list has loading, empty and error states; a failed submit never leaves the form showing success.
- **R14 — Statuses.** Adjustments ignore product status (B18). The level filters and badges: the badge shows for any status; the filters count Active only (B5, D4).
- **R15 — Seed and reset.** `StockMovement` rows with `actorId` set are not cleared by `resetCatalog()` any differently from other movements (it truncates through `Product`); no seed change. `User` rows survive a reset, as before.
- **R16 — Stock ceiling.** The result of an adjustment must be between 0 and 1,000,000 (D8), checked **in the conditional update itself** (`stock + delta BETWEEN 0 AND 1000000`), never by a read before it, so two concurrent adjustments cannot pass it together (E41). A refusal re-reads the stock and says which side failed (too low, R5; too high, "Stock can't go above 1,000,000. It is {n} now."). No existing code path makes stock exceed the ceiling; if a row somehow did, any adjustment on it would be refused until it is brought under by other means.
- **R17 — Dashboard reuse.** The low-stock definition (1 ≤ stock ≤ `lowStockAt`, Active) lives in one pure function and one SQL fragment that [#120](https://github.com/romulojr-dev/pc-ecommerce/issues/120) reuses; this story's list query and the unit test pin it.

## 5. Messages and copy

All in `lib/admin/inventory-copy.ts` (new), shown as written.

| Where | String |
| --- | --- |
| Nav | "Inventory" |
| Page titles | "Inventory", "Stock for {name}" |
| Read-only banner | "This account is read-only." (spec 040's) |
| List filters | "Search by name, SKU or brand", "All categories", "Stock level", "All", "Low stock", "Out of stock", "Needs restocking", "Clear filters" |
| Level badges | "Out of stock", "Low stock" |
| List empty / filtered empty | "No products yet." / "No products match." |
| List error | "Couldn't load inventory. Try again." |
| Form headings | "Adjust stock", "Low-stock threshold", "Stock history" |
| Reasons | "Received", "Damaged", "Correction" (history also: "Order placed", "Order released") |
| Reason hints | "Received: stock arrived and is added." / "Damaged: stock lost or written off, removed." / "Correction: the count didn't match the shelf." |
| Fields | "Reason", "Quantity", "Direction" (options "Add", "Remove"), "Note (optional)", "Note (required for a correction)", "Low-stock at" |
| Low-stock hint | "Shoppers see “Low stock” at this many units or fewer. Use 0 to turn it off." |
| Preview | "Stock would be {n}. (Based on the stock when this page loaded.)" |
| Review / confirm | "Review adjustment", "Stock {before} → {after}. {Reason} {±q}.", "Confirm", "Recording…", "Back", "This would take stock below 0.", "This would take stock above 1,000,000." |
| Threshold submit | "Save threshold" |
| Success | "Stock is now {n}.", "Stock is now {n}. It was {m} when you confirmed, not {before}.", "Low-stock threshold saved." |
| No change | "No changes to save." |
| Refusal (too low) | "Can't remove {q}: only {n} in stock." |
| Refusal (too high) | "Stock can't go above 1,000,000. It is {n} now." |
| Field errors | "Choose a reason.", "Enter a whole number of 1 or more.", "Enter a smaller quantity.", "Choose add or remove.", "Add a note explaining the correction.", "Keep the note to 500 characters.", "Enter a whole number from 0 to 1000." |
| Summary | "Fix {n} problems to save." (spec 045's pattern) |
| Not found | "Product not found." |
| Failure | "Couldn't record the adjustment. Try again." / "Couldn't save the threshold. Try again." |
| History columns | "When", "Reason", "Change", "Order", "By", "Note" |
| History cells | "System" (no actor), "—" (no order / no note), "Hidden in demo" (Demo, non-empty note) |
| History empty | "No stock movements yet." |
| History footer | "Changes before {date} aren't recorded." |

## 6. Data and interfaces

**Schema (one migration).**
- `StockMovementReason` gains `RECEIVED`, `DAMAGED`, `CORRECTION` (`ALTER TYPE … ADD VALUE`; the new values aren't used in the same migration, so no transaction problem). The enum's comment in `schema.prisma` is updated.
- `StockMovement.note String?`. Migration `CHECK`s (Prisma can't express them): `note IS NULL OR char_length(note) BETWEEN 1 AND 500`; a `CORRECTION` has a note; `ORDER_RESERVED` and `ORDER_RELEASED` have no note; `change <> 0`; **signs for every reason**: `RECEIVED > 0`, `DAMAGED < 0`, `ORDER_RESERVED < 0`, `ORDER_RELEASED > 0` (`CORRECTION` either); **`RECEIVED`, `DAMAGED` and `CORRECTION` require `actorId IS NOT NULL` and `orderId IS NULL`**; order movements may have a null `actorId`. Before adding them the migration runs a check that raises an exception naming the rule and the number of offending rows if existing data breaks any (so it fails loudly and readably; `ADD CONSTRAINT` alone would fail too, but without the count).
- Optional index `StockMovement(productId, createdAt desc, id desc)` for the history (the existing `productId` index serves the filter; this one serves the ordered page). A `.db` plan test shows it is used.
- No change to `Product`, `editVersion`, or `AuditLog`. `AUDIT_ENTITIES` / `AUDIT_ACTIONS` already hold `product` and `stock-adjusted`.

**Pure modules (no DB; browser and server).**
- `lib/admin/inventory-input.ts`: Zod schemas for the adjustment (`productId`, `reason`, `quantity`, `direction` for Correction, `note`) and the threshold (`productId`, `lowStockAt`); both strict; `deltaOf(input)` gives the signed integer; `validateDelta(reason, delta)`.
- `lib/admin/inventory-params.ts`: `q`, `category`, `level`, `page` parse / serialize / canonical check.
- `lib/admin/inventory-view.ts`: `stockLevel({ stock, lowStockAt })` → `out` / `low` / `ok`, the labels, the preview, history row view-models (reason label, signed change, masked note).
- The low-stock predicate shared with #120 (R17).

**Server.**
- `lib/admin/inventory/adjust.ts`: `adjustStock(actor, input)` and `setLowStockAt(actor, input)` (the transactions above; return the new stock / the saved value, or a typed refusal with the current stock). They do the writes; the actions only forward.
- `app/admin/(shell)/inventory/actions.ts`: `adjustStockAction`, `setLowStockAtAction`, both `adminAction("inventory.adjust", …)`, calling `updateTag(PRODUCTS_TAG)` after a saved result.
- `lib/admin/queries/inventory.ts`: `listInventory(role, params)`, `getInventoryProduct(role, id)`, `listMovements(role, id, page)` (role-aware, named fields, notes masked for Demo).
- Routes: `app/admin/(shell)/inventory/(list)/page.tsx` with `loading.tsx` / `error.tsx`; `app/admin/(shell)/inventory/[id]/page.tsx` with no `loading.tsx`. `lib/admin/nav.ts` gains the `inventory` item (`inventory.view`). `components/admin/` gains the list, adjust form, threshold form and history components.
- Audit masker: `note` is already a free-text key (spec 040), so Demo sees it hidden; this story adds a test, not a change.
- `lib/admin/inventory-view.ts` also builds the confirm step's text.

## 7. Test plan

- **Unit (Vitest, pure):** `inventory-input` (E10–E16, E23: signs, bounds, correction note, strict schema, `deltaOf`); `inventory-params` (E5, E28 canonical and redirects); `inventory-view` (`stockLevel` boundaries: stock 0, 1, equal to `lowStockAt`, `lowStockAt` 0; preview; history labels; Demo note masking); the shared low-stock predicate; `permissions.test.ts` unchanged and still green; nav shows Inventory for all roles.
- **Integration (`.db`):** the concurrency file also holds E41 and E42 (two adjustments at once against the ceiling and against zero). `adjust.db.test.ts` (E7–E9, E12, E16, E21, E22, E24, E25, E33: stock, movement, audit, rollback, refusal shows current stock, `editVersion` unchanged, no row written on refusal); **concurrency** `adjust-concurrency.db.test.ts` (E17–E20, R8: adjustment against a real `placeOrder`, against a release and a cancel, both interleavings forced, invariant stock = start + Σ changes); schema CHECKs (R2, R6, §6; E45) and the migration's loud failure (E46) in `schema.db.test.ts`; queries (`inventory.db.test.ts`: filters E2–E6, order, history with order links and actors E26–E29, Demo masking E30, named-fields-only); `guard-enumeration.db.test.ts` finds and exercises both actions as Demo (E31); `demo-inventory-pages.db.test.ts` renders the three surfaces as Demo with `expectNoRawValues`; `updateTag` called once on success and not on any refusal (spy). `guardTransactions` on all of them (R12).
- **E2E (Playwright, the review and confirm step (E38) included, `e2e/admin-inventory.spec.ts`, fixtures in `e2e/admin-inventory-fixtures.ts`):** Staff records Received +N and sees "Stock is now…" and the history row; a Damaged refusal shows current stock (E12); Correction without a note is refused (E10); threshold edit changes the level badge; Demo sees everything disabled and "Hidden in demo" (E30); filters (E2–E4). A throwaway product with the SKU prefix `E2E-INV-` and its movements are removed after. Stock changes go through `e2e/stock.ts` (production guard).
- Not tested in E2E: the concurrency cases (integration), foreign origin (integration, E32).

## 8. Out of scope

- Bulk adjustment, CSV, purchase orders, suppliers, stocktakes (issue; Phase 3 / CSV in the PRD).
- **Restocking on refund**: a refund never changes stock. The owner records the restock by hand as a **Correction** with a note naming the order (for example "Returned from PCS-ABCD2345"), not as Received (D15; refunds are [#110](https://github.com/romulojr-dev/pc-ecommerce/issues/110), whose out-of-scope line says the same).
- Editing `stock` from the product form (spec 045: never) and any "set stock to N".
- Per-movement undo or edit: movements are immutable; a mistake is fixed with another adjustment.
- A running "stock after" column and a starting-stock backfill for seeded products (D7); the history says plainly what isn't recorded instead.
- The dashboard's low-stock list ([#120](https://github.com/romulojr-dev/pc-ecommerce/issues/120); this story provides the shared definition, R17), low-stock emails or notifications, per-branch stock, reservations beyond what placement does.
- Customer-facing changes: the storefront's "Low stock" label already follows `lowStockAt`.
- Product publish / retire ([#113](https://github.com/romulojr-dev/pc-ecommerce/issues/113)); this story only has to work whatever the status is.

## 9. Decisions

- **D1 — No new permission action; both mutations use `inventory.adjust`.** The table already has `inventory.view` (everyone) and `inventory.adjust` (Owner, Staff) and matches the issue. Rejected: a separate `inventory.threshold` action (more table rows for the same two roles; the issue says Staff and Owner can adjust).
- **D2 — The wire format is a signed delta; the form takes a positive quantity plus the reason (and a direction for Correction).** Removes sign mistakes (typing a minus for Received) while keeping the stored and transported value a delta. Rejected: one signed input field for all reasons (easy to get the sign wrong), and "set to N" (overwrites a concurrent order, forbidden by the issue).
- **D3 — The list shows raw shelf counts and its own level badge, not `getStockStatus`.** Inventory is about units on the shelf; pre-order dates would hide a low count. Rejected: reusing the shopper label (a pre-order with 2 units would read "Pre-order", hiding that it's nearly out).
- **D4 — Level filters count Active products only.** A draft or retired product at 0 isn't "needs restocking"; it would drown the list in noise and the dashboard (#120) would show the same noise. Rejected: counting every status (simple, but wrong for the "what needs attention" purpose).
- **D5 — Default order is lowest stock first.** The common task is finding what is short. Rejected: alphabetical (the owner would scroll to find the problems).
- **D6 — Threshold is a set value in its own audited form, not a movement and not part of the product form.** It is a setting, so last-write-wins is correct and a delta makes no sense; keeping it out of spec 045's form keeps that spec's "no stock fields" rule and means Staff (no Products screen) can edit it. Rejected: adding `lowStockAt` to the product form (Staff couldn't use it, and it would couple to `editVersion`).
- **D7 — No backfill of starting stock, and no "stock after" column.** Seeded and pre-existing stock was set without movements, so a backward running total would be wrong. The history is a log of changes since movements were recorded. Rejected: a one-off "opening balance" migration movement (invents history; touches every row).
- **D8 — Stock ceiling of 1,000,000 and a per-adjustment limit of 1,000,000.** Catches a typo (an extra zero) before it hits the shop's counts, keeps the `Int` column far from overflow, and, being in the statement, holds under concurrency (E41). Rejected: no ceiling (a typo of 10,000,000 would be accepted and ruin the list), and a lower ceiling (arbitrary for a small shop).
- **D9 — No idempotency key; a confirm step and a pending-disabled button instead.** A deliberate resubmit is a second adjustment; the confirm step shows before → after so a wrong quantity is seen, the button is disabled while pending, and the history shows every entry, so a double is visible and corrected with another adjustment. Rejected: a per-form request id with a unique column (a schema change and more states for a low-risk, owner-visible case). See Open question 1.
- **D10 — The note lives on `StockMovement.note` (a new column) and is copied into the audit row.** The issue puts the note on the movement; the audit row keeps the full who/what/why in one place, as spec 044 does for cancel notes. Rejected: audit-only (the history on the product page would need the audit table).
- **D11 — Adjustments are allowed on any product status.** Receiving stock before publishing is a real step in opening a product. Rejected: Active only (blocks the obvious "receive, then publish" order).
- **D12 — `OPENING` stock for a new product stays 0 and rises only through Received.** Matches spec 045 ("Stock changes through Inventory"); the first Received is that product's first movement. Rejected: an initial-stock field on create.
- **D13 — Staff names are shown to Demo unmasked in the history.** They are the shop's own staff, as on the Audit screen (spec 040). Rejected: masking them (loses the traceability the story is for).
- **D15 — A refund's restock is a Correction with a note naming the order.** Received means stock that arrived from a supplier; a returned part is a count correction, and the note carries the order for traceability (the Correction rule makes the note required). Rejected: Received (mixes supplier receipts with returns), and a fourth reason (the issue lists three).
- **D16 — The confirm step shows before → after from the loaded stock, and the result says when the real stock differed.** Honest about a moved figure without blocking the person. Rejected: re-reading stock on Review (a round trip that still races with orders), and refusing when the figure moved (an order is not a reason to refuse a delta).
- **D17 — The history ends with what isn't recorded.** Seeded and earlier stock has no movements (D7); saying so with the first movement's date stops the log being read as complete. Rejected: a backfilled "opening balance" row.
- **D18 — The category filter offers the eight builder categories**, like the product list, not "any category that has products". Non-builder categories are Phase 2 and hold no products yet, and it keeps the params module pure. Rejected: reading categories from the database for the filter (a query per page for the same list today).
- **D14 — Enum values and check constraints in one migration, with the extra sign `CHECK`s.** The database then holds the invariants the schema cannot (CORRECTION has a note, signs match reasons), as the repo does for orders. Rejected: validating only in code (a future writer could bypass it).

## 10. Open questions

All settled at review:

1. **Double-submit:** no idempotency key; the confirm step and a pending-disabled button are the protection (D9).
2. **Stock ceiling:** 1,000,000, enforced in the conditional `UPDATE` (D8, R16).
3. **Level filters:** count Active products only; the list shows every status (D4, B4–B5).
4. **Cancel reason in the history:** none; the order link is enough.
5. **Extra reason:** none; a refund's restock is a Correction with a note naming the order (D15).
