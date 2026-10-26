# 012 — Common filters: brand, price, in stock

Status: **Approved** · Issue: #35 · PRD refs: FR-5 (price range and "in stock only" on every category; brand), FR-7 (filter state in the URL), NFR Accessibility (WCAG 2.1 AA), Testing strategy (integration tests for queries)

## Summary

The category page gets a filter sidebar: **brand** (multi-select, only brands present in the category), **price range** (pesos in the UI and URL, centavos in the database) and **in stock only**. Filters live in the URL and combine with sort and pagination. The filters are built on a small reusable structure, so spec filters (story 3) and search (story 4) add filters the same way. This story also adds the project's first database integration tests.

## Reusable filter structure

Each filter is one object that says how it is read from the URL, written back, turned into a database condition, and where its options come from. The pure half (URL and chips) is shared by server and client, so it must not import server-only code, just like `lib/specs`. The server half lives apart.

```ts
// Pure: lib/listing-filters/<key>.ts
type ListingFilter<V> = {
  key: string                                   // names it in state, chips, tests
  parse(raw: RawSearchParams): V | null         // null = inactive; never throws
  serialize(value: V): [string, string][]       // canonical URL entries
  chips(value: V, options: Option[]): { label: string; without: V | null }[]
}
// Server-only: lib/listing-filters/server.ts, same keys
//   where(value, ctx: { today: string }): Prisma.ProductWhereInput
//   options?(scope: Prisma.ProductWhereInput): Promise<Option[]>
```

