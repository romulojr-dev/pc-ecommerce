# 017 — SEO for catalog pages

Status: **Approved** · Issue: #40 · PRD refs: NFR SEO (server-rendered pages, unique titles/meta, Product JSON-LD with price and availability, sitemap.xml, clean URLs), FR-7 (crawlable filter links), Goal 5

## Summary

Search engines should understand the home, category and product pages. The pages are already server-rendered with unique titles, descriptions and canonicals. This story makes canonicals absolute from `NEXT_PUBLIC_SITE_URL`, and adds Product and BreadcrumbList JSON-LD, `sitemap.xml`, `robots.txt`, and Open Graph / Twitter tags with a default site image.

## Audit

**Already in place** (kept as they are):

| Piece | Where |
| --- | --- |
| Server-rendered category and product pages, per request | `await connection()` in both pages |
| Title template `%s \| PC Silicon` and a default description | [app/layout.tsx](../../../app/layout.tsx) |
| Unique title and description per category (`— Page N` from page 2) and per product (description cut at 155 characters, or a generated sentence) | `generateMetadata` in [`[category]/page.tsx`](../../../app/(store)/[category]/page.tsx) and [`[product]/page.tsx`](../../../app/(store)/[category]/[product]/page.tsx) |
| Canonical on category pages: own URL without `sort`, page and filters kept (spec 008, 012) | category `generateMetadata` |
| Canonical on product pages, plus a 308 from a wrong category to the real one (spec 010) | product page |
| One URL per listing state: untidy queries redirect to the canonical one | `isCanonicalQuery` in [lib/listing-params.ts](../../../lib/listing-params.ts) |
| `noindex, follow` on filtered category pages, every `/search` URL and `/builder` (spec 012, 014, 016) | the pages' metadata |
| Clean URLs (`/gpu/<slug>`); filter, sort and pagination links are plain `<a href>` | `listingHref`, `productHref` |
| `sitemap.xml` and `robots.txt` can't collide with a category slug (slugs can't contain `.`) | spec 005, [lib/reserved-slugs.ts](../../../lib/reserved-slugs.ts) |
| `lang="en"`, image alt text | root layout, `ProductImage` |

**Gaps this story closes:**

- No `metadataBase`: the canonicals are relative paths, so Next resolves them against its own fallback (the Vercel production URL, or `localhost` with a build warning), not our configured URL.
- The home page has no canonical.
- No structured data, no `sitemap.xml`, no `robots.txt`.
- No Open Graph or Twitter tags, and no image for link previews.

## Absolute URLs

- **`metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL)`** in the root layout's `metadata`. Every relative URL in metadata (canonicals, `og:url`, `og:image`) is then made absolute from it. `env` already validates the variable as a URL at startup.
- **`absoluteUrl(siteUrl, path)`** in `lib/seo/urls.ts` builds absolute URLs for the sitemap and JSON-LD, which `metadataBase` doesn't cover. It composes the URL the way `metadataBase` does: no doubled slash, and the home URL without a trailing slash. Pure functions take `siteUrl` as an argument rather than importing `env`, so the unit tests need no env vars.

## Canonical URLs

