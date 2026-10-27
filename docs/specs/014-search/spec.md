# 014 — Keyword search

Status: **Approved** · Issue: #37 · PRD refs: FR-6 (keyword search across name, brand, model number and key specs; results reuse filters), FR-7 (state in the URL), NFR Accessibility (WCAG 2.1 AA), Testing strategy (integration tests for queries)

## Summary

The header search box submits to `/search?q=`. Results come from Postgres full-text search over name, brand, SKU and key spec values, ranked by relevance, and reuse the listing page's product cards, sort, pagination, active-filter chips and common filters, plus a **Category** filter with counts. `/search?brand=asus` with no query lists a brand's products, for the home page's "Shop by brand". Search pages are `noindex`.

## Header search box

- `HeaderSearch` becomes a `next/form` `<Form action="/search">` with `role="search"` and one `<input type="search" name="q" maxLength={100}>`. Enter submits it (implicit submission of a one-field form), so it works **without JavaScript** as a plain GET; with JavaScript, `next/form` navigates client-side and prefetches. The search icon stays decorative.
- **The query stays in the box** on `/search`: the box reads `q` with `useSearchParams` when the path is `/search`, and is empty elsewhere. It is keyed by `q`, so it updates on navigation. `/search` renders per request, so the server HTML already holds the value (no-JS case); on prerendered pages the box sits in a `Suspense` with an empty box as fallback.
- An empty submit goes to `/search?q=`, which redirects to `/search` (the prompt).

## What's searched

| Weight | Source | Example |
| --- | --- | --- |
| **A** | Product name | "ASUS ROG Strix B650-A Gaming WiFi" |
| **B** | Brand name, SKU | "ASUS", "90MB1BP0-M0AAY0" |
| **C** | String spec values (enums and free text) | socket "AM5", chipset "B650" / "GeForce RTX 5070", memory type "DDR5", chipset brand "NVIDIA", form factor, CPU generation |
| **D** | Category name | "Motherboard" |

