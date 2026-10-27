# 017 — Plan: SEO for catalog pages

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #40 · ADRs: [0003](../../adr/0003-cache-shared-data-with-tags.md), [0004](../../adr/0004-effective-price-column-kept-by-trigger.md)

## Context

NFR SEO asks for search engines to understand the catalog. The pages are already server-rendered with unique titles, descriptions and relative canonicals, and noindex where needed. The approved spec adds what's missing: `metadataBase` from `NEXT_PUBLIC_SITE_URL` (absolute canonicals, plus one on the home page), Product and BreadcrumbList JSON-LD (escaped), `sitemap.xml`, `robots.txt`, and Open Graph / Twitter tags with a default 1200 × 630 image. No schema change, no migration, no new dependency.

## Reuse

- `env.NEXT_PUBLIC_SITE_URL` ([lib/env.ts](../../../lib/env.ts)), already validated as a URL
- `categoryHref`, `productHref`, `siteConfig` ([lib/site.ts](../../../lib/site.ts))
- `getStockStatus`, `StockStatus`, `manilaToday` ([lib/stock.ts](../../../lib/stock.ts)); the page already computes `status` and `today`
- `getProductPage` / `ProductPageData` ([lib/products.ts](../../../lib/products.ts)), gains `sku`
- `CATEGORIES_TAG` ([lib/categories.ts](../../../lib/categories.ts)), `PRODUCTS_TAG` ([lib/home.ts](../../../lib/home.ts)); the "export the loader, cache it separately" pattern of `loadHomeProducts` / `getHomeProducts`
- `ImageResponse` from `next/og` (bundled with Next) for the default image; the script layout of [scripts/generate-placeholders.tsx](../../../scripts/generate-placeholders.tsx)
- Test helpers `resetCatalog`, `createCategoryAndBrand`, `db` ([test-support/db.ts](../../../test-support/db.ts)); E2E `test`/`expect` from [e2e/test.ts](../../../e2e/test.ts)

## Files

```
lib/seo/urls.ts (+ test)              absoluteUrl(siteUrl, path)
lib/seo/json-ld.ts (+ test)           types, formatPriceAmount, availabilityFor, productJsonLd,
                                      breadcrumbJsonLd, serializeJsonLd
lib/seo/metadata.ts (+ test)          DEFAULT_OG_IMAGE, isRasterImage, socialMetadata
components/seo/json-ld.tsx            <JsonLd data={…} /> (server)
lib/sitemap.ts (+ .db.test.ts)        loadSitemapData (exported for tests), getSitemapData (cached)
app/sitemap.ts, app/robots.ts         metadata routes
app/layout.tsx                        metadataBase, default openGraph/twitter
app/(store)/page.tsx                  canonical "/", social metadata
app/(store)/[category]/page.tsx       social metadata
app/(store)/[category]/[product]/page.tsx  social metadata, JSON-LD, breadcrumbs from one array
lib/products.ts                       getProductPage selects sku
scripts/generate-og-image.tsx, public/images/og-default.png, package.json  "images:og"
e2e/seo.spec.ts                       sitemap, robots, JSON-LD, canonicals, OG tags
CLAUDE.md, docs/specs/017-seo/spec.md  docs, ticks
```

## Design

### URLs (`lib/seo/urls.ts`)

`absoluteUrl(siteUrl: string, path: string): string`. It trims the site URL's trailing slash and joins `path` (always starting with `/`). `"/"` gives the bare origin (`https://x.com`), the way `metadataBase` resolves `"/"`. `https://` values are returned unchanged, which covers `ProductImage.url`. The pure modules take `siteUrl` as an argument; only pages and routes read `env`.

Root layout: `metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL)`. Home: `alternates: { canonical: "/" }`. The category and product canonicals don't change; they become absolute automatically.

### JSON-LD (`lib/seo/json-ld.ts`)

