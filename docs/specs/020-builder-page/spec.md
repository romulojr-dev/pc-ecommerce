# 020 — Builder page with saved state, summary and Add to build

Status: **Approved** · Issue: #53 (epic #3, depends on #51 and #52, both merged) · PRD refs: PC Builder › Flow (steps 2 and 4); FR-8 (Add to build); Technical architecture › Stack (Builder state)

## 1. Summary

This story turns `/builder` from a "coming soon" placeholder into a working builder. The shopper adds parts from a product page or from `/builder`, and sees the total, the estimated wattage against the PSU and the compatibility status as they go. The build survives a reload. The browser saves only `{ slot, productId, quantity }` items, and prices, stock and specs are loaded fresh from the server on every visit. It is the first screen that shows the output of the engine from spec 018 and spec 019. The slot picker (#54) comes later. Until then, a slot's "Choose" and "Change" links lead to the category listing, and the product page's Add to build fills the slot.

## 2. Behavior

### The saved build

1. The build is a list of `BuildItem`s (`{ slot, productId, quantity }`, spec 018), held in a client-side store and persisted to `localStorage` under one key with a version number (1). Nothing else is saved: no names, prices, stock or specs.
2. Every action on the store keeps spec 018's slot limits: storage holds several entries (one per product), memory holds one kit with a quantity of 1 or more, and every other slot holds one part with quantity 1. On top of those, a build holds at most **20 different products** (the parts request's cap), which leaves room for 13 different drives next to one part in each of the other 7 slots (Rules › Store).
3. Whatever is read from `localStorage` (this version, an older one, or corrupted data) goes through `parseBuild` before anything else uses it. That covers the first read and a change made in another tab.
4. A change in one tab shows in the other open tabs without a reload. They listen for the browser's `storage` event and read the build again.

### Loading parts

5. When the saved build has been read, the page asks the server for the parts by id: one `GET /api/builder/parts` request with every id in the build. The server checks the ids with a Zod schema (at most 20, Rules › Parts request), answers 400 to bad input, and otherwise returns only **active** products, with their current specs, prices, stock status and first image. Nothing is cached, by Next or the browser (ADR 0003: per-request data).
6. The page passes the response to `assembleBuild`. Items whose id didn't come back (deleted, draft, never existed) or that sit in the wrong slot are **removed from the saved build**, and a notice names the slots they were in (Messages). The notice shows once. After a reload the items are gone, so it doesn't show again.
7. Items are removed only after a successful response. A failed request never changes the saved build.
8. A new request is made only when the build holds an id that hasn't been loaded yet: on page load, or when another tab adds a part. Removing a part or changing a quantity needs no request. If a newer request starts before an older one finishes, the older response is ignored.

### `/builder`

9. **Loading:** the page shell (heading, eight slot rows, summary panel) renders on the server with skeletons where parts and figures go. Skeletons stay until the saved build has been read and its parts have loaded. An empty saved build needs no request, so its skeletons go away right after the read. Server HTML never depends on `localStorage`, so there is no hydration mismatch.
10. **Slots:** eight rows in `builderCategories` order: CPU, Motherboard, Memory, Storage, Graphics Card, Case, Power Supply, CPU Cooler. Each row is labelled with the category name.
11. **Empty slot:** a "Choose a CPU" style link (Messages) to the category listing (`/cpu`). #54 will turn it into the slot picker.
12. **Filled slot:** each part shows its image (`ProductImage`), its name linked to its product page, its brand, its price (the price the shopper pays: `effectivePrice`, with the regular price struck through when it is on sale) and its current stock label (`stockStatusLabel`). A part named in an issue gets an "Error" or "Warning" marker (icon plus text) that matches the issue's severity.
13. **A saved part that is no longer buyable** (it was buyable when added, and is now out of stock or a pre-order): it **stays in the build**. Its row shows its current stock label ("Out of stock" or "Pre-order") and a short note: "Not available to buy right now. Replace it to add this build to cart." The summary says the build can't be added to cart until it is replaced (Behavior 15, Messages). It still counts in the total, the wattage and the rules: it is still the shopper's pick. "Buyable" means in stock or low stock, the `inStock` filter's meaning (spec 012).
14. **Actions on a part:**
    - **Remove** takes the entry out of the build. The slot goes back to its empty state (for storage, back to its empty state when the last drive is removed).
    - **Change** (one-part slots and memory) links to the category listing, like "Choose". Adding another part from its product page then asks before replacing (Behavior 19). #54 turns it into the slot picker.
    - **Quantity** (memory and each storage drive): a stepper from 1 up to the part's current stock. Increasing works only while the part is buyable. A saved quantity above the current stock is kept and shown, and only decreasing is allowed until it fits. A quantity above 1 shows the unit price × quantity and the line total.
    - **Add another drive** (storage, under its drives) links to `/storage`.
