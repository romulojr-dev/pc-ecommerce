# ADR 0005 — Keep the search vector in a column maintained by triggers

Status: **Accepted** · Date: 2026-10-27 · Story: #37 · Spec: [014-search](../specs/014-search/spec.md)

## Context

Keyword search (FR-6) matches a shopper's text against a product's name, brand, SKU, string spec values and category name, with the name weighted highest. Postgres full-text search needs a `tsvector` for each product. The brand and category names live in other tables, so the vector can't be an index expression on `Product` alone.

Model numbers are written in many shapes on both sides ("RTX5070" / "RTX 5070", "16gb" / "16 GB", "B650-A"), so the products and the query must be normalized the same way.

## Decision

`Product.searchVector` is a `tsvector` column with a GIN index, declared in Prisma as `Unsupported("tsvector")?` with `@@index([searchVector], type: Gin)`. The migration `product_search` adds hand-written SQL:

- `search_normalize(text)`: lowercase, anything but `a-z0-9` becomes a space, and a space goes in where letters meet digits. It is the **only** normalizer, used for both the products and the query.
- `search_query(text)`: the shopper's text as a tsquery that can't fail. It ANDs the normalized tokens (at most 16), makes the last token a prefix match when it has 2+ characters, and returns `NULL` for no tokens. Only `[a-z0-9]` tokens reach `to_tsquery`.
- `product_search_vector(...)`: weight A for the name, B for brand name and SKU, C for every string in `specs`, D for the category name. Uses the `simple` configuration.
- A `BEFORE INSERT OR UPDATE` trigger on `Product` sets the column on every write. `AFTER UPDATE OF name` triggers on `Brand` and `Category` refresh their products' vectors. The migration backfills existing rows.

**Rule: app code never writes `searchVector`**, the same rule as `effectivePrice` ([ADR 0004](0004-effective-price-column-kept-by-trigger.md)). Prisma Client can't read or filter an `Unsupported` field, so search matches in raw SQL (`$queryRaw` with the text as a bound parameter, through `search_query`), and the rest of the listing stays typed Prisma, scoped to the matching ids.

The field is optional only because a required `Unsupported` field without a default removes `create` from Prisma Client. The trigger never leaves it null.

## Spike result (2026-10-27)

The spike ran in a scratch database (`pcsilicon_spike`) on the local Docker Postgres 18. Neon and the test database were not touched.

- Prisma 7.10.1 accepts `@@index([searchVector], type: Gin)` on the `Unsupported` field and generates `CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector")`.
- **No drift:** after the migration was applied, two more `prisma migrate dev --create-only` runs each produced an empty migration, and `migrate status` reported the schema up to date. Prisma ignores the functions and triggers.
- The seed ran (150 created) and re-ran (150 updated); every product has a vector.
- Triggers, checked in a rolled-back transaction: insert sets the vector (including a string inside a spec array); a name or specs update replaces it; a value written straight to the column is overwritten; renaming a brand (15 products) or a category (27) makes all of them match the new name.
- The planner uses the index (`Bitmap Index Scan on "Product_searchVector_idx"`).

No fallback was needed: neither dropping the index nor building the vector per query.

The migration was then applied to the Neon dev branch with `pnpm db:migrate`. A following `migrate dev` again produced an empty migration, and the seed re-ran. Production gets it from `pnpm db:deploy` before the Vercel build ([vercel.json](../../vercel.json)), and the migration's backfill fills the vectors of existing products, so production needs no re-seed.

## Ranking

Best match orders by `ts_rank_cd(searchVector, query, 1)`: cover density, divided by the log of the entry's length. The spec first chose `ts_rank`. The fixture tests in T5 showed why that was wrong: `ts_rank` barely rewards a repeated word or words that appear together, and its length penalty counts the whole entry. So a product with a long SKU lost to one with a short SKU, and a "2×16 GB" kit beat a true "16 GB" kit for `16gb ddr5`.

Scores on the fixtures, for each candidate:

| Query | `ts_rank`, norm. 1 | `ts_rank`, norm. 0 | `ts_rank_cd`, norm. 0 | **`ts_rank_cd`, norm. 1** |
| --- | --- | --- | --- | --- |
| `16gb ddr5`: 16 GB kit / 2×16 GB kit | 0.235 / 0.240 | 1.000 / 1.000 (tie) | 0.652 / 0.386 | **0.222 / 0.134** |
| `rtx 5070`: plain / Ti | 0.217 / 0.239 | 0.996 / 0.996 (tie) | 1.238 / 1.242 | **0.390 / 0.430** |

None of them can tell "RTX 5070" from "RTX 5070 Ti" by word matching alone, since both contain the query words side by side. So the tests don't check the order of near-equal matches. A plain-before-variant rule is Phase 2. Changing the ranking function is a code change in `lib/search.ts` only, with no migration.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Build the vector per query | No index is possible across the joined tables, and it repeats the normalization and weighting on every search |
| Prisma's `search` operator (`fullTextSearchPostgres`) | Builds the vector per query and passes text to `to_tsquery`, which throws on input such as `rtx 5070` |
| A column the app keeps up to date | Every writer, and every brand or category rename, would have to remember it; it would drift silently |
| `english` configuration | Drops "a" in "B650-A" as a stopword and stems codes unpredictably; most search terms are model numbers |

## Consequences

- **Correct for every writer**, including the seed and SQL run in the Neon console. A brand or category rename updates every product it touches, which costs one update per product. That's fine for an admin rename.
- **The triggers and functions don't appear in `schema.prisma`.** The schema comment and the migration point here. A migration that recreates `Product`, `Brand` or `Category` must recreate the triggers.
- **Changing the normalizer or the weights** is a new migration that replaces the functions and re-runs the backfill `UPDATE`.
- **Search is the one raw-SQL query in the listing.** It returns ids and ranks; filters, counts and cards reuse the typed code.
