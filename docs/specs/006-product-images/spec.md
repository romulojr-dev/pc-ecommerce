# 006 — Product images with placeholders

Status: **Draft** · Issue: #19 · PRD refs: FR-8 (gallery), NFR Performance (Lighthouse ≥ 90, LCP < 2.5 s), Tech stack (Images: Cloudinary, next/image)

## Summary

Every product gets at least one image. We have no product photos, so each builder category gets one original placeholder: a category icon in our theme's neutral colors, stored in the repo. The seed attaches images to products, and a few products get 2–3 images for the gallery story. `ProductImage.url` holds a path, so switching to real images later (e.g. Cloudinary) only changes data. A reusable `ProductImage` component renders images with `next/image` and shows a generic fallback when a product has no image. The `/products` page uses it, so the change is visible now.

## Placeholder images

- **Location:** `public/images/placeholders/`, served at `/images/placeholders/<name>.svg`.
- **One per builder category**, named by category slug. The icons come from `lucide-react` (already a dependency, ISC license):

  | File | Icon |
  | --- | --- |
  | `cpu.svg` | Cpu |
  | `motherboard.svg` | CircuitBoard |
  | `memory.svg` | MemoryStick |
  | `storage.svg` | HardDrive |
  | `gpu.svg` | Gpu |
  | `case.svg` | PcCase |
  | `psu.svg` | PlugZap |
  | `cpu-cooler.svg` | Fan |

- **Two shared extra views** for multi-image products, so gallery thumbnails can be told apart:
  - `box.svg`: Package icon ("in the box")
  - `detail.svg`: ScanSearch icon ("detail view")
- **Artwork:**
  - Square (1:1). The icon is centred, about 40% of the width, with a 2 px-equivalent stroke.
  - Transparent background. The icon is in a mid-gray that reads on both the light and dark `muted` tokens.
  - The neutral background comes from the component (`bg-muted`), so it follows the site's light/dark theme. A background baked into the SVG couldn't follow the theme toggle.
- **Original work only:** generated from the icons, with no product photos or brand logos. The files are committed, along with the small script that generated them, so they can be regenerated.
- **Why SVG:** each file is a few hundred bytes, scales to any size, and needs no optimization. `next/image` serves `.svg` sources as-is, without a config change.

## Seed

- **Default:** every seed part gets one image, its category placeholder: `url: "/images/placeholders/<category>.svg"`, `alt: <product name>`, `sortOrder: 0`. Data files don't repeat this.
- **Override:** a part may set `images: [{ url, alt? }, …]` (1–4 entries) to replace the default. A missing `alt` becomes the product name, with the view appended for extra images (e.g. "Noctua NH-D15 G2 — in the box"). `sortOrder` follows the array order.
- **Multi-image parts:** 5–6 parts across different categories get 2–3 images (category placeholder, then `box`, then `detail`). At least one has exactly 2 and one has exactly 3. This includes "AMD Ryzen 5 7600", the E2E fixture part.
- **Validation** (before any write, like every other field):
  - `url` must be a path starting with `/` or an `https://` URL. Anything else is rejected.
  - A local path must exist under `public/`. This is checked in a unit test, not at seed time: the seed may run where `public/` isn't next to it.
  - `alt` must not be empty.
- **Writes:**
  - The seed adds images only to a product that has **no** images: on create, and on update when the product has none.
  - It never changes or deletes existing images, because once the admin panel exists, images are managed there.
  - This way, re-seeding production adds images to the 60 products that are already there, and a second run adds none.
- **Summary line** gains a count, e.g. `Seeded 8 categories, 27 brands, 60 products (0 created, 60 updated; …), 67 images added.`
- `--reset` already truncates `ProductImage`.

## `ProductImage` component

A server component in `components/product/product-image.tsx`.

- **Props:**
  - `image: { url: string; alt: string } | null`
  - `productName: string`, used for the fallback's label
  - `sizes: string` (required)
  - `className?` for the outer box
  - `loading?: "lazy" | "eager"` (default `"lazy"`)
- **Renders:**
  - A square box (`aspect-square`, `bg-muted`, rounded, `overflow-hidden`, `relative`).
  - Inside it, `next/image` with `fill`, `object-contain`, the given `sizes` and `alt={image.alt}`. The box reserves its space, so there is no layout shift.
- **Why `sizes` is required:** without it, the browser assumes the image is as wide as the viewport (`100vw`) and downloads oversized files. Each caller states the rendered width, e.g. `"48px"` for a table thumbnail.
- **Lazy by default:** `next/image` defaults to lazy loading. A caller whose image is the page's LCP element (the product page, later) passes `loading="eager"`. `priority` is deprecated in Next 16 and is not used.
- **Fallback:** when `image` is `null` (the product has no images), the same box shows a generic ImageOff icon in `muted-foreground`, drawn inline (no network request), with `role="img"` and `aria-label="No image available for <productName>"`.
- **Works for real images later:** `next/image` optimizes raster sources and serves `.svg` as-is. When real images arrive, their host is added to `images.remotePatterns` in `next.config.ts`. That is a config change, not a component change.
- Uses only theme tokens, like the rest of the UI.

## `/products` page

- The query also selects each product's first image (`images` ordered by `sortOrder`, `take: 1`, `url` and `alt`).
- A new first column shows a 48 × 48 thumbnail: `<ProductImage sizes="48px" … />`. The column header is visually hidden ("Image") so the table stays accessible.
- A product with no images shows the fallback in that cell.

## Tests

- **Unit** (Vitest, no database):
  - A part without `images` gets the category placeholder with `alt` = product name.
  - Explicit `images` keep their order and fill in a missing `alt`.
  - A `url` like `images/x.svg` or `http://…` is rejected.
  - An empty `alt` is rejected.
  - Every local image path used by the seed exists under `public/`.
  - Every builder category has a placeholder file.
  - The catalog has 5–6 multi-image parts.
- **E2E** (`/products`): the "AMD Ryzen 5 7600" row contains an image whose accessible name is "AMD Ryzen 5 7600" and that has loaded (`naturalWidth > 0`).
- **By hand on the dev branch:**
  - Delete one product's images → its row shows the fallback with the right label. Re-seed → the image is back.
  - Light and dark themes look right.

## Production re-seed (once, after merge)

Same procedure as spec 004, "Seeding production". Expected: `0 created, 60 updated`, and an images-added count equal to the dev branch's first run. Then `/products` in production shows thumbnails.

## Acceptance criteria

- [ ] One original placeholder per builder category in `public/images/placeholders/`, plus `box` and `detail` views.
- [ ] Every seeded product has at least one `ProductImage`; 5–6 have 2–3.
- [ ] `ProductImage` renders with `next/image`, a caller-set `sizes`, lazy loading by default and the stored alt text; no layout shift.
- [ ] A product with no images shows the labelled fallback.
- [ ] `/products` shows thumbnails.
- [ ] Re-seeding adds images only where none exist; a second run adds none.
- [ ] Unit and E2E tests pass; `pnpm lint` and `pnpm typecheck` pass.
- [ ] Production re-seeded; thumbnails show on the production URL.

## Out of scope

- The gallery UI, zoom and thumbnails strip (product page story, FR-8).
- Uploads and image management (AD-2), Cloudinary or any remote host, `remotePatterns`.
- A fallback for an image URL that fails to load (404). The box keeps its size and the browser shows the alt text, so nothing breaks. A client-side error fallback can come with the gallery.
- Brand logos (`Brand.logoUrl`).

## Open questions

None.
