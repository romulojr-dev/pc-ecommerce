# 010 — Product detail page

Status: **Approved** · Issue: #22 · PRD refs: FR-8 (gallery with zoom, price, sale price and % off, stock status incl. Pre-order, quantity, Add to cart, Add to build), FR-9 (spec table, overview, warranty, what's in the box), NFR Performance (LCP < 2.5 s), NFR SEO (unique titles and meta, clean URLs), NFR Accessibility (WCAG 2.1 AA)

## Summary

`/<category-slug>/<product-slug>` (e.g. `/cpu/amd-ryzen-5-7600`) shows everything a shopper needs to decide: gallery, name, brand, price (with sale price and % off), stock status, quantity, warranty, what's in the box, overview and the spec table from spec 009. Add to cart and Add to build are visible but disabled until their epics. Two schema changes come with it: **pre-order** and **what's in the box**, in one migration, with seed data for both.

## Route and data

- **Route:** `app/(store)/[category]/[product]/page.tsx`, inside the store layout.
- **Lookup:** `getProductPage(slug)` in `lib/products.ts` (server-only) finds the product **by its slug alone** (`Product.slug` is unique), active only (`status: "ACTIVE"`). It selects the page's fields: name, slug, description, price, salePrice, stock, lowStockAt, preorderShipsOn, warrantyMonths, boxContents, specs, brand name, category `{ name, slug }`, and images in `sortOrder`. It is wrapped in React `cache()`, so `generateMetadata` and the page share one query per request.
- **Unknown or draft product → `notFound()`** (default 404 page, status 404).
- **Wrong category → `permanentRedirect(productHref(product.category.slug, product.slug))`** (308). This also covers an unknown category slug in front of a real product, so `/gpu/amd-ryzen-5-7600` and `/nonsense/amd-ryzen-5-7600` both land on `/cpu/amd-ryzen-5-7600`. Links keep working if a product is moved to another category. The issue's acceptance criterion says 404 for this case; it is updated to match.
- **Specs:** checked with `validateSpecs(category, product.specs)` before `SpecTable`. A product in a non-builder category, or with specs that fail validation, shows the page without the table and the line "Specifications are not available for this product."; invalid specs are also logged with `console.error` (the seed and admin validate on write, so this means a bad manual edit). The page never 500s on specs.

## Rendering

**Per request**, following [ADR 0003](../../adr/0003-cache-shared-data-with-tags.md): price, sale price, stock and pre-order status change at runtime. The page calls `await connection()`; the product query is not wrapped in `unstable_cache`, so no stock or price write needs to invalidate a tag. The category name comes from the product's own join, so the page doesn't need the cached `getCategoryBySlug`.

ADR 0003 names this page as a trigger to reconsider Cache Components (static shell with live stock). Not now: a database round trip per product view is fine before there is traffic, and the evaluation is its own story.

## Metadata

- **Title:** the product name (the root template adds "| PC Silicon").
- **Description:** the product's `description`, cut at a word boundary to at most 155 characters with "…", or when it has none: "`<name>` from `<brand>`: full specs, warranty and stock at PC Silicon. Check compatibility in the PC Builder." No price or stock in the description: search snippets would go stale.
- **Canonical:** `productHref(...)` of the real URL.

## Layout

Desktop-first, two columns from `lg`, stacked below:

1. **Breadcrumbs** (above both columns): Home › `<Category name>` › `<Product name>` with `components/ui/breadcrumb.tsx`. A `nav` labelled "Breadcrumb"; the product is the current page (`aria-current="page"`, not a link).
2. **Left:** gallery.
3. **Right:** brand (muted, small), name as the page's `h1`, price block, stock status, quantity selector, the two disabled buttons, warranty.
4. **Below, full width:** "Overview" (`description`, when set), "Specifications" (`h2` + `SpecTable` with its caption hidden), "What's in the box" (when not empty).

### Price

- No sale: `formatPeso(price)`.
- Sale (`salePrice` set, always below `price` per the seed check): `formatPeso(salePrice)` large, `formatPeso(price)` struck through and muted, with a "Was" label for screen readers (`<s>` alone is not announced), plus a badge "`<n>`% off".
- **`discountPercent(price, salePrice)`** in `lib/format.ts`: `Math.floor((price - salePrice) / price * 100)`. **Rounded down**, so the badge never claims more than the real discount (₱11,495 → ₱9,999 is 13.01 % → "13% off"). A result of 0 (discount under 1 %) shows the sale price without a badge.
- Cards and sorting keep using `price`; sale prices on cards are out of scope.

### Stock status and pre-order

See "Pre-order" below for the logic. Shown as text with an icon, never color alone: "In stock", "Low stock", "Out of stock", or "Pre-order: ships `<date>`".