- `formatPriceAmount(centavos)`: `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`, integers only.
- `availability: Record<StockStatus, string>`: in-stock and low-stock map to `https://schema.org/InStock`, pre-order to `…/PreOrder`, out-of-stock to `…/OutOfStock`.
- `productJsonLd({ product, status, siteUrl })`, where `product` is `Pick<ProductPageData, "name" | "slug" | "sku" | "description" | "brand" | "category" | "effectivePrice" | "preorderShipsOn" | "images">`. It builds the spec's object. `description` and `image` are spread in only when present. `availabilityStarts: preorderShipsOn` is added only for `pre-order`. The offer `url` is `absoluteUrl(siteUrl, productHref(...))`, and `itemCondition` is `NewCondition`.
- `breadcrumbJsonLd(items: { name: string; path?: string }[], siteUrl)`: `ListItem` with `position: i + 1`, and `item` only when `path` is set.
- `serializeJsonLd(data)`: `JSON.stringify(data)`, then replaces `<`, `>` and `&` with `\u003c`, `\u003e` and `\u0026`.
- `components/seo/json-ld.tsx`: `JsonLd({ data }: { data: object })` renders `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />`.

Product page: one `const breadcrumbs = [{ name: "Home", path: "/" }, { name: product.category.name, path: categoryHref(...) }, { name: product.name }]` drives both the visible `Breadcrumb` (mapped: a link when there is a `path`, otherwise `BreadcrumbPage`; separators between items via a keyed `Fragment`) and `breadcrumbJsonLd`. That way they can't drift apart. Both `<JsonLd>` scripts are rendered at the top of the `Container`, before the `Suspense`.

### Social metadata (`lib/seo/metadata.ts`)

- `DEFAULT_OG_IMAGE = { url: "/images/og-default.png", width: 1200, height: 630, alt: "PC Silicon: PC parts and a PC Builder that checks compatibility" }`.
- `isRasterImage(url)`: the URL's pathname (query stripped) ends in `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif`.
- `socialMetadata({ title, description, path, image? }): Pick<Metadata, "openGraph" | "twitter">`. A raster `image` (`{ url, alt }`) is used with `card: "summary"`; otherwise it's `DEFAULT_OG_IMAGE` with `"summary_large_image"`. It sets `openGraph: { type: "website", siteName, locale: "en_PH", url: path, title, description, images: [img] }` and `twitter: { card }`. Next fills Twitter's title, description and images from `openGraph`.
- Layout: `...socialMetadata({ title: siteConfig.name, description: siteConfig.tagline, path: "/" })` as the default. Home sets the same plus its canonical. Category: the page's title and description, with `path` = the canonical href. Product: name, the meta description, `productHref`, and `image: product.images[0]`. The title and description are computed once into variables, so the meta and OG values match.

### Default image

`scripts/generate-og-image.tsx` (`pnpm images:og`): `new ImageResponse(<div …>, { width: 1200, height: 630 })`, then `arrayBuffer()`, then `public/images/og-default.png`. The layout: light background, the "pcsilicon" wordmark, "PC Silicon", the tagline, and a simple wafer (a circle with a grid of small squares, built from divs, since satori supports only a subset of CSS). Hard-coded hex colors that match the light theme. A script can't read CSS variables, so this follows the placeholder script's precedent. The output is committed and checked to be under 300 KB. If `ImageResponse` won't run under `tsx`, I'll stop and ask rather than add a dependency.

### Sitemap (`lib/sitemap.ts`, `app/sitemap.ts`)

`loadSitemapData()` (server-only) returns serializable data, because `unstable_cache` JSON-serializes and a `Date` would come back as a string:

```ts
type SitemapData = {
  homeModified: string | null                       // ISO
  categories: { slug: string; lastModified: string }[]
  products: { categorySlug: string; slug: string; lastModified: string }[]
}
```