15. **Summary**, a panel that stays in view (sticky) beside the slots from 1024 px up:
    - **Total:** the sum of `effectivePrice` × quantity over every entry, with `formatPeso`. Parts that aren't buyable still count: they are still in the build, and their row says why.
    - **Estimated power:** spec 019's summary copy, from `estimateWattage`: "Estimated power: 264 W" before a PSU is picked, "Estimated power: 264 W of 550 W (48%)" after. A "How is this estimated?" button next to it shows a tooltip that explains the ×1.3 (Messages). The button is focusable, so keyboard users can open the tooltip too.
    - **Status:** from `buildStatus(checkBuild(build))`: "OK", "Warnings" or "Errors", each with its own icon so color isn't the only signal. An empty build shows "Add parts to check compatibility." in place of a status.
    - **Issues:** every issue message in `checkBuild` order (errors first), each marked "Error" or "Warning". With parts and no issues: "No compatibility issues found."
    - **Availability:** when one or more parts aren't buyable, a line under the status says the build can't be added to cart until they're replaced, naming the part (one) or counting them (several). It is separate from the compatibility status: a build can be "OK" and still not buyable.
    - **Add build to cart:** a disabled button with a visible "coming soon" line, linked through `aria-describedby` (same pattern as spec 010). The availability line above is the rule the Checkout epic enforces when it enables the button. *Changed by spec 026 (#62): the button is enabled when the build has parts, no errors and every part is buyable; its "coming soon" line is gone, and the disabled reasons are visible text (spec 026 Behavior 1–2).*
16. **Error state:** when the parts request fails (network or server error), the slots keep their skeletons and the summary shows "We couldn't load your build's prices and stock." with a "Try again" button that repeats the request. The saved build is untouched.
17. **Metadata:** title "PC Builder", a description, the canonical `/builder`, and `noindex` (kept from the placeholder). `/builder` stays out of the sitemap.

### Add to build on the product page

18. **One rule everywhere: a part can be added to a build only if it is buyable** (in stock or low stock, Behavior 13). The product page's "Add to build" is enabled when the product's category is a builder category and the product is buyable. Out-of-stock and pre-order parts show it disabled, with a visible line explaining why (spec 010's disabled state for both stays as is). *Changed by spec 025 (#60): on the product page that line is now "Only parts in stock can be added to your cart or build.", one note for both disabled buttons; the picker keeps its own line.* #54's picker follows the same rule (D7). A product outside the builder categories doesn't show the button. The MVP catalog has none yet.
19. Clicking it always adds **one** unit. By the slot's state:

    | Slot state | Result |
    | --- | --- |
    | Empty | The part is added (quantity 1) |
    | Storage, drive not in the build | Added as a new entry (quantity 1), after the existing drives |
    | Storage or memory, same product already there | That entry's quantity goes up by 1 |
    | Storage or memory, same product, quantity already at its stock | Nothing changes: "Your build already has all {stock} we have in stock." |
    | One-part slot, same product already there | Nothing changes: "Already in your build." |
    | One-part slot or memory, another product there | A confirmation dialog asks first. "Replace" swaps the part in place, "Cancel" changes nothing. Memory keeps the kit quantity (spec 018 D12), capped at the new kit's stock. The dialog states the quantity it will keep |
    | Storage, new drive, build already holds 20 different products | Nothing changes: "Your build has the most parts it can hold. Remove a drive to add another." |

    *Changed by spec 024 (#68): when the page's fit state is "Doesn't fit your build" and the add would change the build (the "Empty", "Storage, drive not in the build" and "another product there" rows), a confirmation comes first, and the "Replace?" dialog is not shown in that case. This table applies to everything else.*

20. After an add, raise or replace, a status line under the buttons says "Added to your build." with a "View build" link to `/builder`. When nothing changed, it shows the matching line from the table, with the same link. The line is announced to screen readers.
21. The product page's quantity selector doesn't affect Add to build: it belongs to Add to cart (D15). Quantities beyond one are changed on `/builder`, or by adding again.
22. The button does nothing until the saved build has been read, which happens right after hydration, so an early click can't overwrite a saved build. It renders the same on the server and the client: its label never depends on the saved build. *Changed by spec 024 (#68): a click before the saved build is read or its parts are loaded is pending, not ignored. It waits and then decides, so it still can't overwrite the saved build.*
23. The product page doesn't run the compatibility rules. The shopper sees any issues on `/builder` (D9). *Changed by spec 024 (#68): the page runs the rules for the "Fits your build" hint (spec 023), and Add to build asks first on errors.*

### Elsewhere

24. The product page's line under the buttons becomes "Cart is coming soon." (it describes only Add to cart now). The home hero keeps its "Coming soon" badge. #54 removes it (Out of scope).

## 3. Examples

Prices and stock are seed values. "Build A" is spec 001's compatible build (`buildA` in `test-support/seed-parts.ts`): AMD Ryzen 5 7600, ASUS ROG Strix B650-A Gaming WiFi, Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 (stock 25), Samsung 990 PRO 1TB NVMe SSD (stock 30), ASUS Dual GeForce RTX 4060 OC Edition 8GB, Lian Li LANCOOL 216 Black, Cooler Master MWE 550 Bronze V2, Thermalright Peerless Assassin 120 SE. All quantity 1. Examples that need a part's stock to change (E9, E15) set it in the test database, not in the seed.

### `/builder` display

| # | Saved build | Expected |
| --- | --- | --- |
| E1 | Nothing saved | No request. Eight empty rows: "Choose a CPU" (→ `/cpu`), "Choose a motherboard", "Choose memory", "Choose storage", "Choose a graphics card", "Choose a case", "Choose a power supply", "Choose a CPU cooler". Total ₱0.00. "Estimated power: 0 W". "Add parts to check compatibility." Add build to cart disabled |
| E2 | Ryzen 5 7600 | CPU row: AMD Ryzen 5 7600, AMD, ₱11,495.00, "In stock". Total ₱11,495.00. "Estimated power: 114 W". Status OK, "No compatibility issues found." |
| E3 | Build A | Total ₱69,060.00. "Estimated power: 264 W of 550 W (48%)". Status OK. No availability line |
| E4 | Ryzen 5 7600X (₱12,495, on sale for ₱10,995) | Row shows ₱10,995.00 with ₱12,495.00 struck through. Total ₱10,995.00 |
| E5 | Intel Core i5-14400F | Status Warnings: "The Intel Core i5-14400F has no integrated graphics, so add a graphics card to get a display." "Estimated power: 192 W". CPU row has a Warning marker |
| E6 | Ryzen 5 7600 + MSI PRO B760M-A WiFi DDR4 | Status Errors: "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4." Both rows have an Error marker |

### Saved parts that are no longer buyable

| # | Saved build | Expected |
| --- | --- | --- |
| E7 | AMD Ryzen 7 9800X3D (stock 4) + ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB (stock 0) + Corsair RM850e (2023) 850W | The GPU stays. Its row: "Out of stock" and "Not available to buy right now. Replace it to add this build to cart." The 9800X3D row says "Low stock" with no note (low stock is buyable). Total ₱217,485.00 (the GPU's ₱179,995.00 counts). "Estimated power: 958 W of 850 W (113%)". Status Errors with spec 019's E11 message. Availability: "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB isn't available to buy right now. Replace it to add this build to cart." |
| E8 | Intel Core Ultra 7 265K (a pre-order shipping 2027-02-01, saved before it became one) | The CPU stays. Its row: "Pre-order" and the same note. Total ₱20,995.00. "Estimated power: 325 W". Status OK (the 265K has integrated graphics), and the availability line names the 265K: a build can be OK and still not buyable |
| E9 | Build A, after the RTX 4060's stock drops to 0 and the 990 PRO becomes a pre-order | Both stay, each row with its label and the note. Status OK. Availability: "2 parts in this build aren't available to buy right now. Replace them to add this build to cart." |
| E10 | E9, then the shopper removes the RTX 4060 and the 990 PRO | Availability line gone. Status OK |

### Changing the build on `/builder`

| # | Start | Action | Expected |
| --- | --- | --- | --- |
| E11 | Build A | Remove the graphics card | Row shows "Choose a graphics card". Total ₱51,065.00. "Estimated power: 114 W of 550 W (21%)". OK (the 7600 has integrated graphics). No request is made |
| E12 | Build A | Memory quantity 1 → 2 | Row: "₱6,495.00 × 2", line ₱12,990.00. Total ₱75,555.00. OK (4 modules, 4 slots) |
| E13 | Build A, memory at 2 | Memory quantity 2 → 3 | Total ₱82,050.00. Errors: "3 kits of the Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 make 6 memory modules, but the ASUS ROG Strix B650-A Gaming WiFi has 4 memory slots." |
| E14 | Build A | Memory stepper at 1 | The decrease button is disabled. The increase button works up to 25 (Vengeance stock) |
| E15 | Build A, the 990 PRO now a pre-order | Storage stepper | Increase is disabled (not buyable). Decrease works down to 1 |
| E16 | Build A, Vengeance saved at quantity 30 (stock 25) | Load | Quantity 30 is kept and shown. Only decreasing is allowed |
| E17 | Build A | "Add another drive" | Goes to `/storage` |
| E18 | Build A | "Change" on the CPU row | Goes to `/cpu` |
| E19 | Build A in two tabs | Tab 2: remove the case | Tab 1 shows "Choose a case" without a reload |

### Add to build on the product page

| # | Saved build | Product page | Expected |
| --- | --- | --- | --- |
| E20 | Empty | `/cpu/amd-ryzen-5-7600`, Add to build | Saved: `[{ slot: "cpu", productId: <7600>, quantity: 1 }]`. "Added to your build. View build". "View build" → `/builder` shows the CPU (E2) |
| E21 | E20, then reload `/builder` | — | Skeleton, then the same build as E2 |
| E22 | Ryzen 5 7600 | Intel Core i5-14400F, Add to build | Dialog "Replace the CPU in your build?" / "This replaces the CPU you picked with the Intel Core i5-14400F." Replace → the CPU slot holds the i5, "Added to your build." |
| E23 | Ryzen 5 7600 | i5-14400F, Add to build, Cancel | Nothing saved changes. No status line |
| E24 | Ryzen 5 7600 | Ryzen 5 7600 again | No dialog, no change. "Already in your build." |
| E25 | Build A (Vengeance × 1) | Corsair Vengeance DDR5-6000 32 GB again | No dialog. Memory: Vengeance × 2. "Added to your build." |
| E26 | Build A, Vengeance × 25 (stock 25) | Vengeance again | No change. "Your build already has all 25 we have in stock." |
| E27 | Build A, Vengeance × 2 | G.Skill Flare X5 DDR5-6000 32 GB (2×16 GB) CL30 (stock 11) | Dialog "Replace the memory in your build?" / "This replaces the memory you picked with the G.Skill Flare X5 DDR5-6000 32 GB (2×16 GB) CL30, keeping 2 kits." Replace → Flare X5 × 2 |
| E28 | Build A, Vengeance × 12 | Flare X5 (stock 11) | Dialog body ends "keeping 11 kits." (capped at the new kit's stock). Replace → Flare X5 × 11 |
| E29 | Build A (Vengeance × 1) | Flare X5 | Dialog body: "This replaces the memory you picked with the G.Skill Flare X5 DDR5-6000 32 GB (2×16 GB) CL30." (no quantity sentence at 1). Replace → Flare X5 × 1 |
| E30 | Build A | Crucial MX500 1TB 2.5" SATA SSD | Storage: 990 PRO × 1, then MX500 × 1. No dialog |
| E31 | Build A | Samsung 990 PRO 1TB again | Storage: 990 PRO × 2. "Added to your build." |
| E32 | Build A, 990 PRO × 30 (stock 30) | 990 PRO again | No change. "Your build already has all 30 we have in stock." |
| E33 | Build A's 7 other parts + 13 different drives (20 products) | A 14th drive | No change. "Your build has the most parts it can hold. Remove a drive to add another." |
| E34 | Any | ASUS ROG Astral GeForce RTX 5090 (stock 0) | Add to build disabled, with "Only parts in stock can be added to a build." *Changed by spec 025 (#60): "Only parts in stock can be added to your cart or build."* |
| E35 | Any | Intel Core Ultra 7 265K (pre-order) | Add to build disabled, with the same line. The stock line still says "Pre-order: ships February 1, 2027" (spec 010, unchanged) |
| E36 | Empty | AMD Ryzen 7 9800X3D (low stock, 4 left) | Enabled. Adds the CPU |

### Parts request (`GET /api/builder/parts`)

| # | Request | Expected |
| --- | --- | --- |
| E37 | `?ids=<7600>,<rtx4060>` | 200, both parts with specs, prices, stock status and image. `Cache-Control: no-store` |
| E38 | `?ids=<7600>,<a well-formed id no product has>` | 200 with the 7600 only |
| E39 | `?ids=<7600>,<a draft product>` | 200 with the 7600 only |
| E40 | 20 distinct ids | 200 |
| E41 | 21 distinct ids | 400 |
| E42 | No `ids` parameter, or `?ids=` | 400 |
| E43 | `?ids=<7600>,,<rtx4060>` (an empty id) | 400 |
| E44 | An id that isn't shaped like a product id (`../admin`, `<script>`, 200 characters) | 400 |
| E45 | `?ids=<7600>,<7600>` | 400 |
| E46 | The same request twice, with the 990 PRO's price changed in between | The second response has the new price (nothing cached) |
| E47 | The page gets a 400 | The error state, as for a failed request (E54). The saved build is unchanged |

### Stale, corrupted and failed loads

| # | Saved build | Expected |
| --- | --- | --- |
| E48 | Ryzen 5 7600 + a GPU item whose id doesn't exist | Notice: "A part in your saved build is no longer available, so we removed it: Graphics Card." The CPU shows. Saved build now holds only the CPU. Reload: no notice |
| E49 | Build A with the RTX 4060 set to draft | Same as E48 for the Graphics Card slot (inactive counts as not found) |
| E50 | Two missing ids, in gpu and storage | "Some parts in your saved build are no longer available, so we removed them: Storage, Graphics Card." (slot order) |
| E51 | A storage item whose id is the Ryzen 5 7600 | Dropped (`wrong-category`), notice names Storage |
| E52 | Stored value isn't JSON, or `items` isn't a list | Empty build. Notice: "We couldn't read your saved build, so we started a new one." |
| E53 | Two storage items with the same id (hand-edited) | Merged by `parseBuild`, quantities summed. No notice |
| E54 | Build A, parts request fails | Slots keep their skeletons. "We couldn't load your build's prices and stock." + "Try again". Saved build unchanged. Try again succeeds → E3 |
| E55 | Build A, an admin changed the 990 PRO price between visits | The next visit shows the new price and total |
| E56 | Hand-edited: Build A's 7 other parts + 14 different drives (21 products) | The last drive is dropped on read, silently. The request has 20 ids |

### Page and SEO

| # | Check | Expected |
| --- | --- | --- |
| E57 | `/builder` HTML | `<meta name="robots" content="noindex">`, canonical `/builder`, title "PC Builder" |
| E58 | `sitemap.xml` | No `/builder` URL |
| E59 | `reserved-slugs.test.ts` | Passes. `builder`, `build`, `builds` are already reserved, and `api` covers the parts route |
| E60 | Home page | The hero link still reads "Build your PC Coming soon" (#54 removes the badge) |

## 4. Rules and edge cases

### Buyable

- **Buyable** = stock status "in stock" or "low stock" (`getStockStatus`), the `inStock` filter's meaning (spec 012). Out of stock and pre-order aren't buyable.
- **Adding** needs a buyable part: Add to build here, the picker in #54 (D7). Spec 010's disabled buttons for out-of-stock and pre-order parts stay as they are.
- **Keeping** doesn't: a saved part that stops being buyable stays in the build, with its row note and the summary's availability line (Behavior 13). Removing it silently would lose the shopper's pick, and the shopper may prefer to wait for the restock.
- The availability line counts **products**, not units: a drive × 2 that is out of stock is one part.

### Store

- **Stored shape:** `{ state: { items: BuildItem[] }, version: 1 }`, the store library's persist format. Version 1 is the first one, so there is nothing to migrate yet. A later version adds a migration, and its output still goes through `parseBuild`.
- **Order:** items are kept in slot order, with storage drives in the order they were added (as `parseBuild` returns them).
- **At most 20 different products** (`MAX_BUILD_PRODUCTS`, the same constant as the request cap). Only storage can reach it: 7 other slots + 13 drives. Adding a new drive to a full build is refused (E33). Raising a quantity is always allowed, since it adds no product. On read, a hand-edited build over the cap loses its last drives, silently (E56).
- **Writes before the read:** no store action runs before the saved build has been read (Behavior 22), so an empty in-memory build never overwrites a saved one.
- **`localStorage` unavailable** (blocked, private mode, quota): the builder works in memory for the visit, and nothing is shown. The next visit starts empty.
- **Which repairs show a notice:** `not-found` and `wrong-category` show the "no longer available" notice. `reset` shows the "couldn't read" notice. `invalid-entry`, `unknown-slot`, `invalid-quantity`, `merged-duplicate`, `extra-entry`, `quantity-set-to-1` and the over-cap drop are silent: the store's own actions can't produce them, so they come only from hand-edited data (D5).
- **Notice slots:** listed once each, in slot order, with the category names.
- **No upper limit on quantity** in the store (spec 018). The stepper and Add to build stop at the current stock (Behavior 14, 19). The memory-slots and M.2 rules, not a limit, explain board limits (D11).

### Parts request

- **Input**, checked by a Zod schema (D17): one `ids` query parameter, comma-separated, 1 to 20 ids, no duplicates, each shaped like a product id (a cuid: lowercase letters and digits). Anything else → 400 with no product data (E41–E45). The page only ever sends valid input, so a 400 means a bug or hand-made data, and the page shows its error state (E47).
- **Output:** 200 with one entry per active product found, in any order. Ids not found are simply absent (E38, E39). The page works out what's missing with `assembleBuild`.
- **Never cached:** the handler reads per request and answers with `Cache-Control: no-store`, so neither Next, a CDN nor the browser keeps a copy (ADR 0003, E46).
- **Specs that fail `validateSpecs`** (a bad manual edit, as in spec 010) are left out and logged on the server, so the page treats them as not found. The engine only ever sees valid specs (spec 018).
- **Stock status** uses `getStockStatus` with Manila's date on the server, as the product page does.

### Summary

- `checkBuild`, `buildStatus` and `estimateWattage` run in the browser on the assembled build, after every change, without a request.
- **Total** is an integer sum of centavos, formatted once. It isn't a checkout price: no shipping, vouchers or stock re-check (Checkout epic).
- Before the parts load, the summary shows skeletons, not ₱0.00 or "OK", so it never shows a figure for a build it hasn't checked.

### Add to build

- The slot is the product's category slug (every builder category is a slot).
- **Enabled only for buyable parts** (Rules › Buyable), using the status the page already shows.
- **Always one unit** (D15). A raise or a new entry is quantity + 1 or 1. The stock cap compares the saved quantity with the product's current stock, which the page has just rendered.
- **Memory replace** keeps the saved quantity, capped at the new kit's stock (E28). The dialog shows the resulting number, so nothing changes that the shopper didn't read.
- The dialog is a real modal: focus moves into it, Escape cancels, and focus returns to the button.
- The button reads the store when clicked, so a change made in another tab in the meantime is respected (Behavior 4).

### Accessibility

- Every slot row is a list item under a heading with its category name. Actions have accessible names that include the part or slot ("Remove AMD Ryzen 5 7600 from your build", "Change CPU", "Increase quantity of Corsair Vengeance…").
- Notices and the error state are announced (`role="status"` for notices, `role="alert"` for the load error). Notices can be dismissed.
- Status, issue severity and stock notes always come as text plus an icon, never as color alone.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Page title | PC Builder |
| Meta description | Pick a part for each slot and PC Silicon checks socket, memory, fit and power as you go. |
| Intro under h1 | Pick a part for each slot. We check that everything fits and has enough power as you go. |
| Empty slot links | Choose a CPU · Choose a motherboard · Choose memory · Choose storage · Choose a graphics card · Choose a case · Choose a power supply · Choose a CPU cooler |
| Part actions | Change · Remove · Add another drive |
| Accessible names | Change {slot name} · Remove {part} from your build · Decrease quantity of {part} · Increase quantity of {part} |
| Quantity line | {unit price} × {quantity} |
| Issue marker on a row | Error · Warning |
| Row note, not buyable | Not available to buy right now. Replace it to add this build to cart. |
| Summary heading | Your build |
| Total | Total |
| Power | Estimated power: {watts} · Estimated power: {watts} of {psuWatts} ({loadPercent}%) (spec 019) |
| Power tooltip trigger | How is this estimated? |
| Power tooltip | The CPU's and graphics card's maximum power draw, plus 30% headroom for the other parts and short power spikes. |
| Status labels | OK · Warnings · Errors |
| Empty build | Add parts to check compatibility. |
| No issues | No compatibility issues found. |
| Availability, one part | The {part} isn't available to buy right now. Replace it to add this build to cart. |
| Availability, several | {n} parts in this build aren't available to buy right now. Replace them to add this build to cart. |
| Cart button | Add build to cart (disabled). *Changed by spec 026 (#62): see spec 026 §5.* |
| Cart note | Adding a whole build to the cart is coming soon. |
| Removed, one | A part in your saved build is no longer available, so we removed it: {slot}. |
| Removed, several | Some parts in your saved build are no longer available, so we removed them: {slot}, {slot}. |
| Reset | We couldn't read your saved build, so we started a new one. |
| Notice close | Dismiss |
| Load error | We couldn't load your build's prices and stock. |
| Retry | Try again |
| Product page, added | Added to your build. |
| Product page, one-part slot unchanged | Already in your build. |
| Product page, at stock | Your build already has all {stock} we have in stock. |
| Product page, build full | Your build has the most parts it can hold. Remove a drive to add another. |
| Product page, link | View build |
| Product page, not buyable | Only parts in stock can be added to a build. *(Changed by spec 025 (#60): "Only parts in stock can be added to your cart or build.")* |
| Product page, cart note | Cart is coming soon. *(Changed by spec 025 (#60): removed; Add to cart works)* |
| Product page, pending | Checking your build… *(Changed by spec 024 (#68): added)* |
| Replace dialog title | Replace the {slot noun} in your build? |
| Replace dialog body | This replaces the {slot noun} you picked with the {part}. |
| Replace dialog body, memory, kept quantity > 1 | This replaces the memory you picked with the {part}, keeping {quantity} kits. |
| Replace dialog buttons | Replace · Cancel |

`{slot}` is the category name (CPU, Graphics Card, …). `{slot noun}` is its lowercase form in a sentence: CPU, motherboard, memory, graphics card, case, power supply, CPU cooler. Storage never replaces, so it has none.

## 6. Data and interfaces

No database, Prisma schema or migration change.

| Name | What it is |
| --- | --- |
| `zustand` | New dependency (PRD Stack: Builder state) |
| `isBuyable(status)` (`lib/stock`) | `true` for "in-stock" and "low-stock". Used by the product page, the slot rows and the summary here, and by #54 |
| `MAX_BUILD_PRODUCTS` | 20: the store's limit and the request schema's cap |
| Build store (client only, outside `lib/builder`) | State `{ items: BuildItem[] }` plus a `hydrated` flag. Persisted to `localStorage` key `pc-silicon-build`, version 1. Every read goes through `parseBuild` and the 20-product cap. Actions: add or raise (Behavior 19), replace, remove an entry, set a quantity, drop the items `assembleBuild` reported. Each keeps `SLOT_LIMITS` |
| `planAdd(items, product)` (pure) | What Add to build will do for `{ slot, productId, stock }`: `"add"`, `"raise"`, `"already"`, `"at-stock"`, `"full"`, or `"confirm-replace"` (with the memory quantity it will keep). The button and its tests use it |
| `builderPartsQuerySchema` (Zod) | The `ids` parameter's rules (Rules › Parts request). Pure, so its tests need no server |
| `GET /api/builder/parts?ids=a,b,c` (route handler) | 200 `{ parts: BuilderPartData[] }` with `Cache-Control: no-store`; 400 on bad input. Not a server action: it reads data and runs in parallel, like #54's candidate loader (D1) |
| `getBuilderParts(ids)` (server, `lib/`) | Loads active products by id with specs, prices, stock and the first image. Validates specs and returns `BuilderPartData[]` |
| `BuilderPartData` | `{ part: AnyBuildPart; slug; brand; price; salePrice; effectivePrice; stock; stockStatus; image: { url; alt } \| null }`: what a slot row, the total and the availability line need |
| `buildTotal(build, prices)` (pure) | Σ `effectivePrice` × quantity in centavos |
| `buildNotice(changes)` (pure) | The notice text from `BuildChange[]`, or none (Messages) |
| `/builder` page | Server-rendered shell with metadata (Behavior 17). Static: no database read on the server |
| Builder client components | Slot list, slot row, summary, notice. They reuse `ProductImage`, `formatPeso`, `stockStatusLabel`, `Skeleton`, `Tooltip` and `Button` |
| `AddToBuildButton` (client) | Replaces the disabled Add to build on the product page. Uses the existing `Dialog` for the confirmation |
| `e2e/test.ts` | The auto fixture also fails a test when React logs a hydration error (dev message, or minified errors #418/#423/#425 in production) |

Docs: `CLAUDE.md` replaces "`app/(store)/builder` is a 'coming soon' placeholder" with the builder page, the store, the parts route, the buyable rule and the rule that saved builds hold ids only. No ADR: ADR 0003 already covers per-request data, and the PRD chose Zustand. #54 writes ADR 0006.

## 7. Test plan

| Level | File (indicative) | Covers |
| --- | --- | --- |
| Unit | `lib/stock.test.ts` | `isBuyable` for all four statuses, including a pre-order whose ship date has passed |
| Unit | build store tests | Actions keep slot limits: E20, E22, E25, E27–E31, remove (E11), quantity (E12, E13). The 20-product cap (E33, E56). The persisted value holds only items and version 1. Reading corrupted or duplicate data goes through `parseBuild` (E52, E53). No write before the read |
| Unit | `planAdd` tests | Every row of Behavior 19: E20, E22, E24–E33 |
| Unit | `builderPartsQuerySchema` tests | E40–E45 |
| Unit | `buildTotal`, `buildNotice` | E1–E4, E7 (out-of-stock part still counts), E11–E13 totals. E48, E50–E52 copy, silent kinds (E53, E56) |
| Unit (component) | summary and slot row | E1 empty text, E3 power with PSU, E2 without, E5 warning, E6 error ordering. Not-buyable note and availability line, one and several (E7–E10). Stepper limits (E14–E16). Skeletons before load. Error state and Try again (E54) |
| Integration (Postgres) | `getBuilderParts` and the route handler, `*.db.test.ts` | Active only (E39, E49), unknown ids absent (E38), current price and `effectivePrice` (E4, E46, E55), stock status for in stock, low stock (E36), out of stock (E7) and pre-order (E8), invalid specs left out. The handler's 200 with `Cache-Control: no-store` (E37) and 400s (E41, E42) |
| E2E | `e2e/builder.spec.ts` | **AC:** `/cpu/amd-ryzen-5-7600` → Add to build → View build → `/builder` shows the CPU → reload → still there (E20, E21). Replace dialog (E22, E23). Memory raise from the product page (E25). Empty builder (E1) and "Choose a CPU" → `/cpu`. Errors status (E6). Memory quantity (E12, E13). Removed-part notice (E48): a real id comes from adding a part through the UI, then a fake GPU id is put in `localStorage`. Out-of-stock and pre-order disabled (E34, E35). The hydration guard runs on every test. Saved parts that aren't buyable (E7–E9) are covered by the component and integration rows above, not here: E2E has no database access, so it can't learn the id of an out-of-stock product |
| E2E (updated) | `product-page.spec.ts` | The "Cart is coming soon." line; Add to build enabled for an in-stock part |
| E2E (updated) | `seo.spec.ts` | E57: `/builder` is noindex with canonical `/builder`. E58: `sitemap.xml` has no `/builder` URL (the suite already fetches it; `sitemap.db.test.ts` tests data, not URLs) |
| Unit and E2E (existing) | `reserved-slugs.test.ts`, `home.spec.ts` | E59. E60: the hero test stays as is |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Slot picker, compatible-first lists, "Show all", greyed reasons, confirming incompatible picks; turning "Choose"/"Change" into the picker; replacing one specific drive in place | #54 |
| Removing the home hero's "Coming soon" badge from "Build your PC" | #54 |
| "Fits your build" hints and compatibility checks on product and listing pages | FR-10 (later builder story). *Changed by spec 024 (#68): done in spec 023 (hints) and spec 024 (confirmation before adding a part that doesn't fit).* |
| Adding the build to the cart, blocking on errors and on parts that aren't buyable, acknowledging warnings, the server re-check | Checkout epic |
| Saved builds, share links, syncing the build to the database when logged in | Saved builds story (FR-19, PRD Flow step 5) |
| A build count in the header; "Start over" / clear build | Later builder story |
| "Ask us" link on warnings (PRD Risks) | Later builder story |
| Notices for price changes since the last visit | Not planned |
| Mobile layout of the builder (below 1024 px it stacks, unpolished) | Phase 2 |
| Templates (PRD Flow step 1) | Phase 2 |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | Parts load through a `GET` route handler | A read that can run alongside others. Server actions are for mutations and run one at a time. #54 says the same for candidates | A server action. Rendering on the server from a cookie (the AC says `localStorage`) |
| D2 | `/builder` is a static shell and the browser loads the parts | The build exists only in the browser, so the server has nothing to render per visitor | `await connection()` with nothing to read |
| D3 | Items are dropped only after a successful load, and the drop is saved | A network error must never empty a build. Saving the drop makes the notice show once | Dropping on any failure. Keeping dead ids and warning on every visit |
| D4 | The notice names slots, not parts | `localStorage` has no names, and the server can't name a deleted product | Fetching names of drafts (would leak unpublished products) |
| D5 | Only `not-found`, `wrong-category` and `reset` show a notice | The other repairs come only from hand-edited data. A notice about duplicates would only confuse | A notice for every `BuildChange` |
| D6 | The replace dialog doesn't name the current part | The product page doesn't load the saved build's parts. "The CPU you picked" is enough to decide | An extra parts request on the product page |
| D7 | **One rule everywhere: only buyable parts (in stock or low stock) can be added to a build** (review decision). Spec 010 stays as is. **#54's picker follows the same rule**: this replaces the issues' looser wording ("disabled for out-of-stock parts" in #53, "out-of-stock parts can't be added" in #54), so pre-orders can't be added from the picker either | One meaning of "can be added", the same as the `inStock` filter and as what Add to cart will accept. A build should hold parts the shopper can buy now | Allowing pre-orders (the draft's reading of "matching the slot picker") |
| D8 | Memory keeps its quantity when replaced, capped at the new kit's stock, and the dialog says so | Matches `applyCandidate` (spec 018 D12), so the picker's checks and the result agree. The cap keeps the quantity buyable | Resetting to 1. Keeping a quantity above the new stock |
| D9 | The product page doesn't run the rules before adding | The AC asks only for the replace confirmation. Compatibility hints are FR-10 and need the build's parts on every product page | Loading the build and confirming errors on the product page. *Superseded by spec 024 (#68): the rejected alternative is what happens now.* |
| D10 | Storage drives get a quantity stepper too, and adding the same drive again raises its quantity | The data model allows it (spec 018), and the M.2 rule already counts quantity. Two identical drives are a real choice | Memory-only stepper, with a second identical drive impossible |
| D11 | The stepper and Add to build stop at current stock, not at the board's slots | The rules explain board limits in words. Stock is the one hard limit the shopper can't change | Capping at `memorySlots / moduleCount` (silently hides the rule) |
| D12 | An empty build shows "Add parts to check compatibility." instead of "OK" | "OK" for nothing reads as a passed check | Showing "OK" |
| D13 | Other tabs follow changes through the `storage` event | A shopper adds parts from product tabs while `/builder` is open. Without it, a stale tab would overwrite the build on its next change | Last write wins |
| D14 | The hydration guard joins the E2E key-warning fixture | The AC is "no hydration mismatch", and React logs it in both dev and production builds, so CI catches it | A one-off check in the builder spec |
| D15 | Add to build always adds one unit. The product page's quantity selector is for Add to cart only (review decision) | One meaning for one button. "2" would mean two kits, two drives or nothing, depending on the category | Using the selector's quantity |
| D16 | Until #54, "Choose" and "Change" link to the category listing (review decision) | Makes "parts can be changed" work now: listing → product page → Add to build → replace dialog. #54 changes only the link target | Disabled links until the picker ships |
| D17 | The parts request takes at most 20 ids, Zod-validated, 400 on anything else, never cached (review decision). The store keeps builds within the same 20 | A real build has 7 one-part ids plus its drives. A cap bounds the query, and a strict schema rejects junk before the database. Sharing the cap with the store means a valid build never gets a 400 | 50 ids. Silently ignoring bad ids |
| D18 | Memory: the same kit from the product page raises its quantity; a different kit asks to replace (review decision) | Adding the same kit again means "one more", as for drives | "Already in your build" for memory |
| D19 | A saved part that stops being buyable stays in the build, with a row note and a summary line (review decision). Availability is shown apart from the compatibility status | The pick is still the shopper's; they may wait for the restock or replace it. A build can be compatible and still not buyable, so mixing the two would blur both | Dropping it with a notice. Turning it into a compatibility warning |

## 10. Open questions

None. #54's acceptance criteria were updated on 2026-10-28 to match D7: parts that aren't buyable (out of stock or pre-order) are greyed out under "Show all" and can't be added. The draft's other questions were settled in review (D15, D16, and the hero badge moved to #54).

## Acceptance criteria mapping

The second criterion's "disabled for out-of-stock parts" is read as "disabled for parts that aren't buyable" (D7).

| Acceptance criterion | Covered by |
| --- | --- |
| Zustand store persisted to `localStorage` (with a version), only `{ slot, productId, quantity }`, slot limits from #51 | Behavior 1–3; Rules › Store; E20, E25–E33, E52, E53, E56 |
| Prices, stock and specs loaded fresh per request by id (ADR 0003), never in `localStorage`. Missing or inactive ids dropped, with a notice | Behavior 5–8; Rules › Parts request; E37–E51, E54, E55; D1–D5, D17 |
| `/builder` lists the 8 slots in `builderCategories` order with parts or "Choose a CPU". Remove, change, memory quantity, another drive | Behavior 10–14; E1, E11–E19; D16 |
| Sticky summary: total (`formatPeso`, price paid), "Estimated" wattage vs PSU, status, issues in plain language | Behavior 15; E2–E10, E11–E13; D12, D19 |
| "Add build to cart" shown, disabled, "coming soon" | Behavior 15; Messages; E1 |
| Product page Add to build: enabled for builder parts, disabled when not buyable (matching the picker), fills the slot (storage adds), asks before replacing, links to `/builder` | Behavior 18–23; E20–E36; D6–D9, D15, D18 |
| No hydration mismatch, skeleton until the saved build has loaded | Behavior 9, 22; E21; D14 |
| `/builder` noindex | Behavior 17; E57 (E2E `seo.spec.ts`) |
| `/builder` not in the sitemap | Behavior 17; E58 (E2E `seo.spec.ts`) |
| `builder`, `build`, `builds` reserved; `reserved-slugs.test.ts` passes | E59 |
| E2E: product page → Add to build → `/builder` shows the part; survives a reload | Test plan (E2E); E20, E21 |
