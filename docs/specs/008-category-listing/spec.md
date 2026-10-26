# 008 — Category listing page

Status: **Approved** · Issue: #21 · PRD refs: FR-4 (category listing, grid/list, pagination, sort), FR-7 (state in the URL), NFR Performance (LCP < 2.5 s), NFR Accessibility (WCAG 2.1 AA)

## Summary

`/<category-slug>` (e.g. `/cpu`) lists the category's active products as cards: image, name, brand, price and stock status. Shoppers can sort, page through results and switch between a grid and a list. Sort and page live in the URL, through a small parser that Sprint 3's filters extend. The card is a reusable component for search and related products. The temporary `/products` page is removed.

## Route and data

- **Route:** `app/(store)/[category]/page.tsx`, inside the store layout. Static routes (`/login`, `/builder`, …) take precedence over the dynamic segment, and the seed already rejects reserved slugs ([lib/reserved-slugs.ts](../../../lib/reserved-slugs.ts)).
- **Category lookup:** `getCategoryBySlug(slug)` in `lib/categories.ts` returns `{ id, name, slug } | null`. It is cached like the menu: `unstable_cache`, tag `CATEGORIES_TAG`, `revalidate: 3600`. Both `generateMetadata` and the page call it. Unknown slug → `notFound()`, which renders the default 404 page with status 404.
- **Products:** active products (`status: "ACTIVE"`) in that category, with brand name, price, stock, `lowStockAt`, slug and first image. `count` and `findMany` (`skip`/`take`) run in parallel with `Promise.all`, not `db.$transaction`: inside a transaction Prisma loads the relations as concurrent queries on one pg client, which pg deprecates.
- **Empty category:** "No products in this category yet." and no pager or sort.

## Rendering

**Per request**, following [ADR 0003](../../adr/0003-cache-shared-data-with-tags.md): a product list shows stock and prices, which change at runtime, so it is per-request data. The page calls `await connection()`, as CLAUDE.md requires (reading `searchParams` and the view cookie would make it dynamic anyway). Only the category lookup is cached, because categories are shared, rarely changing data and the cache already exists with its invalidation duty. Caching the product list would need every stock change (orders, admin edits) to invalidate a tag, which isn't worth it before there is traffic.

## Product card

`components/product/product-card.tsx`, a server-compatible component (no `"use client"`, no server-only imports, so client components can render it too).

- **Props:** `product: ProductCardData` (plain data: `name`, `slug`, `categorySlug`, `brand`, `price`, `stock`, `lowStockAt`, `image`), `layout: "grid" | "list"`, `sizes`, `loading` (passed to `ProductImage`) and `headingLevel` (default `3`, the listing passes `2`).
- **Content:** `ProductImage`, brand (muted, small), name as a link in a heading, `formatPeso(price)`, and `stockStatusLabel[getStockStatus(product)]` as text (not color alone). The whole card is clickable through the name link's stretched `::after`, so there is one link per card.
- **Link:** `productHref(categorySlug, slug)` added to `lib/site.ts` (`/cpu/amd-ryzen-5-7600`). It 404s until the product page story, as the menu's links did in spec 007.
- **Layouts:** grid: image on top, square, `sizes="(min-width: 1280px) 280px, 25vw"`. List: a row with a 96 px image left, name and brand in the middle, price and stock right-aligned.
- **Data helper:** `productCardSelect` (the Prisma `select`) and `toProductCardData(row)` in `lib/products.ts` (server-only), so search and related products load the same fields.
- Sale price isn't shown yet (FR-8, product page story); price and sorting use `price`.

## Sort

| `sort` value | Order | Label |
| --- | --- | --- |
| *(absent)* = `newest` (default) | `createdAt desc` | Newest |
| `price-asc` | `price asc` | Price: low to high |
| `price-desc` | `price desc` | Price: high to low |

- Every order ends with `name asc, id asc`, so pages are stable when values tie (seeded products share nearly the same `createdAt`).
- **Default: newest**, since best selling (FR-4) needs orders and comes later. The default is never written to the URL.
- The control is a shadcn `Select` labelled "Sort by", in a small client component `ListingSort`. Changing it navigates to the new URL and resets to page 1.

## Pagination

- **Page size: 24** (6 rows of the 4-column desktop grid). `?page=2` etc.; page 1 is never written to the URL.
- The pager (shadcn `Pagination`) renders real links: Previous, page numbers (with ellipses past 7 pages), Next. It is a `nav` labelled "Pagination", and the current page has `aria-current="page"`. It is hidden when there is one page.
- A "Showing 25–48 of 61 products" line sits above the results.
- Out-of-range and invalid values: see the next section.

## URL state

**Recommendation: a pure, typed parse/serialize module**, `lib/listing-params.ts`, shared by server and client:

