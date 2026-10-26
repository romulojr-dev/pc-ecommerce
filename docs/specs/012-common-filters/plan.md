# 012 — Plan: common filters (brand, price, in stock)

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #35 · ADR: [0003](../../adr/0003-cache-shared-data-with-tags.md)

## Context

FR-5 and FR-7 ask for filters on every category, kept in the URL. The approved spec adds a sidebar with brand, price range and "in stock only", built on a small reusable filter structure that stories 3 (spec filters) and 4 (search) extend. It filters and sorts by the price the shopper pays, so it also adds an `effectivePrice` column and shows the sale price on cards. It adds the project's first database integration tests.

## Summary

- **One migration:** `Product.effectivePrice Int @default(0)` plus a `BEFORE INSERT OR UPDATE` trigger that sets it to `COALESCE(salePrice, price)`, and a backfill. The first task is a spike (spec: "recommendation E"); the fallback is a typed `OR` filter and raw SQL for the sort only.
- **One new shadcn primitive:** `checkbox` (Base UI variant). No new npm dependency. `Field`, `Input`, `Button` already exist.
- **Pure vs server-only:** the pure half of each filter (parse, serialize, chips, normalize) is imported by client components, so `lib/listing-filters/*.ts` imports nothing from `db`/Prisma at runtime. The server half is in `lib/listing-filters/server.ts`, a `Record` over the same keys.
- **Reuse:** `parseListingParams`/`listingQuery`/`listingHref`/`isCanonicalQuery` (extended, not replaced), `getStockStatus` and `manilaToday` ([lib/stock.ts](../../../lib/stock.ts)), `formatPeso`, `productCardSelect`/`toProductCardData`, `focusRing`, `ListingResults`, `ListingPagination`, the `Field*` primitives in [components/ui/field.tsx](../../../components/ui/field.tsx), and the canonical redirect already in the category page.
- **Small additions to the spec's interface:** an optional `normalize(value, options)` on the pure filter (brand drops slugs that aren't options); `today` passed as a query argument.

## Files

```
prisma/schema.prisma                                 Product.effectivePrice
prisma/migrations/<ts>_effective_price/migration.sql column, backfill, trigger
vitest.config.ts                                     exclude **/*.db.test.ts
vitest.db.config.ts                                  integration project: TEST_DATABASE_URL, global setup
test-support/db-global-setup.ts                      migrate deploy on the test DB
test-support/db.ts                                   resetCatalog(), fixtures (P1–P6, G1)
package.json                                         "test:db"
.env.example, README.md, .github/workflows/ci.yml    TEST_DATABASE_URL, second DB, test:db step

lib/listing-filters/types.ts                         ListingFilter, FilterOption, FilterChip
lib/listing-filters/{brand,price,in-stock}.ts        pure halves (+ .test.ts each)
lib/listing-filters/index.ts                         commonFilters, FilterValues, helpers
lib/listing-filters/server.ts                        where(), options() per key
lib/listing-filters/server.db.test.ts                integration cases from the spec
lib/listing-params.ts (+ test)                       state.filters, parse/serialize/canonical
lib/products.ts                                      filtered getCategoryProducts, effective-price sort, card salePrice
lib/products.db.test.ts                              sort + trigger tests

components/ui/checkbox.tsx                           shadcn
components/catalog/listing-shell.tsx                 "use client": grid, transition, aria-busy, navigate context
components/catalog/listing-filters.tsx               "use client": sidebar (brand, price, availability)
components/catalog/active-filters.tsx                server: chips + Clear all
components/catalog/listing-sort.tsx                  takes full state
components/product/product-card.tsx                  sale price + struck list price
app/(store)/[category]/page.tsx                      wiring, normalization redirect, metadata, empty states
e2e/category-filters.spec.ts                         new; e2e/category-page.spec.ts cardPrices helper
CLAUDE.md                                            listing/filter conventions, test commands
```

## Migration and schema

- `effectivePrice Int @default(0)` with a comment: maintained by a trigger, never written by the app. Create with `pnpm db:migrate --create-only --name effective_price`, then edit the SQL:
  1. `ALTER TABLE "Product" ADD COLUMN "effectivePrice" INTEGER NOT NULL DEFAULT 0;`
  2. `UPDATE "Product" SET "effectivePrice" = COALESCE("salePrice", "price");`
  3. `CREATE FUNCTION product_effective_price() ... NEW."effectivePrice" := COALESCE(NEW."salePrice", NEW."price"); RETURN NEW;` and `CREATE TRIGGER ... BEFORE INSERT OR UPDATE ON "Product" FOR EACH ROW`.
