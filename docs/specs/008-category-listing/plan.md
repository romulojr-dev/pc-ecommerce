# 008 — Plan: category listing page

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #21 · ADR: [0003](../../adr/0003-cache-shared-data-with-tags.md)

## Context

FR-4 asks for category listings with sort, pagination and a grid/list toggle; FR-7 wants the state in the URL. The approved spec puts them at `/<category-slug>`, with a reusable `ProductCard`, sort and page in the URL through one parse/serialize module that Sprint 3's filters extend, the view in a cookie, the product list per request and the category lookup cached under the existing `categories` tag. It also removes the temporary `/products` page and adds the current-category E2E deferred from spec 007.

## Summary

- **No schema change, no migration, no new npm dependency.** Three shadcn primitives are added: `select`, `pagination`, `toggle-group` (`pnpm dlx shadcn@latest add …`, Base UI variants for `base-mira`).
- **Pure logic stays testable without env:** URL parsing, hrefs and paging math live in `lib/listing-params.ts` and `lib/site.ts`, which don't import `db`.
- **Reuse:** `ProductImage`, `formatPeso`, `getStockStatus`/`stockStatusLabel`, `categoryHref`, `CATEGORIES_TAG`, `Container`, `focusRing`, the root title template (`%s | PC Silicon`).
- Next 16 specifics (checked in `node_modules/next/dist/docs`): `params` and `searchParams` are promises; `PageProps<"/[category]">` is a global helper; `redirect()` throws (307, `replace`); cookies are read with `await cookies()` in server components and can't be set during render, so the client writes the view cookie with `document.cookie`.

## Files

```
lib/listing-params.ts                       sort/page state: parse, href, paging math
lib/listing-params.test.ts                  unit tests
lib/site.ts / site.test.ts                  productHref(categorySlug, slug)
lib/categories.ts                           getCategoryBySlug() (cached, CATEGORIES_TAG)
lib/products.ts                             productCardSelect, toProductCardData, getCategoryProducts()
components/product/product-card.tsx         ProductCard + ProductCardData type
components/catalog/listing-sort.tsx         "use client" sort Select
components/catalog/listing-pagination.tsx   server component, pager links
components/catalog/listing-results.tsx      "use client" view toggle + grid/list of cards
components/ui/{select,pagination,toggle-group}.tsx   shadcn
app/(store)/[category]/page.tsx             page + generateMetadata
app/(store)/products/                       deleted
e2e/products.spec.ts                        deleted
e2e/category-page.spec.ts                   new
lib/reserved-slugs.ts                       "products" moved to "Likely routes"
e2e/category-menu.spec.ts                   comment about #21 updated
CLAUDE.md                                   current state, listing conventions
```

## URL state — `lib/listing-params.ts`

```ts
export const SORTS = ["newest", "price-asc", "price-desc"] as const
export type ListingSort = (typeof SORTS)[number]
export const DEFAULT_SORT: ListingSort = "newest"
export const SORT_LABELS: Record<ListingSort, string>   // "Newest", "Price: low to high", …
export const PAGE_SIZE = 24
export type ListingState = { sort: ListingSort; page: number }
type RawSearchParams = Record<string, string | string[] | undefined>

parseListingParams(raw): ListingState      // first value of repeated keys; bad sort → default; page must match /^[1-9]\d*$/ else 1
listingQuery(state): string                // "sort=price-desc&page=2", defaults omitted, fixed key order ("" when all default)
listingHref(slug, state): string           // categoryHref(slug) + ("?" + query when non-empty)
pageCount(total): number                   // max(1, ceil(total / PAGE_SIZE))
paginationItems(current, count): (number | "ellipsis")[]   // all pages when count ≤ 7, else 1 … c-1 c c+1 … last
```

The page's canonical check compares `new URLSearchParams(raw).toString()` (rebuilt from the raw object) with `listingQuery(state)`; any difference redirects. Unknown keys are dropped by that redirect, which is what "one URL per state" means; Sprint 3 adds its keys to `ListingState`, the parser and `listingQuery`.

## Data

