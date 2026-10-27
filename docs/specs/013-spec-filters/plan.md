# 013 — Plan: spec filters per category

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #36 · ADRs: [0003](../../adr/0003-cache-shared-data-with-tags.md), [0004](../../adr/0004-effective-price-column-kept-by-trigger.md)

## Context

FR-5 asks for filters driven by each category's spec schema. The approved spec adds spec filters (five kinds, taken from the display metadata), option counts for brand and spec options, and a collapsible sidebar. They are built on spec 012's filter structure, which needs a per-category filter list. Queries use Prisma's typed JSON path filters. Values are bound parameters, and the GIN index is not used, as the spec's finding records.

## Summary

- **No migration, no new dependency.** `components/ui/collapsible.tsx` (Base UI) already exists.
- **Metadata:** `FieldMeta.filterable: boolean` becomes `filter?: SpecFilterKind`. The `values` kind matches text or numbers. Which one is decided from the schema, using the introspection helper that already exists in [lib/specs/fields.test.ts](../../../lib/specs/fields.test.ts) (`fieldSchemas`). It moves into `lib/specs`, so the filters and the test share it.
- **URL state:** `FilterValues` stays flat. It keeps typed common keys and adds an `unknown` index signature for spec keys. Spec filters are ordinary `ListingFilter`s keyed by field name. `listingFilters(slug)` returns the category's list: the common filters, then the spec filters in metadata order.
- **Reuse:**
  - `formatSpecValue` (labels and chips).
  - `first`/`all` in `raw.ts`.
  - `parsePriceBound`'s pattern, generalized.
  - `activeWhere`/`loadFilterOptions` (extended).
  - `CheckboxField`, plus the price form generalized into a `RangeForm`.
  - `useNavigateListing`, `useOptimistic`, the `Field*` primitives, `Collapsible`, and the page's normalization and canonical redirects.
