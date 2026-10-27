# 014 — Plan: keyword search

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #37 · ADRs: [0003](../../adr/0003-cache-shared-data-with-tags.md), [0004](../../adr/0004-effective-price-column-kept-by-trigger.md), 0005 (new)

## Context

FR-6 asks for keyword search across name, brand, model number and key specs, with results that reuse the listing's filters. The approved spec chooses a trigger-maintained `tsvector` column (like `effectivePrice`), a `simple`-config normalizer that splits letters from digits, a query function that can't throw, `/search` reusing the listing components with a new Category filter, and `noindex`. The user's conditions: the spike states its fallbacks (already in the spec); search tests use their own fixtures, and **a failing search test is never "fixed" by changing the expectation: stop and report with a view**; the listing-component refactor is its own task, verified (category pages unchanged, existing E2E green) before any search UI.

## Summary

- **One migration** (column, GIN index, 4 SQL functions, 3 triggers, backfill). **No new dependency** (`next/form` ships with Next).
- **Target + state:** `q` lives in a serializable `ListingTarget` (`{ kind: "category", slug } | { kind: "search", q }`), so `ListingState` stays `{ sort, page, filters }`. Components take `target` instead of `slug`; one `targetHref(target, state)`.
- **Reuse:** `activeWhere`, `loadFilterOptions(scope, …)` (scope = matching ids), `countFacet`, `productCardSelect` / `toProductCardData`, `ListingShell` / `useNavigateListing`, `ListingResults`, `ListingSort`, `ListingPagination`, `ActiveFilters`, `ListingFilters`, `NoMatches`, `first`/`all` from `raw.ts`, `brandFilter` as the model for `categoryFilter`, `getMenuCategories` (cached) for category links, `manilaToday`, the test-support helpers (`resetCatalog`, `assertTestDatabase`).

## Files

```
prisma/migrations/<ts>_product_search/migration.sql (new)
prisma/schema.prisma                         searchVector Unsupported("tsvector")? + @@index Gin (per spike)
docs/adr/0005-search-vector-kept-by-trigger.md (new)

lib/listing-params.ts (+ test)               ListingTarget, targetHref/targetQuery, filtersFor(target),
                                             sortsFor/defaultSort(target), parseSearchParams, cleanQuery
lib/listing-filters/category.ts (+ test)     categoryFilter (pure, like brand)
lib/listing-filters/index.ts                 searchFilters list (category + common)
lib/listing-filters/types.ts                 FacetRow gains category { slug, name }
lib/listing-filters/server.ts                serverFilters over common keys + "category"; facetSelect adds category
lib/search.ts (new, server-only)             matchProducts, getSearchProducts, getSearchFilterOptions
lib/search.db.test.ts (new)                  spec's fixture table and query table
test-support/db.ts                           insertSearchFixtures() (F1–F14)

components/catalog/*.tsx                     slug -> target (sort, pagination, chips, sidebar, no-matches)
components/layout/header-search.tsx          next/form, name="q", prefilled on /search
components/layout/site-header.tsx            Suspense around HeaderSearch
app/(store)/[category]/page.tsx              passes { kind: "category", slug }
app/(store)/search/page.tsx (new)            states, redirects, metadata (noindex)
components/catalog/search-prompt.tsx, search-no-results.tsx (new)
e2e/search.spec.ts (new)
CLAUDE.md, docs/specs/012-common-filters/spec.md (superseded note on `q`)
```

## Database (migration)