| Page | Canonical |
| --- | --- |
| Home | `/` (new: `alternates.canonical` in the home page's `metadata`) |
| Category | Its own URL without `sort`. Page 2 and later are canonical **to themselves** (`/cpu?page=2`), not to page 1, because they list different products and Google ignores a canonical that points at different content. Filtered pages keep their own canonical and stay `noindex`. Already in place; now absolute. |
| Product | `productHref(category, slug)`. Already in place; now absolute. |
| Search, builder | None: they're `noindex`. |

A canonical is set **per page, never in a layout**. Metadata merges shallowly, so a layout canonical would be inherited by every page that doesn't set its own, and they would all point at that URL.

## Structured data (JSON-LD)

Pure builders in `lib/seo/json-ld.ts` take the page's data and `siteUrl` and return plain objects with local types (no new dependency). A small server component, `JsonLd` in `components/seo/json-ld.tsx`, renders one `<script type="application/ld+json">`. The product page renders two of them (Product and BreadcrumbList) **before the `Suspense` boundary**, so they're in the first HTML chunk, and from the same data and `today` the page already uses. Because the page renders per request, price and availability are always current.

### Product

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "AMD Ryzen 5 7600",
  "image": ["https://<site>/images/placeholders/cpu.svg"],
  "description": "…",
  "sku": "…",
  "brand": { "@type": "Brand", "name": "AMD" },
  "offers": {
    "@type": "Offer",
    "url": "https://<site>/cpu/amd-ryzen-5-7600",
    "priceCurrency": "PHP",
    "price": "12999.00",
    "availability": "https://schema.org/InStock",
    "itemCondition": "https://schema.org/NewCondition"
  }
}
```

- **name**, **sku**, **brand** (`Brand` with the brand's name), **description** (the full text; the key is left out when the product has none).
- **image:** every image URL in `sortOrder`, made absolute (site paths get the site URL; `https://` URLs stay as they are). Left out when the product has no images.
- **getProductPage** gains `sku` in its select.
- **price:** `effectivePrice`, the price the shopper pays (the sale price when there is one, ADR 0004), converted from centavos to a string with two decimals: `1299900` becomes `"12999.00"`. Integer arithmetic only (`Math.trunc(c / 100)` and the remainder padded to two digits), never floating-point division. **priceCurrency** is `"PHP"`. No `priceValidUntil` (sales have no end date) and no strikethrough list price.
- **availability**, from `getStockStatus(product, today)`:

  | Status | schema.org | Why |
  | --- | --- | --- |
  | `in-stock` | `InStock` | |
  | `low-stock` | `InStock` | It can still be bought now. `LimitedAvailability` adds nothing for search and reads as a different state. |
  | `pre-order` | `PreOrder`, plus `availabilityStarts` = `preorderShipsOn` (`YYYY-MM-DD`) | Can be ordered now and ships on that date. |
  | `out-of-stock` | `OutOfStock` | |

  A `Record<StockStatus, …>` makes a new status a type error until it is mapped.
- **No `aggregateRating` or `review`:** there are no reviews yet, and invented ratings break Google's guidelines. No `shippingDetails` or `hasMerchantReturnPolicy` either (see "Validating after merge").

### BreadcrumbList