- **Counts by facet queries:** at most 2 + (number of active faceted filters) `findMany`s run in parallel, each selecting `specs` and `brand { slug, name }`. A pure function then counts the values (the spec's "How").

## Files

```
lib/specs/helpers.ts                     FieldMeta.filter?: SpecFilterKind (replaces filterable)
lib/specs/categories/*.ts                filter kinds per the spec's table
lib/specs/fields.ts (new)                fieldSchemas() moved from fields.test.ts; isTextField()
lib/specs/fields.test.ts                 kinds fit fields: enum/contains have options, contains is ZodArray, boolean is ZodBoolean, range is numeric
lib/specs/format.test.ts                 filterable -> filter
prisma/seed/data/coverage.test.ts        reads meta.filter; COUNT_LIKE -> kind "values"

lib/listing-filters/types.ts             FilterOption.count; ListingFilter.spec?: { field, meta }
lib/listing-filters/spec.ts (new)        specFilter(field, meta): one pure factory per kind
lib/listing-filters/spec.test.ts (new)   parse/serialize/chips per kind, caps, swap, wrong case
lib/listing-filters/index.ts             listingFilters(slug); helpers take the list; FilterValues widened
lib/listing-filters/facets.ts (new)      pure: countFacets(filter, scopeRows, otherRows) -> FilterOption[]
lib/listing-filters/facets.test.ts (new)
lib/listing-filters/server.ts            specWhere per kind; loadFilterOptions(scope, filters, ctx, list) with deduplicated facet queries; brand via facets
lib/listing-filters/spec-filters.db.test.ts (new)
lib/listing-filters/server.db.test.ts    brand options now carry counts
lib/listing-params.ts (+ test)           parseListingParams(slug, raw), listingQuery(slug, state), isCanonicalQuery(slug, raw, state); listingHref unchanged
lib/products.ts                          getFilterOptions(categoryId, slug, filters, ctx); getCategoryProducts passes slug
test-support/db.ts                       insertSpecFixtures() (X1–X5, C1–C4, M1–M2)

components/catalog/listing-filters.tsx   collapsible sections, spec sections, counts, disabled, RangeForm
components/catalog/active-filters.tsx    list from listingFilters(slug)
app/(store)/[category]/page.tsx          slug-aware parse/canonical, options with filters, normalization
e2e/epic-browse.spec.ts (new), e2e/category-filters.spec.ts (spec-filter scenarios)
CLAUDE.md, docs/specs/012-common-filters/spec.md (superseded line)
```

## Metadata (`lib/specs`)

- `export type SpecFilterKind = "enum" | "values" | "range" | "boolean" | "contains"`. The `filter` field is optional, and a field without it isn't filterable. Kinds per field are as in the spec's table.
- `lib/specs/fields.ts`:
  - `fieldSchemas(schema)`, moved verbatim from the test.
  - `isTextField(category, field)`: true when the field's schema is a `ZodString`, e.g. chipset. Must stay pure, with no server imports.

## Pure filters (`lib/listing-filters/spec.ts`)

`specFilter(category, field, meta)` returns a `ListingFilter` with `key = field` and `spec: { field, meta }` attached, which the sidebar reads.

| Kind | Value | Parse | Serialize | Chips |
| --- | --- | --- | --- | --- |
| `enum` / `contains` | `string[]` | `all(raw, field)` ∩ `Object.keys(meta.options)`, deduplicated, in option order, max 20 | repeated `field` | one per value, "Socket: AM5" (`formatSpecValue`) |
| `values` | `string[]` | Numbers: `^(0\|[1-9]\d{0,6})$`, sorted ascending. Text: trimmed, 1–60 characters, sorted A–Z. Max 20 | repeated `field` | "Capacity: 32 GB" |
| `range` | `{ min, max }` | `min<Field>`/`max<Field>`, same integer rule per bound, swapped when min > max | min, then max | one chip: "VRAM: 12 GB – 16 GB" / "from" / "up to" |
| `boolean` | `true` | `field=1` only | `[field, "1"]` | `meta.label` |

- `normalize` applies to `enum`, `contains` and `values`: values that aren't among the scope options are dropped.
- `paramKey(field, "min")` gives `"min" + Field`.
- Collisions: a unit test lists every builder field's keys against `RESERVED_KEYS = ["brand","minPrice","maxPrice","inStock","sort","page","q"]`.

## Filter list and URL state (`index.ts`, `listing-params.ts`)

- `listingFilters(slug)` returns `[brand, price, inStock, ...specFilters]`, memoized per slug. Non-builder slugs (`isBuilderCategory`) get the common filters only.
- `FilterValues = { brand?: string[]; price?: PriceFilterValue; inStock?: true; [field: string]: unknown }`. `setFilter`/`withFilter` stay typed for the common keys.
- `FilterOptions = Record<string, FilterOption[]>`.
- `parseFilters`, `serializeFilters`, `normalizeFilters` and `activeFilterChips` take the list. `activeFilterCount` counts the defined keys.
- `parseListingParams(slug, raw)`, `listingQuery(slug, state)` and `isCanonicalQuery(slug, raw, state)` change. `listingHref(slug, state)` keeps its signature, so the sort, pagination, no-matches and chip links don't change.
- `generateMetadata` parses with the slug.

## Database (`server.ts`, `products.ts`)

- **Spec `where`**, generated per filter from its kind. Field names come from metadata, never from the URL:
  - `enum`/`values`: `{ OR: values.map(v => ({ specs: { path: [field], equals: v } })) }`. Numbers are sent as numbers unless `isTextField`.
  - `range`: `{ specs: { path: [field], gte?, lte? } }`.
  - `boolean`: `equals: true`.
  - `contains`: `{ OR: values.map(v => ({ specs: { path: [field], array_contains: [v] } })) }`.
- **The server list:** the common `serverFilters` record stays. `serverFiltersFor(list)` adds a spec entry for every filter with `spec`, so completeness holds by kind (`Record<SpecFilterKind, …>`). `activeWhere(filters, ctx, list)`.
- **Facets (`loadFilterOptions(scope, filters, ctx, list)`):**
  1. The faceted filters are brand plus every `enum`, `values`, `contains` and `boolean` spec filter. `range` loads distinct values for placeholders only.
  2. Query sets, deduplicated by the excluded key: `scope` (no filters), `all` (every active filter), and one set per *active* faceted key (all active filters but that one). Each set is one `db.product.findMany({ where: { AND: [scope, ...activeWhere(subset)] }, select: { specs: true, brand: { select: { slug: true, name: true } } } })`, all in `Promise.all`.
  3. `countFacets` (pure):
     - Options are the values present in the scope rows, in this order: brand by name; `enum`/`contains` in options order; numbers ascending; text A–Z; `boolean` a single `"true"` option.
     - `count` comes from the filter's "others" rows. An option with count 0 is disabled unless it's checked; the sidebar handles that.
     - Labels come from `formatSpecValue(meta, value)`, and from the brand's name for brands.
- `getFilterOptions(categoryId, slug, filters, ctx)` and `getCategoryProducts(categoryId, slug, state, ctx)`. The page still runs both in parallel. Per request; no cache (ADR 0003).

## UI

- **`ListingFilters` (client)**, in order: Brand, Price (₱), Availability, then one section per spec filter.
  - **Sections:** `Collapsible` with `defaultOpen`. The trigger is a button with the section title and a chevron (`aria-expanded` comes from Base UI). The panel holds a `FieldSet` with an sr-only legend.
  - **Titles** add the unit: "VRAM (GB)".
  - **Checkbox options:** `CheckboxField` gains `count` and `disabled`. The count renders as visible "(12)" with sr-only "12 products", tied to the checkbox by `aria-describedby`. The name stays the label, so the existing `{ name: "AMD" }` locators still work.
  - **Ranges:** a generic `RangeForm` (title, unit, bound parser, error text, placeholders from the first and last range option values). `PriceForm` becomes a `RangeForm` with the peso-cleaning parser. Spec ranges apply via `withFilter(state, field, value)`.
  - **Boolean:** one checkbox with `meta.label`.
- **`ActiveFilters`** gets its chips from `activeFilterChips(state.filters, options, listingFilters(slug))`.
- **Page:**
  - `state = parseListingParams(slug, raw)`.
  - `Promise.all([getFilterOptions(..., state.filters, { today }), getCategoryProducts(...)])`.
  - Then the existing redirects, using `normalizeFilters(state.filters, options, list)` and `isCanonicalQuery(slug, raw, state)`.

## Integration tests

- Add `insertSpecFixtures()` to `test-support/db.ts`, with GPU X1–X5, CPU cooler C1–C4 and motherboard M1–M2 as in the spec. Every fixture's specs pass `validateSpecs`, which is asserted while inserting. It reuses `resetCatalog`.
- `spec-filters.db.test.ts`, through `getCategoryProducts` and `getFilterOptions` (and `parseListingParams` for the ignored cases):
  - Every case in the spec's "Kinds", "AND", "Counts" and "Ignored" lists.
  - Parameterization: a client with `log: [{ emit: "event", level: "query" }]` (a local `PrismaClient` on the test URL), checking that `"RX C"` is in `params` and not in `query`.
  - Injection: the table is intact afterwards (`count()`).

## Verification

- **Each task:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus `pnpm test:db` from T3 on (Docker: `pnpm test:db:up`).
- **End:**
  - `pnpm build` (`/[category]` stays `ƒ`) and `pnpm test:e2e`.
  - In `pnpm dev`: `/gpu`, `/memory`, `/case` and `/cpu-cooler` filters, counts, disabled options, collapsible sections by keyboard, `/cpu?threads=8` redirects, chips and Clear all.
  - Light and dark themes at 1280 and 1024 px, a screen reader hears counts, and axe reports no violations.
