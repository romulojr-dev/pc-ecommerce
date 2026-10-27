# 016 — Plan: home page

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #39 · ADRs: [0003](../../adr/0003-cache-shared-data-with-tags.md), [0004](../../adr/0004-effective-price-column-kept-by-trigger.md)

## Context

FR-2 asks for a home page; `/` is still the shadcn template. The approved spec: hero, shop by category, featured products (new `isFeatured` flag), deals (on sale, available, biggest % first, none from Featured), shop by brand, trust strip; a spec summary line on every product card; an **On sale** common filter behind "View all deals"; a `/builder` "coming soon" page; the page static with a 10-minute refresh (ADR 0003). The existing shadcn theme and fonts are used unchanged; header and footer are untouched. One migration, no new dependency.

## Reuse

- Cards: `productCardSelect`, `toProductCardData`, `ProductCardData` ([lib/products.ts](../../../lib/products.ts)); `ProductCard` ([components/product/product-card.tsx](../../../components/product/product-card.tsx)); the raw-ids-then-typed pattern of `getRelatedProducts`
- Specs: `formatSpecValue`, `builderCategories`, `isBuilderCategory`, `FieldMeta` ([lib/specs/](../../../lib/specs/))
- Filters: `commonFilters`, `inStockFilter` as the model ([lib/listing-filters/in-stock.ts](../../../lib/listing-filters/in-stock.ts)), `serverFilters` in [lib/listing-filters/server.ts](../../../lib/listing-filters/server.ts), the sidebar's `CheckboxField` / "Availability" group ([components/catalog/listing-filters.tsx](../../../components/catalog/listing-filters.tsx)), `listingHref`, `searchTarget`, `categoryTarget`, `activeFilterCount`
- Cache: `getMenuCategories`, `CATEGORIES_TAG` pattern ([lib/categories.ts](../../../lib/categories.ts)); `manilaToday()` ([lib/stock.ts](../../../lib/stock.ts)); `discountPercent` (only for the ordering rule's meaning)
- Layout: `Container`, `Button` (`buttonVariants` for links), lucide icons, the placeholder icon map in [scripts/generate-placeholders.tsx](../../../scripts/generate-placeholders.tsx)
- Tests: `resetCatalog`, `createCategoryAndBrand`, `insertFixtures`, `FIXTURE_TODAY` ([test-support/db.ts](../../../test-support/db.ts)); E2E `test`/`expect` from [e2e/test.ts](../../../e2e/test.ts); the existing [e2e/home.spec.ts](../../../e2e/home.spec.ts)

## Files

```
prisma/schema.prisma, prisma/migrations/<ts>_product_featured   isFeatured Boolean @default(false)
prisma/seed/part-schema.ts      featured: z.literal(true).optional()
prisma/seed/write.ts            productData sets isFeatured; "isFeatured" added to CATALOG_FIELDS
prisma/seed/data/*.ts           featured: true on one part per category
prisma/seed/data/coverage.test.ts  one featured per category, in stock, not on sale
lib/specs/helpers.ts            FieldMeta.summary?: { suffix?: string }
lib/specs/categories/*.ts       summary marks (spec table)
lib/specs/summary.ts (+ test)   specSummary(categorySlug, specs): string | null; exported from index
lib/products.ts                 productCardSelect gains specs; ProductCardData.summary
components/product/product-card.tsx  summary line under the name
lib/listing-filters/on-sale.ts (+ test), index.ts, server.ts   onSale common filter
components/catalog/listing-filters.tsx  "On sale" checkbox in Availability
app/(store)/search/page.tsx     heading and title "Deals" for onSale alone
lib/home.ts (+ home.db.test.ts) loaders, cached wrappers, PRODUCTS_TAG
components/catalog/category-icons.ts  icon map shared with the placeholder script
components/home/*.tsx           hero, wafer-illustration, category-tiles, product-section, brand-list, trust-strip
app/(store)/page.tsx            the home page, revalidate = 600
app/(store)/builder/page.tsx    coming soon
e2e/home.spec.ts                home sections and links
docs/adr/0003-*.md, CLAUDE.md   docs
```

## Data (T1)

- Migration via `pnpm db:migrate --name product_featured` (adds the column only; no index, the catalog is small).
- Seed: `featured` in the part schema; `productData` writes `isFeatured: part.featured ?? false`; `isFeatured` joins `CATALOG_FIELDS`, so a re-seed sets it on existing products (comment: moves to create-only when the Admin epic manages it).
- Mark 8 parts, one per builder category, each with stock > `lowStockAt`, no `salePrice`, `status` ACTIVE, preferably well-known mid-range parts (e.g. AMD Ryzen 5 7600).
- Coverage test: exactly one featured part per category; each is ACTIVE, in stock (`getStockStatus(..., TODAY)` is `in-stock`), no `salePrice`.

## Card summary (T2)

- `FieldMeta.summary?: { suffix?: string }` (plain data, client-safe).
- Marks per the spec table: cpu socket, cores ("cores"), boostClockMhz ("boost"); motherboard socket, formFactor, memoryType; memory capacityGb, memoryType, speedMts; storage capacityGb, interface, formFactor; gpu vramGb ("VRAM"), boardPowerW; case maxGpuLengthMm ("GPU"), maxCoolerHeightMm ("cooler"); psu wattageW, efficiencyRating, modularity; cpu-cooler type, radiatorSizeMm, heightMm.
- `specSummary(categorySlug: string, specs: unknown): string | null` in `lib/specs/summary.ts`: null for a non-builder category or non-object specs; for each marked field in metadata order, skip `undefined`, skip `false`, a `true` boolean shows `meta.label`, otherwise `formatSpecValue(meta, value)` plus `" " + suffix`; join with `" · "`; null when nothing is left. Unit tests: one per category's example shape, an AIO and an air cooler, a missing optional field, a boolean true/false (via a test-only meta).
- `productCardSelect.specs = true`; `toProductCardData` adds `summary: specSummary(row.category.slug, row.specs)` and doesn't pass `specs` on.
- Card: `<p className="truncate text-xs text-muted-foreground">` under the heading when `summary` is set.

## On sale filter (T3)

- `on-sale.ts`: like `inStockFilter`: `key: "onSale"`, parse `first(raw.onSale) === "1"`, serialize `[["onSale", "1"]]`, chip "On sale".
- `commonFilters` gains `onSale` after `inStock` (URL order brand, price, inStock, onSale).
- Server: `onSale: { where: () => ({ salePrice: { lt: db.product.fields.price } }) }`. If the adapter rejects field references, fall back to a raw-id condition (`id: { in: ... }` from `SELECT id ... WHERE "salePrice" < "price"`), noted in the plan's deviations.
- Sidebar: a second `CheckboxField` "On sale" in Availability.
- Search page: `heading` returns "Deals" when `!q` and the only active filter is `onSale`; `generateMetadata` gives the title "Deals" in the same case (shared helper `isDealsOnly(q, filters)`).
- Tests: unit (parse/serialize/chip, URL order in `listing-params.test.ts`); integration in `server.db.test.ts` with the existing fixtures (P2 is the one on sale) plus an inserted product with `salePrice == price`: onSale → P2 only; onSale + brand Beta → none; onSale + inStock → P2.

## Home queries and caching (T4)

`lib/home.ts` (server-only):

```ts
export const PRODUCTS_TAG = "products"
export const HOME_LIMIT = 8
export type HomeProducts = {
  featured: ProductCardData[]
  deals: ProductCardData[]
}
export async function loadHomeProducts(): Promise<HomeProducts> // tested
export async function loadHomeBrands(): Promise<
  { name: string; slug: string }[]
> // tested
export const getHomeProducts = unstable_cache(
  loadHomeProducts,
  ["home-products"],
  { tags: [PRODUCTS_TAG], revalidate: 600 }
)
export const getHomeBrands = unstable_cache(loadHomeBrands, ["home-brands"], {
  tags: [PRODUCTS_TAG],
  revalidate: 600,
})
```

- Featured: `findMany({ where: { isFeatured: true, status: "ACTIVE" }, select: { id, ...productCardSelect }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }, { id: "asc" }], take: 8 })`.
- Deals: raw ids, then typed `findMany` and reorder (as `getRelatedProducts`):
  ```sql
  SELECT "id" FROM "Product"
  WHERE "status" = 'ACTIVE' AND "salePrice" < "price" AND "stock" > 0
    AND "id" <> ALL(${featuredIds}::text[])
  ORDER BY (("price" - "salePrice")::bigint * 100) / "price" DESC,
           ("price" - "salePrice") DESC, "name", "id"
  LIMIT 8
  ```
  `bigint` because `diff * 100` can overflow `int4` near the price cap. `salePrice < price` is false for null.
- Brands: `db.brand.findMany({ where: { products: { some: { status: "ACTIVE" } } }, orderBy: { name: "asc" }, select: { name, slug } })`.
- Loaders are exported separately because `unstable_cache` needs Next's request context; tests call the loaders.
- `lib/home.db.test.ts` (local `insert` helper like `related-products.db.test.ts`): the spec's featured, deals, no-duplicates and brands cases.

## Home page UI (T5)

- `app/(store)/page.tsx`: server component, `export const revalidate = 600`, no `connection()`; `Promise.all([getMenuCategories(), getHomeProducts(), getHomeBrands()])`; `today = manilaToday()`; sections in `Container`, vertical rhythm per the design (`mt-16`-ish), each `<section aria-labelledby>` with `h2` `text-xl font-semibold tracking-tight font-heading`.
- `components/home/hero.tsx`: two-column grid; `h1` `text-5xl font-semibold tracking-tight`; links with `buttonVariants()` / `buttonVariants({ variant: "outline" })` and lucide `Wrench`/`Tag` icons; "Coming soon" as small `text-muted-foreground` text inside the first link; "Shop deals" (`href="#deals"`) only when `deals.length > 0`. Smooth scroll: add `motion-safe:scroll-smooth` to `<html>`'s classes in `app/layout.tsx` (a class only; fonts and theme untouched), and `scroll-mt-8` on the Deals section.
- `wafer-illustration.tsx`: `<svg viewBox aria-hidden>` on a `bg-muted rounded-xl` panel; `<pattern>` die grid clipped to a circle, `stroke-border`/`fill-background` classes, dashed outer circle `stroke-muted-foreground`, three chips + leader lines + labels `fill-foreground` in `font-mono text-[10px]`. Under 10 KB.
- `category-icons.ts`: `categoryIcons: Record<BuilderCategorySlug, LucideIcon>` moved from the script (script imports it); `iconFor(slug)` falls back to `PackageIcon`.
- `category-tiles.tsx`: `<ul className="grid grid-cols-4 lg:grid-cols-8 gap-3">` of `Link` tiles (`rounded-lg border bg-card`, icon in a `bg-muted` well, name `text-sm`), focus ring as `ProductCard`.
- `product-section.tsx`: heading, optional subtext, optional "View all deals" link (right-aligned), `<ul className="grid grid-cols-2 lg:grid-cols-4 gap-4">` of `ProductCard` (`layout="grid"`, `headingLevel={3}`, `loading="lazy"`, `className="h-full"`, `sizes` as related products). Returns null when empty. Deals section `id="deals"`.
- `brand-list.tsx`: `<ul className="flex flex-wrap gap-x-6 gap-y-2 border-y py-4">` of links via `listingHref(searchTarget({}), { …, filters: { brand: [slug] } })`.
- `trust-strip.tsx`: sr-only `h2`; 4 items in `rounded-lg bg-muted` with `h3 text-sm font-medium` and the line in `text-foreground` (contrast note in the spec).
- `app/(store)/builder/page.tsx`: `metadata = { title: "PC Builder", robots: { index: false } }`, `h1`, text, link "Shop by category" → `/cpu`.

## E2E (T6)

Extend `e2e/home.spec.ts` (keep the existing header test):

- The `h1`; regions "Shop by category", "Featured products", "Deals", "Shop by brand", "Why shop with PC Silicon", in document order (compare bounding boxes' `y`).
- Category tile "CPU" → `/cpu` with `h1` "CPU"; first featured card link → its product page `h1`; brand "AMD" → `/search?brand=amd`, `h1` "AMD".
- "Shop deals" → URL hash `#deals`, Deals heading in viewport; "Build your PC" → `/builder`, "Coming soon" visible.
- "View all deals" → `/search?onSale=1`, `h1` "Deals", every card contains "Was".
- `/cpu`: the first card has a summary line (text matching `/·/`).

## Tasks (tasks.md)

After approval: copy this plan to `docs/specs/016-home-page/plan.md`, write `tasks.md`, set the spec to Approved. Then one task at a time, stopping after each, committing after each (subject-only Conventional Commit):

- **T1. Featured flag: migration and seed**
- **T2. Spec summary line on cards** (screenshots of `/cpu` and a product page's Similar products)
- **T3. On sale filter**
- **T4. Home queries and caching**
- **T5. Home page and builder placeholder**
- **T6. E2E**
- **T7. Docs and wrap-up** (ADR 0003 row, CLAUDE.md, spec criteria, full checks, push, PR; Lighthouse on the preview; after merge, `pnpm db:seed` on production)

## Verification

- T1: `pnpm db:migrate`, `pnpm db:seed` (8 featured in dev: check in Prisma Studio or a query), `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck`.
- T2: `pnpm test`; `pnpm dev` and Playwright screenshots (scratchpad script) of `/cpu`, `/search?q=ryzen` and a product page, light and dark.
- T3: `pnpm test`, `pnpm test:db`; in dev, `/cpu?onSale=1` shows only struck-price cards, chip and checkbox work; `/search?onSale=1` titled "Deals".
- T4: `pnpm test:db`.
- T5: `pnpm dev` screenshots of `/` and `/builder` (light, dark); keyboard pass; axe; `pnpm build` shows `/` as static (ISR 10m) in the route table.
- T6: full `pnpm test:e2e`.
- T7: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; Lighthouse desktop on the Vercel preview (`/`), scores in the PR.
