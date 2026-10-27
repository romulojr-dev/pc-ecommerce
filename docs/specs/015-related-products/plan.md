# 015 — Plan: related products

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #38 · ADRs: [0003](../../adr/0003-cache-shared-data-with-tags.md), [0004](../../adr/0004-effective-price-column-kept-by-trigger.md)

## Context

FR-11 asks for related products on the product page. The approved spec: up to 4 other active products from the same category, available ones (`stock > 0`, pre-orders included) first, then closest in `effectivePrice`, ties to the cheaper one, then name, then id. The section is "Similar products", reuses `ProductCard`, and streams behind `Suspense` with a skeleton so the product details are never delayed. No schema change, no migration, no new dependency.

## Reuse

- `productCardSelect`, `toProductCardData`, `ProductCardData` ([lib/products.ts](../../../lib/products.ts))
- The raw-ids-then-typed pattern of `getSearchScope` ([lib/search.ts](../../../lib/search.ts)): `db.$queryRaw` tagged template, values as bound parameters
- `ProductCard` ([components/product/product-card.tsx](../../../components/product/product-card.tsx)), `Skeleton` ([components/ui/skeleton.tsx](../../../components/ui/skeleton.tsx)), `manilaToday()` ([lib/stock.ts](../../../lib/stock.ts))
- Test helpers `resetCatalog`, `createCategoryAndBrand`, `db` ([test-support/db.ts](../../../test-support/db.ts)); E2E `test`/`expect` from [e2e/test.ts](../../../e2e/test.ts)

## Files

```
lib/products.ts                          getProductPage selects id, categoryId, effectivePrice;
                                         RelatedSource type; getRelatedProducts(source)
lib/related-products.db.test.ts (new)    the spec's integration cases
components/product/related-products.tsx  RelatedProducts (async server component), RelatedProductsSkeleton
  (new)
app/(store)/[category]/[product]/page.tsx  <Suspense> section after the detail sections
e2e/product-page.spec.ts                 "Similar products" test
CLAUDE.md                                one line: related products, where the query lives
docs/specs/015-related-products/spec.md  status Approved, criteria ticked at the end
```

## Query (`lib/products.ts`)

```ts
// The product related products are measured from
export type RelatedSource = { id: string; categoryId: string; effectivePrice: number }

export const RELATED_LIMIT = 4

export async function getRelatedProducts(source: RelatedSource): Promise<ProductCardData[]>
```

1. `db.$queryRaw<{ id: string }[]>` with the spec's SQL (`("stock" > 0) DESC, ABS("effectivePrice" - ${price}), "effectivePrice", "name", "id"`, `LIMIT ${RELATED_LIMIT}`).
2. No ids → `[]` without a second query.
3. `db.product.findMany({ where: { id: { in: ids } }, select: productCardSelect })`, then sort by the ids' index (a `Map` of id → position) and map with `toProductCardData`.

`ProductPageData` gains `id`, `categoryId`, `effectivePrice` (added to the select; `effectivePrice` is only read, per ADR 0004).

## UI

`components/product/related-products.tsx` (server, no `"use client"`):

- `RelatedProducts({ source, today })`: `try { products = await getRelatedProducts(source) } catch (error) { console.error(...); return null }`; empty → `null`; else `<section aria-labelledby="similar-products" className="mt-12">` with `<h2 id="similar-products" className="text-lg font-semibold">Similar products</h2>` and `<ul className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">`, one `<li key={slug}>` per `ProductCard` (`layout="grid"`, `headingLevel={3}`, `loading="lazy"`, `className="h-full"`, `sizes="(min-width: 1280px) 296px, (min-width: 1024px) 23vw, 45vw"`).
- `RelatedProductsSkeleton()`: same outer spacing and grid, `aria-hidden="true"`; a heading bar (`h-6 w-48`) and 4 blocks (`aspect-square w-full` + two text lines + price line), so the swap doesn't jump.

Page: after the `max-w-3xl` detail column, still inside `Container`:

```tsx
<Suspense fallback={<RelatedProductsSkeleton />}>
  <RelatedProducts source={product} today={today} />
</Suspense>
```

`today = manilaToday()` computed once (the page already calls it for `getStockStatus`; hoist to a variable). `notFound()` / `permanentRedirect()` stay above, before any boundary, so 404/308 keep their status.

## Tests

`lib/related-products.db.test.ts`: `beforeEach(resetCatalog)`, a CPU category + brand from `createCategoryAndBrand`, and a small local `insert({ name, price, salePrice?, stock?, status?, preorderShipsOn?, categoryId? })` (slug/sku from the name, `specs: {}`, `weightGrams: 100`, `lowStockAt: 5`, like `insertFixtures`). The current product is "Current" at ₱10,000. Cases, one `it` each, asserting the returned names in order:

| Case | Others (pesos) | Expected |
| --- | --- | --- |
| Closest price | 4,000 · 8,000 · 9,500 · 11,000 · 13,000 · 20,000 | 9,500, 11,000, 8,000, 13,000 |
| Sale price counts | A list 15,000 sale 10,500 · B 11,000 | A, B |
| Self excluded | Current + 3 others | 3 results, no "Current" |
| Inactive excluded | DRAFT at 10,000 + 1 active at 12,000 | only the active one |
| Other category excluded | GPU at 10,000 + CPU at 12,000 | only the CPU |
| Out of stock after available | OOS 10,000 + available 15,000, 20,000, 30,000, 40,000 | the four available |
| Out of stock fills | OOS 10,000 + available 15,000, 20,000, 30,000 | the three, then OOS |
| Pre-order counts | pre-order (stock 5, ships 2027) 10,100 + available 12,000 + OOS 10,000 | pre-order, 12,000, OOS |
| Tie-break | 9,000 "B" · 11,000 "A" · 9,000 "A2" | "A2", "B" (9,000, by name), then "A" |
| None | Current only | `[]` |

E2E in `e2e/product-page.spec.ts`: `/cpu/amd-ryzen-5-7600` → region "Similar products" has 4 `article`s, none with the link name "AMD Ryzen 5 7600"; click the first card's link → URL `/cpu/<slug>`, `h1` equals that name.

## Tasks (tasks.md)

After approval: copy this plan to `docs/specs/015-related-products/plan.md`, write `tasks.md`, set the spec to Approved. Then one task at a time, stopping after each, committing after each:

- **T1. Query + integration tests** (`getRelatedProducts`, `getProductPage` select, `lib/related-products.db.test.ts`)
- **T2. Section on the product page** (component, skeleton, `Suspense`)
- **T3. E2E**
- **T4. Docs and wrap-up** (CLAUDE.md, tick criteria, full checks, push, PR)

## Verification

- T1: `pnpm test:db` (with `pnpm test:db:up`), `pnpm lint`, `pnpm typecheck`.
- T2: `pnpm dev`, a CPU and a GPU product page show 4 cards; with a temporary `await new Promise(r => setTimeout(r, 3000))` in `RelatedProducts` (not committed) the details appear first and the skeleton is swapped; `curl -I` on `/cpu/no-such-product` → 404 and `/gpu/amd-ryzen-5-7600` → 308; `pnpm build`.
- T3: `pnpm test:e2e` (full suite).
- T4: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; then push and PR.
