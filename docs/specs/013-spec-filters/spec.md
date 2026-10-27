# 013 — Spec filters per category

Status: **Approved** · Issue: #36 · PRD refs: FR-5 (faceted filters driven by each category's spec schema), FR-7 (filter state in the URL), NFR Accessibility (WCAG 2.1 AA), Testing strategy (integration tests for queries)

## Summary

Each builder category's sidebar gets filters for its spec fields: socket, memory type, VRAM, form factor and so on. Which fields appear, and how each one filters, comes from the display metadata in `lib/specs/categories/*.ts` ([spec 009](../009-spec-table/spec.md)), not from the page. Spec filters plug into the filter structure from [spec 012](../012-common-filters/spec.md) as ordinary filters. Brand options and spec options now show how many products match. Options with no match in the category are hidden; options with no match only because of the other active filters are disabled.

## Filter kinds and fields

Today `FieldMeta.filterable` is a boolean. The schema type doesn't settle the kind: an integer can be a range (VRAM) or a few common values (memory modules). So **`filterable: boolean` becomes `filter?: SpecFilterKind`**, where no `filter` means not filterable:

| Kind | Control | Matches | For |
| --- | --- | --- | --- |
| `enum` | Checkboxes, one per value, in `options` order | Any of the checked values | Enum fields with `options` |
| `values` | Checkboxes, one per value present in the category (numbers ascending, text A–Z) | Any of the checked values | Small sets of numbers ("common sizes"), free text (chipset) |
| `range` | Min and Max number fields, Apply | `min ≤ value ≤ max`, either bound optional | Integers with a wide spread |
| `boolean` | One checkbox | `true` only | Booleans |
| `contains` | Checkboxes, one per value, in `options` order | The list holds any of the checked values | Array fields (a case's form factors) |

These are the fields that are filterable today, with their kinds. Order is metadata entry order, which is also the spec table's order.

| Category | Fields (kind) |
| --- | --- |
| CPU | socket (enum), generation (enum), cores (range), boostClockMhz (range), hasIntegratedGraphics (boolean), tdpW (range) |
| Motherboard | socket (enum), chipset (values), memoryType (enum), formFactor (enum), m2Slots (values), hasWifi (boolean) |
| Memory | memoryType (enum), capacityGb (values), moduleCount (values), speedMts (range) |
| Storage | capacityGb (values), formFactor (enum), interface (enum) |
| GPU | chipsetBrand (enum), chipset (values), vramGb (range), lengthMm (range) |
| Case | motherboardFormFactors (contains), maxGpuLengthMm (range), maxCoolerHeightMm (range) |
| PSU | wattageW (range), efficiencyRating (enum), formFactor (enum), modularity (enum) |
| CPU cooler | type (enum), radiatorSizeMm (values), supportedSockets (contains) |

The issue names VRAM, GPU length and wattage as range filters, and this table follows it. A unit test checks that each kind fits its field: `enum` and `contains` have `options`, `contains` is an array in the schema, `boolean` is a boolean. The seed coverage test ([prisma/seed/data/coverage.test.ts](../../../prisma/seed/data/coverage.test.ts)) reads `filter` instead of `filterable`, and its `COUNT_LIKE` list becomes "kind is `values`".

## URL format

The key is the field name. Values are the stored values as they are (enum identifiers, integers in base units, text), so the URL needs no mapping.

| Kind | URL | Valid values |
| --- | --- | --- |
| `enum`, `contains` | `socket=AM4&socket=AM5` | Keys of the field's `options`; anything else is ignored |
| `values` | `capacityGb=32&capacityGb=64`, `chipset=GeForce+RTX+5070` | Integers `^(0\|[1-9]\d{0,6})$` for number fields; text of at most 60 characters. Values not among the category's options are dropped, like unknown brands |
| `range` | `minVramGb=12&maxVramGb=16` | The same integer rule, checked per bound; min > max are swapped, like price |
| `boolean` | `hasWifi=1` | `1` only |

- **Order:** the common filters (brand, price, in stock), then spec filters in metadata order, then `sort` and `page`. At most 20 values per field. Values are deduplicated and kept in option order.
- **Invalid or unknown → ignored**, then spec 012's canonical redirect rewrites the URL. `/cpu?threads=8` (not filterable), `/cpu?vramGb=8` (another category's field) and `/gpu?chipsetBrand=nvidia` (wrong case) all go to the URL without the value.
- **No collisions:** a unit test checks that no spec filter key (including the `min`/`max` forms) equals a reserved key: `brand`, `minPrice`, `maxPrice`, `inStock`, `sort`, `page` and `q` (story 4).
- **Units** in the URL are the stored base units. Boost clock is in MHz (`minBoostClockMhz=5000`), since a range takes integers; its chip shows "from 5 GHz" through `formatSpecValue`.

