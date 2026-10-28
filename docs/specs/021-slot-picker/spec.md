# 021 — Slot part picker with compatible parts first

Status: **Approved** · Issue: #54 (epic #3, depends on #51, #52 and #53, all merged) · PRD refs: PC Builder › Flow (step 3); Non-functional requirements › Performance (builder feedback < 100 ms)

## 1. Summary

This story adds the slot picker, the builder's main way to fill a slot. "Choose a CPU" and "Change" on `/builder` stop linking to the category listing. They now open a list of that category's parts, checked against the current build in the browser. By default the list shows only parts that fit (no errors) and can be bought now. Warnings stay in the list with a badge. "Show all" adds every other active part, greyed out, with the reasons in plain language. It is the PRD's core promise, "only compatible, in-stock parts by default" (Flow step 3), and the first screen that runs `checkCandidate` (spec 018, spec 019). ADR 0006 records the choice to filter in memory, not in SQL.

## 2. Behavior

### Opening the picker

1. On `/builder`, each slot's actions open the picker instead of linking to the listing (spec 020 D16 ends here):
   - **Empty slot:** "Choose a CPU" (and the other `SLOT_COPY.choose` labels) opens it to **add** a part.
   - **Filled one-part slot or memory:** "Change" opens it to **replace** the part.
   - **Storage:** "Choose storage" and "Add another drive" open it to **add** a drive. Each drive gets its own "Change", which opens it to **replace that drive** (spec 018's `{ replace }`).
2. These are buttons, not links. They show only once the saved build and its parts have loaded (spec 020 Behavior 9), so the picker always checks a complete build.
3. The picker is a large modal dialog over `/builder` (D1, review decision). Its title says what it does (Messages).
   - **Focus:** on open, focus moves into the dialog. On close, it returns to the button that opened it, except after a pick (Behavior 14).
   - **Closing:** Escape and "Close" close it without changes.
   - **Layout:** the header (title and "Close"), the "Show all" toggle, the count line, the notes and the banner stay fixed at the top. Only the list scrolls, inside the dialog. The page behind it doesn't scroll.

### Loading candidates

4. Every time the picker opens, it makes one request: `GET /api/builder/candidates?slot=<slug>`. The response holds every **active** product in the slot's category, with its specs, card data (`productCardSelect` / `toProductCardData`), `effectivePrice`, stock and stock status. Nothing is cached, by Next or the browser (ADR 0003: per-request data). The server's Manila date comes back with it, so the cards and the buyable rule agree on pre-orders.
5. **Loading:** the dialog opens at once with its title, the "Show all" toggle (disabled) and skeleton cards in the list area. Screen readers hear "Loading CPUs…".
6. **Error:** if the request fails (network, server error, or a 400), the list area shows "We couldn't load the CPUs." with "Try again", which repeats the request. The toggle stays disabled, "Close" still works, and the build is untouched.
7. While it is open, nothing else is requested. Changing the toggle, or a change to the build (from another tab, spec 020 Behavior 4), only re-runs the checks in the browser.

### Checking and sorting

8. For every candidate the browser runs `checkCandidate(build, slot, part, options)` against the current build (with `{ replace }` when a drive is being changed). The result puts each candidate into one group, in this order:

   | Group | Meaning | Default list | With "Show all" |
   | --- | --- | --- | --- |
   | Fits | Buyable, no issues | Shown | Shown |
   | Fits with warnings | Buyable, warnings only | Shown, with a "Warning" badge and the messages | Shown, same |
   | Fits, not buyable | No errors, but out of stock or a pre-order | Hidden | Greyed, with the stock reason |
   | Doesn't fit | One or more errors (buyable or not) | Hidden | Greyed, with every error message, plus the stock reason if it isn't buyable |

   **Precedence:** errors decide first. A part that doesn't fit and also can't be bought goes in "Doesn't fit", shows both reasons (errors, then stock), and can't be added: no "Add anyway" (D5, E14a).

   "Buyable" means in stock or low stock (`isBuyable`, spec 020 Rules › Buyable). Pre-orders are hidden by default and can't be added (spec 020 D7).
9. Within every group, parts are sorted by `effectivePrice`, cheapest first, then by name. There is no sort control (D6, review decision).
10. A line above the list counts the default list: "6 of 18 motherboards fit your build and are in stock." With "Show all" on: "Showing all 18 motherboards."
11. **"Show all"** is a checkbox above the list, off each time the picker opens. Turning it on or off changes the list without a request and keeps focus on the checkbox.

### A candidate card

12. Each candidate is a `ProductCard` (list layout): image, brand, name linked to its product page, spec summary, price and stock label, as in the category listing. Below it, the picker adds:
    - **Warnings** (Fits with warnings): a "Warning" badge (icon plus text) and each warning message.
    - **Reasons** (greyed cards): each error message, then the stock reason ("Out of stock", or "Pre-order: ships February 12, 2027"), as visible text with an icon. The reasons are plain text in the card, not a tooltip, so keyboard and screen-reader users get all of them.
    - **Markers for parts already in the build** (Rules › Current part):
      - **"Current":** the part being changed, when the picker was opened with "Change" (a one-part slot, memory, or the one drive being replaced). It has no button: it can't be added.
      - **"In your build (×2)":** when adding a drive, a drive the build already holds. It keeps its button, which adds one more.
      - When replacing a drive, another drive the build holds shows "In your build (×1)" and keeps its button: picking it merges the two (E22).
    - **One action button** (Behavior 13), except on the "Current" part.
13. **Actions:**

    | Candidate | Button | Result |
    | --- | --- | --- |
    | Buyable, no errors | "Add to build" | Adds or replaces at once (Behavior 14) |
    | Buyable, with errors | "Add anyway" | A confirmation dialog that names the errors (Behavior 15) |
    | Not buyable (with or without errors) | "Add to build", disabled, with "Only parts in stock can be added to a build." | Nothing (spec 020 D7) |
    | The "Current" part (opened with "Change") | No button, only "Current" | — |
    | A drive already in the build, at its stock (storage add) | Disabled, with "Your build already has all {stock} we have in stock." | Nothing (spec 020 `planAdd`) |
    | A new drive when the build holds 20 products (storage add) | Disabled. A note above the list says "Your build has the most parts it can hold. Remove a drive to add another." | Nothing |

14. **Adding:** the picker uses the store's actions, read at the moment of the click (spec 020 Rules › Add to build):
    - **One-part slot:** empty → the part is added. Filled → it is replaced at once, with no "Replace?" dialog: the shopper opened the picker with "Change" (D4).
    - **Memory:** the new kit keeps the saved quantity, capped at its stock (spec 020 D8). With 2 kits or more, a note above the list says so (Messages).
    - **Storage, adding:** a new drive is added after the others (quantity 1). A drive already in the build goes up by one (`planAdd` "raise").
    - **Storage, replacing:** the new drive takes the old one's place and quantity, capped at its stock. If it is already in the build elsewhere, the two entries merge (as `applyCandidate` does, spec 018).
    - Then the picker closes. The slot shows the new part at once, from the data the picker already has, with no new request. Focus goes to that slot's "Change" button (storage: the new drive's "Change"). The summary updates from the rules, as for any change (spec 020 Behavior 15).
