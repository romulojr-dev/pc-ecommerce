# 011 — Grow the seed catalog to 150 parts

Status: **Approved** · Issue: #34 · PRD refs: Success metrics (seed catalog of at least 150 parts), FR-5 (filters), FR-6 (search), FR-8 (sale price, stock status)

## Summary

The 60 parts from spec 005 grow to about 150, so Sprint 3's filters (#35, #36) and search (#37) have data worth filtering. The new parts are designed for those features: every filterable field takes several values, range fields have a real spread, brands and prices span the market, and stock states, sale prices and pre-orders are mixed in. The 60 existing parts stay exactly as they are, so spec 001's builds and incompatible pairs keep working. A coverage test turns these rules into CI checks. After merge, production is re-seeded with the existing safe procedure.

## Catalog

### Size and split

About 150 parts (the test accepts 145–155), weighted towards what shoppers browse most. The split is a target; no per-category total is tested beyond the minimum below.

| Category | Now | New | Total | Why |
| --- | --- | --- | --- | --- |
| Graphics card | 9 | +21 | 30 | The most compared and most expensive part; most filters (chipset, VRAM, length) |
| CPU | 8 | +18 | 26 | Four sockets, two brands, hybrid core counts |
| Motherboard | 8 | +10 | 18 | Every socket needs boards in more than one chipset and form factor |
| Memory | 7 | +13 | 20 | DDR4 and DDR5, six capacities, a spread of speeds |
| Storage | 7 | +13 | 20 | NVMe, SATA SSD and HDD, 250 GB to 8 TB |
| Case | 7 | +5 | 12 | Fewer SKUs sell |
| Power supply | 7 | +5 | 12 | |
| CPU cooler | 7 | +5 | 12 | |
| **Total** | **60** | **+90** | **150** | |

Minimum per category: 10.

### Existing parts

The 60 parts from specs 001 and 005 keep their SKU, name, slug, specs, price, stock and images. A re-seed would not change price, stock, sale price or pre-order date on existing rows anyway (`write.ts` sets them on create only), so editing them would make the seed file disagree with production. All new variety comes from the 90 new parts.

### Designed for filters and search

Rules per category. "Filterable field" means a field with `filterable: true` in the display metadata (`lib/specs/categories/*`), so the data follows the metadata when it changes.

| Dimension | Rule |
| --- | --- |
| Exact-match fields (enum, boolean or text fields: socket, memory type, form factor, chipset, efficiency…) | At least 3 distinct values, or all of them when the field allows fewer. For a field with two values (DDR4/DDR5, NVMe/SATA, air/AIO, Wi-Fi, iGPU), each value appears in at least 3 parts, so either choice visibly narrows the list |
| Range fields (numeric: cores, boost clock, VRAM, GPU length, wattage, capacity, speed…) | At least 4 distinct values, or 3 for count-like fields with a small natural range (modules, M.2 slots, radiator size). Values should be spread over the real market range, not clustered |
| Brands | 3–5 per category (CPU: AMD and Intel only). Three categories already have 6 from spec 005 (case, PSU, cooler); they stay at 6 and the new parts add no 7th. No brand holds more than 40% of a category (CPU: 60%) |
| Prices | Budget, mid and high tiers each hold at least 3 parts per category (2 for case, PSU and cooler), and the dearest part costs at least 3× the cheapest. Tier boundaries per category are the ones in each data file's header comment (spec 005); they move into the coverage test's table so the test can check them |
| Model names | Real products people search for, named the way shops write them: brand, line, model, capacity (`Ryzen 7 7800X3D`, `RTX 5070 Ti`, `Samsung 990 EVO Plus 2TB`). Include near-miss families so search has something to rank (`7600` / `7600X`, `RTX 5060` / `5060 Ti`, `RX 9070` / `9070 XT`, `i5-12400F` / `i5-13400F`). A model line may repeat when its variants differ in a spec a rule or filter reads (GPU partner cards differ in `lengthMm`; storage and memory differ in capacity) |

Suggested coverage of the main axes (exact lists are chosen during implementation):

- **CPU:** AM4 ×4, AM5 ×10, LGA1700 ×8, LGA1851 ×4; with and without iGPU (`F` parts, `G` parts); 4 to 24 cores; entry (Ryzen 5 5500, Core i3-12100F) to flagship (Ryzen 9 9950X3D, Core Ultra 9 285K).
- **Motherboard:** all four sockets; A-, B-, X- and Z-series chipsets; ATX, Micro-ATX and Mini-ITX; DDR4 boards on LGA1700 and AM4 as well as DDR5; 1 to 5 M.2 slots; with and without Wi-Fi.
- **Memory:** DDR4 and DDR5; 8 GB to 96 GB; 1, 2 and 4 module kits (the 4-module kit trips the memory-slots rule on 2-slot ITX boards); DDR4-3200 to DDR5-8000.
- **Storage:** NVMe (Gen3 to Gen5 parts), SATA SSD, 3.5" HDD, plus one M.2 2230 drive; 250 GB to 8 TB.
- **GPU:** NVIDIA, AMD and Intel (at least 2 Intel cards); roughly RTX 3050 up to RTX 5090, RX 7600 up to RX 9070 XT, Arc B570/B580; 6 to 32 GB VRAM; lengths from low-profile to 358 mm.
- **Case:** E-ATX/ATX, Micro-ATX and ITX-only cases; GPU clearance 300 to 430 mm; cooler clearance 70 to 185 mm.
- **PSU:** 450 W to 1200 W or more, including one SFX-L unit (all three PSU form factors are then stocked); Bronze to Platinum; fully, semi and non-modular.
- **Cooler:** air towers and low-profile; at least 3 AIOs with 240, 280 and 360 mm radiators; all four sockets.