## Database conditions

Each active spec filter adds one entry to the query's `AND`, as in spec 012. All of them use Prisma's typed JSON path filters on `Product.specs`:

| Kind | `where` entry |
| --- | --- |
| `enum`, `values` | `OR: values.map(v => ({ specs: { path: [field], equals: v } }))` |
| `range` | `{ specs: { path: [field], gte: min, lte: max } }` (only the bounds that are set) |
| `boolean` | `{ specs: { path: [field], equals: true } }` |
| `contains` | `OR: values.map(v => ({ specs: { path: [field], array_contains: [v] } }))` |

A product without the field (an air cooler has no `radiatorSizeMm`) never matches a filter on it.

### Finding: the GIN index is not used

The acceptance criteria say queries use the JSONB column "and its index". I checked on the dev branch by logging Prisma's SQL and running `EXPLAIN`:

- Prisma compiles path filters to extraction: `("specs" #> ARRAY[$1]::text[])::jsonb = $2`, and `>=` with a `jsonb_typeof` check for ranges. The index is `GIN (specs jsonb_path_ops)`, which serves only `@>`, `@?` and `@@` on the whole column. Even with `enable_seqscan = off`, Postgres can't use the index for these queries.
- A raw `specs @> '{"socket":"AM5"}'` can use the index, but only with `enable_seqscan = off`. With normal settings Postgres picks a sequential scan, which is the right plan for about 150 rows (about 20 per category). Ranges can't use the index in any form; `@@ '$.vramGb >= 8'` only scans the whole index.
- Prisma can't add raw SQL to a typed `where`. Using the index would mean a raw query that returns product IDs, plus `id: { in: ids }`: an extra round trip and a second way of filtering. [ADR 0004](../../adr/0004-effective-price-column-kept-by-trigger.md) already rejected that to keep the typed `where`.

**Recommendation:** use the typed path filters and change the criterion to "Queries filter on the JSONB `specs` column. The GIN index is kept for the builder's lookups and isn't used by facet queries at this size; see spec 013." If a category reaches thousands of products, `enum`, `boolean` and `contains` can switch to an `@>` ID query inside the spec filters' server half. Nothing outside it changes.

## Option counts

- **Semantics:** OR within a filter, AND across filters. An option's count is the number of products that would match if that option were checked: scope AND every *other* active filter (common ones included), but not its own filter. Checking an option therefore never lowers the counts beside it.
- **Applies to** `enum`, `values` and `contains` options, and to **brand** (spec 012 deferred brand counts to this story). For a `boolean` filter, the count is the number of products where the field is true. Range, price and in stock get no counts. A `contains` product counts once for each value its list holds.
- **Zero matches (recommendation):**
  - **Hidden** when no active product in the category has the value at all (Intel GPUs, if none are stocked). The sidebar then only lists real choices.
  - **Disabled, showing (0)** when the category has the value but the other filters rule it out. It stays in place, so the list doesn't jump while the shopper filters.
  - **A checked option is never disabled**, even at 0, so it can always be unchecked.
- **How:** for each faceted filter, one query loads the matching products' `specs` and brand (`{ slug, name }`) with scope AND the other active filters. A pure function in `lib/listing-filters/` then counts the values. Filters that aren't active all share the same "others" (every active filter), so the queries are deduplicated: there are at most `2 + number of active faceted filters` (scope only, all active filters, and one per active faceted filter), run in parallel. Rows are small (about 20–40 per category), so counting in JS is cheaper than a `GROUP BY` on JSON in raw SQL, and that SQL would need a raw copy of the common filters' conditions.
- **Range placeholders:** the Min and Max fields show the category's lowest and highest value as placeholders, taken from the scope query.
- **Per request**, like the listing ([ADR 0003](../../adr/0003-cache-shared-data-with-tags.md)); no cache or tag.

## Security

