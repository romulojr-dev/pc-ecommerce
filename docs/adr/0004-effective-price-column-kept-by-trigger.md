# ADR 0004 — Keep the effective price in a column maintained by a trigger

Status: **Accepted** · Date: 2026-10-26 · Story: #35 · Spec: [012-common-filters](../specs/012-common-filters/spec.md)

## Context

The price a shopper pays is `salePrice` when one is set, otherwise `price`. Filtering a listing by price range and sorting it by price (FR-4, FR-5) must both use that value, or a card showing ₱9,000 appears under a "₱10,000 and up" filter.

Prisma's `where` and `orderBy` take columns, not expressions, so `COALESCE("salePrice", "price")` can't be used in them. Something has to make the value a column, or the listing has to drop to raw SQL.

## Decision

`Product.effectivePrice` is a plain `Int` column, set by a `BEFORE INSERT OR UPDATE` trigger to `COALESCE("salePrice", "price")`. The trigger is written by hand in the migration `effective_price`, which also backfills existing rows.

**Rule: app code never writes `effectivePrice`.** Not the seed, not server actions, not the admin panel. The column has `@default(0)` only because Prisma needs a default for a `NOT NULL` column; the trigger overwrites whatever is sent. Filters and price sorts read it; nothing else computes the price a shopper pays in SQL.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Typed `OR` on `salePrice` and `price` | Works for filtering, but can't order by an expression, so the sort needs raw SQL anyway: two mechanisms for one idea |
| Raw SQL for the whole listing | Loses Prisma's typed `where`, so the reusable filter structure (and story 3's JSONB spec conditions) would become hand-built SQL |
| Postgres generated column (`GENERATED ALWAYS AS (...) STORED`) | Prisma doesn't model generated columns. Reports describe `migrate dev` trying to drop the column or its default: [prisma/prisma#14799](https://github.com/prisma/prisma/issues/14799), [#24180](https://github.com/prisma/prisma/issues/24180). We did not test it on Prisma 7; the trigger gets the same result without depending on that behaviour |
| A column the app keeps up to date | Every writer (seed, admin, bulk edit, a manual fix in the Neon console) would have to remember it; the value would drift silently |

## Consequences

- **No drift:** Prisma sees an ordinary column, and it doesn't diff or drop triggers. Checked on the dev branch: a second `prisma migrate dev` reported "Already in sync", the seed re-ran, and setting and clearing `salePrice` changed `effectivePrice`.
- **Correct for every writer**, including SQL run outside the app. The value doesn't depend on `salePrice < price`: whatever is set as the sale price is what the shopper pays.
- **The trigger is invisible in `schema.prisma`.** The schema comment and the migration point here. `prisma migrate reset` and a fresh database replay the migration, so they get the trigger too. A migration that recreates the `Product` table must recreate the trigger.
- **The type system doesn't stop a write** to the column; the rule above does, and an integration test checks that the trigger overrides a value sent by the app.
- **Reconsider** if Prisma gains first-class generated columns: the trigger can then become a generated column in one migration, with no change to queries.