Only active products are searched. **Numeric spec values are left out**: the headline numbers (capacity, VRAM) are already in the names, and bare lengths, watts and clocks would add false matches ("280" matching a 280 mm GPU). String values are picked up generically (every string in `specs`, including arrays such as a cooler's sockets), so a new spec field needs no search change.

### Precomputed column or per query

| | A. Build the vector per query | **B. `searchVector tsvector` column kept by a trigger (recommended)** |
| --- | --- | --- |
| Work per search | `to_tsvector` over every active product, joined to brand and category | One GIN index lookup |
| Index | Not possible: brand and category names live in other tables | GIN on the column |
| Correctness | Always current | Current for every writer (app, seed, Neon console), like `effectivePrice` ([ADR 0004](../../adr/0004-effective-price-column-kept-by-trigger.md)) |
| Cost | Simple at 150 products, grows with the catalog | Hand-written migration; triggers on `Brand` and `Category` too |

**Recommendation: B**, recorded as ADR 0005. A `BEFORE INSERT OR UPDATE` trigger on `Product` builds the weighted vector; `AFTER UPDATE OF name` triggers on `Brand` and `Category` refresh their products' vectors, so a rename never leaves stale results. The app never writes the column.

- **Prisma:** the column is `searchVector Unsupported("tsvector")?` with `@@index([searchVector], type: Gin)`. Optional, because a required `Unsupported` field without a default removes `create` from Prisma Client; the trigger always fills it. Prisma Client can't read or filter it, so the match runs in raw SQL (below).
- **Spike first** (a scratch database in the local Docker Postgres 18, so neither Neon nor the test database is touched), as in spec 012: migrate, `migrate dev` reports no drift, seed re-runs, all three triggers fire. Fallbacks, in order:
  1. **Prisma rejects the index or reports drift on it:** drop the index and keep the column. Postgres then scans `searchVector` on every search, which costs nothing measurable at this catalog size; the vectors are still precomputed. Note the missing index in ADR 0005 and revisit it when the catalog grows. The index is never created in SQL only, because `migrate dev` would generate a migration that drops it.
  2. **Prisma reports drift on the `Unsupported` column itself:** use option A. No column and no product triggers; the raw query builds the weighted vector per search from the same `search_normalize` and `search_query` functions (Prisma doesn't track functions, like the existing `effectivePrice` trigger function). Everything else in this spec is unchanged.

  The spike's result, and the fallback used if any, are recorded in ADR 0005.
- **Prisma's `search` operator** (`fullTextSearchPostgres`) is rejected: it rebuilds the vector per query and passes text to `to_tsquery`, which throws on input such as `rtx 5070`.

## Model numbers

Shoppers type model numbers in many shapes, and the catalog writes them in many shapes ("DDR5-6000 32 GB (2×16 GB)", "7800X3D", "B650-A", "i5-14400F"). Both sides go through **one SQL normalizer**, `search_normalize(text)`, used by the trigger and by the query function, so they can't drift:

1. Lowercase.
2. Every character that isn't `a-z` or `0-9` becomes a space (hyphens, slashes, dots, `×`, quotes, tsquery operators).
3. A space goes in at every letter↔digit boundary: `rtx5070` → `rtx 5070`, `7800x3d` → `7800 x 3 d`, `16gb` → `16 gb`.

**Text-search configuration: `simple`** (lowercase, no stemming, no stopwords). Most terms are codes, not English words: `english` would drop "a" in "B650-A" as a stopword and stem tokens unpredictably, and there's nothing to gain from stemming "gaming".

**Query:** the normalized tokens (at most 16) are AND-ed. **The last token is a prefix match** (`:*`) when it has at least 2 characters, so partial input like "780" finds "7800X3D"; earlier tokens match exactly. A 1-character last token stays exact, so "ddr5" doesn't become `ddr & 5:*` (which would match every token starting with 5) and "ryzen 7" doesn't match "7600".

| Input | Tokens / tsquery | Finds | Why |
| --- | --- | --- | --- |
| `rtx 5070` | `rtx & 5070:*` | RTX 5070 and 5070 Ti cards | Name tokens; plain 5070 ranks first (shorter name) |
| `5070` | `5070:*` | Same | |
| `RTX5070` | `rtx & 5070:*` | Same | Letter↔digit split |
| `7800x3d` | `7800 & x & 3 & d` | Ryzen 7 7800X3D only | Same split on both sides; `7800` excludes the 9800X3D |
| `b650` | `b & 650:*` | B650, B650-A, B650I, B650M boards | Hyphen and suffix letters split off |
| `16gb ddr5` | `16 & gb & ddr & 5` | DDR5 kits with "16 GB" in the name | Matches "16 GB" and "2×16 GB"; a true 16 GB kit names it twice, so it ranks first |
| `780` | `780:*` | Ryzen 7 7800X3D | Prefix on the last token |

Expected trade-offs: "5070" also matches the Ti (it is one), and a kit of "2×16 GB" matches "16gb". Ranking, not exclusion, handles both.

## Safety

- **User text is always a bound parameter.** The match runs as `db.$queryRaw` with a tagged template; `q` is never concatenated into SQL.
- **The query function can't throw.** `search_query(text) RETURNS tsquery` normalizes, splits, caps at 16 tokens, and builds the tsquery only from tokens that are `[a-z0-9]+` (plus our own `&` and `:*`), so `to_tsquery` never sees operator syntax from the user. Nothing left → `NULL`, which matches nothing. `websearch_to_tsquery` also never throws, but has no prefix matching and doesn't split `rtx5070`.
- **Length:** `q` is trimmed, runs of whitespace collapsed, control characters removed (Postgres text can't hold `\0`), then cut to **100 characters**; the URL redirects to the cleaned value. The box has `maxLength=100`. A repeated `q` uses the first.

## Results

- **Query flow** (`lib/search.ts`, server-only): one raw query returns the matching active product ids with `ts_rank` (weights A–D above, normalized by document length). From there everything is typed Prisma with the scope `{ status: "ACTIVE", id: { in: ids } }`: `activeWhere` for filters, `loadFilterOptions(scope, …)` for options and counts (spec 012 made options take a scope for this), `count`, and `findMany` with `productCardSelect` / `toProductCardData`. With no `q`, the scope is all active products. Fine for this catalog; revisit past ~10,000 products.
- **Sort:** **Best match** (relevance: rank, then name, then id) is the default when `q` is set; Newest and both price sorts (effective price) stay available. With no `q`, the default is Newest and `sort=relevance` is ignored. Relevance ordering is applied to the filtered ids before the page is sliced.
- **Filters:** **Category** first, then the common filters (brand, price, in stock). Category is a new filter object like brand: `category=gpu&category=cpu` (repeated slug, any of them, max 20), options are the categories in the result set with counts that apply the other active filters, unknown slugs are dropped with a redirect. It is not on category pages. Spec filters are not on search (out of scope).
- **`q` is not a filter.** It defines the scope, is matched in raw SQL, and isn't removed by **Clear all**. This supersedes spec 012's note that search would be "a `q` filter with no options". The state is `{ q, sort, page, filters }`; the URL key order is `q`, filters (list order), `sort`, `page`; defaults omitted; non-canonical URLs redirect, as in spec 008.
- **Reuse:** `ProductCard` (via `ListingResults`), `ListingShell` (announcements), `ListingSort`, `ListingPagination`, `ActiveFilters`, `ListingFilters` and `NoMatches`. They take a `slug` today; they take a serializable listing target instead, `{ kind: "category", slug } | { kind: "search", q }`, with one pure `targetHref(target, state)` in [lib/listing-params.ts](../../../lib/listing-params.ts), since the client components can't receive a function. **This refactor is its own task, done and verified before any search UI:** category pages render and behave exactly as before (same URLs, redirects and markup), and the existing unit, integration and E2E tests pass unchanged.
- **Heading:** `Results for “rtx 5070”`; with no `q` and one brand, the brand name ("ASUS"); otherwise "All products". Count line and announcement as on category pages.
- **Rendering:** per request (`await connection()`), no cache ([ADR 0003](../../adr/0003-cache-shared-data-with-tags.md)).

## Empty and no-results states

| State | Shows |
| --- | --- |
| No `q`, no filters (`/search`) | Heading "Search", "Search by part name, brand or model number.", example searches as links ("RTX 5070", "Ryzen 7", "B650", "DDR5") and links to the categories. No sidebar |
| No `q`, any filter (`/search?brand=asus`) | That filter's products across all categories, Newest first, with the full sidebar. This is the "Shop by brand" link target |
| `q` with no matches, no filters | Heading `No results for “…”` and suggestions: check the spelling, use fewer words, try just the model number ("5070" instead of "RTX 5070 Super"), or browse a category (links). No sidebar |
| Matches exist but filters exclude them all | The existing `NoMatches` block; **Clear all filters** keeps `q` |

## SEO

Every `/search` URL gets `robots: { index: false, follow: true }`: result pages are thin and unbounded, but their product links stay followable. `/search` is **not** blocked in `robots.txt`, since crawlers must fetch a page to see its `noindex`. `search` is already in [lib/reserved-slugs.ts](../../../lib/reserved-slugs.ts).

## Tests

- **Unit** (pure): parsing `q` (trim, whitespace, control characters, 100-character cut, repeated key); default sort with and without `q`; `sort=relevance` dropped without `q`; category filter parse/serialize/chips/normalize; `targetHref` round trips and canonical checks for both targets.
- **Integration** (`lib/search.db.test.ts`, `pnpm test:db`): the tests insert **their own fixture products**, not the seed, so a seed change can't move a result. Names and SKUs are chosen for the query list, so every expected match is known in advance. SKUs are `FIXA` to `FIXN` (one letter token, which no query uses), except F1, which carries a real-shaped SKU for the SKU query. Specs hold only the string fields listed (they are what search reads); the number fields are left out.

  | | Name | Brand | SKU | Category | String specs |
  | --- | --- | --- | --- | --- | --- |
  | F1 | Gigabyte GeForce RTX 5070 Windforce OC 12G | Gigabyte | GV-N5070WF3OC-12GD | Graphics Card | NVIDIA, GeForce RTX 5070 |
  | F2 | MSI GeForce RTX 5070 Ti Ventus 16G | MSI | FIXB | Graphics Card | NVIDIA, GeForce RTX 5070 Ti |
  | F3 | ASUS Dual GeForce RTX 4060 OC 8GB | ASUS | FIXC | Graphics Card | NVIDIA, GeForce RTX 4060 |
  | F4 | AMD Ryzen 7 7800X3D | AMD | FIXD | CPU | AM5, zen-4 |
  | F5 | AMD Ryzen 7 9800X3D | AMD | FIXE | CPU | AM5, zen-5 |
  | F6 | AMD Ryzen 5 7600 | AMD | FIXF | CPU | AM5, zen-4 |
  | F7 | Intel Core i5-14400F | Intel | FIXG | CPU | LGA1700, raptor-lake-refresh |
  | F8 | ASUS ROG Strix B650-A Gaming WiFi | ASUS | FIXH | Motherboard | AM5, B650, DDR5, ATX |
  | F9 | ASRock B650I Lightning WiFi | ASRock | FIXI | Motherboard | AM5, B650, DDR5, MINI_ITX |
  | F10 | MSI PRO B760M-A WiFi DDR4 | MSI | FIXJ | Motherboard | LGA1700, B760, DDR4, MICRO_ATX |
  | F11 | Kingston FURY Beast DDR5-5600 16 GB (1×16 GB) CL40 | Kingston | FIXK | Memory | DDR5 |
  | F12 | Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 | Kingston | FIXL | Memory | DDR4 |
  | F13 | Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 | Corsair | FIXM | Memory | DDR5 |
  | F14 | Same as F1, **DRAFT** | Gigabyte | FIXN | Graphics Card | Same as F1 |

  **Rule:** a failing search test is never fixed by changing its expectation to match the output. Work stops and the failure is reported, with a view on whether the expectation or the search is wrong; the decision is the product owner's.

  Queries and their exact expected matches (order checked only where stated):

  | Query | Expected |
  | --- | --- |
  | `rtx 5070`, `5070`, `RTX5070` | F1, F2; F1 first |
  | `7800x3d` | F4 |
  | `x3d` | F4, F5 |
  | `780` | F4 |
  | `ryzen 7` | F4, F5 |
  | `b650` | F8, F9 |
  | `16gb ddr5` | F11, F13; F11 first |
  | `i5-14400f` | F7 |
  | `GV-N5070WF3OC-12GD` (SKU) | F1 |
  | `am5` (spec) | F4, F5, F6, F8, F9 |
  | `lga1700` (spec) | F7, F10 |
  | `nvidia` (spec) | F1, F2, F3 |
  | `motherboard` (category) | F8, F9, F10 |
  | `asus` | F3, F8 |
  | `geforce rtx 5070 super` | none |

  Also: F14 never appears; **safety inputs** return without error (`'`, `"`, `\`, `&`, `|`, `!`, `:*`, `(`, `<->`, `'; DROP TABLE "Product"; --`, emoji, only punctuation → none, 1,000 characters); `ddr5` category counts are Memory 2, Motherboard 2; `rtx` + `category=gpu` + `brand=asus` → F3; price sort within a query; the trigger sets the vector on insert and on a name or specs update; renaming a brand or category updates its products' matches.
- **E2E** (`e2e/search.spec.ts`, seeded DB, role-based locators): on the home page, type "rtx 5070" in the header box and press Enter → URL `/search?q=rtx+5070`, the box still holds "rtx 5070", every card name contains "5070" → check a brand in the sidebar → URL keeps `q` and adds `brand`, every card is that brand → open the first card → its product page heading matches the card. Also: the same search with JavaScript disabled reaches the results; `/search?brand=<seeded brand>` lists only that brand; `/search` shows the prompt; a nonsense query shows "No results for"; the page has a `noindex` robots meta tag.

## Out of scope

- Typo tolerance (`pg_trgm` similarity, "did you mean") and autocomplete / suggestions under the box: Phase 2.
- Synonyms ("graphics card" → GPU), an OR fallback when the AND finds nothing, spec filters on search results, search analytics.