- **State:** `ListingState` becomes `{ sort, page, filters }`. `filters` holds the active filters' values by key; an absent key is inactive. `parseListingParams(raw, filters)` takes the filter list, so a category can have its own (story 3 builds spec filters from `FieldMeta.filterable`). `listingQuery` writes filters in list order, then `sort`, then `page`. Defaults and inactive filters are never written.
- **Query:** `getCategoryProducts` builds `where = { categoryId, status: "ACTIVE", AND: activeFilters.map(f => f.where(value, ctx)) }`. One condition per `AND` entry, so two filters never fight over the same key. `today` is a parameter, not read inside the query, so tests are deterministic.
- **Options** take a `scope` (the category's `where`), not a category id, so search can scope them to its result set.
- **Completeness:** the server half is a `Record` over the same keys as the pure half, so a filter can't be added to only one.
- **Changing a filter** goes through one helper that sets `page` to 1.
- **Adding a filter later** = one pure object, one `where` (and `options`) entry, one sidebar group. Story 3's spec filters are generated from field metadata; story 4's keyword filter is a `q` filter with no options.

## Filters

| Filter | URL | Meaning |
| --- | --- | --- |
| Brand | `brand=amd&brand=intel` (repeated key, brand slug) | Any of the selected brands |
| Price | `minPrice=10000&maxPrice=20000` (whole pesos) | Effective price from min to max, both inclusive; either bound may be absent |
| In stock only | `inStock=1` | See below |

Different filters combine with AND; the values inside Brand combine with OR.

### Brand

- **Options:** brands with at least one active product in the category, by name. Not narrowed by other filters (counts come in story 3).
- **Source:** `db.brand.findMany({ where: { products: { some: scope } } })`, **per request**. ADR 0003 caches shared data that changes rarely, but the brand list changes whenever a product is added, hidden or moved, so caching it would add a tag-invalidation duty to every product write. The page is per-request anyway, and the query is one indexed lookup.
- **Parse:** repeated `brand` values that look like slugs (`[a-z0-9-]+`), deduplicated and sorted, at most 20. Parsing is pure, so it can't know the options. The page loads options and products in parallel, drops slugs that aren't options, and redirects if that changed anything. An unknown slug beside a valid one matches nothing extra, so the discarded result is still correct.

### Price (effective price)

Filters, **and now sort**, use the price the shopper pays: `COALESCE(salePrice, price)`.

**Finding:** today the price sort uses `price` ([lib/products.ts](../../../lib/products.ts) `sortOrderBy`), and the card shows `price` only ([spec 008](../008-category-listing/spec.md): "sale price isn't shown yet"). Filtering by effective price while sorting and showing the list price would put a ₱12,000 card in a "₱6,000–₱9,500" result. So this story also: sorts by effective price, and the card shows the sale price (sale price in the price slot, list price struck through beside it, "Was" for screen readers, no % badge; the product page keeps the badge). This supersedes the 008 notes.

**Computing it in queries.** Prisma can't filter or order by an expression.

| Option | Filter | Sort | Verdict |
| --- | --- | --- | --- |
| A. Typed `OR` on both columns | `OR: [{ salePrice: range }, { salePrice: null, price: range }]` | Not possible; needs raw SQL | Two mechanisms; hard for story 3 to extend |
| B. Raw SQL for the whole listing | `COALESCE` in SQL | Same | Loses typed `where`, so the filter structure above and story 3's JSONB conditions become hand-built SQL |
| C. Generated column `GENERATED ALWAYS AS (COALESCE(...)) STORED` | `effectivePrice` range | `orderBy: { effectivePrice }` | Cleanest in SQL, but Prisma doesn't model generated columns. [Reports](https://github.com/prisma/prisma/issues/14799) [show](https://github.com/prisma/prisma/issues/24180) `migrate dev` trying to drop the default or the column. Not verified on Prisma 7, and the risk is ours |
| D. Plain `effectivePrice Int` written by the app | Same | Same | Every writer (seed, admin, bulk edit) must keep it right; it drifts silently |
| **E. Plain `effectivePrice Int`, kept by a database trigger (recommended)** | Same | Same | Prisma sees an ordinary column, so there is no drift. The trigger (`BEFORE INSERT OR UPDATE`, hand-written in the migration) sets it from `salePrice`/`price` for every writer, including the seed and the Neon console. The app never writes it |

**Recommendation: E.** One typed definition serves filter, sort and (later) price bounds, and correctness doesn't depend on any writer. It doesn't rely on `salePrice < price` either: whatever is set as the sale price is what the shopper pays. Costs: a hand-written migration, a column declared `@default(0)` that the trigger always overwrites, and no index for now (the catalog is small). The first task of the plan is a spike on a throwaway branch: migrate, `migrate dev` shows no drift, seed re-runs, trigger fires on insert and update. If it fails, fall back to A for the filter and raw SQL for the sort only.

- **Units:** the UI and URL use whole pesos; `where` multiplies by 100. Values are `^\d{1,8}$`, at most 10,000,000, so centavos stay inside Postgres `Int`; anything else is invalid.
- **Invalid values are ignored**, per bound: `minPrice=abc`, `-5`, `1.5`, `1e3`, empty, or above the cap. The other bound still applies.
- **min > max** are swapped, so the range the shopper meant is applied, and the canonical redirect shows them in order. `min == max` is valid (an exact price).

### In stock only

"In stock" means what a shopper can buy and have shipped now, the same as the card's **In stock** and **Low stock** labels:

| Card status | Shown by "In stock only" |
| --- | --- |
| In stock | Yes |
| Low stock | Yes |
| **Pre-order** | **No** |
| Out of stock | No |

A pre-order isn't in stock yet, and a card labelled "Pre-order" under an "In stock only" filter would contradict the label. A pre-order whose ship date is today or earlier has ended, so it counts as normal ([lib/stock.ts](../../../lib/stock.ts)). The condition mirrors `getStockStatus`: `stock > 0 AND (preorderShipsOn IS NULL OR preorderShipsOn <= today)`, with `today` from `manilaToday()`. A test checks that the filter and `getStockStatus` agree on every fixture product. Including pre-orders is a possible later toggle.

## URL behavior

- **Combine:** `/cpu?brand=amd&maxPrice=20000&inStock=1&sort=price-desc&page=2`. Key order: filters (list order), `sort`, `page`. Sort and pagination links pass the whole state through, so they keep the filters. `ListingSort` and `ListingPagination` get the full state, not just `sort`, and `generateMetadata` passes `filters`.
- **Reset:** changing, adding or removing a filter sets `page` to 1. Changing sort already does.
- **Invalid values are ignored** (not an error), then the existing canonical redirect rewrites the URL: `?minPrice=abc&inStock=yes&brand=NOT%20A%20SLUG` goes to `/cpu`. `inStock` is on only for `1`. A page past the end still redirects to the last page of the *filtered* results.
- **SEO:** the filter links are plain `<a href>`s, so they're crawlable (FR-7). Filtered pages get `robots: { index: false, follow: true }`, since combinations aren't useful landing pages. Sort variants keep the canonical from spec 008.
- **Rendering:** per request ([ADR 0003](../../adr/0003-cache-shared-data-with-tags.md)); no new cache or tag.

## UI

- **Layout:** a left `<aside aria-label="Filters">`, 240 px, from 1024 px up; the grid is re-checked at 1280 and 1024 (columns and `sizes`). Below 1024 px the sidebar stacks above the results, with no drawer (mobile is Phase 2). Fieldsets with legends: **Brand**, **Price (₱)**, **Availability**. Uses `Field` primitives and a shadcn `Checkbox` (`pnpm dlx shadcn@latest add checkbox`).
- **Price control:** two number fields (Min, Max) plus an Apply button, not the slider from FR-5. Typed values are exact, a slider's keyboard steps over ₱3,000–₱150,000 are coarse, and a slider's live updates need debounced client state that spec 008 chose to avoid. A dual-handle slider can sit on top later without changing the URL.

| Control | Applies | Why |
| --- | --- | --- |
| Brand checkbox | Instantly | One decision per click |
| In stock only | Instantly | Same |
| Price Min / Max | On submit: Apply button or Enter in either field | Typing "15000" would otherwise navigate five times with nonsense ranges |

- **Instant controls** navigate with `router.push(listingHref(...), { scroll: false })` in a transition. The checkbox shows its new state at once (`useOptimistic`), focus stays on it, and the results are `aria-busy` while loading.
- **Price field errors:** a non-numeric or out-of-range value isn't submitted; the field gets `aria-invalid` and a message tied with `aria-describedby`. Min > max needs no error (swapped).
- **Active filters:** above the count line, a list of chips, one per brand, one for price ("Price: ₱10,000 – ₱20,000", "Price: from ₱10,000", "Price: up to ₱20,000"), one for "In stock only". Each chip is a link with a remove icon and the name "Remove filter: Brand: AMD" (the visible label, with a visually hidden "Remove filter: " before it), pointing to the URL without it (page 1). A **Clear all** link follows. Clear all removes filters but keeps the sort. Nothing is shown with no filters.
- **Announcement:** a visually hidden `role="status"` region in the listing shell says "Showing 1 to 24 of 61 products", or "No products match your filters.", whenever the results change. It lives in the shell, which stays mounted, because a live region that appears together with its text may not be announced. The visible count line is plain text.
- **No matches:** with filters active and zero results, show "No products match your filters." (a heading) and a **Clear all filters** button; the sidebar and chips stay so the shopper can adjust; sort and pager are hidden. A category that has no products at all keeps today's "No products in this category yet." and no sidebar.
- **Keyboard:** everything is native (checkboxes toggle with Space, fields submit with Enter, chips are links), in reading order: sidebar, chips, sort, results. Focus rings use the existing `focusRing`.

## Tests

- **Unit** (Vitest, pure): `lib/listing-params.test.ts` and one test file per filter.
  - Brand: repeated keys, duplicates, sorting, malformed slugs, the 20 cap.
  - Price: valid; decimals, negatives, text, empty, above the cap (each ignored per bound); min > max swapped; equal bounds; pesos to centavos.
  - In stock: `1` only.
  - `listingQuery` round-trips with the parser, with a fixed key order; changing a filter resets the page; `isCanonicalQuery` with filters; chips and their `without` values.
- **Integration** (Vitest + Postgres; our first). `*.db.test.ts` files in a separate Vitest project run by `pnpm test:db`, **not** by `pnpm test`, which stays pure.
  - **Database:** a dedicated test database from `TEST_DATABASE_URL` (a local Docker Postgres of the same major version as Neon and CI), which never falls back to `DATABASE_URL`. A guard refuses to run when it is missing, or points at the same host as `DATABASE_URL` / `DATABASE_URL_UNPOOLED` (a loopback host such as CI's throwaway server is allowed only with a different database name), and prints the host and database it uses. So a test can't touch the dev or production data. A global setup applies the migrations to it; each file empties the catalog tables and inserts the fixtures. The config points `DATABASE_URL` at it, so `@/lib/db` works untouched. Listed in `.env.example`.
  - **CI:** the Postgres service container gets a second database, `pcsilicon_test`; a `pnpm test:db` step runs after the unit tests. The E2E database and seed are unaffected.
  - **Fixtures** (today pinned to `2026-10-26`), effective prices in pesos:

    | | Brand | Price | Sale | Stock | Notes | Effective |
    | --- | --- | --- | --- | --- | --- | --- |
    | P1 | Alpha | 5,000 | | 10 | | 5,000 |
    | P2 | Alpha | 12,000 | 9,000 | 3 | low stock (`lowStockAt` 5) | 9,000 |
    | P3 | Beta | 10,000 | | 0 | out of stock | 10,000 |
    | P4 | Beta | 20,000 | | 4 | pre-order, ships 2027-01-15 | 20,000 |
    | P5 | Beta | 15,000 | | 6 | ship date 2026-10-26 (ended) | 15,000 |
    | P6 | Gamma | 8,000 | | 5 | DRAFT | |

    P1–P6 are in CPU; **G1** (brand Delta, 7,000, in stock) is in GPU, to prove scoping.
  - **Cases** (each checks the names and `total`): brand options for CPU are Alpha and Beta only (not Gamma, which is draft only, nor Delta); brand Alpha → P1, P2; Alpha + Beta → five products; ₱6,000–₱9,500 → P2 only (its list price is outside); ₱9,000–₱10,000 → P2, P3 (both bounds inclusive); only min / only max; ₱100,000 minimum → none; in stock → P1, P2, P5; Beta + in stock → P5; Alpha + Beta + max ₱10,000 → P1, P2, P3; price-asc → P1, P2, P3, P5, P4 and price-desc the reverse (list-price order would put P3 before P2); no filter returns all five active CPUs; the trigger sets `effectivePrice` on insert and when `salePrice` is set or cleared; the in-stock set equals the products whose `getStockStatus` is in-stock or low-stock.
- **E2E** (`e2e/category-filters.spec.ts`, role-based locators, seeded DB, no exact catalog data):
  - **Brand + price:** on `/cpu`, check "AMD" → URL `?brand=amd`, every card is AMD, an "AMD" chip appears. Fill Max price `20000`, press Enter → URL has `brand=amd&maxPrice=20000`, at least one card, every card price ≤ ₱20,000, and the count fell.
  - **Sort and filter combine:** choose "Price: high to low" → URL keeps it after a filter change; prices are descending.
  - **Remove and clear all:** remove the price chip → `maxPrice` gone, brand kept; "Clear all" → URL back to `/cpu` (or `/cpu?sort=price-desc` when sorted).
  - **In stock only:** no card reads "Out of stock" or "Pre-order".
  - **No match:** `/cpu?minPrice=9999999` shows "No products match your filters."; "Clear all filters" restores the list.
  - **Fallbacks:** `/cpu?minPrice=abc&inStock=yes` → `/cpu`; `/cpu?minPrice=20000&maxPrice=10000` → `?minPrice=10000&maxPrice=20000`.
  - **Keyboard:** Tab to a brand checkbox, Space toggles it and the results change with focus still on it; type a price, Enter applies.
- **By hand:** light and dark themes, 1280 px and 1024 px, a screen reader hears the count change, axe with no violations.

## Changes to existing code

- Migration: `Product.effectivePrice` plus the trigger; existing rows backfilled in the same migration.
- `lib/listing-params.ts` (state, parse, serialize), `lib/products.ts` (`where`, sort by `effectivePrice`, card data gains `salePrice`), `ProductCard`, `ListingSort`, `ListingPagination`, the category page, and `generateMetadata`.
- `CLAUDE.md`: listing URL state note, the test commands, and `TEST_DATABASE_URL`. README: how to set up the test database. `.env.example`.

## Acceptance criteria

- [x] Sidebar with brand (only the category's brands, multi-select), price range and "in stock only".
- [x] Price filter and price sort use the effective price; the card shows the sale price.
- [x] "In stock only" excludes pre-orders and out-of-stock products.
- [x] Filters live in the URL, combine with sort and pagination, reset the page, and invalid values are ignored; min > max is swapped.
- [x] Active filters show as chips with remove links, plus Clear all; "No products match your filters." has a way back.
- [x] Brand and in-stock apply instantly, price on submit; everything works by keyboard.
- [x] The filter structure lets a new filter be added with one pure object, one server entry and one sidebar group.
- [x] Unit, integration (in CI) and E2E tests pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- Spec filters and option counts (story 3), keyword search (story 4).
- A price slider, price bounds or histogram, pre-orders in the stock filter.
- Mobile layout and filter drawer, a new sort (best selling), caching the brand list.

## Open questions

None. Confirm two choices when reviewing: the two price fields instead of FR-5's slider, and pre-orders excluded from "in stock only".