- `lib/categories.ts`: `getCategoryBySlug = unstable_cache(async (slug) => db.category.findUnique({ where: { slug }, select: { id, name, slug } }), ["category-by-slug"], { tags: [CATEGORIES_TAG], revalidate: 3600 })`. The slug is part of the cache key through the argument.
- `lib/products.ts` (imports `db`):
  - `productCardSelect` (`satisfies Prisma.ProductSelect`): `name, slug, price, stock, lowStockAt, brand.name, category.slug, images` (first by `sortOrder`, `url, alt`).
  - `toProductCardData(row): ProductCardData` flattens brand, category slug and `images[0] ?? null`.
  - `getCategoryProducts(categoryId, { sort, page })` → `{ products, total }` with `Promise.all([count, findMany])` (not `$transaction`: inside one, Prisma loads relations as concurrent queries on one pg client, which pg deprecates), `where: { categoryId, status: "ACTIVE" }`, `skip: (page - 1) * PAGE_SIZE`, `take: PAGE_SIZE`, and `orderBy` from a map: `newest → createdAt desc`, `price-asc/desc → price`, each followed by `name asc, id asc`.
  - Out-of-range pages: the page queries first, and if `page > pageCount(total)` redirects to the last page (one wasted query on a bad URL, acceptable).

## Components

- **`ProductCard`** (no `"use client"`): props `product`, `layout: "grid" | "list"`, `sizes`, `loading?`, `headingLevel?: 2 | 3` (default 3). Renders an `<article>`; name in `h2`/`h3` with a `Link` to `productHref(...)` whose `after:absolute after:inset-0` makes the card clickable; `relative` card with focus ring via `has-[a:focus-visible]`. Brand above the name, price (`tabular-nums`), stock label. Grid: image on top; list: `flex` row, 96 px image, price/stock right.
- **`ListingSort`** (`"use client"`): shadcn `Select` labelled "Sort by" with `SORT_LABELS`; `onValueChange` → `router.push(listingHref(slug, { sort, page: 1 }))`. Props `slug`, `sort`.
- **`ListingPagination`** (server): hidden when `count === 1`; shadcn `Pagination` with `Link`s from `listingHref`, `aria-label="Pagination"`, `aria-current="page"` on the current number, Previous/Next omitted (or disabled spans) at the ends.
- **`ListingResults`** (`"use client"`): props `products: ProductCardData[]`, `initialView`, `toolbar` slot (the sort, rendered by the server). Holds `view` in state; `ToggleGroup` with "Grid"/"List" items (`aria-pressed` from Base UI, icon + `aria-label`); on change sets state and `document.cookie = "listing-view=…; path=/; max-age=31536000; samesite=lax"`. Grid: `grid grid-cols-3 xl:grid-cols-4 gap-6`; list: `ul` with dividers. First 4 cards `loading="eager"` (LCP).
- View cookie name and values: `VIEW_COOKIE` and `parseView(value)` (default `grid`) in `lib/listing-params.ts`.

## Page — `app/(store)/[category]/page.tsx`

```
generateMetadata: category = await getCategoryBySlug(slug) → notFound when null
  title: page > 1 ? `${name} — Page ${page}` : name
  description: template from the spec
  alternates.canonical: listingHref(slug, { sort: DEFAULT_SORT, page })
Page:
  await connection()
  category ?? notFound()
  state = parseListingParams(await searchParams)
  { products, total } = await getCategoryProducts(category.id, state)
  clamp: page > pageCount(total) → redirect(listingHref(slug, { ...state, page: last }))
  non-canonical query → redirect(listingHref(slug, state))
  view = parseView((await cookies()).get(VIEW_COOKIE)?.value)
  render: h1 name, "Showing a–b of n products", ListingResults (with ListingSort toolbar), ListingPagination; empty state
```

## E2E — `e2e/category-page.spec.ts`

As listed in the spec: menu → `/cpu` (heading, title, "AMD Ryzen 5 7600" card with brand, `₱` price, stock text, loaded image — the old products check moves here); current-category marker (`aria-current` and `svg.lucide-check` only on "CPU"); sort `price-desc` in URL and descending prices, kept on reload; `/cpu?sort=bogus&page=abc` and `/cpu?page=99` end at `/cpu`; List toggle pressed and kept on reload; `/no-such-category` and `/products` return 404.

## Verification

- `pnpm test` with `.env.local` moved aside (pure units), `pnpm lint`, `pnpm typecheck`.
- `pnpm dev`: each category, sorts, toggle (no flash on reload), bad URLs redirect, light/dark at 1280/1024 px, keyboard, axe.
- `pnpm test:e2e` (all specs), `pnpm build` (route table lists `/[category]` as `ƒ`, `/` still static).