### Quantity selector

A small client component: a number input labelled "Quantity" between "Decrease quantity" / "Increase quantity" icon buttons.

- Range **1 to available stock**: `stock` for in-stock, low-stock and pre-order products (for pre-order, `stock` is the pre-order allocation). Typing a value outside the range clamps it on blur; the buttons disable at the ends.
- Out of stock: the selector is disabled.
- `clampQuantity(value, max)` in `lib/stock.ts` (pure): non-numbers → 1, below 1 → 1, above max → max.
- The value is local state only until the cart epic reads it.

### Add to cart / Add to build

Both are real `<button disabled>`s, primary and outline, with a visible line under them: "Cart and PC Builder are coming soon." linked to both through `aria-describedby`. Not a tooltip: disabled buttons don't receive focus or hover, so keyboard and touch users would never see it. Out-of-stock products show the same disabled buttons and line; the cart epic decides the out-of-stock wording.

### Warranty

`formatWarranty(months)` in `lib/format.ts`: whole years as years ("1-year warranty", "3-year warranty"), otherwise months ("6-month warranty", "18-month warranty"), and 0 → "No manufacturer warranty". Shown with a shield icon under the buttons.

### What's in the box

A bulleted list of `boxContents` under its own `h2`. The section is left out when the list is empty.

## Gallery

`components/product/product-gallery.tsx`, a client component.

