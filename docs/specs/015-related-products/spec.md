# 015 — Related products

Status: **Approved** · Issue: #38 · PRD refs: FR-11 (related products; "frequently bought together" deferred), NFR Performance (LCP < 2.5 s), NFR Accessibility (WCAG 2.1 AA), Testing strategy (integration tests for queries)

## Summary

The product page gets a **"Similar products"** section under its details: up to 4 other active products from the same category, closest in the price the shopper pays, preferring ones that can be bought now. It reuses `ProductCard` and streams in behind a `Suspense` boundary with a skeleton, so the product details never wait for it.

## Which products

`getRelatedProducts(product)` in `lib/products.ts` (server-only) takes the current product's `id`, `categoryId` and `effectivePrice`, and returns up to 4 `ProductCardData`.

- **Candidates:** same `categoryId`, `status: "ACTIVE"`, `id` not the current product's.
- **Order**, in this priority:
  1. **Available first:** `stock > 0` before `stock <= 0`.
  2. **Closest in price:** `ABS("effectivePrice" - <current effectivePrice>)` ascending. `effectivePrice` is the price the shopper pays, kept by the trigger ([ADR 0004](../../adr/0004-effective-price-column-kept-by-trigger.md)), so a product on sale is compared at its sale price, the one its card shows.
  3. **Tie-break** for equal distances: the **cheaper one first** (`effectivePrice` ascending), then `name`, then `id` (the same final keys as the listing's `tieBreakers`). A ₱10,000 product with neighbours at ₱9,000 and ₱11,000 always shows ₱9,000 first, and the result never depends on row order.
- **`LIMIT 4`.**

### Availability and pre-orders

"Available" means **`stock > 0`**: in stock, low stock and **pre-orders all count**. A pre-order can be ordered today (its stock is its allocation) and its card says "Pre-order", so the shopper isn't misled. This is deliberately wider than the listing's "In stock" filter, which excludes pre-orders: that filter answers "can I get it now", while this section offers alternatives the shopper can buy. It also means the query needs no `today`.

Out-of-stock products are **only used to fill slots**: because availability is the first sort key, they appear only when fewer than 4 available candidates exist, and always after them. Their cards say "Out of stock".

### Fewer than 4, or none

- **1 to 3 candidates:** the section shows those, in the order above; the grid keeps its 4-column width, so cards don't stretch.
- **None** (the only active product in its category): the section, heading included, is **not rendered**. The skeleton disappears with no empty-state text; an empty "Similar products" would be noise.

### Query

Prisma's `orderBy` takes columns, not `ABS(...)`, so the ordering is one raw query that returns ids, like `getSearchScope` in `lib/search.ts`:

```sql
SELECT "id" FROM "Product"
WHERE "categoryId" = $categoryId AND "status" = 'ACTIVE' AND "id" <> $id
ORDER BY ("stock" > 0) DESC,
         ABS("effectivePrice" - $price),
         "effectivePrice", "name", "id"
LIMIT 4
```

All values are bound parameters (`$queryRaw` tagged template). Then a typed `findMany` with `productCardSelect` on those ids, mapped with `toProductCardData` and put back in the raw query's order. Two round trips on small result sets; fine for a section that streams.

`getProductPage` gains `id`, `categoryId` and `effectivePrice` in its select, so the page passes them without a second lookup. Reading `effectivePrice` is fine; only writing it is forbidden.

## Rendering and loading

The page already renders per request (`await connection()`, [ADR 0003](../../adr/0003-cache-shared-data-with-tags.md)): stock and prices change at runtime, so related products are **not** wrapped in `unstable_cache` either, and no write has to invalidate a tag.

How the streaming works here:

1. The page awaits `getProductPage(slug)`, then calls `notFound()` or `permanentRedirect()` when needed. That all happens **before** any `Suspense` boundary renders, so 404s and 308s keep their real HTTP status. (Once a fallback is sent, the response is committed to `200`.)
2. The page renders `<Suspense fallback={<RelatedProductsSkeleton />}><RelatedProducts product={...} today={today} /></Suspense>` after the details. `RelatedProducts` is an async server component that awaits `getRelatedProducts`.
3. React sends the HTML for everything outside the boundary (breadcrumbs, gallery with the LCP image, price, stock, specs) plus the skeleton in the first chunk, and keeps the response open. When the query resolves, it streams the section's HTML in the same response with a small inline script that swaps it in place of the skeleton. The product details are never delayed by the related query.

This works without Cache Components (`cacheComponents` stays off); `Suspense` streaming is plain React plus the App Router. No `loading.tsx`: that would wrap the whole page, including the details we want first.

Consequences:

- **Without JavaScript the section stays a skeleton**, since the swap is a script (the same mechanism spec 014 avoided for the search box). Acceptable: the section is supplementary, and the details and spec table are in the first chunk.
- **Crawlers** that Next detects as HTML-limited bots get the fully rendered page, section included.
- **Errors don't break the page:** a failed query has already passed the `200`, so `RelatedProducts` catches it, logs it with `console.error`, and renders nothing, like the empty case.
- The section is below the fold on desktop, so its swap-in doesn't shift the details; when it renders nothing, the skeleton's space collapses at the bottom of the page.

## Layout

- **Where:** a full-width `<section aria-labelledby="similar-products">` after the Overview / Specifications / What's in the box column, still inside the page's `Container`, separated like the other sections (`mt-12`).
- **Heading:** `<h2 id="similar-products">Similar products</h2>`, styled like the other section headings (`text-lg font-semibold`).
- **Cards:** a `<ul>` grid, `grid-cols-2` below `lg` and `lg:grid-cols-4`, one `<li>` per `ProductCard` with `layout="grid"`, `headingLevel={3}` (under the section's `h2`), `today={manilaToday()}` from the page, `loading="lazy"` (never the LCP image), `className="h-full"`, and `sizes="(min-width: 1280px) 296px, (min-width: 1024px) 23vw, 45vw"` (4 columns in the 1280 px container, 2 below `lg`). Each card links to its product page, as on listings.
- **Skeleton:** `RelatedProductsSkeleton` uses `Skeleton` from `components/ui/skeleton` in the same grid: a heading-sized bar and 4 card-shaped blocks (square image, two text lines, price line), so the swap doesn't jump. `aria-hidden="true"`: it carries no information, and the real heading announces the section when it arrives.

## Tests

Integration (`lib/related-products.db.test.ts`, Vitest against `TEST_DATABASE_URL`, fixtures inserted by the test with the helpers in `test-support/db.ts`). One category with a current product at ₱10,000 and fixtures around it, plus a product in another category:

- **Closest price:** with 6 available candidates, returns the 4 nearest by `effectivePrice`, in distance order.
- **Sale price counts:** a product listed at ₱15,000 on sale for ₱10,500 ranks as ₱10,500 away by ₱500.
- **Self excluded:** the current product never appears, even though its distance is 0.
- **Inactive excluded:** a `DRAFT` (non-active) product at ₱10,000 is not returned.
- **Other categories excluded:** a ₱10,000 product in another category is not returned.
- **Availability preference:** an out-of-stock product at ₱10,000 comes after available ones further away; it fills the 4th slot only when there are 3 available candidates.
- **Pre-orders count as available:** a pre-order (future `preorderShipsOn`, `stock > 0`) ranks with the available products.
- **Tie-break:** candidates at ₱9,000 and ₱11,000 return ₱9,000 first; two at the same price return in name order.
- **Fewer than 4 / none:** a category with 2 other products returns 2; the only product in its category returns `[]`.

E2E (`e2e/product-page.spec.ts`, role-based locators, seeded database):

- On `/cpu/amd-ryzen-5-7600`, the region "Similar products" (`getByRole("region", { name: "Similar products" })`) shows 4 product cards, none named "AMD Ryzen 5 7600".
- Clicking the first card's link opens another product: the URL changes to `/cpu/<that slug>` and the `h1` is that card's name.

Unit: none new; the card and stock status already have theirs.

## Acceptance criteria

- [ ] Product pages show "Similar products" with up to 4 active products from the same category, never the current one, closest in effective price, available ones (pre-orders included) before out-of-stock, with the tie-break above.
- [ ] With no candidates, the section isn't rendered; with 1 to 3, it shows those.
- [ ] The section reuses `ProductCard`, under an `h2`, and each card opens its product page.
- [ ] The section streams behind `Suspense` with a skeleton; 404 and 308 responses keep their status; a failed related query doesn't break the page.
- [ ] Integration and E2E tests above pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- **"Frequently bought together"** (FR-11): needs real order data, so it waits for the Orders epic.
- Similarity by specs (same socket, same VRAM), brand preference, or builder compatibility hints (FR-10).
- Related products on listing or search pages; a carousel or more than 4 cards.
- Caching the section or moving the product page to Cache Components (ADR 0003's evaluation is its own story).

## Open questions

None.
