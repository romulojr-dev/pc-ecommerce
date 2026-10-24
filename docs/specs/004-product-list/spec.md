# 004 — Product list

Status: **Draft** · Issue: #10 · PRD refs: FR-8 (stock status, price), Catalog epic

## Summary

A temporary `/products` page lists every active product in the database, so the seeded catalog is visible on the production URL. It is the first page that reads from the database. The two helpers it needs, `formatPeso()` and `getStockStatus()`, are pure, unit-tested and meant to be reused by the Catalog epic. The page itself will be replaced by category pages (FR-4) later.

## Page

- Route: `app/(store)/products/page.tsx`, inside the existing `(store)` group, so it gets the header, footer and page container (spec 002). Title: `"Products"` → "Products | PC Silicon".
- Lists products with `status: ACTIVE` only. `DRAFT` products never appear.
- One semantic `<table>` with a caption, one row per product:

| Column | Source |
| --- | --- |
| Name | `Product.name` |
| Brand | `Brand.name` |
| Category | `Category.name` |
| Price | `formatPeso(Product.price)` |
| Stock | label of `getStockStatus(product)` |

- Sorted by category name, then product name, so the order is stable for tests.
- The query selects only the fields above (no `specs`, no images).
- Styling uses token utilities only, like the shell. No links: product pages don't exist yet.

**Empty state:** when no active products exist, the table is replaced by a short message ("No products yet.") under the page heading. The page still returns 200.

## Rendering: on every request

The page queries the database at request time, on every request. It is not prerendered at build time and not cached.

**Why:** a Prisma query is not a `fetch`, and the page uses no request data, so without an opt-out Next.js would prerender it during `pnpm build` and serve that HTML until the next deploy. That breaks here because:

- Production is built before it is seeded (see "Seeding production" below). A prerendered page would show the empty state until someone redeploys.
- Stock and price change at runtime (orders, admin panel later). A product list frozen at build time would show stale stock.
- The build would need a populated database to produce the right page, coupling every build to the database contents.

The catalog is small and this page is temporary, so a query per request costs nothing worth caching for. Caching comes with the real catalog pages.

**How:** the page calls `await connection()` from `next/server` before querying (see `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`). `cacheComponents` is not enabled in this project, so `connection()` marks the route dynamic and nothing else is needed. `pnpm build` output must list `/products` as dynamic (ƒ), not static.

## Helpers

Both live in `lib/` (e.g. `lib/format.ts` and `lib/stock.ts`), import nothing server-only and run in the browser too, since product cards and the builder will use them.

### `formatPeso(centavos: number): string`

- Formats integer centavos as Philippine pesos with `Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })`, always two decimals: `1149500` → `"₱11,495.00"`.
- Negative amounts get a leading minus sign: `-50000` → `"-₱500.00"`. Checkout needs this for discounts.
- Throws a `RangeError` for a non-integer input; prices are integer centavos (CLAUDE.md) and a fractional value is a bug.

### `getStockStatus(product: { stock: number; lowStockAt: number }): StockStatus`

Returns `"in-stock" | "low-stock" | "out-of-stock"`, with a `stockStatusLabel` map to the FR-8 labels:

| Condition | Status | Label |
| --- | --- | --- |
| `stock <= 0` | `out-of-stock` | Out of stock |
| `0 < stock <= lowStockAt` | `low-stock` | Low stock |
| `stock > lowStockAt` | `in-stock` | In stock |

"Pre-order" (FR-8) has no field in the schema yet, so it is not a status here (see Deferred).

### Unit tests (`*.test.ts`, colocated)

- `formatPeso`: `0` → `"₱0.00"`, `99` → `"₱0.99"`, `1149500` → `"₱11,495.00"`, a seven-digit peso amount gets two group separators, `-50000` → `"-₱500.00"`, `1.5` and `-1.5` throw.
- `getStockStatus`: `stock` 0, 1, equal to `lowStockAt`, `lowStockAt + 1`; and `lowStockAt: 0` (never "Low stock", 0 is "Out of stock").

## CI and E2E

- `.github/workflows/ci.yml`: a new step "Seed database" runs `pnpm db:seed` right after "Apply migrations" and before the build and E2E tests. CI has no `.env.local`; the seed reads the job-level env.
- New E2E test `e2e/products.spec.ts` on `/products`:
  - the response is successful and the page title is "Products | PC Silicon";
  - the table has a row for "AMD Ryzen 5 7600" (found by role and name), and that row contains a ₱-formatted price (matched by pattern, e.g. `/₱[\d,]+\.\d{2}/`, not an exact amount).
- The test depends only on that product name staying in the seed. Exact prices and the stock-status logic are covered by the unit tests, so changing a fixture's price or stock doesn't break E2E.
- The empty state is checked by hand (an empty Neon branch), not in CI, since the CI database is always seeded.

## Seeding production (once, after merge)

The production Neon database (main branch) has migrations applied by the Vercel build but no data. After this story's PR is merged and its production deploy succeeds, seed it once by hand:

1. Copy the production `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from Vercel (or Neon). Do **not** write them into `.env.local` or any file.
2. Run the seed with them set in the shell for that one command only; real environment variables win over `.env.local` (dotenv does not override them):
   ```sh
   NODE_ENV=production DATABASE_URL="…" DATABASE_URL_UNPOOLED="…" pnpm db:seed
   ```
3. Check that the printed target host is the production one and the counts look right, then open `/products` on the production URL.

Why this is safe:

- **No `--reset`.** With `NODE_ENV=production` the script refuses `--reset` anyway, so a typo can't truncate the catalog.
- **Validate first, then one transaction.** Invalid seed data writes nothing; a failure mid-write rolls back.
- **Idempotent.** Re-running upserts by SKU and keeps stock, price and status of existing products (spec 001), so a second run is harmless.
- **Not part of any build or deploy.** Seeding stays a manual, one-time step; `vercel.json` is unchanged.

Small change in this story: the seed prints `Seeding <host>` before writing (today it prints the host only for `--reset`), so step 3 can confirm the target before trusting the counts.

## Acceptance criteria

- [ ] `/products` lists every active seeded product with name, brand, category, price and stock status; `DRAFT` products are absent.
- [ ] With no active products, `/products` shows the empty state and returns 200.
- [ ] `pnpm build` reports `/products` as dynamic; a product added to the database after the build appears on reload without a redeploy.
- [ ] `formatPeso` and `getStockStatus` unit tests pass with `pnpm test`.
- [ ] CI seeds its database and the new E2E test passes there.
- [ ] Production is seeded per the steps above and `/products` on the production URL shows the catalog.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of scope

- Filters, sorting controls and search (FR-4, FR-5).
- Product detail pages and links to them (FR-8, FR-9).
- Images.
- Pagination.
- Sale price and % off display.
- Caching the list; header or footer links to `/products`.

## Deferred

- **"Pre-order" stock status (FR-8).** It needs a schema field (e.g. a pre-order flag or availability date on `Product`), which doesn't exist yet. Handled in the Catalog epic: add the field, then extend `getStockStatus()` and its tests.

## Resolved questions

| # | Question | Decision |
| --- | --- | --- |
| R1 | Route group: `(shop)` or the existing `(store)`? | `(store)`; no new group. |
| R2 | How is production seeded? | By hand, once after merge, per "Seeding production"; the seed prints the target host before writing. |
| R3 | How does the page opt out of prerendering? | `await connection()`. |

## Open questions

None.
