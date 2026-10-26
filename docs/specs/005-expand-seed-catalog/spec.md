# 005 — Expand the seed catalog

Status: **Draft** · Issue: #18 · PRD refs: FR-4 (pagination), FR-5 (filters), FR-8 (sale price, stock status), NFR SEO (clean URLs), Success metrics (seed catalog)

## Summary

The 23-part fixture set from spec 001 grows to about 60 real parts, with at least 6 per builder category. That gives category pages, filters and pagination realistic data to work with. The catalog covers price tiers, several brands, every stock state and a few sale prices. All of spec 001's compatible builds and incompatible pairs keep working. Category slugs become top-level URLs (`/gpu/...`), so the seed now rejects any category slug that clashes with a reserved top-level route. After merge, production is re-seeded with the existing safe procedure.

## Catalog

### Size

- 55–65 parts in total, with **at least 6 per builder category**. Suggested split (60): CPU 8, motherboard 8, memory 7, storage 7, GPU 9, case 7, PSU 7, CPU cooler 7.
- **The 23 existing parts stay as they are.** Their SKU, name, slug, specs, price and stock do not change. Spec 001's builds and incompatible pairs depend on them, and production keeps its own stock, price and status for existing rows anyway (see "Production re-seed").
- **No duplicates.** SKU and slug must be unique (already enforced by the seed). Also, a model line appears only once, unless the variants differ in a spec a rule or filter reads (e.g. two capacities of one SSD, two lengths of one GPU line).

### Coverage

Each category must have:

| Dimension | Rule |
| --- | --- |
| Price tiers | At least 2 budget, 2 mid-range and 2 high-end parts. The tier is judged within the category (a ₱4,000 cooler is high-end, a ₱4,000 GPU is budget), and the data file notes it in a comment |
| Brands | At least 3 brands (CPU: AMD and Intel only) |
| Spec spread | Values a filter will offer (socket, DDR type, form factor, capacity, wattage, VRAM…) take more than one value |

Across the whole catalog:

| Dimension | Rule |
| --- | --- |
| Stock | Mostly in stock. At least 3 parts out of stock (`stock: 0`) and at least 5 low-stock parts (`0 < stock ≤ lowStockAt`), spread over several categories |
| Sale prices | 4–8 parts with a `salePrice` (less than `price`, already enforced), in different categories and tiers |
| Status | All parts `ACTIVE` (the default) |

### Builder scenarios

- Every compatible build and incompatible pair in spec 001 ("Examples") still gives the same result. New parts add options; they don't replace fixture parts.
- Add at least one PSU of 1000 W or more, so the RTX 5090 has a passing PSU-wattage build (spec 001 noted this gap).
- New parts should add further passing and failing combinations where it's natural (another LGA1851 or AM4 platform, another ITX case, a long GPU), but no specific new scenario is required.

### Data accuracy

- Every part is a real, currently or recently sold product. Its spec values come from the **manufacturer's own spec page**, recorded in `sourceUrl`. Retailer and review pages don't count. If the manufacturer page lacks a required field, pick another part.
- Spec 001's naming, unit and rounding rules apply (round in the safe direction; `nativeCpuGenerations` from the launch BIOS support list).
- **Prices are sample PHP prices**: plausible PH retail in integer centavos, not quotes from a specific shop. Each data file's header comment says so (today it says "approximate PH retail").

## Reserved category slugs

Category pages will live at `/<category-slug>` (PRD: `/gpu/rtx-5070-12gb`). A category slug that equals a top-level route would hide one of them.

- One shared list lives in `lib/` (no server-only imports), so the seed now and the admin category form (AD-3) later use the same list.
- The list contains:
  - Planned routes: `cart`, `builder`, `account`, `admin`, `checkout`, `search`, `api`.
  - Current top-level routes: `products`, `login`, `signup`, `sidebar`.
  - Likely routes, reserved early: `build`, `builds`, `orders`, `brands`, `deals`, `compare`, `wishlist`, `auth`, `logout`, `about`, `contact`, `help`.
- Matching is exact on the slug (`cart` is reserved, `cart-accessories` is not). Slugs can't contain `.` or `_` (slug rule), so `sitemap.xml`, `robots.txt` and `_next` can't collide.
- The seed checks every category slug it is about to write against the list, during validation and before any database access. A clash fails the whole seed with a message that names the slug, e.g. `Category slug "cart" is reserved for a top-level route (lib/<file>.ts)`. Nothing is written.
- The current 8 builder category slugs are not reserved, so today's seed passes.

## Tests

Unit tests (Vitest, no database):

- **Reserved slugs:** a reserved slug (`cart`) is rejected by the seed validation; a non-reserved one (`gpu`, `cart-accessories`) passes; the real `builderCategories` slugs all pass.
- **Routes stay reserved:** every static top-level folder under `app/` is in the reserved list. Route groups like `(store)` are looked into, and dynamic (`[...]`) and private (`_...`) folders are skipped. A new top-level route therefore fails CI until it's added to the list.
- **Catalog coverage:** the seed data meets the minimums above: ≥ 6 parts per category, total in 55–65, ≥ 3 brands per category (2 for CPU), ≥ 3 out-of-stock and ≥ 5 low-stock parts, 4–8 sale prices.
- Existing tests (every file validates, rule-field cases) keep passing.

The E2E test on `/products` (finds "AMD Ryzen 5 7600") is unchanged and must still pass.

## Production re-seed (once, after merge)

Same procedure as spec 004, "Seeding production": production URLs set in the shell for one command, `NODE_ENV=production`, no `--reset`, and a check of the printed host.

Expected result: the 23 existing products are updated (stock, price and status kept), and the new parts are created, e.g. `Seeded 8 categories, N brands, 60 products (37 created, 23 updated; stock, price and status kept).` Then check that `/products` on the production URL lists the full catalog.

## Acceptance criteria

- [ ] 55–65 parts, at least 6 per builder category, meeting the coverage rules; the coverage test passes.
- [ ] The 23 fixture parts are unchanged, and spec 001's builds and pairs still hold; a ≥ 1000 W PSU exists.
- [ ] Every new part has a manufacturer `sourceUrl`, and its values were checked against it.
- [ ] The seed rejects reserved category slugs; the reserved-slug and route tests pass.
- [ ] `pnpm db:seed` stays idempotent: a second run gives 0 created and the same row counts.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` and CI pass.
- [ ] Production re-seeded per the procedure above; `/products` in production shows the full catalog.

## Out of scope

- Product images (`ProductImage` rows, uploads).
- Pre-order status and its schema field (comes with the product page story).
- Showing sale prices or % off (product page and category page stories). This story only seeds `salePrice`.
- Pagination, filters and category pages themselves (Catalog epic).
- The PRD's 150-part target (Success metrics). This story reaches about 60.
- Non-builder categories (case fans, monitors, peripherals, networking, prebuilts).
- Reserving brand or product slugs (they aren't top-level routes).

## Open questions

None.