- Spike checks (T1): `migrate dev` reports no drift on a second run; `db:seed --reset` and a second `db:seed` work (the seed never writes the column; the trigger fills it); a manual `UPDATE ... SET "salePrice"` and a clear to `NULL` both change `effectivePrice`.
- No index (catalog of ~150).

## Filter structure — `lib/listing-filters/`

```ts
type ListingFilter<V> = {
  key: string
  parse(raw: RawSearchParams): V | null
  serialize(value: V): [string, string][]
  chips(value: V, options: FilterOption[]): { label: string; without: V | null }[]
  normalize?(value: V, options: FilterOption[]): V | null   // brand only
}
```

- **brand:** `V = string[]`. Values of `brand` (all repeats) matching `/^[a-z0-9-]+$/`, deduplicated, sorted, first 20; `null` when empty. Chips "Brand: <name>" (name from options, falling back to the slug), `without` = the list minus it. `normalize` keeps slugs found in options.
- **price:** `V = { min: number | null; max: number | null }` in whole pesos. Each bound is the first value, accepted if `/^\d{1,8}$/` and ≤ 10,000,000, else ignored. Swapped if `min > max`; `null` when neither is set. Serialize `minPrice` then `maxPrice`. One chip ("₱10,000 – ₱20,000", "From ₱10,000", "Up to ₱20,000") via `formatPeso(n * 100)`; `without` = `null`.
- **inStock:** `V = true`; on only for the first value `"1"`. Chip "In stock only".
- **index:** `commonFilters = { brand, price, inStock }` (object order = URL order). `FilterValues` is the partial map of each key's value type. Helpers: `withFilter(state, key, value | null)` (sets the filter, `page: 1`), `clearFilters(state)` (filters `{}`, `page: 1`, sort kept), `activeFilterCount`.
- **Listing params:** `ListingState = { sort, page, filters: FilterValues }`. `parseListingParams(raw, filters = commonFilters)`, `listingQuery` (filter entries in list order, then sort, then page), `listingHref` and `isCanonicalQuery` unchanged in shape. All existing callers spread `state`, so filters carry through; `ListingSort` takes `state` instead of `sort`.
- **server.ts:** `where = { brand: brand => ({ brand: { slug: { in: brand } } }), price: ({min,max}) => ({ effectivePrice: { gte: min*100, lte: max*100 } }) /* absent bounds omitted */, inStock: (_, {today}) => ({ stock: { gt: 0 }, OR: [{ preorderShipsOn: null }, { preorderShipsOn: { lte: new Date(today) } }] }) }` and `options.brand = scope => db.brand.findMany({ where: { products: { some: scope } }, orderBy: { name: "asc" }, select: { slug, name } }).map(...)`. `activeWhere(filters, ctx)` returns the `AND` array.

## Queries — `lib/products.ts`

- `getCategoryProducts(categoryId, state, { today })`: `where = { categoryId, status: "ACTIVE", AND: activeWhere(state.filters, { today }) }`; sort map uses `effectivePrice` for both price sorts (`newest` unchanged), same tie-breakers.
- `productCardSelect` gains `salePrice`; `ProductCardData.salePrice: number | null`. `getBrandOptions(categoryId)` wraps `options.brand` with scope `{ categoryId, status: "ACTIVE" }`.
- Per request, no cache (spec; ADR 0003).

## Page — `app/(store)/[category]/page.tsx`

1. `state = parseListingParams(raw)`; `today = manilaToday()`.
2. `Promise.all([getBrandOptions(category.id), getCategoryProducts(category.id, state, { today })])`.
3. `normalized = normalizeFilters(state, { brand: brands })`; if filters changed, `redirect(listingHref(slug, normalized))`. Then the existing past-the-end and canonical redirects.
4. Layout: `<ListingShell sidebar={<ListingFilters …/>}>` containing `ActiveFilters`, then either the no-match state (`total === 0` with filters active, `role="status"`, "Clear all filters" link button) or `ListingResults` + pager. No filters and `total === 0` keeps "No products in this category yet." with no sidebar. The count line gets `role="status"`.
5. `generateMetadata`: parse with filters; `robots: { index: false, follow: true }` when any filter is active; canonical `listingHref(slug, { sort: DEFAULT_SORT, page, filters })` (own URL minus sort).

## Components