- **Only metadata fields are accepted.** URL keys are looked up in the category's filter list, which is built from `builderCategories[slug].fields` (`Object.hasOwn`, so `__proto__` or `constructor` match nothing). The JSON `path` passed to Prisma is always a metadata key, never text from the URL. Unknown keys are dropped and redirected.
- **Values are always parameters.** Values are validated as above and bound by Prisma (`$2` in the logged SQL). No `$queryRawUnsafe` or string-built SQL. An integration test captures Prisma's query log and checks that a filter value appears in the parameters and not in the SQL text.

## Sidebar

- **Order:** Brand, Price (₱), Availability (as in spec 012), then one section per spec filter in metadata order.
- **Sections:** each one is a collapsible fieldset: a disclosure button with the legend text and `aria-expanded`, using Base UI `Collapsible` (`pnpm dlx shadcn@latest add collapsible`). All sections are open by default. Open or closed is local UI state, not in the URL. A section with an active filter can't render closed.
- **Units** are shown in the section title, from `unit` ("VRAM (GB)", "Length (mm)", "Boost clock (MHz)"). `values` options are labelled with `formatSpecValue` ("32 GB", "2 TB"), `enum` and `contains` options with `options` labels ("Micro-ATX"). A `boolean` checkbox is labelled with the field label ("Wi-Fi").
- **Counts:** shown after the label, "AM5 (12)". A disabled option is muted and has `disabled`. The checkbox's accessible name starts with the label, so tests and screen readers find "AM5".
- **Behaviour** is the same as spec 012: checkboxes apply instantly (`useOptimistic`, focus stays), ranges apply on submit with the same validation and errors as price. Chips are "Socket: AM5", "VRAM: 12 GB – 16 GB", "Length: up to 300 mm" and "Wi-Fi". Clear all removes spec filters too.

## Changes to spec 012's filter structure

