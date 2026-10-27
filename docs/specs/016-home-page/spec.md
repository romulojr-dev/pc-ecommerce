# 016 — Home page

Status: **Approved** · Issue: #39 · PRD refs: FR-2 (home page; "best sellers" becomes a featured flag until there is order data), FR-5 (a new common filter), NFR Performance (Lighthouse ≥ 90 desktop, LCP < 2.5 s), NFR Accessibility (WCAG 2.1 AA)

## Summary

`/` replaces the template page with six sections in the approved design's order: hero, shop by category, featured products, deals, shop by brand and a trust strip. The page uses the project's existing shadcn theme as it is: no token or font changes. Product cards drop nothing they have today, gain a spec summary line, and never get "Add to cart" yet. A new **On sale** common filter backs "View all deals", and `/builder` becomes a "coming soon" page. The header and footer don't change.

## Theme

The design gives the layout; colors, fonts and radius come strictly from the project's existing shadcn theme. `app/globals.css` and the fonts in `app/layout.tsx` (Geist, Geist Mono) **don't change**. Components use only token classes (`bg-background`, `bg-muted`, `bg-card`, `border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `rounded-lg` …) and the existing type scale, never hex, `oklch()` or new font families. Headings use `font-heading` (Geist). Dark mode comes for free from the theme's `.dark` values.

The design maps onto the tokens like this: page `background`, soft surfaces (hero panel, category icon wells, trust strip) `muted`, product and category tiles `card` with `border`, buttons `primary` (the existing `Button` variants), secondary text `muted-foreground`.

**Contrast with the existing tokens:** `muted-foreground` on a `muted` surface is about 4.3:1, under AA's 4.5:1 for small text. So secondary text never sits on `bg-muted` at small sizes: the trust strip's lines use `text-foreground` (or the items sit on `bg-card` with a border), and checks with axe confirm it in both themes. The theme's focus ring color is unchanged; a site-wide contrast review of the ring is out of scope.

**Nothing else on the site changes look**, apart from the product card's summary line (below).

## Sections

The page is one `<main>` (from the store layout) with one `h1` in the hero. Every other section is a `<section aria-labelledby>` with an `h2`; card and item titles are `h3`. Nothing rotates or moves on its own.

### 1. Hero

- `h1` "Build a PC that just works.", the short text from the design, and two links styled as buttons:
  - **Build your PC** → `/builder`, with a small "Coming soon" text label next to it (the issue asks for the label until the Builder epic). Accessible name: "Build your PC Coming soon", the visible text.
  - **Shop deals** → `#deals`. Smooth scroll only when `prefers-reduced-motion` allows it (CSS `scroll-behavior`). Not rendered when there are no deals.
- **Illustration:** an original inline SVG of a wafer: a circle filled with a die grid (`<pattern>`), a dashed outer ring and three callouts (CPU, GPU, RAM) on chips. Server-rendered, no JavaScript, no network request, no animation or filters, under 10 KB. Strokes and fills use `currentColor` and token classes, so it follows dark mode. Decorative: `aria-hidden="true"`; the callout words are in the SVG, not needed by screen readers. The `h1` text, not the SVG, is the LCP element.

### 2. Shop by category

- The 8 builder categories from `getMenuCategories()` (already cached, `CATEGORIES_TAG`), as a `<ul>` of tiles in a row: icon and name, each a link to `/<slug>`. Names come from the database ("CPU", "Graphics Card"), as in the header menu, not the design's plurals.
- Icons: the same lucide icons as the placeholder images. The slug → icon map moves out of `scripts/generate-placeholders.tsx` into a shared module (`components/catalog/category-icons.ts`) that both use; a top-level category without an icon gets a generic one. Icons are `aria-hidden`.
- No "View all".

### 3. Featured products

- New column `Product.isFeatured Boolean @default(false)` (migration).
- Shows up to **8** products with `isFeatured` and `status: ACTIVE`, ordered by category `sortOrder`, then name. Out-of-stock featured products still show, with their stock label (it's a curated pick; unflag it to remove it).
- **Seed:** a part can have `featured: true`. The seed marks 8: **one per builder category, in stock, not on sale** (so Deals isn't emptied by the no-duplicates rule). A coverage test checks that rule. `isFeatured` is written on create _and_ re-seed, like `name`, so the production re-seed after merge sets it; when the Admin epic manages it, it moves to create-only like `status`. Until production is re-seeded, the section is empty and not rendered.
- No "View all". Not rendered when empty.

### 4. Deals (`id="deals"`)

- **On sale** means `salePrice < price`. A `salePrice` equal to or above `price` is not a deal (the shopper still pays it, per ADR 0004, but nothing is discounted).
- **Which:** `ACTIVE`, on sale, **available** (`stock > 0`; pre-orders count, as in spec 015, and their card says "Pre-order"), and **not among the products shown in Featured**. Up to **8**.
- **Order:** biggest discount first by percentage, `((price - salePrice) * 100) / price` with integer division (the same floor as `discountPercent`, which the product page shows); then the bigger peso saving; then name, then id. Prisma can't order by an expression, so one raw query returns the ids (like `getRelatedProducts`), then a typed `findMany` with `productCardSelect`.
- Cards show the sale price and the struck list price, as the shared card already does. **No discount badge** (the design's "−XX%"): cards stay the same everywhere, consistent with spec 012; the % off stays on the product page only.
- **"View all deals"** → `/search?onSale=1`, built with `listingHref(searchTarget({}), …)`. That page lists every active product on sale, including out-of-stock ones, in the default sort.
- Not rendered when empty (and the hero's "Shop deals" isn't either).

### 5. Shop by brand

- A compact, wrapping `<ul>` of text links: brands with at least one `ACTIVE` product, by name, each to `/search?brand=<slug>` (built with `listingHref`). That page already titles itself with the brand's name.
- No "All brands".

### 6. Trust strip

Four items from the design, each an icon (`aria-hidden`), an `h3` and one line, under a visually hidden `h2` "Why shop with PC Silicon" (keeps the heading order):

| Item                     | Text                                                        |
| ------------------------ | ----------------------------------------------------------- |
| Compatibility-checked    | The PC Builder flags parts that won't fit or work together. |
| Genuine parts            | Brand-new components with manufacturer warranty.            |
| Delivery or store pickup | Ship it to your door or pick it up in store.                |
| Flexible payments        | GCash, Maya, cards, cash on delivery and installments.      |

These replace the issue's wording (authentic, warranty, secure payment, nationwide delivery): warranty is in "Genuine parts", and the payment methods are the PRD's.

## Product cards

The shared `ProductCard` changes everywhere it is used (home, category pages, search, similar products):

- **No "Add to cart"** (comes with Checkout). The card keeps its brand line and stock label, which the design omits.
- **Spec summary line** under the name, e.g. "AM5 · 8 cores · 5.4 GHz boost", one line, muted, truncated with an ellipsis (the full text stays in the DOM for screen readers).
  - `FieldMeta` gains `summary?: { suffix?: string }`. Marked fields appear in metadata order, joined with " · ". Each is `formatSpecValue`'s text, plus the suffix if given. A boolean shows its label when true and is left out when false; a missing optional field is left out. Only scalar fields are marked, and no field that repeats the name (a GPU's chipset). Plain data, no functions, since filter metadata reaches client components.
  - `productCardSelect` gains `specs`; `toProductCardData` builds `summary: string | null` on the server, so the card gets a string and the specs JSON isn't sent to the client.

  | Category      | Summary fields (suffix)                              | Example                                                      |
  | ------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
  | CPU           | socket, cores ("cores"), boostClockMhz ("boost")     | AM5 · 8 cores · 5.4 GHz boost                                |
  | Motherboard   | socket, formFactor, memoryType                       | AM5 · ATX · DDR5                                             |
  | Memory        | capacityGb, memoryType, speedMts                     | 32 GB · DDR5 · 6,000 MT/s                                    |
  | Storage       | capacityGb, interface, formFactor                    | 2 TB · PCIe 4.0 · M.2 2280                                   |
  | Graphics card | vramGb ("VRAM"), boardPowerW                         | 12 GB VRAM · 250 W                                           |
  | Case          | maxGpuLengthMm ("GPU"), maxCoolerHeightMm ("cooler") | 400 mm GPU · 170 mm cooler                                   |
  | Power supply  | wattageW, efficiencyRating, modularity               | 850 W · 80+ Gold · Fully modular                             |
  | CPU cooler    | type, radiatorSizeMm, heightMm                       | AIO · 240 mm (each cooler type has only one of the last two) |

  Examples are illustrative; the exact text is whatever `formatSpecValue` gives.

- **No discount badge** on cards (spec 012 stands); sale cards keep the sale price with the struck "Was" price.
- Home cards use `layout="grid"`, `headingLevel={3}`, `loading="lazy"` (they are below the fold at 1280 × 800; the LCP is the hero text) and `sizes` for 4 columns in the 1280 px container.

## On sale filter

A new common filter through the existing structure (spec 012): `lib/listing-filters/on-sale.ts` (pure), an `onSale` entry in `commonFilters` after `inStock`, its `where` in `lib/listing-filters/server.ts`, and an "On sale" checkbox in the sidebar's Availability group. So category pages and search both get it.

- **URL:** `onSale=1`; anything else is off. Chip: "On sale". Applies instantly, like "In stock only".
- **Condition:** `salePrice < price` with a Prisma field reference (`salePrice: { lt: db.product.fields.price }`); a null `salePrice` never matches. If the adapter rejects field references, the plan falls back to `effectivePrice < price` the same way, or a raw id scope.
- **Search heading:** `/search?onSale=1` with no other filter and no query is titled **"Deals"** (like a single brand), page title "Deals".

## Builder placeholder

`app/(store)/builder/page.tsx`: `h1` "PC Builder", "Coming soon" text saying the guided builder will check socket, power and fit, and a link to shop by category (`/cpu`). Static, `robots: { index: false }`. The header and footer already link to `/builder`, which 404s today; `builder` is already a reserved slug.

## Caching and freshness

The home page is **static with a 10-minute refresh**: no `await connection()`, `export const revalidate = 600`, and its data comes from `unstable_cache` functions in `lib/home.ts` (ADR 0003):

| Data                                                                | Function                       | Tag                             | `revalidate` |
| ------------------------------------------------------------------- | ------------------------------ | ------------------------------- | ------------ |
| Categories                                                          | `getMenuCategories` (existing) | `categories`                    | 1 h          |
| Featured and deals, in one snapshot so the no-duplicates rule holds | `getHomeProducts`              | `products` (new `PRODUCTS_TAG`) | 10 min       |
| Brands with products                                                | `getHomeBrands`                | `products`                      | 10 min       |

- ADR 0003 puts product lists under "per request". The home page is an exception because it is a teaser: every price and stock figure is re-read per request on the product page, listings and (later) cart and checkout, which stay authoritative. ADR 0003's table gets a row for it.
- **Can be briefly stale (up to 10 min, or until a write invalidates `products`):** prices and sale prices on cards, stock labels (a deal can show "In stock" after selling out), which products are featured or in deals, and the brand list. `today` for pre-order labels is computed at render, so it can be up to 10 minutes late around midnight. Categories as before (1 h).
- **Invalidation duty:** any app write to products or brands (Admin epic, and orders when they change stock) calls `revalidateTag(PRODUCTS_TAG, "max")`. The seed can't, so after a re-seed the home page catches up within 10 minutes.
- `pnpm build` prerenders `/` from the database, which Vercel and CI already provide (CI seeds before building).

## Performance and accessibility

- **Lighthouse desktop ≥ 90** for Performance and Accessibility on `/`, measured on the Vercel preview before merging; scores go in the PR. LCP < 2.5 s.
- No client components on the page except what the header already has; no carousels; images lazy; fonts via `next/font` as today.
- Keyboard: every tile, card, brand and button is a native link in reading order with the theme's focus ring. axe shows no violations, light and dark.

## Tests

**Integration** (`lib/home.db.test.ts`, fixtures inserted by the test):

- **Featured:** only `isFeatured` and `ACTIVE`; at most 8 (with 9 flagged); category order, then name.
- **Deals:** only `salePrice < price` (not null, not equal, not above); only available (`stock > 0`; a pre-order counts, out-of-stock doesn't); only `ACTIVE`; ordered by discount %, then peso saving, then name; at most 8.
- **No duplicates:** a product both featured and on sale appears only in Featured, and the next deal fills its slot; with 9 flagged, the 9th (not shown) may appear in Deals.
- **Brands:** only brands with an `ACTIVE` product, by name.
- **On sale filter** (in `lib/listing-filters/server.db.test.ts`): matches only `salePrice < price`; combines with brand and in stock; its count among the options applies the other filters.

**Unit:** the on-sale filter's parse, serialize and chip; the summary line per category (suffixes, booleans, missing optional fields, cooler union); `isFeatured` seed coverage (one per builder category, in stock, not on sale).

**E2E** (`e2e/home.spec.ts`, role-based locators, seeded database):

- `/` has the `h1` and regions "Shop by category", "Featured products", "Deals", "Shop by brand" and the trust strip, in that order.
- A category tile opens its listing; a featured card opens its product page; a brand link lands on `/search?brand=<slug>` titled with the brand.
- "Shop deals" moves to `#deals`; "Build your PC" opens `/builder` showing "Coming soon".
- "View all deals" lands on `/search?onSale=1`, headed "Deals", and every card shows a struck "Was" price.
- On `/cpu`, cards show a summary line.

## Changes to existing code

`app/(store)/page.tsx`, new `components/home/*`, `ProductCard`, `lib/products.ts` (`specs` in the select, `summary` in card data), `lib/specs` (`summary` metadata, summary formatter), `lib/listing-filters` (on sale), the filter sidebar, the search page heading, `prisma/schema.prisma` + migration, the seed (part schema, writer, data, coverage test), `scripts/generate-placeholders.tsx` (shared icon map), ADR 0003 (table row), `CLAUDE.md` (home page, `PRODUCTS_TAG`, `/builder`, card summary).

## Acceptance criteria

- [ ] The page uses only the existing shadcn theme tokens and fonts (no changes to `globals.css` or the fonts, no hard-coded colors); text contrast meets AA in light and dark.
- [ ] Hero with "Build your PC" (to `/builder`, labelled coming soon) and "Shop deals" (to `#deals`); inline SVG illustration that isn't the LCP.
- [ ] Shop by category (8 tiles from the database), Featured (flagged products), Deals (on sale, available, biggest discount first, no duplicates with Featured, "View all deals"), Shop by brand and the trust strip, in that order; empty product sections are hidden.
- [ ] Product cards show a spec summary line everywhere, no discount badge and no "Add to cart".
- [ ] "On sale" filter on category pages and search; `/search?onSale=1` is titled "Deals".
- [ ] Home page is static with a 10-minute refresh and tagged caches per ADR 0003.
- [ ] Lighthouse desktop ≥ 90 (performance and accessibility) on the Vercel preview.
- [ ] Integration, unit and E2E tests above pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- [ ] After merge: `pnpm db:seed` run once on production to set the featured products.

## Out of scope

Header and footer redesign; add to cart; the PC Builder itself; deal-alert emails (the footer form stays as is); mobile layout; a "biggest discount" sort on search; real best sellers (needs orders).

## Open questions

None.
