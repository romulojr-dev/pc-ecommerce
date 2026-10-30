# 026 — Add build to cart

Status: **Approved** (review changes applied) · Issue: #62 (Sprint 5, Checkout epic; depends on #59 and #60, both merged) · PRD refs: FR-12 (a build as one grouped line); PC Builder › Flow (step 6), › Compatibility rules (errors block "Add build to cart", warnings need acknowledgment); Testing strategy (E2E "build → fix conflict → add to cart")

## 1. Summary

This story turns on **Add build to cart** on `/builder`. One click sends the build's items to the server, which loads the parts and runs the compatibility engine itself. It refuses a build with errors, with parts that can't be bought, or that would push a product past its stock, and asks the shopper to confirm the warnings it finds. A build that passes is stored as a `Build` snapshot (spec 022's content-addressed row) and added as one group of `CartItem`s. `/cart` shows each group as one line ("Custom PC build · 8 parts") that expands to list its parts. It builds on spec 025's cart tables, stock cap and count rule (a group counts as 1).

## 2. Behavior

### The button on `/builder`

1. The summary's **Add build to cart** button loses its "coming soon" line. It is enabled only when the summary is ready, the build has at least one part, the build has no **errors** (`buildStatus` of the client's `checkBuild`), and every part is **buyable** (`isBuyable`, spec 020 D7). The client's verdict only drives the button; the server decides again (Behavior 9).
2. **Disabled states** and their visible reason, linked by `aria-describedby` (disabled buttons can't be focused, so the text is never a tooltip):
   - Loading, or the parts request failed: disabled, no extra text (the summary already shows its skeleton or its error, as for Share build).
   - Empty build: "Add parts to add your build to cart."
   - Errors: "Fix the errors to add this build to cart." The issues list above already names them.
   - Parts that aren't buyable: the button points at the summary's existing availability line ("The {part} isn't available to buy right now. Replace it to add this build to cart.", spec 020), with no second sentence (D12).
   - Errors and parts that aren't buyable: both texts, in that order.
3. **Warnings** (status "Warnings", no errors): the button is enabled. Clicking it opens the **warnings dialog** first (Behavior 6). With status "OK" a click sends at once.
4. **Sending:** the button reads the saved build's items at the click (as Share build does) and sends `{ items, acknowledgedWarnings }`. While it runs the button reads "Adding…", is disabled and has `aria-busy`. The local build is never changed by adding it to the cart, whatever the result.
5. **Result** in one polite live region under the button (`aria-live="polite"`, not `role="status"`, so the builder's existing status role stays the only one). It is replaced by the next result and cleared when the build changes, so a stale "already in your cart" never describes a different build:
   - Added: "Added your build to your cart." and a **View cart** link to `/cart`. The header count updates from the action's count, without a page load (spec 025's `cartCountStore`).
   - Already there (the same contents are a group in this cart): "This build is already in your cart." and View cart. Nothing changes.
   - Not enough stock: "This build can't be added to your cart:" then one line per short product (Messages), as `role="alert"`.
   - Errors the client didn't show (data changed since the parts loaded): "This build can't be added to your cart:" then the server's error messages, as `role="alert"`.
   - Parts not buyable or no longer sold (data changed): one line naming them (Messages), as `role="alert"`.
   - Invalid input or a server error: "Couldn't add your build to your cart. Try again." (`role="alert"`).
   - For errors, unavailable parts and new warnings, the builder also **reloads its parts** (`useBuildParts`' retry), so the summary, the button and the slots catch up with what the server saw (D14). A part that is gone is then dropped with the notice spec 020 already shows.

### The warnings dialog

6. Title "Add a build with warnings?". Body: "Your build may still work, but check this warning first:" (several: "…check these warnings first:") and the warning messages as a list, in `checkBuild` order. Buttons **Add to cart** (primary) and **Cancel**. Add to cart closes the dialog and sends the items with the keys of exactly the warnings listed (D1). Cancel, Escape or closing sends nothing and returns focus to Add build to cart.
7. **Warnings the shopper hasn't seen.** If the server finds a warning whose key isn't in `acknowledgedWarnings` (specs, prices or stock changed, or the client's result was tampered with), it adds nothing and returns all its warnings. The builder reloads its parts and opens the same dialog with the server's warnings and the lead "Something in your build changed since it loaded. Check this warning before adding it:" (several: "…these warnings…"). Confirming sends again with those keys. This repeats if the data changes again.
8. Acknowledgments aren't saved. Every click on Add build to cart asks again for a build with warnings.

### What the server does

9. `addBuildToCart` trusts nothing the client says about the build: it takes the items and the acknowledged keys only, and ignores any other field (a status, issues, prices). In order, stopping at the first failure (D2):
   1. **Input:** the items pass spec 022's `shareInput` (a list, 1 to 20 items, nothing `parseBuild` would repair, quantities up to 99); `acknowledgedWarnings` is a list of at most 50 strings of at most 200 characters. Otherwise `invalid` (or share's `empty`, `too-many-parts`, `quantity-too-high`).
   2. **Parts:** every product is loaded fresh (`getBuilderParts`) and assembled (`assembleBuild`). A product that is missing, not active or in the wrong slot → `unavailable` (no longer sold). An active part that isn't buyable today (out of stock, pre-order) → `unavailable` (can't be bought now). Both list every such part by name.
   3. **Errors:** `checkBuild` on the assembled build. Any error → `errors` with the errors.
   4. **Already in the cart:** the build's content hash (`contentHashOf`, ADR 0007) names a `Build` that already has lines in the cookie's cart → `already-in-cart`. Nothing changes.
   5. **Stock:** for each product in the build, its total across the cart's lines (the single line and every group) plus its quantity in this build may not pass `min(stock, 99)` (spec 025's cap). Any product over → `stock` with every short product (D4). Nothing is capped.
   6. **Warnings:** any warning whose key isn't acknowledged → `confirm` with all the build's warnings.
   7. **Write**, in one transaction: create the cart if there is none (spec 025 Behavior 4–5), find or create the `Build` row for these contents (the shared snapshot write, D5: it inserts the row only if no row has this content hash, and the `BuildItem`s only when the row is new, without ever raising a conflict error inside the transaction), and insert one `CartItem` per entry with that `buildId` and the entry's quantity. Result `added` with the new count.