1. **The filter list is per category.** `commonFilters` stays as it is. A new `listingFilters(slug)` returns the common filters followed by the spec filters built from that category's metadata (none for non-builder categories). Spec 012 already said `parseListingParams` would take the list, but the code doesn't yet. The functions that parse or write the URL (`parseListingParams`, `listingQuery`, `isCanonicalQuery`) take the category slug. `listingHref(slug, state)` keeps its signature. Why: the filters differ by category, and serializing needs the filters' definitions. Everything here is pure, so client components can still build links.
2. **`FilterKey` and `FilterValues` cover spec keys.** Today they are `keyof typeof commonFilters`. They widen to the common keys (still typed) plus spec field names. The plan decides the exact types. Why: spec keys exist only at runtime, per category.
3. **One factory per kind** creates spec filters: `specFilter(field, meta)` gives the pure half, and `specServerFilter(field, meta)` in `server.ts` gives `where`. Both are keyed by `SpecFilterKind` in a `Record`, so a kind can't have only one half. This keeps spec 012's completeness rule, now by kind rather than by key.
4. **Options get counts and are computed together.** `FilterOption` gains `count: number`. The per-filter `options(scope)` becomes a `facet` (pure: how to read a filter's values from a loaded row). `loadFilterOptions(scope, filters, context)` runs the deduplicated queries above. Why: a count needs the *other* filters, which a single filter's loader can't see. Brand's options change from `db.brand.findMany` to this facet query.
5. **`normalize`** is used by spec filters for `values`, and to drop enum values the category doesn't stock, the same way it drops unknown brands. No change to its shape.
6. **`FieldMeta.filterable` → `filter?: SpecFilterKind`** in `lib/specs/helpers.ts` and every category file (see above). Why: the boolean can't tell a range from common values.

Docs: CLAUDE.md's listing-filter note (per-category list, spec filters, counts) and spec 012's "not narrowed by other filters" line, which this spec supersedes.

## Tests

- **Unit** (pure):
  - Each kind's parse, serialize and chips, including bad values, swapped ranges, the 20-value cap and wrong case.
  - `listingFilters(slug)` order, and a round trip with the canonical query.
  - No key collisions, and every kind fits its field (see above).
  - The counting function, with `contains` lists and missing fields.
- **Integration** (`lib/listing-filters/spec-filters.db.test.ts`, separate fixtures inserted by a new helper; all specs pass `validateSpecs`):

  | | Category | Brand | Specs | Notes |
  | --- | --- | --- | --- | --- |
  | X1 | GPU | Alpha | NVIDIA, "RTX A", 8 GB, 240 mm | |
  | X2 | GPU | Alpha | NVIDIA, "RTX B", 12 GB, 300 mm | |
  | X3 | GPU | Beta | AMD, "RX C", 16 GB, 320 mm | out of stock |
  | X4 | GPU | Beta | AMD, "RX C", 16 GB, 340 mm | |
  | X5 | GPU | Beta | NVIDIA, "RTX B", 12 GB, 285 mm | DRAFT |
  | C1 | CPU cooler | Alpha | AIR, [AM4, AM5] | |
  | C2 | CPU cooler | Alpha | AIR, [LGA1700] | |
  | C3 | CPU cooler | Beta | AIO 240, [AM5, LGA1700] | |
  | C4 | CPU cooler | Beta | AIO 360, [AM5] | |
  | M1, M2 | Motherboard | Alpha | AM5, Wi-Fi yes / no | |

  - **Kinds:**
    - `enum`: NVIDIA → X1, X2 (not the draft X5); NVIDIA + AMD → X1–X4.
    - `values` (text): "RX C" → X3, X4.
    - `range`: VRAM ≥ 12 → X2–X4; length 300–320 → X2, X3 (both bounds inclusive); max only.
    - `contains`: AM5 → C1, C3, C4; AM4 + LGA1700 → C1, C2, C3.
    - `values` with a missing field: radiator 240 → C3 only.
    - `boolean`: Wi-Fi → M1.
  - **AND across filters:** AMD + length ≥ 330 → X4; brand Alpha + VRAM ≥ 12 → X2; in stock + "RX C" → X4.
  - **Counts:**
    - With no filters: NVIDIA 2, AMD 2, Intel hidden; chipsets RTX A 1, RTX B 1, RX C 2; sockets AM4 1, AM5 3, LGA1700 2, LGA1851 hidden.
    - With AMD checked: chipset-brand counts are unchanged (own filter excluded), chipsets RTX A 0 and RTX B 0 (disabled), brands Alpha 0 and Beta 2.
    - NVIDIA + VRAM ≥ 16: NVIDIA shows 0 but stays checked and enabled.
  - **Ignored:**
    - `/gpu?boardPowerW=300` (not filterable), `?threads=8` (another category's field) and `?__proto__=x` parse to no filters and list X1–X4.
    - `chipset='; DROP TABLE "Product"; --` matches nothing and the table is intact.
    - The query log shows the filter value only in the parameters.
- **E2E** (seeded database, role-based locators):
  - **Epic** (`e2e/epic-browse.spec.ts`): Home → Categories menu → "Memory" → check "DDR5". The URL is `/memory?memoryType=DDR5`, and the result count equals the count the option showed. Open the first product; its spec table reads Memory type DDR5.
  - **Range:** on `/gpu`, Min VRAM 12 then Enter adds `minVramGb=12` and adds a "VRAM: from 12 GB" chip. Removing the chip restores the list.
  - **Disabled option:** after one filter is checked, an option with (0) is disabled.
  - **Ignored field:** `/cpu?threads=8` redirects to `/cpu`.
  - **Keyboard:** a section's disclosure button toggles with Enter, and a checkbox inside toggles with Space.
- **By hand:** light and dark themes, 1280 px and 1024 px, a screen reader hears counts and the disabled state, axe reports no violations.

## Acceptance criteria

- [ ] Spec filters come from `FieldMeta.filter` for every builder category; no page lists fields.
- [ ] `enum`, `values`, `range`, `boolean` and `contains` filters work, combine with brand, price, in stock, sort and pagination, and live in the URL.
- [ ] Brand and spec options show counts that reflect the other active filters. Options the category doesn't have are hidden; options ruled out by other filters are disabled; checked options stay enabled.
- [ ] Only metadata fields are accepted from the URL; values are bound parameters.
- [ ] Queries filter on the JSONB `specs` column (index: see the finding).
- [ ] Unit, integration (in CI) and E2E tests, including the epic test, pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- Keyword search (story 4).
- Range sliders and histograms. Counts for price, in stock and range filters.
- An "any field" OR across filters, and a "not" (`false`) choice for boolean filters.
- Compatibility filtering ("fits my build"; that is the builder).
- Raw SQL or `@>` queries for the GIN index (see the finding), the mobile filter drawer, and filters for non-builder categories.

## Open questions

None. Resolved in review:

1. **GIN index:** typed Prisma path filters, with the changed criterion (see the finding). A raw `@>` ID query waits until a category reaches thousands of products.
2. **Kinds:** as in the table. VRAM, GPU length and wattage are ranges; memory and storage capacity, modules, M.2 slots and radiator size are `values`.
3. **Boost clock:** filtered in MHz in the inputs and the URL; chips show GHz.
