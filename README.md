# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Testing

```bash
pnpm test                              # unit tests (Vitest), no database needed
pnpm test:watch                        # unit tests in watch mode
pnpm test:db:up                        # start the test Postgres (Docker)
pnpm test:db                           # database integration tests; needs TEST_DATABASE_URL
pnpm test:db:down                      # stop it
pnpm exec playwright install chromium  # once, before the first E2E run
pnpm test:e2e                          # E2E tests (Playwright); starts the dev server
```

Unit tests are `*.test.ts` next to the code they test. Integration tests are
`*.db.test.ts`; they run real queries against Postgres. E2E tests live in `e2e/`.

E2E runs against the database the app server uses (`DATABASE_URL`: locally the
Neon dev branch, in CI a throwaway Postgres). One spec, `e2e/cart-flags.spec.ts`,
changes a product's stock there through `e2e/stock.ts` and restores it; the
helper refuses to run on the production database, and locally it needs
`PRODUCTION_DATABASE_HOST` in `.env.local` ([spec 027](docs/specs/027-cart-stock-flags/spec.md)).
Running local E2E on the Docker Postgres instead is
[#74](https://github.com/romulojr-dev/pc-ecommerce/issues/74).

### Integration test database

The integration tests empty the catalog tables, so they run against a Postgres
of their own, never the app's database. It runs in Docker
([docker-compose.yml](docker-compose.yml): Postgres 18 on port 5433, data in
memory, local-only credentials). With Docker Desktop running, add the
`TEST_DATABASE_URL` line from `.env.example` to your `.env.local` once, then:

```bash
pnpm test:db:up      # start it and wait until it is healthy
pnpm test:db         # apply the migrations, then run the tests
pnpm test:db:down    # stop and remove it (its data goes with it)
```

`pnpm test:db:migrate` applies the migrations by hand, for poking at the
database; `pnpm test:db` does it itself. `pnpm test:db` prints the host and
database it uses, and refuses to run when `TEST_DATABASE_URL` is missing or on
the same host as `DATABASE_URL`. (A loopback host such as this one is allowed
to share a server with the app only when the database name differs, which is
how CI runs it.)

The image's major version matches the Neon project and CI. Check Neon's with
`SHOW server_version;` in its SQL editor, or under the project's settings, and
update `docker-compose.yml` and `.github/workflows/ci.yml` together if it ever
changes.

## Schema drift

CI fails when `prisma/schema.prisma` and the migrations disagree: a model or an
index (such as the cart's partial unique index) that no migration creates, or a
migration that changes something the schema doesn't say. It replays the
migrations in an empty scratch database and compares the result with the schema
(`pnpm db:drift`, [spec 025](docs/specs/025-cart-single-items/spec.md)). To run
it yourself, point `SHADOW_DATABASE_URL` at an empty database that is not the
app's, for example one more database on the Docker Postgres:

```bash
docker exec pc-silicon-test-db psql -U postgres -c 'CREATE DATABASE pcsilicon_shadow'
SHADOW_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/pcsilicon_shadow pnpm db:drift
```

It prints "No difference detected." and exits 0 when they agree, and lists the
difference and exits 2 when they don't. It only reads; it never changes the
app's database. `CHECK` constraints and triggers live only in the migrations
(Prisma can't express them), so the check doesn't compare those.

## Cached data

The header's category menu is cached for up to an hour
([ADR 0003](docs/adr/0003-cache-shared-data-with-tags.md)). Changes made
through the app refresh it at once, but `pnpm db:seed` and manual edits in the
Neon console run outside Next, so the menu can show the old categories for up
to an hour afterwards.

To check: compare the menu with the database, e.g. in the Neon SQL editor:

```sql
SELECT name, slug, "sortOrder" FROM "Category"
WHERE "parentId" IS NULL ORDER BY "sortOrder", name;
```

If they differ, wait for the hour to pass. In production you can purge the
Data Cache from the Vercel dashboard (project Settings → Caches) instead.
Locally, stop `pnpm dev`, delete `.next/cache` and start it again.

The home page's Featured products, Deals and brand list work the same way, with
a 10-minute delay (tag `products`, [spec 016](docs/specs/016-home-page/spec.md)):
after a re-seed, its prices, stock labels and picks can be up to 10 minutes old.
Product pages, listings and search always show current prices and stock.

## Shipping data

The shipping rates and the store settings (address, hours, free-shipping
threshold, order expiry) are **demo values**: a fictional store and made-up
courier rates. `pnpm db:seed` creates the settings row only when it is missing
and inserts the rates only when the table is empty, so it never overwrites what
Admin sets later; a second run prints "kept (already set)." for each
([spec 028](docs/specs/028-shipping-data-and-fee-rules/spec.md)). With
`--reset`, the seed clears both tables along with the catalog and refills the
demo values.

The PH address data (regions, provinces, cities, barangays) comes from the PSA's
PSGC publication. `pnpm psgc:convert` turns `data/psgc/2026Q3.xlsx` into the JSON
files in `data/psgc/json/2026Q3/`, which are committed; the app serves them at
`/api/psgc/2026Q3/…` and validates addresses against the same files
([ADR 0008](docs/adr/0008-serve-address-data-as-versioned-json-through-a-route-handler.md)).
For a new quarter, put the workbook in `data/psgc/`, change `PSGC_VERSION` in
`lib/psgc/version.ts`, run `pnpm psgc:convert`, and fix what the tests name.

## Payments

Checkout pays through PayMongo's test mode. The keys, webhooks, tunnel, cron
and preview setup are in [docs/setup/payments.md](docs/setup/payments.md).

## AI agent skills

The Prisma agent skills used by Claude Code are not committed. `.agents/` holds
the skill files and `.claude/skills/` links to them; both are gitignored.
`skills-lock.json` records which skills are installed and is committed.

On a new machine, restore them from the lockfile:

```bash
pnpm dlx skills@1.5.14 experimental_install
```

If that fails (the command is experimental), reinstall them for Claude Code only:

```bash
pnpm dlx skills@1.5.14 add prisma/skills --agent claude-code --skill '*' -y
```