10. Steps 4 to 7 run with the cart row locked (`SELECT … FOR UPDATE`, as every cart write does), so concurrent writes to one cart see each other (Rules › Concurrency).
11. **The cookie:** `added` and `already-in-cart` set the `__Host-cart` cookie again with a fresh 30 days (a cart change or a confirmation that the cart is in use, spec 025 Behavior 3). Every failure leaves it as it is and creates no cart.

### Build groups on `/cart`

12. `/cart` lists single lines and build groups together, oldest first by when each was added (a group's lines are all written at once; D10 of spec 025).
13. **A group, collapsed** (the default) shows:
    - the label **"Custom PC build · {n} parts"** ("1 part"), where n is the number of products in the group (a memory kit × 2 is one part). With two or more groups each is numbered in cart order: "Custom PC build 1 · 8 parts", "Custom PC build 2 · 8 parts" (D9);
    - the **group total**: Σ `effectivePrice` × quantity of its parts that are still sold, with `formatPeso`;
    - the **compatibility status** from the server's `checkBuild` of the group's current parts: "OK", "Warnings", "Errors", or "Incomplete" when a part is no longer sold (spec 022 Behavior 16, the same view function), each with its icon;
    - **Show parts** (a disclosure button with `aria-expanded`), **View build** (a link to `/builds/{slug}`, the group's snapshot page), and **Remove** (a button named "Remove Custom PC build", or "Remove Custom PC build 2").
14. **Expanded**, it lists the group's parts in builder slot order (drives by name, as on the shared page): the category name, the product image, the name linked to its product page, the unit price the shopper pays (regular price struck through when on sale), "× {quantity}" when above 1, the line total, and the stock status. When the status isn't OK, the issue messages follow the list. The button reads **Hide parts**. Expanded state isn't kept across reloads.
15. **Parts inside a group have no stepper and no Remove.** A group changes only as a whole: it is removed, never edited. To change a build, the shopper opens it (View build → Open in builder), changes it and adds it again.
16. **A part no longer sold** in a group shows its name and brand, "No longer sold", no price and no link, and is left out of the group total and the checks (status "Incomplete"). **A part that can't be bought now** (out of stock, pre-order) shows its stock status and stays in the total. Flags and fixes for both are #63.
17. **Removing a group** removes all its lines at once, with no confirmation (spec 025 D11). The page announces "Removed Custom PC build from your cart." (with its number when it had one) in the page status region, the subtotal and header count update, and focus moves as for a single line (the next line's Remove, else the previous one's, else the empty state's heading). **Only the group's `CartItem`s are deleted. The `Build` snapshot and its `BuildItem`s stay**, because shared links (`/builds/{slug}`) use them, and the same snapshot may be a group in other carts too; snapshots are never deleted (ADR 0007). A group already removed in another tab → "That item is no longer in your cart." and the page refreshes.
18. **Summary:** the subtotal adds the single lines still sold and every group total. "Subtotal ({n} items)" uses `cartCount`, so a group counts as 1, as in the header (spec 025 D7). Checkout stays disabled ("Checkout is coming soon.").
19. **Loading and errors:** the page's existing `loading.tsx` skeleton covers groups too. A database error is the app's standard error page. A failed group removal shows "Couldn't update your cart. Try again." (`role="alert"`) on the group and changes nothing.

### What stays the same

20. A product can be both a single item and part of one or more groups, as separate lines (spec 025 E44). Single adds and quantity changes already count group lines in the cap (spec 025 E6, E7, E17); nothing changes there. `setCartQuantity` and `removeFromCart` still return `not-found` for a group's line id (spec 025 E25).
21. There are no build quantities: one group per distinct build per cart. Two copies of the same PC aren't possible in the MVP.

## 3. Examples

Seed values (stock in the seed): **Build A** (spec 001): AMD Ryzen 5 7600 ₱11,495.00 [12], ASUS ROG Strix B650-A Gaming WiFi ₱14,995.00 [8], Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 ₱6,495.00 [25], Samsung 990 PRO 1TB NVMe SSD ₱6,995.00 [30], ASUS Dual GeForce RTX 4060 OC Edition 8GB ₱17,995.00 [10], Lian Li LANCOOL 216 Black ₱5,795.00 [7], Cooler Master MWE 550 Bronze V2 ₱2,995.00 [15], Thermalright Peerless Assassin 120 SE ₱2,295.00 [20]; 8 parts, total **₱69,060.00**, status OK. **Build B** (spec 001): Intel Core i5-14400F ₱9,295.00, MSI PRO B760M-A WiFi DDR4 ₱8,495.00, Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 ₱2,495.00, Crucial MX500 1TB ₱4,495.00, Gigabyte GeForce RTX 5070 Windforce OC SFF 12G ₱36,995.00, Cooler Master MasterBox Q300L ₱2,995.00, Corsair RM850e (2023) 850W ₱7,495.00, Thermalright Peerless Assassin 120 SE ₱2,295.00; 8 parts, total **₱74,560.00**, status **Warnings**: the one warning is `bios-update` (spec 019 E10), "The MSI PRO B760M-A WiFi DDR4 may need a BIOS update to run the Intel Core i5-14400F: its launch BIOS supports Alder Lake (12th gen) and Raptor Lake (13th gen), not Raptor Lake Refresh (14th gen)." **Build B′**: Build B with the MWE 550 in place of the RM850e; total ₱70,060.00; two warnings, `psu-wattage` ("The Intel Core i5-14400F and the Gigabyte GeForce RTX 5070 Windforce OC SFF 12G need an estimated 517 W, 94% of the 550 W the Cooler Master MWE 550 Bronze V2 supplies, close to its limit.") and `bios-update`. **Build A×**: Build A with the MSI PRO B760M-A WiFi DDR4 in place of the Strix: errors socket-match ("The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.") and memory-type. "[n]" sets a product's stock to n in the test database first. Keys are written `rule:slot/id,…` (D1).

### Adding (`addBuildToCart`)

| # | Cart before | Input | Expected |
| --- | --- | --- | --- |
| E1 | No cookie | Build A, ack `[]` | `added`, `count: 1`. A new `Cart` and cookie; one `Build` row for A's contents; 8 `CartItem`s with its `buildId`, each × 1, in one transaction |
| E2 | No cookie; Build A was shared before (a `Build` row with slug `k3x9…`) | Build A, ack `[]` | `added`; the 8 lines use that existing `buildId`. No new `Build` row |
| E3 | A Build A group | Build A again | `already-in-cart`, `count: 1`. No new lines; cookie renewed |
| E4 | A Build A group | Build A with the Vengeance kit × 2 | `added` as a second group (different contents, different `Build`). `count: 2` |
| E5 | Ryzen 5 7600 × 1 single | Build A | `added`. The 7600 is on two lines (single × 1, group × 1); `count: 2` |
| E6 | No cookie | Build A×, ack `[]` | `errors` with both errors, errors first. No cart, no cookie, no `Build`, no lines |
| E7 | No cookie | Build A× with extra fields `status: "ok"`, `issues: []`, ack `["socket-match:cpu/…,motherboard/…"]` | Same as E6: the extra fields are ignored, and errors can't be acknowledged |
| E8 | No cookie | Build B, ack `[]` | `confirm` with the BIOS warning. Nothing written |
| E9 | No cookie | Build B, ack `["bios-update:cpu/<i5>,motherboard/<B760M>"]` | `added`, `count: 1` |
| E10 | No cookie | Build B, ack `["integrated-graphics:cpu/<i5>"]` (a key it doesn't have) | `confirm` with the BIOS warning |
| E10b | No cookie | Build B′, ack with the BIOS key only | `confirm` with **both** warnings, PSU then BIOS (the order `checkBuild` gives): the PSU key is missing, and the server returns all of the build's warnings so the shopper confirms the whole set (Behavior 7). Nothing written |
| E11 | No cookie; the test sets the MWE 550's `wattageW` to 300 after the client loaded Build A as OK | Build A, ack `[]` | `confirm` with "The AMD Ryzen 5 7600 and the ASUS Dual GeForce RTX 4060 OC Edition 8GB need an estimated 264 W, 88% of the 300 W the Cooler Master MWE 550 Bronze V2 supplies, close to its limit." Nothing written |
| E12 | — | Build A; [0] RTX 4060 | `unavailable` naming "ASUS Dual GeForce RTX 4060 OC Edition 8GB" (can't be bought now). Nothing written |
| E13 | — | Build A; the LANCOOL 216 set to draft | `unavailable` naming "Lian Li LANCOOL 216 Black" (no longer sold) |
| E14 | [1] Ryzen 5 7600 × 1 single | Build A | `stock`: "Not enough stock for AMD Ryzen 5 7600: 1 in stock, 1 already in your cart." Nothing written (issue example 1) |
| E15 | [3] 990 PRO; a Build A group | Build A with the AMD Ryzen 7 9800X3D in place of the 7600 (it carries a `bios-update` warning, spec 019 E57, so the shopper confirms it first) | `added`: the 990 PRO is 2 of 3 (issue example 2) |
| E16 | [2] Vengeance; empty cart | Build A with Vengeance × 2 | `added` (2 of 2) (issue example 3) |
| E17 | [2] Vengeance × 1 single | Build A with Vengeance × 2 | `stock`: "Not enough stock for Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30: 2 in stock, 1 already in your cart." (issue example 3) |
| E18 | [1] Vengeance; empty cart | Build A with Vengeance × 2 | `stock`: "Not enough stock for Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30: 1 in stock, your build needs 2." |
| E19 | [1] Ryzen 5 7600 and [1] 990 PRO, each × 1 single | Build A | `stock` with two lines, in slot order (CPU, then storage) |
| E20 | [500] Ryzen 5 7600 × 99 single | Build A | `stock`: "Not enough room for AMD Ryzen 5 7600: you can have up to 99 of one part in your cart, and 99 are already in it." |
| E21 | — | items not a list; `[]`; 21 items; two CPUs (a repair); a quantity of 100; ack not a list, 51 entries, or an entry of 201 characters | `invalid` / `empty` / `too-many-parts` / `invalid` / `quantity-too-high` / `invalid`. Nothing written |
| E22 | No cookie | Build A plus an extra `cartId` of another cart | Ignored: a new cart; the other cart unchanged |
| E23 | Cookie names a cart that doesn't exist | Build A | `added` to a new cart; the cookie replaced |
| E24 | Empty cart, two adds of Build A at the same moment | — | One group. One result `added`, the other `already-in-cart` |
| E25 | [1] 990 PRO, empty cart; Build A and Build A with the 9800X3D (warning acknowledged) added at the same moment | — | One `added`; the other `stock` ("…1 in stock, 1 already in your cart.") |
| E26 | Two different carts add the same never-shared contents at the same moment | — | Both `added`; one `Build` row, used by both carts |
| E27 | [12] a Build A group | add Ryzen 5 7600 × 11 single (spec 025's action) | Single × 11 (12 − 1 in the group): spec 025's cap, unchanged |

### Removing a group (`removeBuildFromCart`)

| # | Cart before | Input | Expected |
| --- | --- | --- | --- |
| E28 | A Build A group + Ryzen 5 7600 × 2 single | remove the group | The 8 group lines gone, the single line kept, `count: 2`. The `Build` row and its link still exist; cookie renewed |
| E29 | Cart C has a group; the request carries cart D's cookie, or no cookie | remove C's group | `not-found`. C unchanged |
| E30 | A Build A group | `setCartQuantity` or `removeFromCart` with one of its line ids | `not-found` (spec 025 E25, unchanged) |
| E31 | A Build A group | remove it twice | `ok`, then `not-found` |

### Reading `/cart`

| # | Cart | Expected |
| --- | --- | --- |
| E32 | A Build A group | One line "Custom PC build · 8 parts", ₱69,060.00, "OK", collapsed. Show parts → CPU AMD Ryzen 5 7600 ₱11,495.00, Motherboard ASUS ROG Strix B650-A Gaming WiFi ₱14,995.00, … in builder slot order, each "In stock". View build → `/builds/<slug>`. "Subtotal (1 item)" ₱69,060.00; header "Cart, 1 item" |
| E33 | Build A with Vengeance × 2 as a group | "8 parts"; the kit row "₱6,495.00 × 2", line ₱12,990.00; group total ₱75,555.00 |
| E34 | A Build B group | Status "Warnings"; expanded, the BIOS warning message under the parts |
| E35 | A Build A group, then Ryzen 5 7600 × 2 single | Group first, then the single line. "Subtotal (3 items)" ₱92,050.00 |
| E36 | Two groups (Build A, then Build B) | "Custom PC build 1 · 8 parts", "Custom PC build 2 · 8 parts"; buttons "Remove Custom PC build 1", "… 2"; "Subtotal (2 items)" ₱143,620.00 |
| E37 | A Build A group, then the LANCOOL 216 set to draft | Its row: name, brand, "No longer sold", no price, no link. Group total ₱63,265.00, status "Incomplete". Count still 1 |
| E38 | A Build A group, then [0] RTX 4060 | The GPU row "Out of stock"; total and status unchanged (flags are #63) |
| E39 | A Build A group, then the 7600's price set to ₱10,000.00 | Group total ₱67,565.00 on the next request: prices are never stored in the cart |

### The header count (spec 025's `cartCount`, unchanged)

Spec 025 D7 already counts the units of single items **plus 1 per build group** (its E42–E44); this story only creates the groups. The header, the action results, the count route and "Subtotal ({n} items)" all show the same number.

| # | Cart | Count | Header link |
| --- | --- | --- | --- |
| E56 | A Build A group (8 lines, 8 units) | 1 | "Cart, 1 item" |
| E57 | A group of Build A with the Vengeance kit × 2 (8 lines, 9 units) | 1 | "Cart, 1 item" |
| E58 | A Build A group + Ryzen 5 7600 × 2 single | 3 | "Cart, 3 items" |
| E59 | Groups of Build A and Build B + Ryzen 5 7600 × 1 single (also in Build A) | 3 | "Cart, 3 items" |
| E60 | E58, then the group removed | 2 | "Cart, 2 items" |

### The builder page

| # | Build | Expected |
| --- | --- | --- |
| E40 | Empty | Add build to cart disabled, "Add parts to add your build to cart." |
| E41 | Build A, parts still loading (and the server render) | Disabled, no note |
| E42 | Build A× | Disabled, "Fix the errors to add this build to cart." |
| E43 | Build A with [0] RTX 4060 | Disabled, described by the availability line "The ASUS Dual GeForce RTX 4060 OC Edition 8GB isn't available to buy right now. Replace it to add this build to cart." |
| E44 | Build A | Enabled → "Adding…" → "Added your build to your cart." with View cart; header "Cart, 1 item" without a page load; the builder still shows Build A |
| E45 | Build A, after E44 | Click again → "This build is already in your cart." |
| E46 | Build B | Click → the dialog lists the BIOS warning. Cancel → nothing sent, focus on Add build to cart. Again → Add to cart → added |
| E47 | Build A, the server finds the new warning of E11 | The dialog opens with "Something in your build changed since it loaded. Check this warning before adding it:" and the message; the summary now shows "Warnings" |
| E48 | Build A, server returns `stock` (E14) | Alert "This build can't be added to your cart:" and the stock line; the build unchanged |
| E49 | Build A, the request fails (offline) | "Couldn't add your build to your cart. Try again." |
| E50 | After E44, the shopper changes the GPU | The result line is cleared |

### Epic E2E (PRD "build → fix conflict → add to cart")

| # | Steps | Expected |
| --- | --- | --- |
| E51 | Fresh context; save Build B with the ASUS ROG Strix B650-A in place of the PRO B760M-A → `/builder` | Status "Errors" (socket, memory type and form factor: the Strix is ATX, the Q300L takes Micro-ATX); Add build to cart disabled with "Fix the errors to add this build to cart." |
| E52 | Change the motherboard to the MSI PRO B760M-A WiFi DDR4 | Status "Warnings" (the BIOS message); the button enabled |
| E53 | Add build to cart → the dialog names the BIOS warning → Add to cart | "Added your build to your cart."; header "Cart, 1 item" without a page load |
| E54 | View cart | "Custom PC build · 8 parts", ₱74,560.00, "Warnings"; Show parts lists the 8 parts; "Subtotal (1 item)" |
| E55 | Remove Custom PC build | "Removed Custom PC build from your cart.", empty state, header "Cart" |

## 4. Rules and edge cases

### Trust

- The action's only inputs are the items and the acknowledged keys. The cart comes from the cookie; the status, issues, prices, stock and the content hash are always the server's own (E7, E22).
- Errors can't be acknowledged: an error stops the add whatever `acknowledgedWarnings` holds.
- The client's `checkBuild` and the server's run the same engine on the same data shape (`toBuilderPartData`), so they agree unless the data changed between the two reads.

### Warnings

- A warning's key is its rule plus its parts as `slot/id` in the order `checkBuild` gives them (D1). The message isn't part of it: a PSU load that moves from 94% to 96% is the same warning; a new rule or a different part is a new one.
- The server needs every warning's key in the list; extra keys are ignored (a warning that went away needs nothing).
- A warning that became an error (a PSU load over 100% after a spec change) is an error: step 3 stops it.

### Stock (all or nothing)

- For each product p in the build: `inCart(p) + needs(p) ≤ min(stock(p), 99)`, where `inCart` is p's quantity on every line of the cart (single and every group) and `needs` is its quantity in this build (a memory kit counts kit × quantity: the entry's quantity). Any product over stops the whole add; nothing is capped or partly added.
- The message for a product names its stock and what's already in the cart, or what the build needs when the cart holds none of it (E14, E18). When 99, not stock, is the limit (stock above 99), the room message is used (E20).
- Every short product is listed, in builder slot order, so one try shows everything to fix.
- Stock 0 or a pre-order is caught earlier, as "can't be bought now" (step 2), never as a stock line.
- Like spec 025's cap, this is a convenience, not a reservation (FR-24, Sprint 6).

### One group per build

- A group's identity is its `Build` row: the same contents (by content hash) are the same group. The unique index on `CartItem ("cartId", "productId", "buildId")` keeps one line per product per group.
- Changing the build and adding it again makes a second group; the first stays (D3). Each counts 1 in the header.
- A product appears at most once in a build (canonical items), so a group's lines map 1:1 to its `BuildItem`s.

### Concurrency

- Every write to one cart locks the cart row first, so two adds of the same build give one group (E24) and two builds competing for the last unit don't both get in (E25). Single adds and quantity changes take the same lock, so they see group lines too (spec 025).
- **The snapshot write never raises a conflict inside a transaction.** Postgres aborts a transaction after any error, so catching Prisma's `P2002` and reading the row back (what `shareBuild` does today) can't work inside the cart's transaction. Instead the shared write runs `INSERT … ON CONFLICT DO NOTHING RETURNING "id"` for the `Build`; when no row comes back it selects the existing row by `contentHash`, and it inserts the `BuildItem`s only when the row is new.
- The insert has **no conflict target**, so it also absorbs a random `shareSlug` collision, the other unique index: then nothing is returned and no row has this content hash, so the write tries a new slug (three attempts in all, as today) in the same, still healthy transaction. With `ON CONFLICT ("contentHash")` alone, a slug collision would raise and abort the transaction (D5).
- Two requests writing the same new contents at once: the second insert waits for the first transaction, then does nothing and reads the committed row (Read Committed). So two carts adding the same new contents both succeed with one `Build` row (E26), two concurrent adds of the same build to one cart give one group and no error (E24), and spec 022's parallel shares still give one row and one slug.
- A rejected add writes nothing: no cart, no `Build` row, no lines.

### Data

- No schema change: `Cart`, `CartItem.buildId`, both unique indexes, `CartItem → Build` and `CartItem → Product` `Restrict`, and `BuildItem → Product` `Restrict` already exist (specs 022 and 025).
- `CartItem` holds the product and quantity; the slot comes from the `BuildItem` of the same build and product when the cart is read.
- Removing a group deletes its `CartItem`s only. `Build` rows are never deleted (ADR 0007); one a cart no longer uses stays reachable by its link.
- Adding a build to the cart makes its contents reachable at `/builds/{slug}` (View build), like sharing does. The slug is random and the snapshot holds no personal data (D13).
- Every successful add or group removal updates `Cart.updatedAt`.

### Input bounds

- At most 20 products and quantities up to 99 (spec 022's limits); at most 50 acknowledged keys of up to 200 characters. A cart has no limit on groups yet (#64).

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Builder, button | "Add build to cart"; while running "Adding…" |
| Builder, disabled reasons | "Add parts to add your build to cart." · "Fix the errors to add this build to cart." · (not buyable: spec 020's availability line, unchanged) |
| Builder, results | "Added your build to your cart." · "This build is already in your cart." · link "View cart" |
| Builder, refusal lead | "This build can't be added to your cart:" |
| Builder, stock lines | "Not enough stock for {name}: {stock} in stock, {n} already in your cart." · "Not enough stock for {name}: {stock} in stock, your build needs {n}." · "Not enough room for {name}: you can have up to 99 of one part in your cart, and {n} are already in it." |
| Builder, unavailable (server) | One part: "The {name} can't be bought right now." / "The {name} is no longer sold." Several: "{n} parts in this build can't be bought right now or are no longer sold." Then, always: "Replace them in the builder to add this build to cart." ("Replace it" for one) |
| Builder, quantity too high (server) | "You can add up to 99 of the {name} in a build." (spec 022's share copy) |
| Builder, error | "Couldn't add your build to your cart. Try again." |
| Warnings dialog | Title "Add a build with warnings?"; "Your build may still work, but check this warning first:" / "…check these warnings first:"; after a server confirm: "Something in your build changed since it loaded. Check this warning before adding it:" / "…these warnings…"; buttons "Add to cart", "Cancel" |
| Cart, group | "Custom PC build · {n} parts" / "· 1 part"; numbered "Custom PC build {i} · …" when there are 2+; "Show parts" / "Hide parts"; "View build"; "Remove" (named "Remove Custom PC build" / "Remove Custom PC build {i}"); status "OK" · "Warnings" · "Errors" · "Incomplete" |
| Cart, group part no longer sold | "No longer sold" |
| Cart status | "Removed Custom PC build from your cart." / "Removed Custom PC build {i} from your cart." |
| Removed copy | Builder: "Adding a whole build to the cart is coming soon." |

## 6. Data and interfaces

### Server (`lib/cart/`, server-only)

- `addBuildToCart(input, { cartId, today })` → `{ result, cartId, renewCookie }` (spec 025's `CartOutcome` shape), tested directly with a cart id.
- Its result:
  - `{ ok: true, status: "added" | "already-in-cart", count }`
  - `{ ok: false, reason: "errors", issues: Issue[] }`
  - `{ ok: false, reason: "confirm", warnings: Issue[] }`
  - `{ ok: false, reason: "unavailable", parts: { name, why: "not-buyable" | "retired" }[] }`
  - `{ ok: false, reason: "stock", shortages: { name, stock, inCart, needs, limit: "stock" | "max" }[] }`
  - `{ ok: false, reason: "invalid" | "empty" | "too-many-parts" | "error" }` and share's `quantity-too-high` (with the product id)
  - Copy is made in the client from these, as in spec 025.
- `removeBuildFromCart({ buildId }, { cartId })` → spec 025's `CartResult` (`ok` with `count`, or `not-found` / `invalid` / `error`). Only the cookie's cart is searched.
- **The snapshot write** (D5): one function, `upsertBuildSnapshot(tx, items, { newSlug })` → `{ id, shareSlug }`, taking the transaction client as a parameter. It computes the content hash, inserts the `Build` with `ON CONFLICT DO NOTHING RETURNING`, selects the existing row when nothing came back, inserts the `BuildItem`s only for a new row, and retries a slug collision (Rules › Concurrency). `shareBuild` calls it in its own transaction, with its validation unchanged; `addBuildToCart` calls it inside the cart's. `shareBuild`'s results don't change.
- `getCartView` returns one ordered list of entries, each a single line (spec 025's `CartLineView`) or a **build group**: `{ kind: "build", buildId, slug, label number, partCount, total, status: SharedStatus, issues, rows }`, where the rows, total, status and issues come from spec 022's pure `sharedBuildView` over the group's parts read fresh. `subtotal` adds group totals; `count` is `cartCount` as before.

### Pure

- `warningKey(issue)` and `acknowledgedSchema` (a list of up to 50 strings of up to 200 characters).
- `buildShortages(entries, inCart, stock)` → the stock lines of Rules › Stock (no database), with the 99 limit from `MAX_CART_QUANTITY`.
- `buildCartButton({ state, isEmpty, status, unavailable })` → enabled, or disabled with its reasons (Behavior 2).
- Copy helpers for the results, the stock lines, the dialog leads and the group label.

### Actions and client

- `addBuildToCartAction(input)` and `removeBuildFromCartAction(input)` in `app/(store)/cart/actions.ts`, forwarding like the others; both return the result without the cart id, renew the cookie when the outcome says so, and `refresh()` the cart page (the removal).
- Builder: the summary's button and result region, the warnings dialog (the picker's dialog pattern), and the call to `cartCountStore.fromAction(count)` on success.
- Cart page: the group line (collapsed and expanded), its Remove, and the status and focus handling `CartContent` already has for lines.

### Docs

- CLAUDE.md: the cart bullet gains build groups (the server check order, the warning key, the all-or-nothing stock check, one group per `Build`, the snapshot write shared with share). ADR 0007: a dated note that "one writer path" is now one snapshot write function with two callers (share and add to cart); the canonical form is unchanged, so no new ADR.
- Spec 020: "Changed by spec 026 (#62)" notes at Behavior 15 (the button) and its Messages. Spec 022: done with this review (Behavior 12 and the out-of-scope table point at #72). Spec 025: a note at Behavior 17 that groups are listed (by spec 026). README if it describes the cart.

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | `buildShortages`: across single and group lines, kit × quantity, needs-only, the 99 limit, several products in slot order | E14–E20 |
| Unit | `warningKey`, the acknowledged-keys schema, the add-build input (via `shareInput`) | E9, E10, E21 |
| Unit | `buildCartButton` for every summary state | E40–E43 |
| Unit | Copy: stock lines, unavailable lines, dialog leads (one / several), group label and numbering | Messages, E36 |
| Unit (render) | `BuildSummary` with each button state and result; the warnings dialog body; `CartBody` with a group collapsed and expanded, a retired part, two numbered groups | E32–E38, E40–E50 |
| Integration (`*.db.test.ts`) | `addBuildToCart`: added in one transaction; reuses a shared `Build`; already in cart; a changed build is a second group; errors rejected; **a tampered client result is ignored**; warning without acknowledgment → `confirm`; acknowledged → added; changed data → `confirm`; unavailable (stock 0, draft); **the total-quantity stock check across single and group lines**; invalid input writes nothing; cookie renewed on `added` and `already-in-cart` only; concurrency (same build twice, competing builds, two carts one `Build`) | E1–E26 |
| Integration | The snapshot write: **spec 022's parallel-share test still passes unchanged** (same contents at once → one row, one slug); **two concurrent adds of the same build to one cart → one group, one `added` and one `already-in-cart`, no error** (E24); two carts at once → one `Build` (E26); a forced slug collision inside the transaction retries and succeeds; `BuildItem`s are written once per `Build` | E24, E26, spec 022's tests |
| Integration | `removeBuildFromCart` (only `CartItem`s deleted; the `Build`, its `BuildItem`s and its shared page remain) and the unchanged single-line actions on group lines; `getCartView` groups: order, totals, status, retired parts, fresh prices; spec 025's cap with a group present; the count with groups | E27–E39, E56–E60 |
| E2E (Playwright) | The epic journey: conflict → fix → acknowledge the warning → added → the cart shows the group and the header count updates without a page load → remove | E51–E55 |

The E2E uses spec 025's "no page load" mark. A data-changed case (E47) is covered by integration and render tests, not E2E.

## 8. Out of scope

| What | Owner |
| --- | --- |
| Flags and fixes for group parts over stock, out of stock or retired; the summary banner | #63 |
| **Blocking a group that has errors at checkout.** A group is checked when it is added, but its parts' specs can change later. `/cart` always shows the group's current status from a fresh `checkBuild` (Behavior 13), so a group can read "Errors" in the cart; this story doesn't stop it there. Checkout must re-run `checkBuild` for each group and block any with errors | Sprint 6 (FR-13) |
| Stock reservation | Sprint 6 (FR-24) |
| Add build to cart on the shared page `/builds/[slug]` | #72 (Backlog; D16) |
| Build quantities (two of the same PC); editing a group in the cart | Not in the MVP (issue) |
| Replacing an earlier group when a changed build is added again | Not in the MVP (D3) |
| Rate limiting the action; a limit on groups per cart | #64 |
| Saved builds in an account; merging the guest cart on login | Sprint 7, #65 |

## 9. Decisions

- **D1 — A warning's key is its rule plus its parts (`slot/id`), not its message.** Messages carry figures (a PSU load) that move with small data changes; asking again for 94% → 96% would be noise, while a new rule or part is a real change. *Rejected:* the message text as the key; one hash of the whole warning list. *Review decision (open question 4):* accepted. A PSU warning that rises from 94% to 99% between load and click isn't confirmed again; the shopper already confirmed "close to its limit", and over 100% is an error, which blocks.
- **D2 — Server check order: input, parts, errors, already in cart, stock, warnings, write.** Every reason to refuse comes before the confirmation, so the shopper never confirms warnings for an add that then fails; "already in cart" comes before stock so a re-click on a group that's in the cart isn't reported as short of stock. *Rejected:* warnings before stock.
- **D3 — A group is its `Build` row; a changed build is a new group.** There is no link between a browser's build and a cart group, and a shopper may buy two different PCs. *Rejected:* replacing the last group added from this browser (needs state the issue doesn't ask for); a builder note "An earlier version of this build is in your cart" (the client would need to know which group came from it). *Review decision (open question 2):* kept for the MVP. A shopper who changes the GPU and adds again has two groups, numbered (D9), each with its own Remove.
- **D4 — Stock is all or nothing, listing every short product.** The issue rules out partial groups and silent capping; listing all shortfalls saves round trips. *Rejected:* stopping at the first short product.
- **D5 — One snapshot write function, two callers, with no error inside the transaction.** The issue asks for #59's upsert in the same transaction as the cart lines; `shareBuild` writes outside a transaction. Taking the find-or-create out of `shareBuild` keeps one way to write a `Build`. It takes the transaction client, inserts with `INSERT … ON CONFLICT DO NOTHING RETURNING "id"`, selects the existing row when nothing came back, and inserts `BuildItem`s only for a new row (Rules › Concurrency). This **changes the wording of ADR 0007 and CLAUDE.md** ("`shareBuild` is the one write path"; "P2002 handled by reading the row back"); the canonical form and hash don't change, so a dated note in ADR 0007 is enough, not a new ADR. *Rejected:* catching `P2002` and reading back inside the transaction (Postgres aborts the transaction after the error); calling `shareBuild` before the cart transaction (two transactions, and a snapshot row for every refused add). *Review decision:* agreed, with the `ON CONFLICT` design. **One refinement while writing it in:** the review named `ON CONFLICT ("contentHash")`, but `shareSlug` is unique too, and a random slug collision on that index would still raise and abort the transaction. The spec drops the conflict target (`ON CONFLICT DO NOTHING`), so both cases return no row: a row found by content hash means the same contents, none means a slug collision, and the write retries with a new slug in the same transaction.
- **D6 — Any non-empty build can be added.** Upgraders reuse their own case or PSU; the rules already warn where a missing part matters (integrated graphics). *Rejected:* requiring all 8 slots. *Review decision (open question 3):* allowed; a CPU on its own is a valid build, and its group reads "Custom PC build · 1 part".
- **D7 — Warnings are acknowledged in a dialog at each click, not with a checkbox.** It names the warnings at the moment of adding, matches the picker's "Add anyway" pattern, and leaves no stale acknowledgment. *Rejected:* a persistent "I understand" checkbox in the summary.
- **D8 — A group's status on `/cart` is recomputed per request with spec 022's `sharedBuildView`.** The same "Incomplete" rule and totals as the shared page, from one pure function. *Rejected:* storing the status at add time (stale after data changes).
- **D9 — Groups are numbered only when there are two or more.** Remove buttons and announcements need distinct names; numbers change when one is removed, which is acceptable for an unordered cart. *Rejected:* naming groups by their CPU (a build may have none).
- **D10 — Groups start collapsed, with a disclosure button.** FR-12 says "one grouped line that can be expanded"; a collapsed line keeps an 8-part build from crowding single items. *Rejected:* `<details>` (styling and spec 025's client-side page already rule out no-JS).
- **D11 — Removing a group has no confirmation.** Same as single lines (spec 025 D11); the build is still in the builder and at its link.
- **D12 — The not-buyable reason reuses the availability line.** It already ends with "Replace it to add this build to cart."; a second sentence would repeat it (spec 025 D13's reasoning).
- **D13 — View build links to the snapshot's shared page.** Every `Build` has a slug, so a group gets a read-only page and Open in builder for free. It means an added build is reachable by link like a shared one; the slug is random and the page shows parts only. *Rejected:* no link (the issue asks for it).
- **D14 — After a server refusal for data reasons, the builder reloads its parts.** Otherwise the summary keeps showing "OK" next to a refusal. *Rejected:* showing only the server's message.
- **D15 — `already-in-cart` renews the cookie.** Like spec 025's add that added 0, it confirms the cart is in use.
- **D16 — No Add build to cart on the shared page in this story (review decision, open question 1).** The issue's criteria name `/builder` only; Open in builder then Add build to cart is two clicks. It is #72 (Backlog), and spec 022 carries "Changed by spec 026 (#62)" notes at Behavior 12 and its out-of-scope table. *Rejected:* adding it here, as spec 022's out-of-scope table had planned.
- **D17 — The header count rule is spec 025's, unchanged (review decision).** Units of single items plus 1 per build group (spec 025 D7); E56–E60 show it with groups. *Rejected:* counting a group's units.
- **D18 — Removing a group keeps its snapshot (review decision).** Only its `CartItem`s are deleted (Behavior 17), because shared links and other carts may use the same `Build`. *Rejected:* deleting a snapshot no cart uses (it may have been shared, and ADR 0007 makes snapshots immutable and permanent).

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| Server action with items only; the server runs `parseBuild` + `assembleBuild` + `checkBuild` and never trusts the client | Behavior 4, 9; Rules › Trust; E7, E21, E22 |
| Rejects errors, not buyable or inactive parts, returning the issues; button disabled with visible reason | Behavior 1–2, 9; E6, E12, E13, E40–E43 |
| Warnings need an acknowledgment that names them; `acknowledgedWarnings`; unseen warnings returned for confirmation | Behavior 6–8, Rules › Warnings, D1; E8–E11, E46, E47 |
| `Build` snapshot (#59's upsert) and one `CartItem` per entry, one transaction; `Restrict` kept | Behavior 9.7, Rules › Data and › Concurrency, D5; E1, E2, E24, E26 |
| Stock check across all lines, kit × quantity, all or nothing; the three examples | Rules › Stock; E14–E20, E25 |
| `/cart` grouped line (label, total, status), expands with quantities; remove removes all; no per-part quantity; link to `/builds/[slug]` | Behavior 13–17, D18; E28, E30, E32–E38 |
| Same build again doesn't duplicate ("Already in your cart"); no build quantities; product both in a build and single | Behavior 5, 20–21, Rules › One group; E3, E5, E24, E45 |
| Header count via #60's trigger; local build unchanged; "coming soon" removed | Behavior 4–5, 18, D17; E44, E53, E56–E60; Messages (removed copy) |
| Integration tests (error, warning unacknowledged, acknowledged, tampered, stock across groups) and the epic E2E | Test plan; E6–E9, E14–E17, E51–E55 |

## 10. Open questions

None. The review settled the four earlier questions:

1. Add build to cart on the shared page: out of scope, #72 (D16).
2. A changed build added again is a second group (D3).
3. Any non-empty build can be added (D6).
4. The warning key ignores the message (D1).