- **Main image:** `ProductImage` with `loading="eager"` (the page's LCP image) and `sizes="(min-width: 1024px) 560px, 100vw"`. It is wrapped in a button "Enlarge image" (zoom-in icon in the corner) that opens the dialog.
- **Thumbnails** (only with 2+ images): a list of buttons under the main image, each `ProductImage` at 64 px (`sizes="64px"`), labelled "Show image `<n>` of `<total>`", with `aria-pressed` on the current one and a visible ring. They are in the normal tab order (at most 4, per the seed's limit), and Enter/Space selects. Clicking one changes the main image; focus stays on the thumbnail.
- **"Zoom" = a larger view in a dialog**, the shadcn `Dialog` on Base UI (added with `pnpm dlx shadcn@latest add dialog`). It shows the current image as large as the viewport allows (`sizes="min(90vw, 1000px)"`), its alt text as the dialog's accessible name, and with 2+ images Previous/Next buttons plus Left/Right arrow keys, wrapping around. Esc and the close button close it, and focus returns to the "Enlarge image" button. No pan or hover magnifier.
- **No images:** the `ProductImage` fallback, no enlarge button, no thumbnails.

## Pre-order

### Schema

| | Flag + date (`isPreorder`, `releaseDate`) | **One nullable date** (`preorderShipsOn`) |
| --- | --- | --- |
| Invalid states | Flag without a date, or a date without the flag | None: pre-order exactly when there is a future date |
| What the page shows | Needs a fallback when the date is missing | Always "ships `<date>`" |
| Ending the pre-order | Admin must clear the flag | Ends by itself when the date passes |

**Recommendation: `preorderShipsOn DateTime? @db.Date`** on `Product`: the expected ship date of a pre-order. A Postgres `date` (no time or time zone), since it is a calendar day. An admin who doesn't know the date yet doesn't open pre-orders.

### Combined status

`StockStatus` in `lib/stock.ts` gains `"pre-order"` (label "Pre-order"), and `getStockStatus` takes the date and today:

```ts
getStockStatus(
  product: { stock: number; lowStockAt: number; preorderShipsOn: string | null },
  today: string // "YYYY-MM-DD", in Asia/Manila
): StockStatus
```

1. `stock <= 0` → **out-of-stock**, also for a pre-order (its allocation is sold out).
2. `preorderShipsOn` after `today` → **pre-order**.
3. Otherwise the current rule: `stock <= lowStockAt` → low-stock, else in-stock.

So a ship date that has passed falls back to the normal status: the product is presumably in stock now, and the page never shows "ships" with a past date. Dates are `YYYY-MM-DD` strings, compared as strings; plain data, so cards and client components can take it. `manilaToday()` (same file) gives today in `Asia/Manila` via `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" })`. The page calls it once per request, and tests pass `today` explicitly.

- **Display:** "Pre-order: ships `<date>`" with `formatDate()` in `lib/format.ts` (`en-PH`, `dateStyle: "long"`, `timeZone: "UTC"` since the value is a calendar day): "Pre-order: ships January 15, 2027".
- **Cards:** `productCardSelect` and `ProductCardData` gain `preorderShipsOn` (as `YYYY-MM-DD`), so cards show "Pre-order" too. The category page passes `manilaToday()` to its cards.

## What's in the box (schema)

`boxContents String[] @default([])` on `Product` (Postgres `text[]`): one line per item, in display order, e.g. `["Graphics card", "Quick start guide", "Warranty card"]`. An array, not one text field, so the page renders a real list and the admin form can edit items one by one. Not JSONB: it is a flat list of strings.

## Migration and seed

- **One migration** (`pnpm db:migrate`, named `product_page_fields`) adds both columns. Both are nullable or defaulted, so existing rows need no backfill.
- **`prisma/seed/part-schema.ts`:** `boxContents: z.array(text()).optional()` and `preorderShipsOn: z.iso.date().optional()`.
- **`prisma/seed/write.ts`:** `boxContents` joins `CATALOG_FIELDS` (catalog data, refreshed on re-seed). `preorderShipsOn` is **create-only**, like `status` and `stock`: once the store runs, the admin owns when a pre-order opens and ends. Existing dev databases get the seeded pre-orders with `pnpm db:seed --reset`; CI seeds a fresh database.
- **Data:** box contents for every GPU, CPU and PSU, and a few others, from the manufacturer pages already in `sourceUrl`. Two pre-orders: MSI GeForce RTX 5060 Ti 16G Ventus 2X OC Plus (`preorderShipsOn: "2027-01-15"`) and Intel Core Ultra 7 265K (`"2027-02-01"`), both with `stock > 0` and neither one of the seed's low-stock or out-of-stock parts. The dates will pass eventually; the products then show their normal status, and the dates get moved forward when that matters.

## Product cards link here

Cards already link to `productHref(categorySlug, slug)` since spec 008; this story makes those links resolve. Nothing else changes on the card besides the pre-order status.

## Tests

Unit (Vitest, pure):

- **`lib/stock.test.ts`:** the combined status: in stock / low / out without a date (current cases, with `preorderShipsOn: null`); a future date with stock → pre-order; a future date with stock 0 → out-of-stock; date equal to today → normal status; past date → normal status (in-stock and low-stock); a future date with stock at or below `lowStockAt` → pre-order, not low-stock. `manilaToday()` with a fake clock at 23:30 UTC returns the next day. `clampQuantity`: non-number, 0, negative, within range, above max, fraction.
- **`lib/format.test.ts`:** `discountPercent` (13.01 % → 13, exactly 50 % → 50, under 1 % → 0); `formatWarranty` (0, 6, 12, 18, 24, 36); `formatDate("2027-01-15")` → "January 15, 2027" regardless of the machine's time zone.
- **`prisma/seed/validate.test.ts`:** a bad `preorderShipsOn` ("2027-13-01", "15/01/2027") and an empty `boxContents` item are rejected.

E2E (`e2e/product-page.spec.ts`, role-based locators, seeded database):

- **Menu → category → product:** open Categories, pick "CPU", click the "AMD Ryzen 5 7600" card; the URL is `/cpu/amd-ryzen-5-7600`, the title is "AMD Ryzen 5 7600 | PC Silicon", the `h1` is the name, a peso price is shown, and the "Specifications" table has the row "Socket: AM5". The breadcrumb links back to `/cpu`.
- `/cpu/no-such-product` is a 404; `/gpu/amd-ryzen-5-7600` ends on `/cpu/amd-ryzen-5-7600`.
- Gallery (Gigabyte RTX 5070, 3 images): a thumbnail switches the main image and is pressed; "Enlarge image" opens the dialog with the keyboard, Esc closes it and focus returns.
- A seeded pre-order shows "Pre-order: ships"; Add to cart and Add to build are disabled.

## Acceptance criteria

- [x] `/<category>/<product>` shows breadcrumbs, gallery, brand, name, price with sale price and % off (rounded down), stock status including "Pre-order: ships `<date>`", quantity selector capped at stock, disabled Add to cart / Add to build with "coming soon", warranty, overview, spec table and what's in the box.
- [x] The gallery works with the keyboard, and "Enlarge image" opens the image larger in a dialog.
- [x] One migration adds `preorderShipsOn` and `boxContents`; the seed fills both (two pre-orders).
- [x] Unknown or draft product → 404; product under the wrong category → 308 to its real URL.
- [x] Rendered per request; title, description and canonical per product.
- [x] Category cards open the product page and show "Pre-order" for pre-orders.
- [x] Unit and E2E tests above pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- Cart, the PC Builder and "Fits your current build" hints (FR-10), related products and frequently bought together (FR-11), Product JSON-LD (NFR SEO): Sprint 3 and later epics.
- Sale prices on cards and sorting by sale price; reviews; image pan/magnifier zoom; per-branch stock.
- Admin editing of the new fields (Admin epic), which must also validate `preorderShipsOn` and keep `boxContents` items non-empty.

## Open questions

None.