It mirrors the product page's visible breadcrumbs exactly: Home → category → product.

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://<site>" },
    { "@type": "ListItem", "position": 2, "name": "CPU", "item": "https://<site>/cpu" },
    { "@type": "ListItem", "position": 3, "name": "AMD Ryzen 5 7600" }
  ]
}
```

The last item has no `item`, because it is the current page and isn't a link in the visible trail (Google allows that). The names are the same strings the visible breadcrumbs render (the category's database name, the product name). Category pages show no breadcrumbs today, so they get no BreadcrumbList.

### Escaping (XSS)

Product names, descriptions and brand names are data an admin will be able to edit, so a name like `</script><script>alert(1)</script>` must not end up as markup.

- The content of a `<script>` element is raw text: the HTML parser ignores entities in it and **only `</script` (or `<!--`) can end it early**. React can't render JSON there as a child, since it would escape it into HTML entities, which aren't decoded inside a script and would corrupt the JSON. So the JSON goes in through `dangerouslySetInnerHTML`, and we escape it first.
- `serializeJsonLd(data)` does `JSON.stringify(data)`, then replaces every `<` with `\u003c`, `>` with `\u003e` and `&` with `\u0026` (Next's JSON-LD guide recommends at least `<`). Those are valid JSON string escapes, so `JSON.parse` returns exactly the original strings, but the serialized text **contains no `<` at all**, so `</script>` and `<!--` can't appear in it. `JSON.stringify` already escapes quotes and backslashes, and only strings from our builders go in, never raw HTML.
- `JsonLd` takes the object, not a string, so no page can bypass `serializeJsonLd`.

## Open Graph and Twitter

A helper `socialMetadata({ title, description, path, image? })` in `lib/seo/metadata.ts` returns both blocks, so every page sets them the same way:

- `openGraph`: `type: "website"`, `siteName: "PC Silicon"`, `locale: "en_PH"`, `url: path`, `title`, `description`, `images`.
- `twitter`: `card` (below). Next copies the title, description and images from `openGraph` when `twitter` doesn't set them, so they aren't repeated.

Pages always pass `images`. Metadata merges shallowly, so a page's `openGraph` replaces the layout's whole `openGraph`, image included. That's why the default image is a plain file referenced by the helper, not the `opengraph-image` file convention, which would only reach pages that don't set `openGraph`.

| Page | Title / description | Image | Card |
| --- | --- | --- | --- |
| Home | "PC Silicon" / the tagline | default | `summary_large_image` |
| Category | page title / page description, as in `generateMetadata` | default | `summary_large_image` |
| Product | name / the meta description | the first product image if it's a raster image; otherwise the default | `summary` with a product image, else `summary_large_image` |

- **Default site image:** `public/images/og-default.png`, 1200 × 630 PNG: the wordmark, the tagline and the wafer motif from the hero, in the theme's light colors. Its `alt` is "PC Silicon: PC parts and a PC Builder that checks compatibility". It is made by `scripts/generate-og-image.tsx` (`pnpm images:og`, using `ImageResponse` from `next/og`) and committed, like the placeholders. It stays under 300 KB.
- **Why "raster":** link-preview crawlers (Facebook, X, Messenger, Slack) don't render SVG. Today every product uses an SVG category placeholder, so every product shows the default image until real photos arrive. Real images then only change data, as spec 006 intended.
- The root layout gets the same defaults, so other pages (`/search`, `/builder`) show a preview too.

## sitemap.xml

`app/sitemap.ts` returns `MetadataRoute.Sitemap` from `getSitemapEntries()` in `lib/sitemap.ts` (server-only):

- **Home:** `lastModified` = the newest `updatedAt` of any active product.
- **Categories:** top-level categories with **at least one active product** (an empty category page is thin content), page 1 only (`/cpu`). `lastModified` = the newest `updatedAt` among the category itself and its active products.
- **Products:** every `ACTIVE` product at `productHref`, with `lastModified` = `Product.updatedAt`. `DRAFT` and archived products are left out.
- **Never listed:** filter, sort or page URLs, `/search` (any query), `/builder`, `/login`, `/signup`, `/sidebar`. Only canonical, indexable URLs go in a sitemap.
- No `changeFrequency` or `priority`: Google ignores them.
- URLs are absolute with `absoluteUrl`, so they match the canonicals character for character.
- **Size:** about 160 URLs, far below the 50,000 limit of one file. `generateSitemaps` is only needed past that.

**Caching:** a `sitemap.ts` route is cached by default, so it's generated at build time like the home page (which already reads the database during the build; Vercel and CI have `DATABASE_URL` then). `getSitemapEntries` uses one query per kind, wrapped in `unstable_cache` with the tags `PRODUCTS_TAG` and `CATEGORIES_TAG` and `revalidate: 3600` (ADR 0003), and the route exports `revalidate = 3600`. App writes that already invalidate those tags refresh the sitemap too. The seed doesn't, so after a production re-seed the sitemap catches up within an hour, which is fine for crawlers.

## robots.txt

`app/robots.ts`:

```
User-Agent: *
Allow: /

Sitemap: https://<site>/sitemap.xml
```

**Nothing is disallowed, on purpose.** `noindex` is a tag in the page. A crawler only sees it if it may fetch the page, so a `Disallow` on `/search` or on filtered URLs would hide the `noindex`, and Google can still index a blocked URL that it finds through links (shown without a snippet). Blocking would also stop crawlers from following the product links on those pages (`follow`). The `noindex` tags already keep those pages out of the index (spec 012, 014). The sitemap URL is absolute, from `NEXT_PUBLIC_SITE_URL`.

## Preview deployments

Vercel adds **`X-Robots-Tag: noindex`** to every response of a non-production deployment (preview branches and per-deployment `*.vercel.app` URLs). Production domains don't get it. So previews aren't indexable without any code, and this story adds none: a `VERCEL_ENV` check in `robots.ts` would duplicate the header and add another env variable. When Deployment Protection is on, previews also answer `401` to anyone not logged in to Vercel, which already keeps crawlers out.

Previews may show production canonicals if their `NEXT_PUBLIC_SITE_URL` is the production URL. That's harmless, since nothing on a preview is indexed.

**Verifying it** (once, on this story's preview, then recorded in the PR):

1. `curl -sI https://<preview-url>/cpu | grep -i x-robots-tag` prints `x-robots-tag: noindex`. With protection on, `curl` gets `401`: then open the preview in a logged-in browser and check the response headers of the document request in DevTools → Network.
2. After merge, the same command on the production URL prints **nothing**, so production stays indexable.
3. Check in the Vercel project settings that `NEXT_PUBLIC_SITE_URL` in the **Production** environment is the production URL; the canonicals, sitemap and `robots.txt` all come from it.

## Tests