- `parseListingParams(searchParams) → { sort, page }`: unknown sort → default, non-integer or `< 1` page → 1. Never throws.
- `listingHref(slug, state)`: builds the URL from a state object, omits defaults, writes keys in a fixed order, so each state has one URL.
- **Canonical redirect:** after parsing and counting, if the request URL differs from `listingHref(slug, state)`, the page calls `redirect()` to it. This covers `?sort=bogus`, `?page=abc`, `?page=1` and a page past the end, which redirects to the **last page** (a shared link to page 4 still works after products are removed). The URL then always matches what is shown.
- **Sprint 3 extends it:** filters add keys to the state (e.g. `brand`, `inStock`, `minPrice`, and spec facets parsed per category from `lib/specs`). Parse and serialize stay in one place, every control builds links with `listingHref`, and changing any filter resets `page`. Pagination and sort keep working because they already pass the whole state through.
- **Why not `nuqs`:** it shines for client-heavy state, but our state is read on the server, and links are plain `<a href>`s that crawlers follow (FR-7). Sprint 3 can revisit it if filters need debounced client updates (the price slider).

## Grid/list toggle

- Two toggle buttons, "Grid" and "List" (icon plus visible label, `aria-pressed`, a solid fill when pressed), in a group named "View", next to the sort.
- **State lives in a cookie** (`listing-view`, `grid` | `list`, one year, `SameSite=Lax`), not the URL. It is a display preference, not part of *what* is listed, so it shouldn't create duplicate URLs, be shared in links, or mix into the filter state. A cookie, unlike `localStorage`, can be read on the server, so the first render is already right (no flash, no hydration mismatch). It applies to every category and future visits.
- The page reads it with `cookies()` (the page is per-request anyway) and passes `initialView` to a client component, `ListingResults`, which holds the view in state, renders the cards with the matching `layout`, and writes the cookie on toggle. Switching is instant, with no server round trip.
- Default: grid.

## Metadata

- `generateMetadata` uses the cached `getCategoryBySlug`, so it adds no extra query.
- **Title:** `Category.name`, through the root template: "CPU | PC Silicon"; from page 2: "CPU — Page 2 | PC Silicon".
- **Description:** from a template, since `Category` has no description column: "Shop {name} in the Philippines at PC Silicon. Compare prices and stock, then check compatibility in the PC Builder." A `description` column can come with the Admin epic.
- **Canonical:** `alternates.canonical` is the URL without `sort` (page kept), so sort variants don't compete in search.

## Removing `/products`

**Delete** `app/(store)/products` and `e2e/products.spec.ts`; `/products` then 404s. It was a temporary developer page that nothing links to, so a redirect would only keep a dead URL alive. Its image-loading check moves to the new E2E test. `"products"` stays in `RESERVED_SLUGS`, moved from "Current routes" to "Likely routes" (a future all-products page). CLAUDE.md's "Current state" paragraph is updated.

## Tests

- **Unit** (Vitest):
  - `parseListingParams`: valid values; unknown sort, `page=0`, `-1`, `2.5`, `abc` and repeated keys fall back.
  - `listingHref`: omits defaults, fixed key order, round-trips with the parser.
  - A pure `clampPage(page, total, pageSize)` and the pager's page list (ellipses).
- **E2E** (`e2e/category-page.spec.ts`, role-based locators, seeded database):
  - **Menu → category:** on `/`, open "Categories", click "CPU" → URL `/cpu`, heading "CPU", title "CPU | PC Silicon". The "AMD Ryzen 5 7600" card shows its brand, a peso price and a stock status, and its image loads.
  - **Current-category marker** (deferred from spec 007): on `/cpu`, open the menu → the "CPU" item has `aria-current="page"` and the check icon; no other item has either. The icon is `aria-hidden`, so it is located as `svg.lucide-check` inside the item, the one non-role locator.
  - **Sort:** choose "Price: high to low" → URL `?sort=price-desc`, prices are in descending order; reload keeps it.
  - **Fallbacks:** `/cpu?sort=bogus&page=abc` and `/cpu?page=99` end at `/cpu`.
  - **Toggle:** click "List" → it is pressed; reload → still list.
  - **404:** `/no-such-category` and `/products` return 404.
  - No seeded category has more than 9 active parts (GPU; CPU has 8), so page 2 isn't reachable in E2E; the unit tests cover the paging logic. When the seed passes 24 parts in a category, add a page-2 E2E step.
- **By hand:** light and dark themes, 1280 px and 1024 px, keyboard through sort, toggle and pager, axe with no violations.

## Acceptance criteria

- [x] `/<category-slug>` lists active products with image, name, brand, price and stock status, using `ProductCard`.
- [x] Unknown category shows the 404 page.
- [x] Sort by newest (default), price low→high and high→low; the sort is in the URL; invalid values fall back.
- [x] 24 per page, page number in the URL; out-of-range pages redirect to the last page.
- [x] Grid/list toggle, remembered in a cookie, correct on first render.
- [x] URL state goes through `lib/listing-params.ts`.
- [x] Product list per request; category lookup cached with the `categories` tag.
- [x] Title, description and canonical per category.
- [x] `/products` removed; CLAUDE.md and `RESERVED_SLUGS` updated.
- [x] The menu's current-category marker passes its E2E test.
- [x] Unit and E2E tests pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- Filters and the price slider (FR-5, Sprint 3), search (FR-6), the product detail page (FR-8–FR-11).
- Best-selling sort, sale prices, infinite scroll.
- Subcategory pages, breadcrumbs, a branded 404 page, the mobile layout.

## Open questions

None.