15. **Adding a part that doesn't fit:** "Add anyway" opens a confirmation dialog: "Add a part that doesn't fit?" Its body names the part and lists every error message. It says the build can't be added to cart until they're fixed. "Add anyway" adds the part as in Behavior 14. "Cancel" changes nothing and returns focus to the card's button. Warnings never ask for confirmation: the Checkout epic asks the shopper to acknowledge them.

### Problems no candidate fixes

16. `checkCandidate` doesn't blame a candidate for an error the build already has (spec 019 D7). The picker shows those errors once, in a banner above the list (spec 019 D9). The banner holds the **errors** of the build with this slot empty (for storage, without the drive being replaced): "Picking a CPU won't fix this:" followed by the messages. Warnings aren't repeated there, since the summary already lists them (D7).

### Empty states

17. When the default list is empty, the picker says why and what to change. One of these applies:
    - **No active products in the category:** "There are no CPU coolers in the store right now." The "Show all" toggle is hidden.
    - **Some parts fit, but none is buyable:** "No motherboard that fits your build is in stock right now. Turn on "Show all" to see the ones that fit, or change your CPU or case."
    - **Nothing fits:** "No motherboard fits your build. Turn on "Show all" to see why, or change your CPU or memory."

    "Change your …" names the other slots whose parts appear in the candidates' errors, in slot order (Rules › Empty states). With "Show all" on, the list is never empty unless the category is.

### Elsewhere

18. The home hero's "Build your PC" link loses its "Coming soon" badge (moved here from spec 020).
19. The product page's Add to build, and its replace dialog, stay as spec 020 defines them.

## 3. Examples

Prices and stock are seed values on 2026-10-28 (Manila). "Build A" is spec 001's compatible build (`buildA`): AMD Ryzen 5 7600, ASUS ROG Strix B650-A Gaming WiFi, Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30, Samsung 990 PRO 1TB NVMe SSD, ASUS Dual GeForce RTX 4060 OC Edition 8GB, Lian Li LANCOOL 216 Black, Cooler Master MWE 550 Bronze V2, Thermalright Peerless Assassin 120 SE. Results were computed with the engine on the current seed.

### The default list and "Show all"