**Unit** (`lib/seo/json-ld.test.ts`, `lib/seo/urls.test.ts`, `lib/seo/metadata.test.ts`, pure):

- Price: `1299900` → `"12999.00"`, `1299950` → `"12999.50"`, `5` → `"0.05"`; uses the sale price when there is one; `priceCurrency` is `"PHP"`.
- Availability: each `StockStatus` maps as in the table; pre-order adds `availabilityStarts` and the others don't.
- Fields: brand, sku and offer URL; description and image are left out when empty; site-path images become absolute, `https://` images stay as they are.
- Breadcrumbs: three items, positions 1–3, absolute URLs on the first two, no `item` on the last.
- Escaping: a product named `</script><script>alert(1)</script>` with `&` and `>` in its description serializes with **no `<`, `>` or `&`**, and `JSON.parse` of the output equals the input object.
- `absoluteUrl`: with and without a trailing slash on the site URL, and the home URL.
- `socialMetadata`: an SVG image falls back to the default with `summary_large_image`; a raster image is used with `summary`.

**Integration** (`lib/sitemap.db.test.ts`, against `TEST_DATABASE_URL`): only active products; a category with no active products is left out; `lastModified` values come from `updatedAt` as described.

**E2E** (`e2e/seo.spec.ts`, seeded database; CI serves the production build):

- `GET /sitemap.xml`: `200`, an XML content type, contains `<loc>http://localhost:3000/cpu</loc>` and a known product URL, and no `?`, `/search` or `/builder`.
- `GET /robots.txt`: `200`, `text/plain`, contains `Sitemap: http://localhost:3000/sitemap.xml` and no `Disallow: /`.
- The product page has two `application/ld+json` scripts. Parsed, they are a `Product` whose offer has `priceCurrency` `PHP` and an availability URL, and a `BreadcrumbList` whose names match the visible breadcrumb links.
- `link[rel=canonical]` is absolute on `/`, `/cpu`, `/cpu?page=2` (itself) and a product page.
- `og:image` and `twitter:card` are present on home, category and product pages.

## Validating after merge

1. Open Google's [Rich Results Test](https://search.google.com/test/rich-results) with the production URL of four products: one in stock, one on sale, one pre-order and one out of stock.
2. Each should show **Product snippets**, **Merchant listings** and **Breadcrumbs** detected with **no errors**. Under "View tested page", check the price (the sale price when on sale), `PHP` and the availability.
3. Expected **warnings** (non-critical, out of scope): missing `aggregateRating` / `review`, and, for merchant listings, `shippingDetails` and `hasMerchantReturnPolicy`.
4. Cross-check one product in the [Schema Markup Validator](https://validator.schema.org/).
5. `curl` the production `/robots.txt` and `/sitemap.xml`, and open one product link in a link-preview checker to see the default image.

Record the results in the PR or the issue.

## Acceptance criteria

- [ ] `metadataBase` comes from `NEXT_PUBLIC_SITE_URL`; home, category (each paginated page to itself) and product pages have absolute canonicals.
- [ ] Product pages render escaped Product JSON-LD (name, image, brand, SKU, description, offer with effective price in PHP and availability from `getStockStatus`, pre-order included) and a BreadcrumbList that matches the visible breadcrumbs. No ratings or reviews.
- [ ] `sitemap.xml` lists home, non-empty categories and active products with `lastModified`, no filter or search URLs, cached by tag with an hourly backstop.
- [ ] `robots.txt` allows everything and points to the absolute sitemap URL.
- [ ] Home, category and product pages have Open Graph and Twitter tags; a default 1200 × 630 site image exists.
- [ ] Previews send `X-Robots-Tag: noindex` and production doesn't (checked as above).
- [ ] Unit, integration and E2E tests above pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- [ ] The Rich Results Test on production shows no errors (after merge).

## Out of scope

- Google Search Console setup (verification, submitting the sitemap, coverage reports).
- Mobile (Phase 2, as in the PRD).
- Ratings and reviews, shipping and return-policy structured data, `Organization` / `WebSite` (sitelinks search box) JSON-LD.
- Per-product SEO title and description fields (AD-2, Admin epic) and per-product generated OG images.
- `noindex` for the shadcn block pages (`/login`, `/signup`, `/sidebar`); they're not in the sitemap, and their own stories replace them.
- Image sitemaps, `hreflang` (one language).

## Open questions

None.
