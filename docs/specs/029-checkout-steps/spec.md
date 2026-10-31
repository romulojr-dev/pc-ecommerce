# 029 — Checkout steps: contact, delivery and review

Status: **Implemented** · Issue: #77 (Sprint 6, Checkout epic #4; depends on #76, merged as spec 028) · PRD refs: FR-13 (full: stock re-checked at checkout), FR-14 (3-step checkout, guest), FR-15 (PH address form), FR-16 (shipping fee by zone and weight, free-shipping threshold), FR-27 (Test mode banner); NFR Privacy (collect only what checkout needs); spec 026 (re-run `checkBuild` per group at checkout), spec 027 (block checkout on flagged lines)

## 1. Summary

This story turns the cart's disabled Checkout button into the first two of FR-14's three steps. A guest enters their email, full name and mobile number, chooses delivery (with the PSGC region → province → city → barangay dropdowns from spec 028, plus street and ZIP) or store pickup, and then sees a review of their cart with the shipping fee and total, re-checked by the server against current stock, status and compatibility. Nothing is stored on the server: the entered details live in the tab's `sessionStorage`, and Place order stays disabled until #78 creates orders.

## 2. Behavior

### On `/cart`

1. **Checkout is enabled** when the cart has at least one entry, no flagged line (spec 027: `view.flagged` is 0) and no build group whose status is **Errors**. It is a link to `/checkout`. "Checkout is coming soon." is gone.
2. **Checkout is disabled** otherwise, with visible text under it linked by `aria-describedby` (spec 025's pattern): one sentence for flagged lines, one for groups with errors, both when both apply (§5). The banner, flags and totals of spec 027 don't change.
3. The empty cart has no summary and no Checkout button, as today.

### Entering `/checkout`

4. `/checkout` is **per request** (`connection()`), `noindex`, with its own canonical `/checkout`, and not in the sitemap. It lives in the `(store)` route group, so the store header and footer stay.
5. The page reads the cart from the cookie (`getCartView`). **No cookie, an unknown cookie or a cart with no entries redirects to `/cart`** (an HTTP redirect, so the page has no `loading.tsx`; D6). A cart with flagged lines or groups with errors is **not** redirected: step 1 shows its problems at the top (Behavior 9) and the review blocks it (D7).
6. Every checkout step shows, above the steps:
   - the **Test mode banner** (FR-27; §5). Payment instructions join it in #79.
   - a **step indicator**: "1 Contact and delivery", "2 Review", "3 Payment", with the current step marked (`aria-current="step"`). Step 3 is shown but never reached in this story.
7. The step is in the URL (D2): `/checkout` is step 1, `/checkout?step=review` is step 2. Moving between steps adds a history entry, so the browser's Back and Forward move between them. Any other `step` value is step 1.
8. The entered details are kept in the tab's **`sessionStorage`** under `pc-silicon-checkout` (versioned, D4), written as the shopper types. They are read after mounting, so the server render and the first client render match: until they are read, the form shows its fields disabled at their reserved size (no layout shift). A reload, Back and Forward keep them. A new tab starts empty. Stored data that doesn't parse (an old version, a hand edit) is discarded and the form starts empty.
9. A side summary on step 1 shows "Subtotal ({n} items)" and the subtotal (the `/cart` numbers, from the server render) and "Shipping is calculated in the next step." with a link **Edit cart** (`/cart`).
    - **Cart problems on step 1** (D7): when the cart has problems (a product that isn't sold, a product over stock, a build group with errors: Behavior 20, checks 1–3, run by the same pure code on the cart the page already read), a **problems box** sits at the top of step 1, under the banner and the step indicator. It has the heading and one item per problem of Behavior 20, and the link **Back to cart** (`/cart`). It does not stop the shopper from filling in step 1 or continuing, because the review blocks anyway. There is no "no delivery" problem here (no address yet). The box is current whenever step 1 shows: arriving from step 2 (Back, or Edit) reloads the page's cart data first.

### Step 1: contact and delivery

10. **Contact** (all required): **Email**, **Full name**, **Mobile number**. Rules in §4.
11. **Delivery method**: a radio group, **Delivery** (default) and **Store pickup**.
    - Pickup is offered only when `StoreSettings.pickupEnabled` is true (read per request). When it is off, the radio group is not shown; the step says "Delivery" as a heading and delivery is the method.
    - Choosing Store pickup hides the address fields and shows the store's address and hours as written in the settings (free text, line breaks kept), under "Pick up at".
12. **Address** (delivery only): four dropdowns, **Region**, **Province**, **City / municipality**, **Barangay**, then **Street address** and **ZIP code**.
    - Regions load when the step mounts (`GET /api/psgc/{PSGC_VERSION}/regions.json`); a region's provinces load when it is chosen; a province's cities and barangays load when it is chosen (one file); an independent city chosen under its geographic province loads its own file for its barangays (D3).
    - A dropdown whose parent isn't chosen is disabled. While its list loads it is disabled and reads "Loading…". If its list fails to load it shows "Couldn't load the list." with a **Try again** button that requests it again; the rest of the form keeps working.
    - **Changing a parent clears its children** (region clears province, city and barangay; and so on down). Street and ZIP are kept.
    - A level with exactly one option selects it (D9): NCR selects "Metro Manila"; a pseudo-province with one city selects that city.
    - Order: regions in the PSA's order (NCR first, spec 028 D18); provinces, cities and barangays alphabetically by name (Filipino and English names compare with `localeCompare("en-PH")`).
    - **Independent cities** appear **only under their geographic province** (D3; the `independentCityProvinces` map of spec 028), never as provinces of their own: Region VII lists Bohol and Cebu; Cebu lists City of Cebu, City of Lapu-Lapu and City of Mandaue among its cities. Pseudo-provinces that aren't independent cities stay: "Metro Manila", "City of Isabela", "Special Geographic Area". The server accepts the codes the form sends (a city under its geographic province) with the same mapping (Behavior 30).
13. **Continue to review** checks the form in the browser with the same schema the server uses (§6). Errors appear under each field (`aria-invalid`, `aria-describedby`), focus moves to the first invalid field, and nothing navigates. A valid form goes to step 2.
14. Step 1 never sends the details to the server; only step 2 does (Behavior 16).

### Step 2: review

15. Opening step 2 without saved, valid step 1 details (a new tab, a bookmark or a pasted link to `?step=review`, cleared storage, details that fail the schema's shape check) **replaces the URL with step 1** (no history entry for the review), with an empty or half-filled form. This is decided in the browser after mounting, before anything is sent to the server.
16. **Every time step 2 shows** (arrival, reload, Forward back to it, **Check again**), the browser sends the saved step-1 details to the server, which re-validates them and builds the review from the cart in the cookie (Behavior 17–21). The request is a **server action that only reads** (D1): the details travel in a POST body, never in a URL. While it works, the review area shows a skeleton and "Checking your order…" (`aria-busy`, announced by the polite live region of Behavior 34). If the request fails (network, server error), it shows "Couldn't load your review." with **Try again**.
17. **Invalid details** (a field fails the schema, the address codes don't belong together, pickup was chosen and is now off): the browser goes back to step 1 with the server's field errors shown and the saved values kept. For pickup turned off, the method switches to Delivery and the message in §5 shows above the address.
18. **Empty cart** (the cart was emptied in another tab, or the cookie is gone): the browser goes to `/cart`.
19. Otherwise the review shows:
    - **Contact**: email, name, mobile number; **Delivery**: the address as the dataset names it (street, barangay, city, province, region, ZIP; the names come from `resolveAddress`, never from the browser) or "Store pickup" with the store address and hours. Each has an **Edit** link to step 1.
    - **Items**: the cart's entries in cart order, as on `/cart` but read-only (no stepper, no Remove, no Set to): single lines with image, name, unit price, quantity, line total and flag; build groups collapsed with their label, total, status and flags, expandable to their parts and issues (spec 026).
    - **Summary**: "Subtotal ({n} items)", **Shipping** (the fee, "Free" or "Free (pickup)"), **Total**. Under Shipping, when the free-shipping threshold is set and was not reached by a delivery order: "Free shipping on orders of {threshold} or more."
    - **Place order**: disabled. *(Changed by spec 030: enabled when `ORDERS_ENABLED` is on and the review has no problems; the text below stays when it is off.)* When the review has no problems, the text under it is "Placing orders is coming soon." When it has problems, the problems list (Behavior 20) explains why.
20. **The server re-checks on every request** (FR-13), in this order, and collects **every** problem (it doesn't stop at the first):
    1. **Unavailable**: each product in any line must be active and buyable (`isSold`). A product that isn't is a problem on every line that holds it: "No longer sold", "Out of stock" or "Pre-order only" (spec 027 labels).
    2. **Over stock**: each product's total across the single line and every group must be at most its stock. A product above it is a problem on every line that holds it: "Only N in stock, M in your cart".
    3. **Build errors**: `checkBuild` runs on each group's current parts (the shared view's check, spec 026 Behavior 13). Any error makes the group a problem, with each error message.
    4. **No delivery to the zone**: `shippingFee` answers `no-rate` for a delivery order.
    Any problem **blocks Place order**. The review shows a **problems box** at the top of the review (a labelled group with a heading, §5, not a live region: focus announces it, Behavior 33), one item per problem naming the line (the product's name, or "Custom PC build {n}" with the part), and a link **Back to cart** (`/cart`), or for no-rate a link **Change delivery** (step 1). The lines themselves carry the same flags as on `/cart`.
21. **Warnings don't block** and need no new acknowledgment: each group's warnings from the fresh `checkBuild` are listed under it, expanded by default when the group has warnings, including warnings that appeared after the group was added. The line above them: "This build may still work. Check these warnings before you order." The shopper confirmed warnings when adding the build (spec 026); this story doesn't ask again (issue AC).
22. **Check again** (a button beside Place order) re-runs Behavior 16. It is the way to see a change made in another tab without a reload.
23. **Back** (a link "Back to details", or the browser's Back) returns to step 1 with everything kept.

### Totals

24. **Subtotal** follows the `/cart` rule (spec 025, spec 027 D9): single lines whose product is still active, plus each group's total (which leaves out retired parts). When the review has no problems every product is sold, so the subtotal is exactly what can be bought (this is spec 027 D9's "Sprint 6 recomputes at checkout").
25. **Weight** is `orderWeightGrams` over the same lines the subtotal counts: single lines still active and group parts still active (spec 028 Behavior 12).
26. **Shipping** is `shippingFee({ method, zone, weightGrams, subtotal }, rates, settings)` with the zone from `resolveAddress` and the rates and settings from `getShippingConfig()` (fresh). Pickup is 0.
27. **Total** = subtotal + shipping. Totals are shown even when the review is blocked (D8), except that with `no-rate` Shipping reads "Not available" and Total is not shown.

### Privacy and storage

28. *(Spec 030 clears the draft once an order exists, as this asked.)* Nothing from checkout is written to the database or a cookie in this story. The server receives the details only to build the review and keeps nothing (no log of the payload; a failure log names the reason, not the values). `sessionStorage` is per tab and cleared when the tab closes. **#78 must clear `pc-silicon-checkout` as soon as the order is created** (D4); this story only reads and writes the draft, and #78's spec and E2E must say and test it, so a finished order's personal details don't stay in the tab.
29. The form asks only for what an order needs (NFR Privacy): email (order link and, in Sprint 7, emails), name and mobile number (courier), and the address. No birthday, no account, no marketing consent.

### The address the review returns (the snapshot #78 will store)

30. **Validation uses the geographic mapping.** The codes the form sends for an independent city are its **geographic province's** code with the city's own code (Region VII, Cebu 0702200000, City of Mandaue 0731300000): `resolveAddress` already accepts that path (spec 028 V9), and this story relies on it. The codes of the city's own pseudo-province (0731300000 as the province) are still accepted (spec 028 V10), though the form never sends them.
31. **One normalized address, whichever path the codes came by** (D14). The review returns, and #78 snapshots, a province that follows one rule: **the province code is the PSA's official parent of the city, and only then**.
    - A city in a real province (City of Dagupan in Pangasinan) keeps that province's name and code.
    - An **independent city** (the 17 of spec 028) gets its **geographic province's name** ("Cebu") and **no province code** (`null`): the PSA gives these cities no province, so the geographic one is a label for the courier, not an official parent. The snapshot says so with `provinceIsGeographic: true`. The same result comes from the pseudo-province path.
    - A city under a **pseudo-province** that isn't an independent city (NCR's "Metro Manila", "City of Isabela", "Special Geographic Area") keeps the pseudo-province's **name** and has **no province code** (`null`), since PSGC has none for it.
    - Region, city and barangay keep their codes and dataset names in every case, and the zone comes from the region.
32. The dropdown "Province" and the review's address line use that province name ("Adlaon, City of Cebu, Cebu, Region VII (Central Visayas) 6000"), so what the shopper picked is what the courier reads.

### Focus and announcements

33. **Focus follows the step.** When the step changes (Continue to review, Back to details, an Edit link, the browser's Back or Forward), focus moves to the **new step's heading** ("Contact and delivery" or "Review your order"; a heading that can take focus by script but isn't a tab stop). On the review, once its result has loaded, focus moves instead to the **problem summary** (the problems box's heading) when the review has problems; with none it stays on the step heading. A first page load moves no focus. **Check again** moves focus to the problem summary when the new result has problems, and otherwise keeps it on the button.
34. **Announcements:** one polite live region (not `role="status"`, so the page keeps its other status roles untouched) carries "Checking your order…" while the review loads and, after **Check again**, "Checked just now. No problems found." when there are none. The problems box is not a live region; focus announces it, so it isn't read twice.
35. **The step indicator** is an ordered list in a labelled navigation. The current step carries `aria-current="step"` (exactly one item has it); step 3 never does in this story. The steps already reached are not extra tab stops.

## 3. Examples

Seed values unless stated; "[n]" sets a product's stock to n in the test database first. Prices from spec 026: **Build A** ₱69,060.00, 15,860 g; **Build B** ₱74,560.00, 12,070 g (i5-14400F 450, PRO B760M-A 1,500, FURY DDR4 120, MX500 100, RTX 5070 SFF 1,300, Q300L 5,000, RM850e 2,300, Peerless 1,300), status Warnings (the BIOS warning). **AMD Ryzen 5 7600** ₱11,495.00, 450 g, stock 12. **Lian Li LANCOOL 216 Black** ₱5,795.00, 9,000 g, stock 7. Fees and the ₱75,000.00 threshold are spec 028's demo values.

Addresses (PSGC 2026Q3): **QC** = NCR 1300000000 / Metro Manila 1300000000 / Quezon City 1381300000 / Alicia 1381300001, ZIP 1100. **Cebu** = Region VII 0700000000 / Cebu 0702200000 / City of Cebu 0730600000 / Adlaon 0730600001, ZIP 6000. **Davao** = Region XI 1100000000 / Davao del Sur 1102400000 / City of Davao 1130700000 / Acacia 1130700001, ZIP 8000. Contact: `ana@example.com`, "Ana Santos", "0917 123 4567".

### The review (`buildReview`, pure, and `reviewCheckout`, integration)

| # | Cart | Step 1 | Expected review |
| --- | --- | --- | --- |
| R1 | Ryzen 5 7600 × 2 | Delivery, QC | Subtotal (2 items) ₱22,990.00; 900 g; Shipping ₱120.00; Total ₱23,110.00; "Free shipping on orders of ₱75,000.00 or more."; no problems; "Placing orders is coming soon." |
| R2 | Build A group | Store pickup | Subtotal (1 item) ₱69,060.00; Shipping "Free (pickup)"; Total ₱69,060.00; Delivery block shows the demo store's address and hours |
| R3 | Build A group | Delivery, Cebu (via the province Cebu) | Visayas, ≤ 20 kg: ₱900.00; Total ₱69,960.00; the address reads "Adlaon, City of Cebu, Cebu, Region VII (Central Visayas) 6000" with the street first |
| R4 | Build A group | Delivery, Davao | Mindanao: ₱1,000.00; Total ₱70,060.00 |
| R5 | Build A group + Ryzen 5 7600 × 1 single | Delivery, QC | Subtotal (2 items) ₱80,555.00; 16,310 g; Shipping "Free" (≥ ₱75,000.00); Total ₱80,555.00; no threshold note |
| R6 | LANCOOL 216 × 3 | Delivery, Davao | ₱17,385.00 + ₱1,450.00 (27,000 g, open-ended tier) = ₱18,835.00 |
| R7 | Build B group | Delivery, QC | ₱74,560.00 + ₱450.00 = ₱75,010.00 (the threshold compares the subtotal, ₱74,560.00 < ₱75,000.00). **Not blocked**; under the group, expanded, "This build may still work. Check these warnings before you order." and the BIOS warning |
| R8 | [2] Ryzen 5 7600 × 3 (the stock fell after it was added) | Delivery, QC | Blocked. Problem: "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart". Link Back to cart. Totals shown (₱34,485.00 + ₱180.00 = ₱34,665.00: 1,350 g is in the 3 kg tier) |
| R9 | [1] Ryzen 5 7600 × 1 single + Build A group | Delivery, QC | Blocked: the single line and Custom PC build both carry "Only 1 in stock, 2 in your cart"; two problems, "AMD Ryzen 5 7600: …" and "Custom PC build: AMD Ryzen 5 7600: …" |
| R10 | [0] LANCOOL 216 × 1 | Delivery, QC | Blocked: "Lian Li LANCOOL 216 Black: Out of stock" |
| R11 | Build A group, then the RTX 4060 retired (status not ACTIVE) | Delivery, QC | Blocked: "Custom PC build: ASUS Dual GeForce RTX 4060 OC Edition 8GB: No longer sold"; the group reads "Incomplete"; its total leaves the GPU out (₱51,065.00) |
| R12 | A group of Build A× inserted directly (its snapshot has the MSI PRO B760M-A WiFi DDR4 with the Ryzen 5 7600) | Delivery, QC | Blocked: "Custom PC build has errors:" then the socket-match message ("The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.") and the memory-type message |
| R13 | A Build B group inserted directly, with no acknowledgment (as if the BIOS warning appeared after it was added) | Delivery, QC | Not blocked; the warning is listed; no dialog, nothing to confirm |
| R14 | Ryzen 5 7600 × 1; the Mindanao rates deleted | Delivery, Davao | Blocked: "We can't deliver to Region XI (Davao Region) yet. Choose store pickup or another address."; link Change delivery; Shipping "Not available"; no Total |
| R15 | Same as R14 | Store pickup | Not blocked; Shipping "Free (pickup)" |
| R16 | R8's cart plus R14's address | — | Both problems listed, stock first |
| R17 | Empty cart, or no cookie | Any | `{ ok: false, reason: "empty" }`; the browser goes to `/cart` |

### Input checks (`checkoutInputSchema`, unit; `reviewCheckout`, integration)

| # | Input | Expected |
| --- | --- | --- |
| I1 | The contact above, delivery, QC | Valid; mobile normalized to `+639171234567` |
| I2a | Mobile "0917 123 4567", "09171234567", "0917-123-4567", "(0917) 123-4567", "0917.123.4567" | All valid, all `+639171234567` (`0917…` form) |
| I2b | Mobile "+639171234567", "+63 917 123 4567", "+63-917-123-4567", "+63917 1234567" | All valid, all `+639171234567` (`+63917…` form) |
| I2c | Mobile "639171234567", "63 917 123 4567", "63-917-123-4567" | All valid, all `+639171234567` (`63917…` form) |
| I2d | Mobile "917 123 4567", "9171234567" | Valid, `+639171234567` (the leading 0 left off) |
| I3 | Mobile "02 8123 4567" (landline), "0917123456" (10 digits), "08171234567", "+1 917 123 4567", "" | Invalid: "Enter a mobile number like 0917 123 4567." ("" → "Enter your mobile number.") |
| I4 | Email "  Ana@Example.com  " | Valid, stored trimmed as typed ("Ana@Example.com") |
| I5 | Email "ana@", "ana example.com", "", 255 characters | Invalid |
| I6 | Name "  Ana Santos  " → "Ana Santos"; "" or spaces only; 101 characters | Trimmed; then "Enter your full name."; "Use 100 characters or fewer." |
| I7 | ZIP " 1100 ", "0900" | Valid ("1100", "0900") |
| I8 | ZIP "110", "11000", "abcd" | "Enter a 4-digit ZIP code." |
| I9 | Street "" / 201 characters | "Enter your street address." / "Use 200 characters or fewer." |
| I10 | Delivery with Alicia (1381300001) under City of Makati (1380300000) | Server: invalid address ("Choose your barangay again."), back to step 1 with the barangay cleared |
| I11 | Delivery with Region VIII and province Cebu | Server: invalid address, back to step 1 with province, city and barangay cleared |
| I12 | Delivery, City of Mandaue under province Cebu, and the same under its own pseudo-province 0731300000 | Both valid (spec 028 V9, V10), and both give the same normalized address (AD2, AD3). The form only offers the first |
| I13 | The client sends `regionName: "Fake"`, `fee: 0`, `subtotal: 1`, an extra `cartId` | Ignored; names, fee and totals come from the server; the cart from the cookie |
| I14 | Pickup with an address object | Valid; the address is ignored and not echoed back |
| I15 | Pickup while `pickupEnabled` is false | `{ ok: false, reason: "invalid", fields: { method: "pickup-off" } }`; step 1 with Delivery chosen and "Store pickup isn't available right now. Choose delivery." |
| I16 | Not an object, a 100 KB string, a missing `contact` | `invalid`, no stack or values in the response |

### The address the review returns (`reviewCheckout` and the normalizer, unit and integration)

Province code `null` means no official parent (Behavior 31). Names are the dataset's.

| # | Codes sent (region / province / city / barangay) | Expected address |
| --- | --- | --- |
| AD1 | 0700000000 / Cebu 0702200000 / City of Cebu 0730600000 / Adlaon 0730600001 | Region VII (Central Visayas); **province "Cebu", code `null`, `provinceIsGeographic: true`**; city "City of Cebu" 0730600000; barangay "Adlaon"; zone `visayas`. Accepted: the server uses the geographic mapping |
| AD2 | 0700000000 / Cebu 0702200000 / City of Mandaue 0731300000 / Alang-alang 0731300001 | Province "Cebu", code `null`, geographic; city "City of Mandaue"; zone `visayas` |
| AD3 | The same city through its own pseudo-province: province 0731300000 | The identical address as AD2 (province "Cebu", not "City of Mandaue") |
| AD4 | 1300000000 / Metro Manila 1300000000 / Quezon City 1381300000 / Alicia 1381300001 | Province "Metro Manila", code `null`, **not** geographic (a pseudo-province, not an independent city); city "Quezon City"; zone `metro-manila` |
| AD5 | 0100000000 / Pangasinan 0105500000 / City of Dagupan 0105518000 / Bacayao Norte 0105518001 | Province "Pangasinan", code **0105500000**, not geographic (the PSA places Dagupan in Pangasinan); zone `luzon` |
| AD6 | Region VII / Bohol / City of Mandaue / a Mandaue barangay | `null` (spec 028 V11): the geographic province is Cebu |
| AD7 | AD1's cart, delivery, rates as the demo | The review's address line reads "Adlaon, City of Cebu, Cebu, Region VII (Central Visayas) 6000" with the street above it |
| AD8 | A new tab with `?step=review` | Not here: see N5 and N5b |

### Address cascade (component / E2E)

| # | Action | Expected |
| --- | --- | --- |
| A1 | Choose NCR | Province "Metro Manila" selected at once; City lists 17 places alphabetically; Barangay disabled |
| A2 | Region VII | Province lists Bohol, Cebu only (no "City of Cebu", "City of Lapu-Lapu" or "City of Mandaue" province) |
| A2b | Region VII → Cebu | City lists City of Cebu, City of Lapu-Lapu and City of Mandaue among Cebu's own places, alphabetically |
| A3 | Cebu → City of Cebu | Barangay shows "Loading…" (its own file is requested), then Adlaon first |
| A3b | Region XI → Davao del Sur → City of Davao | Barangays load; Acacia is first. The review reads "Davao del Sur" with no province code (AD1's rule) |
| A3c | NCR → Metro Manila → Quezon City | The only province is chosen at once; barangays load; review reads "Metro Manila" (AD4) |
| A4 | QC filled to the barangay, ZIP 1100, street typed; change Region to VII | Province, city and barangay cleared; street and ZIP kept |
| A5 | Change City from Quezon City to City of Makati | Barangay cleared |
| A6 | The provinces request fails | Province shows "Couldn't load the list." and Try again; Try again succeeds → list appears |
| A7 | Store pickup | The address fields are gone; "Pick up at" with the demo store's address and hours |
| A8 | `pickupEnabled` false | No method radio; heading "Delivery"; the address fields shown |

### Steps, storage and the cart button (E2E)

| # | Action | Expected |
| --- | --- | --- |
| N1 | Empty cart → `/checkout` | Redirect (307) to `/cart` |
| N2 | Cart with Ryzen 5 7600 × 2 → `/cart` → Checkout | `/checkout`, step 1, Test mode banner, step indicator on 1 |
| N3 | Fill step 1, reload | Every value is back, the dropdowns' lists loaded again |
| N4 | Continue → review; browser Back | Step 1 with values; browser Forward → review, re-checked |
| N5 | A new tab opened at `/checkout?step=review` (no saved details) | The URL is replaced with `/checkout` and step 1 shows with an empty form; no review request is sent; Back doesn't return to the review URL |
| N5b | A bookmark or pasted link to `/checkout?step=review` in the tab where the form was only half filled (mobile missing) | Step 1, with the saved values and the mobile field's error shown |
| N6 | Continue with an empty mobile number | "Enter your mobile number." under the field, focus on it, URL unchanged |
| N7 | `/cart` with a flagged line | Checkout disabled; "Fix or remove the lines marked above to check out." |
| N8 | `/cart` with a group whose status is Errors and no flags | Checkout disabled; "A build in your cart has errors. Fix it in the builder or remove it to check out." |
| N9 | Review open for Ryzen 5 7600 × 3; the test sets its stock to [2] → Check again | The review now blocks with R8's problem |
| N10 | Pickup flow (the issue's E2E) | Choosing Store pickup skips the address; Continue → review shows "Store pickup", Shipping "Free (pickup)" |
| N11 | The review's Place order | Disabled, "Placing orders is coming soon."; no order or request beyond the review. *(Changed by spec 030: with `ORDERS_ENABLED` on it works; `e2e/place-order.spec.ts` covers placing.)* |
| N12 | Every step | Exactly one Test mode banner; no extra `role="status"` from checkout; the step indicator has exactly one `aria-current="step"` |
| N13 | A cart with Ryzen 5 7600 × 3 and its stock set to [2]; open `/checkout` | Step 1 renders, and at the top the problems box: "1 problem to fix before you can order", "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart", link **Back to cart**. The form works; Continue still goes to the review, which blocks (R8) |
| N14 | A cart with a build group with errors (R12's), open `/checkout` | Step 1 shows "Custom PC build has errors:" with the messages and Back to cart; no delivery problem appears |
| N15 | Cart with a problem; Continue → review → Back to details; meanwhile the test restores the stock | Step 1's box is gone: it was refreshed on arrival |
| N16 | Click Continue to review | Focus is on the "Review your order" heading (not a tab stop); with a blocked review, once the result loads, focus moves to the problem summary heading |
| N17 | Browser Back from the review | Focus on the "Contact and delivery" heading |
| N18 | Check again on a blocked review, then after the stock is restored | First: focus on the problem summary. Second: focus stays on Check again, and "Checked just now. No problems found." is announced |
| N19 | First load of `/checkout` | No script-moved focus (no heading focus, nothing stolen from the browser) |
| N20 | Tab order on the review | The step indicator's items are not tab stops; the Edit links, Check again and the disabled Place order follow the content order |

## 4. Rules and edge cases

### Inputs (one schema, browser and server)

- **Email**: trimmed; 1–254 characters; one `@` with text on both sides and a dot in the domain (Zod's email check). Case is kept. Not checked against anything else (no accounts yet).
- **Full name**: trimmed, inner runs of spaces collapsed to one; 1–100 characters; any script and punctuation (ñ, hyphens, apostrophes, periods).
- **Mobile number**: a Philippine mobile number. Spaces, dashes, dots and parentheses are ignored; then it must be `09` + 9 digits, `9` + 9 digits, `639` + 9 digits or `+639` + 9 digits. It is normalized to `+639XXXXXXXXX` (D5). Landlines and foreign numbers are refused.
- **Method**: `"delivery"` or `"pickup"`. Pickup is valid only while `pickupEnabled` is true when the server checks (I15).
- **Address** (delivery only): the four 10-digit codes, checked by `resolveAddress` (spec 028; the chain must hold, either independent-city path is accepted); **street** trimmed, 1–200 characters; **ZIP** trimmed, then `zipSchema` (4 digits).
- Unknown fields are dropped. Names, prices, fees, totals and cart ids are never taken from the request.
- The payload is bounded (field lengths), so an oversized body fails parsing and is `invalid`.

### Review

- Problems are listed in this order: unavailable and over-stock lines in cart order (a product's problem once per line that holds it, single line before groups as the cart orders them), then build errors in cart order, then no-rate. A product can only be one of unavailable or over stock (spec 027: unavailable wins).
- A group with a retired part shows "Incomplete" (spec 022) and is blocked by the part's "No longer sold" flag; `checkBuild` runs on its remaining parts, so it can also have errors.
- A build group's warnings and errors come from the same `sharedBuildView` the cart and the shared page use.
- `no-rate` blocks only a delivery order; pickup never needs a rate.
- The review is read only: it takes no lock, writes nothing and renews no cookie. Two tabs can review at once. A change between the review and Place order (#78) is caught there ("Your order changed. Review it again.").
- Stock above 99 can't be crossed from the shop (spec 027); the comparison is with stock.
- `getShippingConfig()` throwing (no settings row) is a setup error: the review answers `error` ("Couldn't load your review.") and the server logs it.
- The page's first render reads `pickupEnabled` and the store text; the review re-reads them. If they change in between, the review wins (I15).

### Steps and storage

- Step 1's values are saved on change; leaving step 1 for `/cart` and coming back keeps them.
- The saved object holds the contact, the method, the codes, the street and ZIP, and nothing else about the places: the lists are loaded again after a reload and the server names the places. Nothing else: no prices, no cart.
- Stored data with an unknown version, or that fails the schema's shape check, is discarded; partial step-1 data that is merely incomplete (a field left empty) is kept so the shopper can finish it.
- A saved address whose codes the current dataset version doesn't have (a future PSGC quarter) fails the server check and sends the shopper back to choose again (I10's message).
- The server render never reads `sessionStorage`, so `/checkout` and `/checkout?step=review` render the same shell; the client picks the step after mounting.

### Cart button

- Enabled = at least one entry, `flagged === 0`, and no group with status `errors`. A group with status `incomplete` always has a flagged part, so it is already covered.
- The cart page's numbers and banner are unchanged (spec 027 D9).

### Deployment

- The review's server code calls `resolveAddress`, which reads `data/psgc/json/**`. The route that runs it (`/checkout`, whose server action executes in that page's function) gets an `outputFileTracingIncludes` key (spec 028 Rules › Data, #77). A preview check (one review with an address) is in the test plan.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Cart, Checkout disabled (flagged) | "Fix or remove the lines marked above to check out." |
| Cart, Checkout disabled (group errors) | "A build in your cart has errors. Fix it in the builder or remove it to check out." |
| Page title / description | "Checkout" / "Check out your PC Silicon order." |
| Test mode banner | "**Test mode.** This is a demo store: no real payment is taken and no order is shipped." |
| Step indicator | "1 Contact and delivery", "2 Review", "3 Payment"; `aria-label="Checkout steps"` |
| Step headings (focus targets) | "Contact and delivery", "Review your order" |
| Step 1 section headings | "Contact", "Delivery method", "Delivery address" (or "Delivery" when pickup is off), "Pick up at" |
| Field labels | "Email", "Full name", "Mobile number" (hint "We'll text you about your delivery."), "Delivery", "Store pickup", "Region", "Province", "City / municipality", "Barangay", "Street address" (hint "House or unit number, building, street"), "ZIP code" |
| Dropdown placeholders | "Choose a region", "Choose a province", "Choose a city or municipality", "Choose a barangay"; loading "Loading…" |
| Dropdown failure | "Couldn't load the list." / button "Try again" |
| Field errors | "Enter your email.", "Enter an email address like name@example.com.", "Enter your full name.", "Use 100 characters or fewer.", "Enter your mobile number.", "Enter a mobile number like 0917 123 4567.", "Choose your region.", "Choose your province.", "Choose your city or municipality.", "Choose your barangay.", "Enter your street address.", "Use 200 characters or fewer.", "Enter a 4-digit ZIP code." |
| Server address mismatch | On the first level that doesn't hold: "Choose your province again.", "Choose your city or municipality again.", "Choose your barangay again." |
| Pickup turned off | "Store pickup isn't available right now. Choose delivery." |
| Step 1 summary | "Subtotal ({n} items)" (spec 025's `subtotalLabel`), "Shipping is calculated in the next step.", link "Edit cart" |
| Step 1 button | "Continue to review" |
| Review loading / failure | "Checking your order…" / "Couldn't load your review." + "Try again" |
| Review sections | "Contact", "Delivery", "Items", "Order summary"; links "Edit" (to step 1), "Back to details" |
| Review delivery | "Store pickup" + the store address and hours; or the street, then "{barangay}, {city}, {province}, {region} {zip}" |
| Summary lines | "Subtotal ({n} items)", "Shipping", "Total"; Shipping values "{fee}", "Free", "Free (pickup)", "Not available" |
| Threshold note | "Free shipping on orders of {threshold} or more." |
| Warnings lead | "This build may still work. Check these warnings before you order." |
| Problems heading | "1 problem to fix before you can order" / "{n} problems to fix before you can order" |
| Problem: line | "{product name}: {flag text}" (spec 027 `flagText`); for a group part "Custom PC build{ n}: {part name}: {flag text}" |
| Problem: build errors | "Custom PC build{ n} has errors:" then each error message |
| Problem: no rate | "We can't deliver to {region name} yet. Choose store pickup or another address." |
| Problem links | "Back to cart", "Change delivery" |
| Place order | Button "Place order" (disabled); "Placing orders is coming soon." |
| Re-check | Button "Check again"; after it, with no problems, "Checked just now. No problems found." (polite live region) |
| Step 1 problems box | The same heading, items and "Back to cart" as the review's (no "Change delivery") |
| Step indicator navigation | `aria-label="Checkout steps"` (an ordered list; the current item `aria-current="step"`) |

## 6. Data and interfaces

No schema change and no migration.

### Pure (`lib/checkout/`, no database, no `next`; the browser imports the schema)

- `checkoutInputSchema` (Zod): `{ contact: { email, name, mobile }, method: "delivery" | "pickup", address?: { regionCode, provinceCode, cityCode, barangayCode, street, zip } }`, with the rules in §4; `address` required for delivery and dropped for pickup. Its output type `CheckoutInput` has the normalized mobile.
- `normalizeMobile(text): string | null`.
- `buildReview(view, input, resolved, config)`: from a `CartView` (with the weights it needs), the parsed input, the resolved address (or null for pickup) and the shipping config, returns a `CheckoutReview`: the entries (read-only), `subtotal`, `weightGrams`, `shipping` (`ShippingFeeResult`), `total` (null for no-rate), `thresholdNote` (threshold or null), `problems: ReviewProblem[]` in §4's order, `warnings` per group, and `canPlace: boolean` (`problems` empty). `ReviewProblem` is `{ kind: "line"; entryId; name; flag }`, `{ kind: "group-part"; buildId; number; name; flag }`, `{ kind: "build-errors"; buildId; number; issues }` or `{ kind: "no-rate"; region }`.
- `normalizeAddress(resolved, codes)`: wraps spec 028's `resolveAddress` result into `CheckoutAddress` by Behavior 31, using `independentCityProvinces` and the province's `kind`. It adds no file reads; `resolveAddress` and spec 028's examples (V9, V10) are unchanged (D14).
- `cartProblems(view)`: the problems that need no address (unavailable, over stock, build errors), shared by step 1's box and `buildReview`.
- `checkoutButton(view)`: `{ enabled: true } | { enabled: false; flagged: boolean; errors: boolean }` for `/cart`.
- Copy functions next to `lib/cart/copy.ts` (problem text, address line, shipping value).
- The stored draft: `checkoutDraftSchema` (loose: every field optional, for a half-filled form) and the storage key `pc-silicon-checkout` with `version: 1`.

### Server

- `reviewCheckout(cartId, input: unknown): Promise<ReviewResult>` (`lib/checkout/review.ts`, server-only): parses with `checkoutInputSchema`; reads `getShippingConfig()`; checks pickup is enabled; calls `resolveAddress` for delivery; reads `getCartView(cartId)` plus the weights of its sold products; returns
  `{ ok: true; review: CheckoutReview; address: CheckoutAddress | null; store: { address, hours } | null }`, where `CheckoutAddress` is `{ region, province: { name, code: string | null, geographic: boolean }, city, barangay, zone, street, zip }` (Behavior 31), or `{ ok: false; reason: "invalid"; fields: Partial<Record<FieldKey, ErrorCode>> }`, `{ ok: false; reason: "empty" }`, `{ ok: false; reason: "error" }`. Tested directly with a cart id.
- `reviewCheckoutAction(input)` in `app/(store)/checkout/actions.ts`: reads the cart id from the cookie and forwards; never takes a cart id from the request. It sets no cookie.
- `getCartView` gains the per-line weights (or the review reads them in one extra query by product id); either way `/cart`'s output doesn't change.

### Routes and components

- `app/(store)/checkout/page.tsx`: per request, `noindex`, canonical `/checkout`, `socialMetadata`; redirects an empty cart; reads `pickupEnabled` and the store text and the cart's count and subtotal; renders the client `CheckoutFlow` with them. No `loading.tsx` (D6).
- Client: `CheckoutFlow` (step from the URL's `step` param, the draft from `sessionStorage`), `ContactDeliveryStep`, `AddressFields` (the cascade, through `GET /api/psgc/{PSGC_VERSION}/…`), `ReviewStep` (calls the action, shows `CheckoutReview`), `TestModeBanner`, `CheckoutSteps`. Read-only versions of `CartLine` and `CartGroup` (a `readOnly` prop, or thin wrappers).
- `components/cart/cart-summary.tsx`: Checkout becomes a link when `checkoutButton` allows it; the disabled text per §5.
- `next.config.ts`: `outputFileTracingIncludes["/checkout"] = ["./data/psgc/json/**/*"]`.

### Docs

- CLAUDE.md: a checkout paragraph (route, steps in the URL, `sessionStorage` draft, `reviewCheckout` and its order of checks, nothing stored, the tracing key).
- PRD: no change. Spec 027's Behavior 18 and spec 025's Checkout copy are superseded here; add a "Changed by spec 029" note to each.

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | `checkoutInputSchema`, `normalizeMobile` | I1–I9, I13, I14, I16 |
| Unit | `buildReview` with fixture cart views and spec 028's demo rates: totals, fee, threshold note, every problem kind, ordering, warnings, `canPlace` | R1–R16 |
| Unit | `checkoutButton` | N7, N8, enabled case |
| Unit | `normalizeAddress` on real dataset chains; `resolveAddress` accepts the form's geographic codes | AD1–AD6 |
| Unit | `cartProblems`, the step-1 box (markup) | N13, N14 |
| Unit | Mobile normalization table | I2a–I2d |
| Unit | Copy functions (problem text, address line) | §5 rows |
| Unit (markup) | `CartSummary` enabled and disabled; the review's problem box and summary rendered as markup (like `CartBody`) | N7, N8, R8, R14 |
| Integration (`*.db.test.ts`) | `reviewCheckout` against the test database with real carts: clean, stock fell, out of stock, retired group part, group with errors (snapshot inserted), no-rate (rates deleted), pickup off, address mismatch, empty cart, extra fields ignored, nothing written (row counts and the cart's `updatedAt` unchanged) | R1–R5, R7–R12, R14, R17, I10, I11, I13, I15 |
| E2E (Playwright) | Cart → Checkout → step 1 (delivery, NCR cascade) → review with fee and total | N2, A1, R1 |
| E2E | A flagged line blocks: stock lowered through `e2e/stock.ts`, review shows the problem and Back to cart | R8, N9 |
| E2E | Pickup skips the address | N10, A7 |
| E2E | Empty cart redirect; reload and Back/Forward keep values; new tab at step 2; field errors; parent change clears children | N1, N3–N6, A4 |
| E2E | Banner, `aria-current` and no extra status role on each step | N12 |
| E2E | Step 1 shows a flagged cart's problems; refreshed after Back | N13–N15 |
| E2E | New tab / bookmark at `?step=review` goes to step 1 | N5, N5b |
| E2E | Focus moves to the step heading, then the problem summary; none on first load | N16–N20 |
| E2E | Cebu, Davao and NCR cascade end to end through the review | A2b, A3, A3b, A3c, AD7 |
| Preview deploy | One review with a delivery address works on the Vercel preview (the tracing key) | §4 Deployment |
| Manual | Look at 1024 px and 1280 px; keyboard through the form and dropdowns; screen reader reads errors and the problems box | — |

## 8. Out of scope

| What | Owner |
| --- | --- |
| Creating the order, reserving stock, the idempotency key, "Your order changed. Review it again.", clearing the cart, **and clearing the `pc-silicon-checkout` details from `sessionStorage` once the order exists** (tested there); storing the address snapshot with the province rule of Behavior 31 | #78 |
| Step 3: the payment page, payment method choice, gateway test card / wallet instructions in the banner | #79 (FR-27 instructions) |
| COD and its limits | FR-25, Sprint 7 |
| Vouchers on the review | FR-17, Sprint 7 |
| Saved addresses, prefill from an account, "create an account" after ordering | Accounts (#65), FR-18, FR-19 |
| Rate limiting the review action | #64 |
| Order confirmation emails | FR-21, Sprint 7 |
| Mobile layouts below 1024 px | Phase 2 (NFR Responsiveness) |
| Add build to cart from a shared build | #72 |
| ZIP lookup or checking it against the place | Not planned (spec 028) |
| Moving local E2E off the Neon dev branch | #74 |

## 9. Decisions

- **D1 — The review is computed by a server action that only reads, which the client calls; it is not a page render and not a GET.** The step-1 details live only in `sessionStorage` (issue AC), which the server can't read, so the server only sees them when the client sends them. A server action sends them in a POST body. Personal details (email, name, mobile, street) must not go in a URL: URLs land in server and CDN logs, browser history, the Referer header and bookmarks, and `?step=review` is deliberately bookmarkable and has no details in it. The action writes nothing, takes no lock and sets no cookie, so repeating it is safe (reload, Check again, two tabs). *Rejected:* a cookie or a database row for the details (stores personal data before an order exists, against the AC); the details as query parameters on `/checkout?step=review` (puts them in logs and history, and a GET page would render per URL); a POST form that renders the review server-side (loses Back/Forward without resubmission prompts).
- **D2 — One route, the step in a search param (`/checkout?step=review`).** One canonical, one `noindex`, one tracing key, and the steps share the client state without a remount. *Rejected:* `/checkout/review` as its own page (a second set of metadata and redirects for the same flow).
- **D3 — Independent cities are offered under their geographic province only (review decision, Q1).** Spec 028 D19 left the labels to this story. A shopper from Mandaue looks under Cebu; listing "City of Cebu" as a province beside Cebu would show the same places twice. Pseudo-provinces that aren't independent cities (Metro Manila, City of Isabela, Special Geographic Area) stay. The server accepts both paths anyway (spec 028 V9, V10), so the form's codes, which use the geographic province, validate with the same `independentCityProvinces` map. *Rejected:* showing both (duplicates, and two ways to enter one address).
- **D4 — `sessionStorage`, versioned, read after mounting.** It survives reload and Back/Forward in a tab and dies with the tab, which fits "collect only what checkout needs"; reading after mount keeps hydration clean, as `useBuild` does. It still outlives a finished order if nothing clears it, so **#78 must clear it after placement** (Behavior 28, §8). *Rejected:* `localStorage` (the details would outlive the visit on a shared computer).
- **D5 — Mobile numbers are PH mobiles, normalized to `+639…`.** Couriers text a mobile; one stored form makes #78's order snapshot consistent. *Rejected:* any phone number (landlines can't receive the courier's texts).
- **D6 — No `loading.tsx` on `/checkout`.** The empty-cart redirect must be an HTTP redirect, as spec 022 keeps its 404s. The page's own server work is two small reads; the slow part (the review) has its own loading state.
- **D7 — A flagged cart can open `/checkout`; step 1 lists its problems at the top and the review blocks it (review decision, Q3).** Stock can change between the cart and the review anyway, so the review must check regardless. The page already reads the cart, so showing the problems on step 1 costs no request and spares the shopper typing details only to learn at step 2; the shared `cartProblems` keeps one rule in both places. Step 1 doesn't block Continue. The cart's disabled button keeps the normal path clean. *Rejected:* redirecting a flagged cart to `/cart` (a bounce while the shopper is typing details); saying nothing on step 1 (the shopper learns late).
- **D8 — A blocked review still shows its totals.** The shopper sees what they'd pay once they fix the lines, and the totals use the `/cart` rule they already know (spec 027 D9). With no-rate there is no fee, so no total. *Rejected:* hiding totals while blocked.
- **D9 — A level with one option selects it.** NCR's only province is "Metro Manila" and some pseudo-provinces have one city; making the shopper pick the only choice adds a click with nothing to decide. Changing the parent still clears it.
- **D10 — Warnings are shown expanded and need no confirmation.** Issue AC: listed with no new acknowledgment, including new ones. Spec 026's acknowledgment was at add time.
- **D11 — Problems are all collected, not first-failure.** Unlike Add build to cart (spec 026 stops at the first failure), the review is a list of what to fix; showing one at a time would make the shopper go back and forth. *Rejected:* spec 026's order-and-stop.
- **D12 — The weight counts the same lines as the subtotal.** A retired part neither costs nor ships. With a blocked review it doesn't matter; with a clean one they're all sold.
- **D14 — Province in the address follows "the PSA's official parent only" (Behavior 31); a wrapper normalizes, `resolveAddress` stays as spec 028 has it.** The PSA has no province for independent cities, NCR's cities, Isabela or the Special Geographic Area, so a province **code** for them would be invented (or, for Cebu, a real code the city isn't officially under). The snapshot keeps the name the courier reads (the geographic province, or the pseudo-province's name) and `null` for the code, with a flag for the geographic case. A wrapper normalizes both entry paths to one result, so the same address never has two snapshots, and spec 028's V10 ("province named 'City of Mandaue'") stays true for `resolveAddress`. *Rejected:* changing `resolveAddress`'s output (breaks an implemented spec's examples); storing the geographic province's real code for independent cities (it would read as the PSA's own parent); storing the pseudo-province as the province (the courier reads "City of Mandaue" where the shopper chose Cebu). **#78 stores this shape in its address snapshot.** *Flag:* the issue and PRD say addresses carry PSGC codes for every level; the province code is the one level that can be absent, and #78's `Order` columns must allow it.
- **D15 — Focus moves to the step heading, and to the problem summary on a blocked review (review decision).** A step change replaces content on one URL; without a focus move, keyboard and screen reader users stay on a button that no longer exists. The problems box takes focus instead of being a live region, so it is announced once. *Rejected:* a live region for the problems (double announcement with the focus move); focusing the page top (loses the place).
- **D16 — The address dropdowns are native `<select>` elements, and Edit / Change delivery / Back to details are links to `/checkout`.** Native selects give the platform's keyboard and screen reader behaviour and testable roles; the Base UI Select adds nothing this form needs. Links to `/checkout` are soft navigations that also reload the page's cart data, which is what returning to step 1 needs (Behavior 9). *Rejected:* the Base UI Select; buttons that only push history.
- **D13 — "Check again" instead of polling.** The review is re-checked on every showing; a button covers changes in another tab without timers or extra load. *Rejected:* refreshing on window focus (surprising re-layout while reading).

Flags against earlier documents:

- **Spec 025 Behavior 18 and spec 027 Behavior 18** say Checkout is disabled with "Checkout is coming soon." This spec replaces that (issue AC); both get a "Changed by spec 029" note.
- **Spec 027 D9** expected checkout to "recompute from what can be bought". This spec keeps the `/cart` rule and blocks when anything can't be bought, which gives the same number whenever an order is possible (Behavior 24). Not a disagreement in effect, but the wording differs.
- **Spec 028 D19 / V10 and this spec's normalized province:** `resolveAddress` is unchanged; this spec's wrapper presents a different province for the pseudo-province path (D14). Not a conflict, but #78 must use the wrapper, not `resolveAddress`'s province, for the snapshot.
- **PRD FR-14** says "account creation offered after". That is after the order (#78 / Accounts), not in these steps.

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| `/checkout` per request, `noindex`, own canonical; empty or missing cart → `/cart` | Behavior 4–5, D6, N1, R17 |
| `/cart` Checkout enabled; disabled with visible text while a line is flagged or a group has errors | Behavior 1–3, §4 Cart button, N2, N7, N8 |
| Step 1: email, full name, mobile (required) | Behavior 10, §4 Inputs, I1–I6, N6 |
| Delivery or pickup; pickup hidden when off; shows store address and hours | Behavior 11, A7, A8, I15, N10 |
| Region → province → city → barangay, each loaded for its parent; street and ZIP; changing a parent clears children | Behavior 12, D3, D9, A1–A6, I7–I12 |
| Step 2: lines and groups as on `/cart`, subtotal, fee, total | Behavior 19, 24–27, R1–R7 |
| Server re-checks every request: sold; total ≤ stock; `checkBuild` per group (errors block, warnings listed, no new acknowledgment); failures block, name lines, link to `/cart` | Behavior 16, 20–22, D10, D11, R8–R16, N9 |
| Step 3 is PayMongo (#79); Place order disabled "Coming soon"; no order | Behavior 6, 19, N11, §8 |
| Inputs Zod-parsed on the server; address codes belong together | §4 Inputs, I10–I16 |
| Nothing stored before an order; client + `sessionStorage`; server re-validates the whole payload | Behavior 8, 14, 16, 28–29, D1, D4 |
| Back/forward and reload keep entries | Behavior 7–8, 15, 23, N3–N5b |
| (Review) Focus moves to the new step's heading and to the problem summary; `aria-current="step"` | Behavior 33–35, D15, N12, N16–N20 |
| (Review) Step 1 shows the cart's problems with a link to `/cart` | Behavior 9, D7, N13–N15 |
| (Review) Address snapshot for independent and NCR cities | Behavior 30–32, D14, AD1–AD7 |
| Test mode banner on every step | Behavior 6, N12 |
| Tests: unit pure review; integration cart-backed review; E2E cart → review, flagged line blocks, pickup skips address | §7 |

## 10. Open questions

The review settled Q1–Q5:

1. Q1: independent cities appear only under their geographic province, and the server accepts that path (D3, D14, Behavior 30–31).
2. Q2: the step stays a search param; `?step=review` without saved details goes to step 1 (D2, Behavior 15).
3. Q3: a flagged cart reaches step 1, which shows the cart's problems with a link to `/cart` (D7, Behavior 9).
4. Q4: Philippine mobiles only (D5, I2a–I2d).
5. Q5: the split is decided at plan time.

One assumption to confirm at the plan review:

1. **The snapshot's province code is `null` for independent cities and pseudo-provinces (D14).** "No official province code" is read as: the province **name** is the geographic one (Cebu), and the province **code** is stored only when the PSA places the city in that province. *Recommendation:* as written. The alternative is storing Cebu's real code (0702200000) with the flag, which would read as the city's official parent.
