# 004 — Plan: product list

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #10

## Summary

- **No schema change, no migration.** The page reads `Product` with its `Brand` and `Category` through `db` ([lib/db.ts](../../../lib/db.ts)).
- **Helpers in `lib/`, pure and client-safe.** They don't import `@/lib/db` or `@/lib/env`, so Vitest needs no env, like [lib/slug.ts](../../../lib/slug.ts).
- **The query lives in the page.** The page is temporary; the Catalog epic will add a proper query module.
- **Table:** shadcn's `table` primitive (`pnpm dlx shadcn@latest add table`) → `components/ui/table.tsx`. The admin panel will reuse it.

## Files

```
lib/format.ts, lib/format.test.ts      formatPeso + tests
lib/stock.ts, lib/stock.test.ts        getStockStatus, StockStatus, stockStatusLabel + tests
components/ui/table.tsx                shadcn table (generated)
app/(store)/products/page.tsx          the page
prisma/seed.ts                         always print the target host before writing
e2e/products.spec.ts                   E2E
.github/workflows/ci.yml               "Seed database" step after "Apply migrations"
CLAUDE.md                              db:seed line (CI + one-off production), current state mentions /products
```

## `lib/format.ts`

```ts
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
})

// Integer centavos → "₱11,495.00"; negatives (discounts) → "-₱500.00"
export function formatPeso(centavos: number): string {
  if (!Number.isInteger(centavos)) {
    throw new RangeError(`formatPeso expects integer centavos, got ${centavos}`)
  }
  return peso.format(centavos / 100)
}
```

Checked in Node: `-500` → `-₱500.00`, `1234567` → `₱1,234,567.00`.

Tests: `0`, `99`, `1149500`, a seven-digit peso amount, `-50000`; `1.5`, `-1.5`, `NaN` and `Infinity` throw `RangeError`.

## `lib/stock.ts`

```ts
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock"

export const stockStatusLabel: Record<StockStatus, string> = {
  "in-stock": "In stock",
  "low-stock": "Low stock",
  "out-of-stock": "Out of stock",
}

export function getStockStatus(product: {
  stock: number
  lowStockAt: number
}): StockStatus
```

`stock <= 0` → out; `stock <= lowStockAt` → low; else in. The structural parameter type accepts a full Prisma `Product` or a `select` subset.

Tests: stock `0`, `1`, `== lowStockAt`, `lowStockAt + 1`; and `lowStockAt: 0` with stock `0` (out) and `1` (in).

## `app/(store)/products/page.tsx`

Server component.

- `export const metadata: Metadata = { title: "Products" }`.
- `await connection()` from `next/server` first, then:
  ```ts
  db.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      lowStockAt: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  })
  ```
- Wrapped in `Container` ([components/layout/container.tsx](../../../components/layout/container.tsx)) with `<h1>Products</h1>`.
- Empty: `<p>No products yet.</p>`. Otherwise a `Table` with a caption ("Active products in the catalog") and the columns Name / Brand / Category / Price / Stock. The Price column is right-aligned with `tabular-nums`. Token utilities only.

## `prisma/seed.ts`

Replace the reset-only log with one line after validation and before `writeSeed`: `Seeding <host>` (plus ` (reset)` when resetting). The `--reset` refusal under `NODE_ENV=production` stays where it is.

## E2E: `e2e/products.spec.ts`

```ts
const response = await page.goto("/products")
expect(response?.ok()).toBe(true)
await expect(page).toHaveTitle("Products | PC Silicon")

const row = page.getByRole("row", { name: /AMD Ryzen 5 7600/ })
await expect(row).toBeVisible()
await expect(row).toContainText(/₱[\d,]+\.\d{2}/)
```

## CI

A new step between "Apply migrations" and "Unit tests":

```yaml
- name: Seed database
  run: pnpm db:seed
```

No env changes. The seed reads the job-level `DATABASE_URL`, and dotenv quietly skips the missing `.env.local`.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (new helper tests plus the existing seed tests), `pnpm test:e2e`.
- Local CI dry run (as in 003): build and start against an empty throwaway Postgres. `/products` shows the empty state with a 200, and the build output lists `/products` as `ƒ`. After `pnpm db:seed`, a reload shows the products with no rebuild, which proves request-time rendering.
- Hand checks: a product set to `DRAFT` in the dev database disappears from `/products`; light and dark themes look right at 1280 px.
- CI passes on the PR. After merge, production `/products` shows the catalog.