| # | Build | Slot | Expected |
| --- | --- | --- | --- |
| E1 | Empty | CPU | 23 of 26 CPUs. Hidden: Intel Core Ultra 7 265K (pre-order), AMD Ryzen 9 9900X (pre-order), AMD Ryzen 7 5800X3D (out of stock). "23 of 26 CPUs fit your build and are in stock." No banner |
| E2 | Ryzen 5 7600 | Motherboard | 6 of 18, in this order: ASRock A620M-HDV/M.2 (₱4,495.00, on sale), ASRock B650M-HDV/M.2 (₱6,495.00), Gigabyte B650 AORUS ELITE AX (₱12,995.00), ASUS ROG Strix B650-A Gaming WiFi (₱14,995.00), ASUS TUF Gaming B850-PLUS WiFi (₱15,495.00), ASRock B650I Lightning WiFi (₱15,500.00, "Low stock"). None has a badge. Hidden: Gigabyte X870E AORUS ELITE WiFi7 (AM5, out of stock) and the 11 LGA1700, LGA1851 and AM4 boards |
| E3 | E2 | Motherboard, "Show all" on | 18 cards: the 6 above, then X870E greyed with "Out of stock", then the 11 others greyed, by price. MSI PRO B760M-A WiFi DDR4: "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4." MSI MAG Z890 Tomahawk WiFi: the LGA1851 socket message, then "Pre-order: ships February 12, 2027". "Showing all 18 motherboards." No request is made |
| E4 | E3 | Toggle off | Back to E2's 6. No request |
| E5 | AMD Ryzen 7 9800X3D | Motherboard | 6 shown. ASUS TUF Gaming B850-PLUS WiFi first, with no badge (its group comes first). Then the five B650/A620 boards, each with "Warning" and "The ASUS ROG Strix B650-A Gaming WiFi may need a BIOS update to run the AMD Ryzen 7 9800X3D: its launch BIOS supports Zen 4 (Ryzen 7000), not Zen 5 (Ryzen 9000)." (with its own board name) |
| E6 | Build A | Graphics card ("Change") | 21 of 30 shown. RTX 4060 is marked "Current" and has no button. Warnings: Sapphire PULSE Radeon RX 7800 XT 16GB (84%), ASUS Prime GeForce RTX 5070 Ti OC Edition 16GB (92%), Sapphire PULSE Radeon RX 9070 XT 16GB (93%), Sapphire NITRO+ Radeon RX 9070 XT OC 16GB (99%), each with spec 019's "close to its limit" message. Hidden: MSI GeForce RTX 5080 16G Gaming Trio OC, MSI GeForce RTX 5090 32G Gaming Trio OC and Sapphire PULSE Radeon RX 7900 XTX 24GB (errors, e.g. "…need an estimated 595 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies."); ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB and ASUS TUF Gaming GeForce RTX 5080 OC Edition 16GB (error and out of stock); MSI GeForce RTX 5070 Ti 16G Ventus 3X OC (warning, out of stock); ASUS Dual GeForce RTX 3060 V2 OC Edition 12GB (out of stock); MSI GeForce RTX 5060 Ti 16G Ventus 2X OC Plus and ASUS Prime Radeon RX 9070 OC Edition 16GB (pre-orders) |
| E7 | Build A | CPU cooler | 12 of 13 shown. Hidden: Noctua NH-L9i-17xx Low-Profile Cooler. With "Show all": "The Noctua NH-L9i-17xx Low-Profile Cooler doesn't support the AM5 socket of the AMD Ryzen 5 7600. It supports LGA1700 and LGA1851." |
| E8 | Build A | Power supply | 9 of 12. Hidden: Corsair SF750 750W SFX and Lian Li SP850 850W SFX ("…(SFX) doesn't fit the Lian Li LANCOOL 216 Black, which takes ATX power supplies."), and Corsair SF850L 850W SFX-L (same error, out of stock) |
| E9 | Build A | Storage ("Add another drive") | All 20 drives fit (no errors). 18 of 20 are shown: the Samsung 9100 PRO 2TB (pre-order) and the Seagate IronWolf 8TB (out of stock) are hidden. The 990 PRO shows "In your build (×1)" and "Add to build" (adds a second unit). No part is marked "Current" |

### Adding

