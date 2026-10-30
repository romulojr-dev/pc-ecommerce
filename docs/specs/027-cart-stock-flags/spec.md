# 027 — Stock flags on the cart page

Status: **Approved** (review changes applied) · Issue: #63 (Sprint 5 stretch, Checkout epic; depends on #60 and #62, both merged) · PRD refs: FR-13 (partial: flags on the cart page; the re-check at checkout is Sprint 6), FR-12 (single items and build groups)

## 1. Summary

This story makes `/cart` say which lines can't be bought as they are. A line whose product is retired, out of stock or on pre-order is flagged "No longer sold", "Out of stock" or "Pre-order only", and all three are treated the same way (counted in the banner, can't be raised, Remove offered). A product whose total across the single line and every build group is more than its stock reads "Only N in stock, M in your cart" on every line that holds it. A single line gets a one-click "Set to …" that brings the total down to stock, a build group gets the flag only (plus the Remove it already has), and a banner counts the flagged lines. The flags are computed fresh on every render of `/cart`, by one pure function over the cart's lines and the products' stock. Nothing is stored, and checkout stays disabled; Sprint 6 re-checks at checkout.

## 2. Behavior

### What is flagged

1. A product in the cart is in one of these states, decided per **product**, not per line, and shown on **every line that holds it** (the single line and each build group):
   - **Unavailable**, one rule with three labels. It is exactly the test that refuses an add (`isSold` in spec 025: active and `isBuyable`), so a line is unavailable exactly when the shopper could not add the product now. The label is the first that applies, in this order (the order of `getStockStatus`):
     - **No longer sold:** the product is not active (retired).
     - **Out of stock:** the product is active and has no stock.
     - **Pre-order only:** the product is active, has stock, and its ship date is still in the future.
   - **Over stock:** the product is available, but its **total** (the single line's quantity plus its quantity in every build group; a memory kit × 2 counts 2) is **more than its stock**.
   - **Clear:** neither.
2. **Unavailable wins over over stock:** a product with stock 0 reads "Out of stock", never "Only 0 in stock".
3. A **flagged line** is a single line whose product is flagged, or a build group with at least one flagged part. A group counts once, however many parts are flagged. The three unavailable labels count the same (D1).
4. Flags are a read. Nothing is written when `/cart` is shown, and the cart's contents, the header count and the subtotal's rules don't change (D9).

### A single line

5. A flagged single line shows its **flag** (icon and text, never colour alone):
   - **Unavailable lines** show their label ("No longer sold", "Out of stock", "Pre-order only") with the same destructive style, and **Remove** as the action. The plus of the stepper is disabled, so a line can't be raised only to be refused (D10).
     - *No longer sold* is the label spec 025 Behavior 24 already shows, with its note "Not included in the subtotal.", no link, price or stepper. Nothing changes there.
     - *Out of stock* and *Pre-order only* keep the line's price, line total and stepper (minus still works) and show the label **in place of the stock status line**, which would say the same thing. A pre-order line also shows "Ships {date}" under it (the date as on the product page), since the stock line's date would be gone.
   - **Over stock:** "Only {stock} in stock, {total} in your cart", under the stock status.
6. **Set to …** (over stock only): next to the flag, a button "Set to {n}", where n = stock − (the product's quantity in every other line). One click sends that quantity for the line, using the existing set-quantity action (lowering always works, spec 025 Rules › Stock cap). The line then holds n, and the product's total equals its stock, so the flag clears on **every** line that had it.
7. **No "Set to" when it can't help:** it is shown only when 1 ≤ n < the line's quantity. When the build groups already hold all of the stock (n is 0 or less), the flag stays without the button and **Remove** is the way out (E6, E7).
8. While "Set to" runs, the line is busy as for any change (stepper and buttons disabled, `aria-busy`). On success the page announces "Set {name} to {n}." in the page status region and focus moves to the line's quantity field (the button is gone). The new flags, banner, subtotal and header count come from the refreshed page.
9. A failed "Set to" shows "Couldn't update your cart. Try again." (`role="alert"`) on the line and changes nothing. A line removed in another tab → "That item is no longer in your cart." and the page refreshes (spec 025 Behavior 23).

### A build group

10. A group with flagged parts shows, under its label and status line and **also when collapsed**:
    - one flagged part: "{part name}: {flag text}", e.g. "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart" or "AMD Ryzen 5 7600: Out of stock";
    - several flagged parts: "{n} parts need attention".
    The flag has an icon. The group's total, status ("OK", "Warnings", "Errors", "Incomplete") and checks don't change.
11. **Expanded** (Show parts), every flagged part's row shows its own flag text. For an unavailable part the label takes the place of its stock status line (spec 026 already shows "No longer sold" for a retired part and "Out of stock" for an out-of-stock one, so only "Pre-order only" is new there); an over-stock part keeps its stock status and gets the over-stock text under it. A part whose row reads "No longer sold" because it is no longer a valid builder part is flagged too, even if its product is still active.
12. A group has **no "Set to"**: it can't change quantity (spec 026 Behavior 15). Its way out is **Remove** (whole group, unchanged), or, when the flagged product is also a single line, "Set to" on that line.
13. A group stays collapsed by default, flagged or not (D10 of spec 026).

### The banner

14. When at least one line is flagged, a banner sits above the lines: "{n} line needs attention. Fix or remove it before you check out." / "{n} lines need attention. Fix or remove them before you check out." n is the number of flagged lines (Behavior 3). It looks the same whatever the flags are: there is one severity. With no flagged line there is no banner and the page reads as it does today.
15. The banner is `aria-live="polite"`, not `role="status"` (the page keeps its one status region, spec 025 Behavior 21), so a change after "Set to" or Remove is announced, and the banner present at load isn't. It disappears when the last flag clears.

### States

16. **Loading:** unchanged (`loading.tsx`). **Empty cart:** unchanged, no banner. **Database error:** the app's standard error page.
17. **Stale page:** flags are as fresh as the render. Stock that changes while the page is open shows at the next render (any cart action refreshes it, or a reload). There is no polling (D13).
18. **Checkout** stays disabled with "Checkout is coming soon." The banner text anticipates it; blocking checkout on flagged lines is Sprint 6. *Changed by spec 029 (#77): Checkout is a link, and is disabled with visible text only while a line is flagged or a group has errors.*

## 3. Examples

Seed values: **AMD Ryzen 5 7600** ₱11,495.00 [12]; **Samsung 990 PRO 1TB NVMe SSD** [30]; **Thermalright Peerless Assassin 120 SE** [20], in both builds; **Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30** ₱6,495.00 [25]; **ASUS Dual GeForce RTX 4060 OC Edition 8GB** [10]; **Lian Li LANCOOL 216 Black** [7]; **MSI MAG A650BN 650W** [20]. **Build A** and **Build B** as in spec 026 (Build A ₱69,060.00, 8 parts; both hold the Peerless Assassin). "A group" means a `Build` snapshot in the cart; the tests insert `CartItem`s directly. **"[n]" sets the product's stock to n after the lines are in the cart**, the way stock really drops under a cart (an add would be capped).

### Flags (pure logic and `/cart`)

| # | Cart (stock after) | Expected |
| --- | --- | --- |
| E1 | [2] 7600 single × 2 + a Build A group (7600 × 1) (issue example 1) | Single: "Only 2 in stock, 3 in your cart", **Set to 1**. Group: "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart", no Set to. Banner "2 lines need attention. Fix or remove them before you check out." Subtotal (3 items) ₱92,050.00 (unchanged, D9) |
| E2 | E1, then **Set to 1** | Single × 1. Total 2 = stock: both flags and the banner gone. "Set AMD Ryzen 5 7600 to 1." Header "Cart, 2 items". Subtotal (2 items) ₱80,555.00. Focus on the single line's quantity field |
| E3 | [0] a Build A group, no single (issue example 2) | Group: "AMD Ryzen 5 7600: Out of stock". Banner "1 line needs attention. Fix or remove it before you check out." Expanded: the 7600 row shows "Out of stock"; the group total and status are unchanged |
| E4 | [5] 7600 single × 3 + a group (7600 × 1) (issue example 3) | No flag, no banner |
| E5 | [2] 7600 single × 3, no group | "Only 2 in stock, 3 in your cart", **Set to 2** |
| E6 | [1] 7600 single × 1 + a group (7600 × 1) | Both lines "Only 1 in stock, 2 in your cart". No Set to anywhere (n = 0). Remove is the way out |
| E7 | [1] Peerless Assassin; a Build A group and a Build B group, no single | Both groups "Thermalright Peerless Assassin 120 SE: Only 1 in stock, 2 in your cart". Banner "2 lines need attention…". No Set to. Remove either group and the other's flag clears |
| E8 | [3] Vengeance single × 2 + a group of Build A with the kit × 2 (group total ₱75,555.00) | Single: "Only 3 in stock, 4 in your cart", **Set to 1** (3 − 2). Group: names the Vengeance with the same text. After Set to 1: total 3, flags gone |
| E9 | [3] 7600 single × 2 + a group (7600 × 1) | Total 3 = stock: no flag (the boundary) |
| E10 | [0] 7600 single × 2 | "Out of stock" (the flag, in place of the stock status line); price and line total as today; plus disabled; Remove. Banner "1 line needs attention…" |
| E11 | 7600 single × 2, then the product set to pre-order (stock 12, ships next month) | "Pre-order only" in place of the stock status line, and "Ships {date}" under it; plus disabled; Remove. Banner "1 line…" |
| E12 | 7600 single × 2, then the product set to draft | "No longer sold", "Not included in the subtotal.", no link, price or stepper; Remove only (spec 025 E31, unchanged). Banner "1 line…". The subtotal leaves it out as today |
| E13 | [0] 7600 single × 1 + a group (7600 × 1) | Both "Out of stock" (never "Only 0 in stock"). The single has no Set to |
| E14 | A Build A group, then [0] RTX 4060 and [0] 7600 | Group: "2 parts need attention". Expanded: both rows "Out of stock". Banner "1 line…". Total ₱69,060.00 and status "OK" unchanged (spec 026 E38) |
| E15 | A Build A group, then the LANCOOL 216 set to draft | Group: "Lian Li LANCOOL 216 Black: No longer sold". Expanded: its row "No longer sold" (spec 026 E37, unchanged). Total ₱63,265.00, status "Incomplete" unchanged. Banner "1 line…" |
| E16 | A Build A group + 990 PRO single × 1; then [0] RTX 4060 and [1] 990 PRO | Group: "2 parts need attention"; expanded: GPU "Out of stock", 990 PRO "Only 1 in stock, 2 in your cart". The single 990 PRO: the same over-stock text, no Set to |
| E17 | [1] 7600 single × 2 + a Build A group (7600 × 1) + AMD Ryzen 7 9800X3D single × 1 (clean) | Banner "2 lines need attention…": the 7600 single and the group, the group once however many parts it has. The 9800X3D line carries no flag. No Set to on the 7600 (n = 0) |
| E18 | Any cart with no flagged line | No banner, no flag text; the page is as before this story |
| E19 | An empty cart | The empty state, no banner |
| E20 | A Build A group with the 7600 retired (draft), the RTX 4060 [0] and the Peerless Assassin on pre-order (three reasons in one group), plus a 990 PRO single × 1 (clean) | Group: "3 parts need attention" with the three labels in the expanded rows ("No longer sold", "Out of stock", "Pre-order only"). Banner "1 line needs attention…": all three share one severity |

### Acting on flags

| # | Cart | Action | Expected |
| --- | --- | --- | --- |
| E21 | E1 | "Set to 1" fails (server error) | "Couldn't update your cart. Try again." (alert) on the line; flags unchanged |
| E22 | E1, line removed in another tab | "Set to 1" | "That item is no longer in your cart."; the page refreshes |
| E23 | E1 | Remove the single line | Total 1 ≤ 2: the group's flag and the banner clear. "Removed AMD Ryzen 5 7600 from your cart." |
| E24 | E3 | Remove the group | Empty state; "Removed Custom PC build from your cart." |
| E25 | E8 | Click "Set to 1" twice quickly | One request (the line is busy); the cart ends at × 1 |

### E2E (one journey, stock lowered in the database)

| # | Steps | Expected |
| --- | --- | --- |
| E26 | Fresh context. Add MSI MAG A650BN 650W × 2 from its product page; save a build of that PSU alone and Add build to cart. Lower its stock to 2 in the database. Open `/cart` | Banner "2 lines need attention…". Single: "Only 2 in stock, 3 in your cart" with **Set to 1**. Group: "MSI MAG A650BN 650W: Only 2 in stock, 3 in your cart" |
| E27 | Click **Set to 1** | Flags and banner gone; "Cart, 2 items" in the header without a page load |
| E28 | Lower its stock to 0. Reload `/cart` | Both lines "Out of stock"; banner "2 lines need attention…". Remove both → empty state. The stock is restored afterwards, pass or fail |

## 4. Rules and edge cases

### The flag rules

- **held(p)** = Σ quantity of product p over every `CartItem` of the cart (the single line and each group's line). This is the same total the stock cap uses (spec 025).
- **State of p**, in order: not active → *No longer sold*; else stock 0 → *Out of stock*; else on pre-order today (`manilaToday`) → *Pre-order only*; else held(p) > stock(p) → *Over stock* (N = stock, M = held); else clear. The first three are the add test (`isSold`), so they never disagree with the product page. Stock above 99 can't be crossed from the shop (the cap holds at `min(stock, 99)`), so the comparison is with stock.
- **Set to n:** n = stock − (held − the line's quantity). Shown only for an over-stock **single** line with 1 ≤ n < its quantity. Since the line is over stock, n is always below its quantity unless the data changed after the render.
- **Group part:** flagged when its product is flagged, or when the group shows it as a retired row (spec 026 Behavior 16).
- **Flagged lines** = single lines with a flag + groups with at least one flagged part.
- A product in two groups and nowhere else is flagged on both when their sum is over stock (E7).
- The over-stock text names the **stock** and the **total of the whole cart**, not the line's own quantity.

### Order and layout

- Lines keep their order (oldest first). Flagged lines are not moved to the top.
- On a single line the flag sits where the stock status line is (unavailable) or after it (over stock); on a group, after the status line. Flag text is plain text in reading order, not a tooltip.

### Concurrency and staleness

- "Set to" is the existing locked write with an **absolute** quantity, so repeating it is harmless, and a second tab that already removed the line gets `not-found` (E22).
- If stock changed between the render and the click, the server's cap logic still decides: a set never raises a line above the cap and lowering always works. The refreshed page shows the true state.
- Two flagged products fixed one after another each refresh the page; the banner follows.

### What does not change

- `cartCount` and the header count; the subtotal and group totals (D9); the product page's caps and notes; Add build to cart's checks; the stock cap; the checkout button.
- Specs 025 and 026, their examples and their tests: "No longer sold" stays as it is, and a clear line's stock status line is unchanged.
- No schema change and no new server action.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Flag, unavailable (single line, group part row, group flag) | "No longer sold" · "Out of stock" · "Pre-order only" |
| Pre-order line, under its flag | "Ships {date}" |
| Flag, over stock | "Only {stock} in stock, {total} in your cart" |
| Group flag, one part | "{part name}: {flag text}" |
| Group flag, several | "{n} parts need attention" |
| Button | "Set to {n}" (accessible name "Set {product name} to {n}") |
| Page status after Set to | "Set {product name} to {n}." |
| Banner | "{n} line needs attention. Fix or remove it before you check out." / "{n} lines need attention. Fix or remove them before you check out." |
| Errors | Reused: "Couldn't update your cart. Try again." · "That item is no longer in your cart." |

## 6. Data and interfaces

### Pure (`lib/cart/`, no database)

- A flag function: lines (an entry key, a product id, a quantity; each entry is a single line or a group) plus, per product, whether it is active, its stock status today and its stock → per product its state (clear, one of the three unavailable labels, or over stock with stock and total), per single line its `setTo` (or none), per entry whether it is flagged and which parts, and the count of flagged entries. Unit-tested from lines and stock, as the issue asks.
- Copy helpers: the flag text, the group flag text, the banner text, the Set to label and status text.

### Server

- `getCartView` reads the products it already reads (status, stock, `lowStockAt`, `preorderShipsOn`) and calls the pure function over the cart's `CartItem` rows. It adds to the view: each single line's `flag` and `setTo`; each group's flagged parts (product id, name, flag); and the count of flagged entries for the banner. The stepper's `max` for an unavailable line is its own quantity.
- `loadGroups` is unchanged in what it reads; its rows are matched to flags by product id.

### Actions and client

- No new action: "Set to" calls `setCartQuantityAction({ lineId, quantity: n })`.
- Components: `CartLine` and `CartGroup` render the flags; `CartBody` renders the banner; `CartContent` handles Set to (busy, status text, focus on the quantity field, error) like a quantity change.

### E2E helper (`e2e/`, test tooling)

- One function that sets a product's stock by name or id, through `DATABASE_URL` (the database the server uses; tooling reads `process.env` directly, like `playwright.config.ts`). It refuses to run when the host is `PRODUCTION_DATABASE_HOST` (the check in `lib/reset-guard.ts`), and the spec sets a known stock first and restores it in a `finally` (D12).

### Docs

- CLAUDE.md, the cart bullet: the last sentence ("A retired product stays as a 'No longer sold' line…; flags and fixes … are #63") becomes the flag rules above, and notes the E2E helper and the tracking issue #74.
- Specs 025, 026 and 022: no change (D1). README if it describes the cart or E2E.

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | The flag function: the three issue examples, the boundary, the three unavailable labels and their order, unavailable beats over stock, n and when Set to is absent, several groups, a kit × 2, banner count (a group counts once), a clean cart | E1–E9, E13, E16–E20 |
| Unit | Copy: flag texts, group flag text (one / several), banner (1 / n), Set to label | Messages |
| Unit (render) | `CartBody` with flags: single (over stock with and without Set to; the three unavailable variants, plus disabled), group collapsed (one part, several) and expanded, the banner and its absence | E1, E3, E6, E10–E18, E20 |
| Integration (`*.db.test.ts`) | `getCartView` after stock drops: flags per entry, `setTo`, flagged count; retired, draft, pre-order and out-of-stock products; groups sharing a product; reading creates nothing; "Set to" through `setCartQuantity` clears both flags | E1–E8, E10–E16, E20 |
| E2E (Playwright) | One journey with stock lowered in the database: flags, banner, Set to, then stock 0 and remove | E26–E28 |

The E2E uses a part no other spec uses (MSI MAG A650BN 650W; the plan checks this by searching `e2e/`), sets its stock to a known value before it starts so a crashed earlier run can't leave it wrong, and restores the original in a `finally`.

## 8. Out of scope

| What | Owner |
| --- | --- |
| Re-checking stock at checkout and blocking checkout on flagged lines (and on groups with errors) | Sprint 6 (FR-13) |
| Stock reservation | Sprint 6 (FR-24) |
| Running local E2E against the Docker test Postgres, so Playwright never writes to the Neon dev branch | #74 (tech-debt, Backlog) |
| Changing a group's parts or quantity from the cart; a "swap this part" fix | Not in the MVP |
| Removing flagged lines automatically | Not scheduled (reads don't write, spec 025 D5) |
| Live updates while the page is open (polling, refetch on focus) | Not scheduled (D13) |
| Flags in the header badge, on the product page or in the builder | Not scheduled |
| Rate limiting the cart actions | #64 |
| Merging the guest cart on login | #65 |

## 9. Decisions

- **D1 — Three labels, one rule (review decision).** The issue says "No longer available" for out of stock, pre-order or inactive. The review kept the three causes apart: "No longer sold" (inactive), "Out of stock" and "Pre-order only", because each tells the shopper something different and the first two are already what specs 025 and 026 show. The labels differ; the treatment doesn't: all three count in the banner at one severity, can't be raised (D10) and offer Remove. So specs 025 and 026, their examples and their tests don't change. Where the flag repeats the stock status line, it takes its place (Behavior 5). This departs from the issue's wording on purpose; the acceptance-criteria table says so. *Rejected:* one merged label "No longer available" (it would change specs 025 and 026 and their tests, and hide why the line can't be bought).
- **D2 — Flags are computed on the server in `getCartView`, per render.** Stock and status are read fresh there, and a pure function keeps the logic testable. *Rejected:* computing in the browser (it would need stock numbers sent to the client and could disagree with the server).
- **D3 — A flag belongs to the product and appears on every line that holds it.** The issue asks for "every affected line"; it also means a shopper sees why a group is flagged when the cause is a single line. *Rejected:* flagging only the line that was added last.
- **D4 — The unavailable labels are the add test.** The cart and the product page can't disagree about what can be bought. A pre-order is unavailable (the issue says so), and keeps its ship date. *Rejected:* treating a pre-order as available to keep.
- **D5 — "Set to" reuses `setCartQuantity`.** Lowering always works (spec 025), so no new action or rule is needed. *Rejected:* a dedicated "fix stock" action.
- **D6 — No "Set to" when the groups hold all the stock.** A button that can only reach 0 would be a hidden Remove. The flag stays and Remove is the fix. *Rejected:* "Set to 0", or removing the single line silently.
- **D7 — A group's flag is visible when collapsed; one part is named, several are counted.** The issue wants the group flagged and the expanded group to name the parts. *Rejected:* auto-expanding flagged groups (an 8-part build would push the rest of the cart down); listing every part in the collapsed state.
- **D8 — The banner counts lines, and a group is one line.** Same unit as the issue ("1 line needs attention") and as the header's count of a group. *Rejected:* counting parts.
- **D9 — Totals don't change (review decision).** The subtotal and group totals keep the rules of specs 025 and 026: a retired single line and a retired group part leave the total; out-of-stock, pre-order and over-stock quantities stay. Reasons: group totals come from `sharedBuildView`, which `/builds/[slug]` shares, so one rule stays one rule; the banner already tells the shopper to fix or remove; and Sprint 6 recomputes at checkout from what can be bought, so a number here is not what is charged. *Rejected:* a subtotal of buyable units only (it would make a group total differ from the shared page's, and change spec 026's totals and tests).
- **D10 — An unavailable line can't be raised.** The plus is disabled, so a pre-order line can't reach a refusal message. *Rejected:* leaving it enabled and showing "This part can't be bought right now."
- **D11 — The banner is `aria-live="polite"`, not `role="status"`.** The page's single status role stays the removal region (spec 025 Behavior 21).
- **D12 — The E2E changes stock in the database the app server uses (review decision).** There is no way to reach this state through the UI, because every add is capped. The helper refuses the production host, uses a part no other spec uses, sets a known stock first and restores it in a `finally`. Locally that database is the Neon dev branch, which is a known risk (`pnpm db:seed` keeps existing stock, so a crashed run would leave it changed); #74 moves local E2E onto the Docker test Postgres. *Rejected:* running this test only in CI (the logic would go unchecked locally).
- **D13 — Flags aren't live.** They are as fresh as the render; every cart action refreshes. Polling for a rare case is not worth the requests (same reasoning as spec 025 D8).

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| Out of stock, pre-order or inactive: "No longer available", with Remove. *Changed in review (D1): the three labels "No longer sold", "Out of stock", "Pre-order only", one rule, Remove offered on all* | Behavior 1, 3, 5, 14; Rules › flag rules; E3, E10–E14, E20, D1, D4 |
| Total across single + every group over stock: "Only N in stock, M in your cart" on every affected line; single gets "Set to …" to stock; group gets only the flag, plus Remove | Behavior 1, 5–7, 10, 12; Rules; E1, E2, E5–E8, E16 |
| A group is flagged when any part is affected, and the expanded group names the parts | Behavior 10–11; E1, E3, E14–E16, E20 |
| Summary banner counts the flagged lines | Behavior 3, 14–15; E1, E3, E7, E10, E17, D8 |
| Example [2] single × 2 + group 1 → both flagged; "Set to 1" clears both | E1, E2 |
| Example [0] group with 1 → flagged ("Out of stock" after D1), names the part, banner "1 line" | E3 |
| Example [5] single × 3 + group 1 → no flag | E4 (and the boundary E9) |
| Unit tests for the flag logic (pure, lines + stock) | Test plan, Unit; §6 Pure |
| One E2E with stock lowered in the test database | E26–E28, D12, #74 |
| Empty, loading and error states | Behavior 16; E19, E21, E22 |

## 10. Open questions

None. The review settled the three points:

1. Labels: "No longer sold", "Out of stock" and "Pre-order only", sharing one rule; specs 025 and 026 unchanged (D1).
2. The E2E helper as proposed, with a tech-debt issue (#74) to move local E2E to the Docker Postgres (D12).
3. Subtotal unchanged, with the reasons recorded (D9).