- **`ListingShell`** (`"use client"`): `useTransition`, a context exposing `navigate(href)` = `startTransition(() => router.push(href, { scroll: false }))`, grid `lg:grid-cols-[15rem_1fr]`, the results wrapper `aria-busy={isPending}` and dimmed. Children and `sidebar` are server-rendered slots.
- **`ListingFilters`** (`"use client"`): `<aside aria-label="Filters">` with `FieldSet`s: Brand (checkbox per option, `useOptimistic` for the checked list), Price (Min/Max `Input` with `inputMode="numeric"`, labels "Min price (₱)"/"Max price (₱)", Apply button, a `<form onSubmit>`; local values re-synced from props during render when the URL's price changes, so focus isn't lost; invalid text → `aria-invalid` + `aria-describedby` message, no navigation), Availability ("In stock only" checkbox). Checkbox change: `navigate(listingHref(slug, withFilter(state, key, next)))`.
- **`ActiveFilters`** (server): chips from each active filter's `chips()`; each chip is a `Link` to `listingHref(slug, withFilter(state, key, without))` named "Remove filter: Brand AMD" with an `XIcon` (`aria-hidden`); "Clear all" link to `clearFilters(state)`. Renders nothing without filters.
- **`ProductCard`:** price slot shows `formatPeso(salePrice)` with `<s>` list price beside it and an `sr-only` "Was"; no % badge.
- Grid: with the 15 rem sidebar the product grid is `grid-cols-2 xl:grid-cols-3` and `sizes` is updated; checked at 1280 and 1024 px.

## Integration tests

- **One variable: `TEST_DATABASE_URL`**, a direct (unpooled) URL. The tests need no pooler, and the same URL serves migrations and queries. It is the only variable the tests read; they never fall back to `DATABASE_URL`.
- **Safety guard** (`test-support/db-guard.ts`, pure, with unit tests in `pnpm test`): `resolveTestDatabase(env)` throws unless `TEST_DATABASE_URL` is set and is a postgres URL, and refuses a URL that points at the app's database. Hosts are compared after stripping Neon's `-pooler` suffix, against both `DATABASE_URL` and `DATABASE_URL_UNPOOLED`:
  - same host (and port) as either → refused, whatever the database name; Neon branches have their own host, so a `test` branch passes;
  - the one exception is a loopback host (`localhost`, `127.0.0.1`, `::1`), which is a throwaway server by definition (CI's service container, a local Docker Postgres): there the **database name** must differ (`pcsilicon_test` vs `pcsilicon`).
  It returns the URL and a printable `host:port/database` (never credentials). Run in three places: at config load (so Vitest won't start), in the global setup (which prints `Integration tests use database <host:port/database>`), and in `resetCatalog()`, which checks the worker's `DATABASE_URL` equals `TEST_DATABASE_URL` before any `TRUNCATE`.
- `vitest.db.config.ts`: loads `.env.local` (like `prisma7.config.ts`), calls the guard, then `include: ["**/*.db.test.ts"]`, `globalSetup`, `fileParallelism: false` (shared database), `env: { DATABASE_URL, DATABASE_URL_UNPOOLED, TEST_DATABASE_URL }` all set to the test URL, and `NEXT_PUBLIC_SITE_URL`.
- Global setup runs `prisma migrate deploy` with `DATABASE_URL_UNPOOLED` set to the test URL (`execFileSync` of `pnpm exec prisma migrate deploy`).
- `test-support/db.ts`: `resetCatalog()` (`TRUNCATE ... CASCADE` like the seed) and `insertFixtures()` (P1–P6, G1 from the spec, today `2026-10-26`).
- CI: after "Unit tests", a step creates `pcsilicon_test` in the existing throwaway Postgres service (`PGPASSWORD=postgres psql -h localhost -U postgres -c 'CREATE DATABASE pcsilicon_test'`) and a `pnpm test:db` step runs with `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pcsilicon_test`. Same server as `DATABASE_URL`, so the guard's loopback rule applies. The E2E database and seed are unaffected.
- Local: needs its own database: a Neon branch named `test` (copy its **direct** connection string into `.env.local` as `TEST_DATABASE_URL`) or a local Postgres; the README says how.

## Verification

- Per task: `pnpm lint`, `pnpm typecheck`, `pnpm test`; `pnpm test:db` from T2.
- End: `pnpm build` (`/[category]` stays `ƒ`), `pnpm test:e2e`, then by hand in `pnpm dev`: `/cpu` and `/gpu` with brand + price + in stock in the URL; sort/page links keep filters; chips and Clear all; no-match state; keyboard through the sidebar; light/dark at 1280 and 1024 px; axe with no violations.