| # | Build | Action | Expected |
| --- | --- | --- | --- |
| E10 | E2 | "Add to build" on the Strix B650-A | The picker closes. The motherboard row shows the Strix B650-A at once, with no request. Focus on "Change Motherboard". Status OK |
| E11 | Build A | Change CPU → "Add to build" on AMD Ryzen 7 7700 | Replaced at once, no "Replace?" dialog. Status OK |
| E11a | Build A | Change CPU | AMD Ryzen 5 7600 stays in "Fits" at its price position (₱11,495.00), marked "Current", with no button. Every other fitting CPU has "Add to build" |
| E11b | Build A, Vengeance × 2 | Change memory | Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 is marked "Current" with no button. Its quantity is changed with the stepper on `/builder`, not here |
| E12 | Build A | Change CPU → AMD Ryzen 9 9950X | Shown with two warnings (82% power, BIOS update). "Add to build" replaces with no confirmation. Status Warnings |
| E13 | E3 | "Add anyway" on the MSI PRO B760M-A WiFi DDR4 | Dialog "Add a part that doesn't fit?" with the socket message. "Add anyway": the board is added, the dialog and picker close, status Errors (spec 020 E6). "Cancel": nothing changes, focus back on "Add anyway" |
| E14 | E3 | X870E (out of stock) and Z890 Tomahawk (pre-order, also an error) | Each has "Add to build" disabled with "Only parts in stock can be added to a build." Z890 never offers "Add anyway": not buyable wins |
| E14a | Build A | Change graphics card, "Show all" on | ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB (stock 0) is in "Doesn't fit", not "Fits, not buyable", sorted by price among the incompatible cards. Greyed, with "The AMD Ryzen 5 7600 and the ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB need an estimated 862 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies." then "Out of stock". "Add to build" disabled with "Only parts in stock can be added to a build.", and no "Add anyway". The ASUS Dual GeForce RTX 3060 V2 OC Edition 12GB (out of stock, no error) is in "Fits, not buyable", above every incompatible card |
| E15 | Build A, Vengeance × 2 | Change memory | Note: "Your build has 2 kits of memory. The kit you pick keeps that quantity, up to its stock." Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36 is hidden: "2 kits of the Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36 make 8 memory modules, but the ASUS ROG Strix B650-A Gaming WiFi has 4 memory slots." G.Skill Flare X5 → Flare X5 × 2 |
| E16 | Build A, Vengeance × 12 | Change memory → G.Skill Flare X5 (stock 11) | Flare X5 × 11 (capped at stock) |
| E17 | Build A | Add another drive → Crucial MX500 1TB | Storage: 990 PRO × 1, MX500 × 1 |
| E18 | Build A | Add another drive → Samsung 990 PRO 1TB | 990 PRO × 2 |
| E19 | Build A, 990 PRO × 30 (stock 30) | Add another drive | 990 PRO disabled with "Your build already has all 30 we have in stock." |
| E20 | Build A's 7 other parts + 13 drives (20 products) | Add another drive | Note "Your build has the most parts it can hold. Remove a drive to add another." Every drive not yet in the build is disabled. Those in it can still go up by one |
| E21 | Build A + MX500 | "Change" on the 990 PRO → WD_BLACK SN850X 2TB | Storage: SN850X × 1 (in the 990 PRO's place), MX500 × 1 |
| E21a | Build A + MX500 | "Change" on the 990 PRO | Title "Replace the Samsung 990 PRO 1TB NVMe SSD". The 990 PRO is marked "Current" with no button. The MX500 shows "In your build (×1)" and "Add to build" |
| E22 | Build A + MX500 | "Change" on the 990 PRO → Crucial MX500 | The two merge: MX500 × 2 |

### Banner and empty states

| # | Build | Slot | Expected |
| --- | --- | --- | --- |
| E23 | MSI GeForce RTX 5090 32G Gaming Trio OC + Cooler Master MWE 550 Bronze V2 | CPU | Banner: "Picking a CPU won't fix this:" "The MSI GeForce RTX 5090 32G Gaming Trio OC needs an estimated 748 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies." No CPU card carries that error (e.g. Ryzen 5 7600: no issues), so 23 are shown |
| E24 | E23 | Graphics card | No banner: with the GPU slot empty, the build has no error |
| E25 | Intel Core i5-14400F | Graphics card | No banner. The build's "no integrated graphics" warning is a warning (D7), and every GPU candidate fixes it anyway |
| E26 | Ryzen 5 7600 + Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 | Motherboard | Empty: "No motherboard fits your build. Turn on "Show all" to see why, or change your CPU or memory." "Show all": all 18 greyed (AM5 boards: the DDR4 message; the others: the socket message, some both) |
| E27 | Ryzen 5 7600 + Fractal Design Ridge Black, ASRock B650I Lightning WiFi set to stock 0 (fixture) | Motherboard | Empty: "No motherboard that fits your build is in stock right now. Turn on "Show all" to see the ones that fit, or change your CPU or case." (the boards with another socket name the CPU) "Show all": B650I Lightning first, greyed with "Out of stock". The others say "…(ATX) doesn't fit the Fractal Design Ridge Black, which takes Mini-ITX boards." |
| E28 | Any | A category with no active products (fixture) | "There are no CPU coolers in the store right now." No toggle |
| E29 | Ryzen 5 7600 + Fractal Design Ridge Black (seed stock) | CPU cooler | 2 of 13 without warnings or errors: Noctua NH-L9a-AM5 and Arctic Liquid Freezer III 280. NZXT Kraken 240 and Arctic Liquid Freezer III 360 also shown with the radiator-fit warning. The 9 others are hidden (cooler height, or the NH-L9i's socket) |

### Loading, errors, changes while open

| # | Situation | Expected |
| --- | --- | --- |
| E30 | Open the CPU picker | Skeletons and a disabled toggle until the response arrives, then E1 |
| E31 | The candidates request fails | "We couldn't load the CPUs." + "Try again". Try again succeeds → E1. The build is unchanged |
| E32 | Picker open on the motherboard slot (E2). Another tab replaces the CPU with an Intel Core i5-14400F | The list re-checks with no request: now the 5 LGA1700 boards, all in stock (any BIOS-update warnings as badges) |
| E33 | "Change" on the 990 PRO open. Another tab removes the 990 PRO | The picker switches to adding a drive (title "Add a drive"). Picking adds it |
| E34 | Open the CPU picker twice, with the 7600's price changed in between | The second time shows the new price (nothing cached) |

### Route (`GET /api/builder/candidates`)

| # | Request | Expected |
| --- | --- | --- |
| E35 | `?slot=motherboard` | 200 with 18 candidates, each with specs, card data, `effectivePrice`, stock and status, and `today`. `Cache-Control: no-store` |
| E36 | `?slot=cpu` with one CPU set to draft | 200 with 25 |
| E37 | A product whose specs fail `validateSpecs` | Left out and logged, as in spec 020 |
| E35a | `?slot=cpu-cooler` (a slug with a hyphen) | 200 with 13 candidates |
| E38 | `?slot=keyboard` (not one of the eight) | 400 |
| E38a | No `slot` parameter, or `?slot=` | 400 |
| E38b | `?slot=CPU`, `?slot=%20cpu`, `?slot=cpu%20` (case or spaces) | 400: the slot must match exactly, nothing is trimmed or lowercased |
| E38c | `?slot=cpu&slot=gpu` (repeated) | 400 |
| E38d | `?slot=fans` (a plausible category slug that isn't one of the eight slots) | 400 |
| E38e | `?slot=../admin`, `?slot=<script>`, 200 characters | 400, with no product data in the body |

### Performance

| # | Check | Expected |
| --- | --- | --- |
| E39 | Build A, all 30 GPUs: `checkCandidate` for each, then grouped and sorted (the picker's whole re-check for one build change) | After 5 warm-up runs, the median of 20 timed runs is under 50 ms (half the 100 ms budget, D9) |

### End to end (epic)

| # | Journey | Expected |
| --- | --- | --- |
| E40 | Empty `/builder` → "Choose a CPU" | Focus is inside the dialog. Escape closes it, and focus is back on "Choose a CPU" |
| E41 | "Choose a CPU" again → "Add to build" on AMD Ryzen 5 7600 → "Choose a motherboard" | The list has 6 AM5 boards. No MSI PRO B760M-A WiFi DDR4 |
| E42 | E41 → "Show all" | The MSI PRO B760M-A WiFi DDR4 is greyed with the socket message |
| E43 | E42 → "Close" | Focus is back on "Choose a motherboard". Nothing changed |
| E44 | "Choose a motherboard" → "Add to build" on the ASUS ROG Strix B650-A Gaming WiFi | The picker closes, focus is on "Change Motherboard". Summary status "OK" |

## 4. Rules and edge cases

### Candidates

- **Which products:** every `ACTIVE` product of the slot's category, however many there are (no pagination, ADR 0006). Drafts and archived products never appear.
- **Data per candidate:** the card data from `productCardSelect` / `toProductCardData`, plus what the rules and the build need (`id`, validated specs, `effectivePrice`, stock, stock status). Specs that fail `validateSpecs` are left out and logged, so the engine only sees valid specs (spec 018 D9).
- **Stock status** uses `getStockStatus` with Manila's date on the server. The response carries that date, and the cards use it, so a card's label and the buyable rule never disagree.
- **Never cached** (ADR 0003). Each opening of the picker asks again. Opening it is a deliberate step, and a fresh stock list is what the AC asks for.
- **Input**, checked by a Zod schema like the parts route's (spec 020 D17): exactly one `slot` query parameter whose value is one of the eight slot names (`SLOTS`), matched exactly, with no trimming or lowercasing. Anything else (missing, empty, repeated, unknown, wrong case) is a 400 with no product data (E38–E38e). The page only sends valid slugs, so a 400 means a bug, and the picker shows its error state.

### Checking

- Checks run in the browser, on the build the page already has, after every change of the build or the toggle, without a request.
- **Options:** one-part slots and memory check with the candidate replacing the current part. Storage checks with the candidate added, or replacing the drive being changed (`{ replace }`). A replace id that is no longer in the build would throw (spec 018 E58), so the picker checks and adds as "add a drive" instead (E33).
- **Memory quantity:** the check uses the saved quantity (`applyCandidate`), while adding caps it at the new kit's stock. A cap only lowers the module count and capacity, so a kit that passes the check still passes after the cap.
- **Severity:** errors decide "Doesn't fit". Warnings never hide a part. Errors come before stock: a part with errors is in "Doesn't fit" whether or not it is buyable (E14a).

### Current part

- **"Current"** marks the part being changed: the slot's part for a one-part slot or memory opened with "Change", or the drive named in `{ replace }` for a storage "Change". There is no "Current" when the picker was opened to add ("Choose…", "Add another drive").
- The "Current" part **can't be added**: it has no button. Picking it again would change nothing in a one-part slot, and memory and drive quantities are changed with the stepper on `/builder` (spec 020 Behavior 14).
- It is checked like any other candidate and sorted in its group, so it can be hidden by default (out of stock now, or an error the build has). That's fine: the slot row on `/builder` still shows it.
- **"In your build (×n)"** marks a drive the build holds that isn't the one being changed. It keeps its button: adding raises its quantity, and replacing with it merges the two entries.

### Ordering and counts

- Group order: Fits → Fits with warnings → Fits, not buyable → Doesn't fit. Within a group: `effectivePrice` ascending, then name, then id, so the order is stable.
- The count line counts the default list against all active candidates in the category.

### Greyed cards

- Greyed means a muted card (lighter background, faded image), not faded text. Names, prices and reasons keep WCAG AA contrast, since the card still has a working link and, for errors, a working button.
- Reasons are text in the card with an icon, never color alone, never a tooltip.
- A card that is both incompatible and not buyable lists every error, then the stock reason, and has the disabled button (not "Add anyway").

### Banner

- It shows `checkBuild(baseline)`'s errors, where the baseline is the build with this slot empty (storage: without the drive being replaced; adding: the build as it is). Those errors stay whatever the shopper picks here, so they're never blamed on a candidate.
- Warnings aren't in the banner. Only the integrated-graphics warning comes from an empty slot, and showing it in the GPU picker would be wrong (E25).
- It is a `role="status"` region inside the dialog, above the list, with the "Error" icon and text.

### Empty states

- "Change your …" names the other slots (not the one being picked) of the parts in every candidate's error `parts`, each once, in slot order, as lowercase nouns joined by commas and a final "or": "CPU or memory", "CPU, memory or case".
- If no other slot is named (all the errors come from the candidates alone, which the 14 rules don't produce), the sentence ends after "see why".
- Which state applies: no active products → the first. Otherwise, any candidate with no errors → the second (all of them aren't buyable). Otherwise → the third.

### Adding

- **Only buyable parts can be added** (spec 020 D7), with or without errors.
- **The store decides at the moment of the click**, like Add to build on the product page. If another tab has changed the slot since the list was drawn, the click applies to the build as it is now (one-part slot: replace; storage: `planAdd`).
- **One unit per pick**, except memory and replaced drives, which keep their quantity up to stock (Behavior 14).
- **The 20-product cap** applies to adding a drive (spec 020 Rules › Store). Replacing a drive never adds a product.
- **No double add:** the button does nothing while its add is being applied, and the picker closes after it.

### Accessibility

- The dialog has a heading (its title), the toggle has a visible label, and the list is a list of cards with level-3 headings.
- Focus moves into the dialog on open and back to the button that opened it on close (Escape or "Close"). After a pick, it goes to the slot's "Change" instead, since the "Choose…" button is gone (Behavior 14).
- Only the list scrolls. The header, toggle, count line, notes and banner stay in view, so the controls and the build's problems are always reachable.
- Action buttons name the part: "Add AMD Ryzen 5 7600 to your build", "Add MSI PRO B760M-A WiFi DDR4 to your build anyway".
- Disabled buttons are linked to their reason with `aria-describedby`, as on the product page.
- The count line is a polite live region, so turning "Show all" on or off is announced ("Showing all 18 motherboards.").
- The confirmation dialog is a real modal on top of the picker. Escape closes only that dialog.

## 5. Messages and copy

`{noun}` is `SLOT_COPY`'s noun (CPU, motherboard, memory, graphics card, case, power supply, CPU cooler; storage: drive). `{plural}` is new copy per slot: CPUs, motherboards, memory kits, drives, graphics cards, cases, power supplies, CPU coolers.

| Where | Text |
| --- | --- |
| Slot buttons (were links) | Choose a CPU · … (`SLOT_COPY.choose`) · Change · Add another drive |
| Accessible names | Change {slot name} (as now) · Change {drive name} |
| Picker title, adding | Choose a CPU · … (`SLOT_COPY.choose`); storage: Add a drive |
| Picker title, replacing | Change the {noun}; storage: Replace the {drive name} |
| Close button | Close |
| Loading (screen readers) | Loading {plural}… |
| Load error | We couldn't load the {plural}. |
| Retry | Try again |
| Toggle | Show all |
| Count, default | {shown} of {total} {plural} fit your build and are in stock. |
| Count, show all | Showing all {total} {plural}. |
| Banner | Picking a {noun} won't fix this: · then each error message |
| Memory note (quantity ≥ 2) | Your build has {n} kits of memory. The kit you pick keeps that quantity, up to its stock. |
| Build full note (storage add) | Your build has the most parts it can hold. Remove a drive to add another. (spec 020) |
| Warning badge | Warning |
| Part being changed | Current |
| Drive already in the build | In your build (×{quantity}) |
| Stock reasons | Out of stock · Pre-order: ships {date} (spec 010's format) |
| Buttons | Add to build · Add anyway |
| Button accessible names | Add {part} to your build · Add {part} to your build anyway |
| Disabled reason, not buyable | Only parts in stock can be added to a build. (spec 020) |
| Disabled reason, at stock | Your build already has all {stock} we have in stock. (spec 020) |
| Confirm title | Add a part that doesn't fit? |
| Confirm body | The {part} doesn't fit your build: · each error message · You can still add it, but you can't add the build to your cart until this is fixed. |
| Confirm buttons | Add anyway · Cancel |
| Empty, no products | There are no {plural} in the store right now. |
| Empty, none buyable | No {noun} that fits your build is in stock right now. Turn on "Show all" to see the ones that fit, or change your {slots}. |
| Empty, none fit | No {noun} fits your build. Turn on "Show all" to see why, or change your {slots}. |

"{noun}" in the empty states for memory reads "No memory kit…" and for storage "No drive…". `{slots}` uses the same nouns ("CPU or memory").

## 6. Data and interfaces

No database, Prisma schema or migration change.

| Name | What it is |
| --- | --- |
| `GET /api/builder/candidates?slot=<slug>` (route handler) | 200 `{ today, candidates: BuilderCandidate[] }` with `Cache-Control: no-store`; 400 on a bad slot. Not a server action (spec 020 D1) |
| `builderCandidatesQuerySchema` (Zod, pure, next to `builderPartsQuerySchema`) | Exactly one `slot`, one of the eight `SLOTS`, matched exactly (Rules › Candidates) |
| `getBuilderCandidates(slot, today)` (server, `lib/`) | The category's active products, loaded with `productCardSelect` plus id, `effectivePrice` and specs. Validates specs; returns `BuilderCandidate[]` |
| `BuilderCandidate` | `{ data: BuilderPartData; card: ProductCardData }`: what the rules and the slot row need (spec 020), and what the card shows, from one row |
| `pickerList(build, slot, candidates, { mode, replace?, showAll })` (pure, `lib/build-state`) | `mode` is add or change. Runs `checkCandidate` per candidate and returns the visible entries (candidate, issues, group, buyable, marker: current or in-build quantity, action) in order, the counts, the banner errors, and the empty state with its "change your" slots |
| `ProductCard` | Gains a greyed variant and a place below the card body for the picker's badge, reasons, marker and button. Listings render it as today |
| Build store | Gains replacing one drive (keeps its position and quantity up to stock, merges into an existing entry). Spec 020's actions cover the rest |
| `useBuildParts` | Accepts part data the picker already has, so a picked part shows without a request |
| `SlotSection` | "Choose", "Change" and "Add another drive" become buttons that open the picker; each drive gets "Change" |
| Slot picker (client component) | The dialog: request, toggle, list, banner, empty, loading and error states, the confirmation. Uses `Dialog`, `Checkbox`, `Skeleton`, `Button`, `ProductCard` |
| `SLOT_COPY` | Gains `plural`, and storage's noun "drive" |
| `lib/builder/check.bench.ts` | Its comment points to the new timing test |
| ADR 0006 | "Filter builder candidates in memory with the shared engine" (Decisions D2): the size assumption (about 30 active parts in the largest category today, GPUs), when to revisit (a category above about 500 active parts, or non-builder categories in the picker), and that checkout re-checks the build on the server with the same engine |

Docs: `CLAUDE.md` gets the picker (the candidates route, `pickerList`, the groups, buyable-only adds, the banner) and ADR 0006, and drops "until #54" wording. `docs/prd.md` doesn't change.

## 7. Test plan

| Level | File (indicative) | Covers |
| --- | --- | --- |
| Unit | `pickerList` tests (real seed parts via `test-support/seed-parts`) | Groups and order: E1–E9, E29. Precedence: E14, E14a. Markers: E6, E9, E11a, E11b, E21a. Banner: E23–E25. Empty states and "change your" slots: E26–E28. Storage replace and fallback to add: E21, E22, E33. Memory note: E15 |
| Unit (timing) | `lib/build-state/picker-list.perf.test.ts`, in `pnpm test` and CI | E39 |
| Unit | `builderCandidatesQuerySchema` | E35a, E38–E38e |
| Unit | Build store | Replacing a drive (E21, E22), memory cap (E16), 20-product cap (E20) |
| Unit (component) | Slot picker, `ProductCard` greyed | Loading and error states with Try again (E30, E31), toggle without a request (E3, E4), warnings and reasons as text (E5, E7, E14a), "Current" with no button (E11a, E21a), disabled buttons with reasons (E14, E19, E20), "Add anyway" confirmation and Cancel (E13), focus after a pick (E10), re-check on a build change (E32). Listings' `ProductCard` unchanged |
| Integration (Postgres) | `getBuilderCandidates` and the route, `*.db.test.ts` | Active only (E36), card data and stock statuses (E35, E35a), invalid specs left out (E37), fresh price (E34), `no-store` (E35), and the 400s with no product data (E38, E38a, E38c) |
| E2E | `e2e/builder.spec.ts` | **Epic AC:** E40–E44, including focus moving into the dialog, Escape closing it, and focus returning to the button that opened it. Also E13 (Add anyway → Errors), E10 (row filled without reload). Existing tests that click "Choose a CPU" as a link change to the picker. The list scrolling inside a fixed header is checked by hand on the preview URL (it's layout, not behavior a locator can see reliably) |
| E2E (updated) | `home.spec.ts` | The hero link reads "Build your PC" with no badge |

Not E2E: out-of-stock and pre-order cards depend on seed stock, which E2E can't set (spec 020 Test plan). They're covered by the unit and integration rows.

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Sort, filters or search inside the picker | Later builder story, if a category grows (ADR 0006) |
| "Fits your build" hints on product and listing pages | FR-10 (later builder story) |
| Server re-check of the build, blocking on errors, acknowledging warnings | Checkout epic |
| "Ask us" link on warnings (PRD Risks) | Later builder story |
| Picker for non-builder categories (fans, OS) | Phase 2 |
| Mobile layout of the picker (below 1024 px it scrolls, unpolished) | Phase 2 |
| Saved and shared builds | Saved builds story (FR-19) |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | The picker is a modal dialog on `/builder`, loaded by a `GET` route handler (review decision). Focus moves in on open and back to the trigger on close, Escape closes it, and only the list scrolls | The build and its parts already live on `/builder`, so the picker needs only the candidates. Spec 020 D1 already planned a route handler for them. Fixed controls keep "Show all" and the banner in reach on a long list | A `/builder/[slot]` page rendered by a Server Component (would also need the build's parts, and the summary twice) |
| D2 | Filter in the browser with `checkCandidate` over the whole category, not in SQL (ADR 0006) | The AC, the PRD (one engine for browser and server) and the size: 30 parts at most today | Translating rules to SQL conditions (two implementations that can drift) |
| D3 | Candidates are requested each time the picker opens, never cached | Stock must be fresh (ADR 0003). One small request per opening is cheap | Caching per slot for the visit (stale stock in a long session) |
| D4 | Replacing from the picker doesn't ask first; only incompatible parts do | The shopper chose "Change", so replacing is the intent. The product page asks because the shopper can't see the build there | Spec 020's "Replace?" dialog on every pick |
| D5 | A part that doesn't fit and can't be bought goes in "Doesn't fit", shows both reasons, and has no "Add anyway" (review decision) | Errors are the bigger problem, so they decide the group. One rule for adds (spec 020 D7): offering "Add anyway" for a part that can't be bought would contradict it | Putting it in "Fits, not buyable". "Add anyway" for every incompatible card |
| D6 | Cheapest first (`effectivePrice`) within every group, no sort control (review decision) | First-time builders on a budget (PRD persona) compare price first, and the groups already put fit first | The listing's default "newest", or a sort control |
| D7 | The banner shows errors only | Spec 019 D9 asks for errors. Warnings are in the summary, and the integrated-graphics warning would be wrong in the GPU picker (E25) | Errors and warnings |
| D8 | The picker closes after each pick, also for storage | One pick, one visible result in the slot and summary. "Add another drive" reopens it | Keeping it open to add several drives |
| D9 | The timing test runs in CI: a few warm-up runs (5), then the **median of 20 runs** must be under 50 ms, half the 100 ms budget (review decision) | The budget covers React's render too, so the engine gets half. The warm-up keeps JIT compilation out of the timing, and the median ignores a run slowed by a busy CI machine, where the slowest run is the one that flakes. This isn't the tight wall-clock test spec 018 D17 ruled out: that one would have pinned the engine's speed near its real cost. Here the limit is about 50× the measured cost (under 1 ms for 30 GPUs), so only a real regression (an accidental O(n²), a rule doing I/O-like work) can fail it. Spec 018 left this budget test to #54 | Asserting the slowest of 5 runs (sensitive to one slow run). Exactly 100 ms. Only a bench, outside CI |
| D10 | The performance test and ADR 0006 use 30 (GPUs, the largest category), not the AC's "about 26" | The seed has 26 CPUs but 30 GPUs. The AC asks for the largest category | Testing CPUs because the AC says 26 |
| D11 | A pick updates the slot from the candidate's data, with no parts request | The picker has just loaded that part, fresh. A request would turn every slot back into a skeleton (spec 020 Behavior 9) | Letting `useBuildParts` fetch the new id |
| D12 | Storage drives get a "Change" button that replaces that drive | Spec 020 moved "replacing one specific drive in place" to #54, and the engine already supports `{ replace }` | Remove, then add another |
| D13 | Under "Change", the part being changed is marked "Current" and can't be added; other drives in the build show "In your build (×n)" and can (review decision) | Re-adding the current part changes nothing in a one-part slot, and quantities belong to the stepper. A different drive the build holds is still a real choice (raise or merge) | One "In your build" marker for both, with the button on the current part |
| D14 | The candidates route validates `slot` with Zod against the eight slot names and answers 400 to anything else (review decision) | The same strictness as the parts route (spec 020 D17): junk is rejected before the database, and the page never sends it | Trimming or lowercasing the slot. A 404 for an unknown slot |

## 10. Open questions

None. The draft's two questions were settled in review: the picker is a dialog (D1), and parts are sorted cheapest first within every group with no sort control (D6).

## Acceptance criteria mapping

| Acceptance criterion | Covered by |
| --- | --- |
| Candidates: active products with specs and card data, from a route handler, stock fresh per request (ADR 0003) | Behavior 4–7; Rules › Candidates; E34–E38e; D1, D3, D14 |
| Compatibility in the browser with `checkCandidate` for every candidate; build or toggle changes need no request | Behavior 7–8, 11; Rules › Checking; E3, E4, E32 |
| Default: no errors and buyable (pre-orders hidden); warnings stay with a badge | Behavior 8, 12; E1, E2, E5, E6 |
| "Show all": every active part; incompatible and not-buyable parts greyed with plain-language reasons, available to keyboard and screen readers | Behavior 8, 12; Rules › Greyed cards, Accessibility; E3, E7, E8, E14, E14a |
| Incompatible parts addable after a confirmation naming the errors; not-buyable parts can't be added (spec 020 D7) | Behavior 13, 15; Rules › Adding, Current part; E11a, E11b, E13, E14, E14a, E21a; D5, D13 |
| Empty state says what to change | Behavior 17; Rules › Empty states; E26–E28 |
| Reuses `ProductCard` (greyed variant), `productCardSelect` / `toProductCardData`, `getStockStatus` | Behavior 4, 12; Data and interfaces |
| Performance test: largest category against a full build within 100 ms, CI-safe margin | E39; D9, D10 |
| ADR 0006: in-memory filtering, size assumption, when to revisit, server re-check at checkout | Data and interfaces (ADR 0006); D2, D10 |
| Epic E2E: CPU → board slot hides other sockets → "Show all" shows the reason → fitting board → OK | E40–E44 (with focus return and Escape); Test plan (E2E) |