### Stock, sale prices, pre-orders

Counted on the whole catalog, with the status a shopper sees (`getStockStatus`):

| Dimension | Rule |
| --- | --- |
| In stock | At least 70% of all parts, and at least 50% of each category |
| Out of stock | At least 8 parts, in at least 4 categories |
| Low stock | At least 15 parts (`0 < stock ≤ lowStockAt`), in at least 5 categories |
| Pre-order | At least 5 parts in at least 3 categories, with ship dates in 2027 (the test pins "today" to 2026-10-26, so it doesn't age) |
| On sale | 12–20 parts with a `salePrice`, discounts of 5–25%. Every category has at least 1 on-sale part that can be bought (not out of stock), and CPU, GPU, memory and storage have at least 2. The 7 on-sale parts already present count |

### Builder scenarios

- Every compatible build and incompatible pair in spec 001 still gives the same result.
- Add a PSU of 1200 W or more, so the RTX 5090 has a build that passes PSU wattage cleanly (958 W / 1000 W is still a warning).
- New parts add passing and failing combinations where it's natural: DDR4 boards beside DDR4 kits on all three DDR4 platforms, a second ITX case and an SFX-L PSU, a 4-module kit against 2-slot boards, GPUs longer than the small cases allow.

## Same quality rules as before

- **Validated:** every part passes its category's Zod schema through the seed, before any database access. Spec 001's naming, unit and rounding rules apply.
- **`sourceUrl`:** the manufacturer's own spec page, not a retailer or review. If the page lacks a required field, pick another part.
- **Box contents and warranty:** each new part lists `boxContents` (at least one line) and a `warrantyMonths` of 12 or more, from the manufacturer. The existing parts keep what they have (34 of them list no box contents yet; filling those in is a separate change).
- **Images:** new parts use their category placeholder (no `images` key). The existing multi-image parts keep their 5–6 gallery examples.
- **Prices:** sample PHP prices, plausible PH retail, in integer centavos. The header comment of each data file keeps saying so.
- **Spot check:** after the data is in, check at least 3 new parts per category field by field against their `sourceUrl`, and note the results in the PR.

## Tests

Unit tests in `prisma/seed/data/coverage.test.ts` (Vitest, no database), on validated parts:

- **Replaced:** the old "55–65 parts", "≥ 6 parts per category", "3 out-of-stock / 5 low-stock / 2 pre-order" and "4–8 on sale" checks give way to the numbers in this spec.
- **Size:** 145–155 parts in total, at least 10 per category.
- **Brands:** the per-category range (CPU: AMD and Intel) and the 40% / 60% cap.
- **Filterable fields:** for every category, every field with `filterable: true` is read from `builderCategories`. Booleans and fields with `options` count as exact-match; other numbers are ranges. Array fields (case motherboard support, cooler sockets) count each listed value. Two-value fields need both values in at least 3 parts. A field with no parts (the cooler's `radiatorSizeMm` on air coolers) counts only the parts that have it. The test fails with the category, field and values found.
- **Prices:** tier counts and the 3× spread per category.
- **Stock and sale:** every row in the stock table above, per category and overall, including at least one buyable on-sale part per category.
- **Quality:** every new part has `boxContents` and `warrantyMonths ≥ 12`; the 23 fixture SKUs and the other 37 existing SKUs are all present; the image and placeholder checks stay.
- Existing validation, reserved-slug and route tests keep passing.

**E2E:** `e2e/category-page.spec.ts` asserts that `/cpu?page=99` redirects to `/cpu` ("the last page, which is page 1 here"). With 26 CPUs and a page size of 24, the last page is page 2, so the assertion changes to `/cpu?page=2` and the comment with it. Pagination is now exercised for CPU and GPU.

## Seed run time

`writeSeed` writes in one transaction with a 60 s timeout, and its comment records that 60 parts took under 30 s against Neon. 150 parts could take about 75 s and time out, in production above all. Before the data is added, the story measures the seed on the Neon dev branch and keeps the single-transaction guarantee (all or nothing) with a longer timeout, or fewer round trips, or both, so a full run has comfortable room. The chosen limit and the measured time go in the PR.

## Production re-seed (once, after merge)

Same procedure as spec 004, "Seeding production": production URLs set in the shell for one command, `NODE_ENV=production`, no `--reset`, and a check of the printed host. Expected result: `Seeded 8 categories, N brands, 150 products (90 created, 60 updated; stock, price and status kept).` Then check on the production URL that `/cpu` and `/gpu` list two pages, and that the pre-order, sale and out-of-stock states show.

## Docs to update

`CLAUDE.md` (`pnpm db:seed` says "about 60"), and a pointer in spec 005 and the PRD's seed-catalog open question that the 150-part target is now met.

## Acceptance criteria

- [ ] About 150 parts across the 8 builder categories, meeting every rule above; the coverage test passes.
- [ ] The 60 existing parts are unchanged; spec 001's builds and pairs still hold; a PSU of 1200 W or more exists.
- [ ] Each new part has a manufacturer `sourceUrl`, box contents and warranty; at least 3 new parts per category are spot-checked against it.
- [ ] `pnpm db:seed` finishes inside the transaction timeout against the dev database, and a second run gives 0 created.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, E2E and CI pass.
- [ ] Production re-seeded per the procedure; the category pages show the new catalog.

## Out of scope

- Real product images and extra gallery images for the new parts (placeholders only).
- The filters, search and brand pages themselves (#35, #36, #37).
- Changing price, stock or any other field of the 60 existing parts.
- Non-builder categories (case fans, monitors, peripherals, networking, prebuilts).
- Real shop prices; they stay sample figures.

## Open questions

None.