- Products: `findMany({ where: { status: "ACTIVE" }, select: { slug, updatedAt, category: { select: { slug } } }, orderBy: [{ category: { sortOrder } }, { name }] })`.
- Categories: `findMany({ where: { parentId: null, products: { some: { status: "ACTIVE" } } }, select: { slug, updatedAt }, orderBy: sortOrder, name })`. `lastModified` is the max of the category's `updatedAt` and its products' newest `updatedAt`, computed from the product rows already loaded (grouped by category slug), so there's no third query.
- `homeModified`: the newest product `updatedAt`, or `null` when there are no products, in which case `lastModified` is left out.
- `getSitemapData = unstable_cache(loadSitemapData, ["sitemap"], { tags: [PRODUCTS_TAG, CATEGORIES_TAG], revalidate: 3600 })`.

`app/sitemap.ts`: `export const revalidate = 3600`. It maps to `{ url: absoluteUrl(env.NEXT_PUBLIC_SITE_URL, href), lastModified }` for the home page, then categories, then products.

`app/robots.ts`: `{ rules: { userAgent: "*", allow: "/" }, sitemap: absoluteUrl(siteUrl, "/sitemap.xml") }`, with a short comment on why nothing is disallowed.

## Tests

- **Unit** (pure, in `pnpm test`): the spec's list. In `json-ld.test.ts`: price strings, sale vs list via `effectivePrice`, all four statuses, `availabilityStarts` only for pre-order, keys left out, absolute and kept-as-is image URLs, breadcrumbs, and the `</script>` escaping round trip (no `<`, `>` or `&` in the output; `JSON.parse` deep-equals the input). In `urls.test.ts`: with and without a trailing slash, the root URL, an `https://` passthrough. In `metadata.test.ts`: SVG vs PNG, no image, query string, card types.
- **Integration** (`lib/sitemap.db.test.ts`): active only (a DRAFT product is excluded); a category with only a DRAFT product is excluded; category `lastModified` is the newer of category and product `updatedAt` (set `updatedAt` explicitly through `db.product.update`); `homeModified` is the max, or `null` when empty.
- **E2E** (`e2e/seo.spec.ts`, `request` fixture for the routes): as in the spec. The product is `/cpu/amd-ryzen-5-7600`, as in the existing product-page tests. The breadcrumb names are compared with the visible `navigation "Breadcrumb"` links plus the current page. The base URL comes from Playwright's `baseURL`.

## Tasks (tasks.md)

After approval: copy this plan to `docs/specs/017-seo/plan.md`, write `tasks.md`, and set the spec to Approved. Then one task at a time, stopping after each and committing after each:

- **T1. Absolute URLs:** `lib/seo/urls.ts` with its test, `metadataBase`, the home canonical.
- **T2. JSON-LD:** builders and tests, `JsonLd`, `sku` in `getProductPage`, product page scripts, and breadcrumbs from one array.
- **T3. Open Graph and Twitter:** the image script and PNG, `socialMetadata` and its test, layout, home, category and product.
- **T4. Sitemap and robots:** `lib/sitemap.ts` and its integration test, `app/sitemap.ts`, `app/robots.ts`.
- **T5. E2E:** `e2e/seo.spec.ts`.
- **T6. Docs and wrap-up:** CLAUDE.md, tick the criteria, full checks, push, check the preview header, open the PR. The Rich Results Test is done after merge.

## Verification

- T1: `pnpm test`; in `pnpm dev`, view the source of `/`, `/cpu?page=2` and a product page: each `<link rel="canonical">` is absolute and matches the page.
- T2: `pnpm test`; product page source has two `ld+json` scripts; paste one into validator.schema.org; temporarily rename a product locally to `</script><script>alert(1)</script>` (via Prisma Studio, then revert) and confirm the page renders the text, with no alert and a valid script.
- T3: `pnpm images:og` and open the PNG; `pnpm test`; `og:*` / `twitter:*` tags in the source of home, `/cpu` and a product page.
- T4: `pnpm test:db` (after `pnpm test:db:up`); `curl localhost:3000/sitemap.xml` and `/robots.txt`; `pnpm build` (the sitemap prerenders).
- T5: full `pnpm test:e2e`.
- T6: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; after the push, `curl -sI <preview>/cpu | grep -i x-robots-tag` (or DevTools if the preview is protected) and check `NEXT_PUBLIC_SITE_URL` in Vercel's Production environment.