- `ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector;` + `CREATE INDEX … USING GIN` (name as Prisma would generate it, so the schema's `@@index` matches).
- `search_normalize(text) RETURNS text IMMUTABLE`: `lower` → `[^a-z0-9]+` to space → `([a-z])([0-9])` and then `([0-9])([a-z])` to `\1 \2` (two passes handle `7800x3d` → `7800 x 3 d`) → `trim`.
- `search_query(text) RETURNS tsquery IMMUTABLE`: tokens of `search_normalize`, empty ones dropped, first 16; last token gets `:*` when length ≥ 2; joined with ` & `; `to_tsquery('simple', …)`; `NULL` when no tokens (so `@@` filters everything out). Only `[a-z0-9]` reach `to_tsquery`.
- `product_search_vector(name, sku, specs, "brandId", "categoryId") RETURNS tsvector STABLE`: `setweight(to_tsvector('simple', search_normalize(x)), 'A'|'B'|'C'|'D')` for name / brand name + SKU / every string in `specs` (`jsonb_path_query(specs, 'strict $.** ? (@.type() == "string")')`) / category name.
- Triggers: `Product` `BEFORE INSERT OR UPDATE OF name, sku, specs, "brandId", "categoryId"` sets `NEW."searchVector"`; `Brand` and `Category` `AFTER UPDATE OF name … WHEN (OLD.name IS DISTINCT FROM NEW.name)` recompute their products. Backfill `UPDATE "Product" SET "searchVector" = …`.
- Schema comment like `effectivePrice`'s: trigger-maintained, never written by the app.

## Pure state (`lib/listing-params.ts`, `lib/listing-filters/`)

- `ListingTarget`; `filtersFor(target)`: category → `listingFilters(slug)`, search → `searchFilters` (`[categoryFilter, ...common]`).
- Sorts: `SORTS` gains `"relevance"` (label "Best match"); `sortsFor(target)`: category → today's three; search with `q` → relevance first + three; search without `q` → three. `defaultSort(target)`: relevance iff search with `q`, else newest. Parse rejects a sort not in `sortsFor`.
- `cleanQuery(raw)`: first `q`, strip `\p{Cc}`, collapse whitespace, trim, cut to 100 code points, trim.
- `targetQuery(target, state)`: search writes `q` first, then filters, sort (if not the target's default), page. `isCanonicalQuery` and `parseListingParams` take the target (category behaviour identical).
- `categoryFilter`: key `category`, repeated slug values, `[a-z0-9-]+`, deduped, sorted, max 20; chips "Category: GPU"; `normalize`; facet from `row.category`, sorted by name.

## Server (`lib/search.ts`)

- `matchProducts(q)`: `db.$queryRaw` tagged template — `SELECT id, ts_rank_cd("searchVector", query, 1) AS rank FROM "Product", search_query(${q}) query WHERE status = 'ACTIVE' AND "searchVector" @@ query` → `Map<id, rank>`. Not called when `q` is empty.
- Scope: `{ status: "ACTIVE", ...(q && { id: { in: [...ranks.keys()] } }) }`.
- `getSearchFilterOptions` = `loadFilterOptions(scope, filters, ctx, searchFilters)`.
- `getSearchProducts`: price/newest sorts → same `count` + `findMany` as `getCategoryProducts` (share the `sortOrderBy` helper from `lib/products.ts`). Relevance → `findMany({ select: { id, name } })` with filters, sort by rank desc, name, id; total = length; slice the page; load cards with `productCardSelect` for those ids and reorder.

## UI

- `HeaderSearch` (client): `<Form action="/search" role="search">`, `<Input type="search" name="q" maxLength={100} key={value} defaultValue={value}>`, value = `q` when `usePathname() === "/search"`. Label "Search parts" kept (home E2E relies on it). `SiteHeader` wraps it in `<Suspense fallback={<empty box>}>` because the home page is prerendered.
- `/search` page: `await connection()`; parse → load options + products in parallel → normalize filters / page past end / canonical redirects as on the category page. States per the spec's table (prompt, brand browse, no results with suggestions, `NoMatches` keeping `q`). Heading: `Results for “q”`, single-brand name, or "All products". `generateMetadata`: title, `robots: { index: false, follow: true }`.

## Verification (end to end)

- `pnpm test` (pure: query cleaning, sorts per target, category filter, URL round trips for both targets).
- `pnpm test:db` (triggers, the fixed query table, safety inputs, counts).
- `pnpm test:e2e` (existing suites unchanged after T2; search journey with and without JavaScript).
- `pnpm build` with the header's Suspense; manual run in `pnpm dev` of each state; `migrate dev` clean on the dev branch.
