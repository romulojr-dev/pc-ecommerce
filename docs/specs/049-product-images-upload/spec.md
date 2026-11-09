# 049 — Product images: upload, order and remove

Status: **Approved with changes** (review of 2026-11-09, see "Review resolutions" in §10) · Issue: [#114](https://github.com/romulojr-dev/pc-ecommerce/issues/114) · PRD refs: AD-2 (images upload), FR-8 (gallery), Tech stack (Images: Vercel Blob through a server upload route, next/image), NFR Accessibility (alt text), NFR Security (role checks on every admin route) · Depends on: [spec 045](../045-admin-products-create-edit/spec.md) (#112), [spec 040](../040-admin-permissions-audit-masking/spec.md), [spec 047](../047-admin-audit-log-view/spec.md) · Builds on: [spec 006](../006-product-images/spec.md), [spec 010](../010-product-page/spec.md), [spec 017](../017-seo/spec.md)

## 1. Summary

The owner uploads real photos for a product on its Admin page, through a server route (`POST /api/admin/images`) that checks the bytes, re-encodes the photo (WebP, at most 2000 px, metadata stripped) and stores the file in Vercel Blob, then sets the main image, reorders, edits alt text and removes images. Real images replace the category placeholder on the card, gallery, cart, builder and shared-build pages and in link previews; a product without real images shows its placeholder, which is no longer a stored row. The owner uploads every photo by hand, once, on production (no import script), so the Admin product list gains a "no photos yet" filter and a "next product without photos" link, and the footer says the images are for illustration.

## 2. Behavior

### Who sees and does what

1. **Owner** has the Images section on `/admin/products/[id]` with every control. **Demo** sees the same section (thumbnails, alt text, order) with every control disabled and the read-only note, like the product form. **Staff** has no Products screen (spec 045), so no Images section. All writes are `images.write` (Owner only, already in the permissions table).
2. The Images section is on the edit page only, below the product form. `/admin/products/new` creates the draft first (spec 045); its "saved" page then shows the section. Uploading to a draft is allowed.

### The Images section (`/admin/products/[id]`)

3. **No real images:** the section shows the category placeholder in a dashed box with "No photos yet. The store shows the {category} placeholder until you add one." and the upload control.
4. **With images:** a vertical list in display order. Each row: a 96 px thumbnail, a "Main image" badge on the first row, the alt text field, and the buttons **Move up**, **Move down**, **Make main image** and **Remove**. The first row has no Move up and no Make main image; the last row has no Move down. A single image is the main image automatically and shows only the badge, the alt field and Remove.
5. **Upload control:** a labelled file input, "Add photos", that accepts several files at once (`accept="image/jpeg,image/png,image/webp"`, a hint only; the server decides). Under it: "JPEG, PNG or WebP, up to 4 MB each. Up to 8 photos per product."
6. **Uploading:** the browser sends **one request per file**, one after another, in the order the files were selected (each request stays under Vercel's 4.5 MB body limit). While it runs, the control is disabled and a progress line reads "Uploading 2 of 3…". Each file's result is listed under the control: "{filename} added." or "{filename}: {reason}". A refused file doesn't stop the next one. When every request has finished, the page refreshes and the new images appear at the end of the list, in selection order.
7. **Before sending**, the browser refuses files it can already see are wrong (over 4 MB, or more files than the room left) with the same messages the server gives, so a hopeless request isn't sent. The server checks everything again.
8. **After at least one successful upload**, a result box shows "Photos added." and, when another product still has no real images, a link **Next product without photos: {name}** to that product's edit page. When none is left it says "Every product now has a photo."
9. **Alt text:** each new image's alt text is the product's name at upload time. The field is editable; **Save alt text** appears when the value changes. Saved: "Alt text saved." Empty or too long: the field error, nothing saved.
10. **Make main image** moves that image to the first position; the others keep their order behind it. **Move up / Move down** swap it with its neighbour. Each is saved at once (no separate Save); the list refreshes with focus kept on the moved image's row.
11. **Remove** asks first: dialog "Remove this photo?" with the thumbnail, "It is deleted from the store's storage and can't be restored." and **Remove photo** / **Cancel**. Removing the last real image adds "The store will show the {category} placeholder again." to the dialog. After removal the store shows the next image as main, or the placeholder when none is left.
12. **Stale screen:** if the images changed in another tab since the page loaded (a reorder, a removal, an upload), a reorder or removal is refused with "These photos changed since you opened the page. Reload to see the current ones." and a **Reload** button. Alt text saves are not refused by other images' changes (they name one image).
13. **Loading:** the edit page has no `loading.tsx` (a bad id keeps its 404, spec 045); buttons show their pending state and are disabled while a request is in flight. **Error:** an unexpected failure shows "Something went wrong. Try again." and writes nothing.

### The upload route

14. `POST /api/admin/images?kind=product&id={productId}` with the file as the raw request body (not multipart) and the original filename in an `X-Filename` header (used only in the answer, never stored). It is built with `adminRoute("images.write", …)`, so the origin check, the session and `can()` run **before the body is read**: Demo gets 403 "This account is read-only" and no byte of the file is read; no session is 401.
15. Then, in order, stopping at the first failure (no write for any of them): the query (`kind` must be `product`, `id` a cuid shape) → `Content-Length` present and at most 4 MB (413 when over, read from the header before the body) → the body read with a hard 4 MB cap (a body longer than its header said is cut off and refused the same way) → the file type from its **first bytes** → the product exists (any status) → the product has fewer than 8 real images → **re-encode** (R19: decode with a 40-megapixel limit, apply the EXIF orientation, shrink to at most 2000 px on the long side without enlarging, drop all metadata, encode as WebP) → the store upload → one transaction → after the commit, `revalidateTag(PRODUCTS_TAG, "max")`. A file that passes the byte check but can't be decoded, or is over the pixel limit, is refused before anything is stored.
16. The **store upload runs outside any transaction, before the row write**. The file is stored under a random name `products/{22 random base64url chars}.webp` (always WebP after re-encoding); the filename the owner gave is never part of it. The transaction locks the product row, re-checks that it exists and that the 8-image cap still holds, inserts the `ProductImage` at the end (`sortOrder` = current maximum + 1), alt = the product's name, and writes the audit row. If the transaction refuses or fails, the just-stored file is deleted best-effort after the rollback (logged on failure).
17. The answer is JSON: `201 { ok: true, image: { id, url, alt } }`, or `{ ok: false, error, message }` with 400 (bad query, wrong type, unreadable or too many pixels), 404 (no such product), 409 (cap reached), 413 (too large), 502 (the store failed) or 500.

### The storefront

18. **The image a product shows** is one rule, used everywhere: its real images in `sortOrder` order, or, with none, its category's placeholder (`/images/placeholders/{category}.svg`, alt = the product name). The `ImageOff` fallback stays only where no category is known (a retired part on a shared build, spec 022).
19. **Product page gallery:** several real images keep spec 010's main image, thumbnails, arrows in the dialog and "n of m" counter. **One real image shows no thumbnail strip, no arrows and no counter**, only the main image and Enlarge image. **The placeholder** shows as a plain image with no Enlarge image button (enlarging an icon helps nobody).
20. **Card, cart line, cart build group, builder part summary and shared build:** the main image (first real image) or the placeholder, at the sizes they already use.
21. **Link previews:** `socialMetadata` already uses a raster image and falls back for SVG; the product page passes the main real image, so a product with a photo gets it as `og:image` and the placeholder still falls back to the default PNG. Product JSON-LD's `image` lists the real images, or the placeholder.
22. **Footer:** a line under the copyright, "PC Silicon is a demo store. Product images are for illustration.", on every store page.

### The Admin product list (`/admin/products`)

23. A new filter **Photos**: "Any" (default) or "No photos yet" (`photos=missing`), products with no real image, any status. It combines with search, category and status, goes through `products-params` like the other filters (canonical URL, page reset), and each row of the list gains a small thumbnail (main image or placeholder) so the owner can scan for gaps.
24. "Next product without photos" (B8) is the first product in this filter's order (the list's own order, `updatedAt` desc then `id` desc) that isn't the current one, so it walks the same queue the owner sees on the list.

### The seed

25. The seed stops writing image rows (the placeholder is derived, B18), so it can never bring a placeholder back after the owner removes every image, and never touches a real image. Seed parts lose their `images` override, and the five or six multi-image placeholder parts of spec 006 go with it. A migration deletes the existing placeholder rows (`url` starting `/images/placeholders/`) on every database, which changes nothing on the storefront because the same placeholder is now derived.

## 3. Examples

Product names are seed parts. "Real image" means a stored Blob image; "fake" means `IMAGE_STORAGE=fake`.

### Upload

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| E1 | Owner; "AMD Ryzen 5 7600" has no real images | Uploads `ryzen.jpg` (1.8 MB, starts `FF D8 FF`) | 201; one `ProductImage` with `sortOrder` 0, alt "AMD Ryzen 5 7600", url `…/products/{random}.webp` (WebP bytes); one audit row `product` / `image-added`; `PRODUCTS_TAG` revalidated; the product page shows the photo as the main image with no thumbnails, arrows or counter |
| E2 | Owner; the same product, now with 1 image | Selects `box.png`, `side.webp` together | Two requests in that order; images 2 and 3 with `sortOrder` 1 and 2; "box.png added.", "side.webp added."; the gallery now has thumbnails and "1 of 3" in the dialog |
| E3 | Demo | `POST /api/admin/images?kind=product&id=…` with a 3 MB body | 403 "This account is read-only"; the body stream is never read (test asserts no read); no Blob call, no row, no audit |
| E4 | Signed out | Same request | 401; nothing read |
| E5 | Owner, `Origin: https://evil.example` | Same request | 403 origin; nothing read |
| E6 | Owner | Uploads `logo.svg` (text `<svg …`) declared `image/png` | 400 "logo.svg: Only JPEG, PNG and WebP photos can be uploaded."; no Blob call |
| E7 | Owner | Uploads `photo.jpg` whose bytes are a PNG | Accepted; the bytes decide, not the name; stored as `{random}.webp` like every upload |
| E8 | Owner | Uploads `doc.pdf` renamed `doc.jpg` (`%PDF`) | 400, same message as E6 |
| E9 | Owner | `Content-Length: 4194305` (4 MB + 1 byte) | 413 "{filename} is larger than 4 MB."; body not read |
| E10 | Owner | `Content-Length: 4194304` exactly, valid JPEG | Accepted (4 MB itself is allowed) |
| E11 | Owner | Header says 1 MB, body streams 5 MB | Reading stops at 4 MB + 1 byte; 413; no Blob call |
| E12 | Owner; "Noctua NH-D15 G2" has 8 real images | Uploads one more | Browser refuses before sending: "This product already has 8 photos. Remove one to add another."; a hand-made request gets 409, same message, no Blob call |
| E13 | Owner; 7 images; two tabs upload at once | Both pass the pre-check | Both store their files; the transactions serialize on the product lock; the second finds 8 and refuses 409; its file is deleted after the rollback; the product has exactly 8 |
| E14 | Owner | `id` of a product that doesn't exist | 404 "This product doesn't exist."; no Blob call |
| E15 | Owner | Blob answers 503 | 502 "The photo couldn't be stored. Try again."; no row, no audit |
| E16 | Owner; Blob stored the file, then the transaction fails on a database error | Upload | 500; row and audit roll back together; the stored file is deleted best-effort; a failed delete logs `image.delete_failed` with the image path only |
| E17 | Owner, `kind=brand` | Upload | 400 "Unknown upload target." until #115 adds brands (D9) |
| E46 | Owner | Uploads a 3000 × 2000 JPEG | Stored WebP is 2000 × 1333 |
| E47 | Owner | Uploads an 800 × 600 PNG | Stored WebP is 800 × 600 (never enlarged) |
| E48 | Owner | Uploads a JPEG with EXIF orientation 6 (rotate 90°) and GPS tags | Stored image is upright (the rotation applied) and has no EXIF, GPS or other metadata |
| E49 | Owner | Uploads a PNG of 8000 × 6000 (48 megapixels) that is under 4 MB | 400 "{filename} has too many pixels (the limit is 40 megapixels)."; refused before decoding the pixels; no Blob call |
| E50 | Owner | Uploads a file that starts `FF D8 FF` but is cut off or garbage after | 400 "{filename} couldn't be read as a photo."; no Blob call |
| E51 | Owner | Uploads an animated WebP of 5 frames | Accepted; the stored image is a single still image, the first frame (D15) |
| E18 | Owner; "ASUS Dual GeForce RTX 4060 OC Edition 8GB" is a draft | Upload | Accepted; the store doesn't show drafts, so nothing changes there |

### Manage

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| E19 | Ryzen has A (main), B, C | Make main image on C | Order C, A, B; one audit row `images-reordered` with before `[A,B,C]` after `[C,A,B]` (ids); `updateTag(PRODUCTS_TAG)`; card and gallery show C |
| E20 | Order C, A, B | Move down on A | C, B, A |
| E21 | Order C, A, B; tab 2 removed B | Tab 1 clicks Move up on A (sends its list `[C,A,B]`) | Refused stale; "These photos changed…" with Reload; no write, no audit |
| E22 | A has alt "AMD Ryzen 5 7600" | Changes it to "AMD Ryzen 5 7600 in its retail box" and saves | Saved; audit `image-alt-changed` with before and after alt; the gallery's `alt` and the dialog title change |
| E23 | — | Saves alt "   " | Field error "Describe the photo for people who can't see it."; nothing saved |
| E24 | — | Saves alt of 201 characters | Field error "Keep it under 200 characters."; nothing saved |
| E25 | C, B, A | Removes B, confirms | Row deleted, audit `image-removed` (url, alt); after the commit the Blob file is deleted; C, A remain with C main |
| E26 | Only A left | Removes A | The dialog warns about the placeholder; after removal the card, gallery and cart show the CPU placeholder; the Admin list's "No photos yet" filter includes Ryzen again; `og:image` is the default PNG |
| E27 | Blob delete fails after the commit | Remove | The removal succeeds for the owner; a JSON log line `image.delete_failed` with the stored path and a code; no error shown |
| E28 | Demo | Calls the reorder, alt and remove actions by hand | "This account is read-only"; no read beyond the session, no write (spec 040 enumeration test) |
| E29 | Owner | Removes an image id that belongs to another product | Refused as stale (the image isn't in this product's list); nothing written |

### Storefront, list, seed, footer

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| E30 | "Intel Core i5-14400F" has no real images | Opens its card, page, cart line | CPU placeholder everywhere, alt "Intel Core i5-14400F"; the gallery has no Enlarge image; `og:image` is `og-default.png` |
| E31 | Ryzen has one real WebP | Shares a build containing it, opens `/builds/{slug}` | The part row shows the photo |
| E32 | Ryzen has one real image; a retired part in the same shared build | `/builds/{slug}` | Ryzen shows its photo, the retired part shows the `ImageOff` fallback (no category known, spec 022) |
| E33 | 150 seed products, 3 with photos | `/admin/products?photos=missing` | 147 rows, 25 per page; each row thumbnail is its placeholder |
| E34 | Owner uploads to the first product in that list | After the upload | "Next product without photos: {second product's name}" links to it |
| E35 | Owner uploads to the last product without photos | After the upload | "Every product now has a photo." and no link |
| E36 | `/admin/products?photos=yes` | — | Redirects to `/admin/products` (bad value is the default, non-canonical) |
| E37 | Production with placeholder rows, owner has added real images to 10 products | Migration runs, then `pnpm db:seed` | Every `/images/placeholders/…` row is gone; the 10 products keep their real images; the seed writes no image rows; the storefront looks the same for the other 140 |
| E38 | Owner removed every image of Ryzen | `pnpm db:seed` again | Ryzen still has no image rows (placeholder shown); summary line has no "images added" count |
| E39 | Any store page | — | The footer shows "PC Silicon is a demo store. Product images are for illustration." |

### Environment

| # | Given | Expected at startup |
| --- | --- | --- |
| E40 | `IMAGE_STORAGE` unset | Fails: "IMAGE_STORAGE is not set" |
| E41 | `IMAGE_STORAGE=fake`, `VERCEL_ENV=production` | Fails: "IMAGE_STORAGE must be blob in production" |
| E42 | `IMAGE_STORAGE=blob`, no `BLOB_READ_WRITE_TOKEN` | Fails: "BLOB_READ_WRITE_TOKEN is not set" |
| E43 | `IMAGE_STORAGE=blob`, token for store `abc123`, no `BLOB_PRODUCTION_HOST` | `images.remotePatterns` is exactly `https://abc123.public.blob.vercel-storage.com/products/**` |
| E43b | The same, with `BLOB_PRODUCTION_HOST=prod9.public.blob.vercel-storage.com` | The patterns list both hosts, `/products/**` only (D7) |
| E43c | `BLOB_PRODUCTION_HOST=evil.example.com` | Fails at startup: "BLOB_PRODUCTION_HOST must be a Vercel Blob host" |
| E44 | `IMAGE_STORAGE=fake` (local, CI) | Uploads are stored in `FakeStoredImage` and served from `/test-images/{name}`; no Blob call; `remotePatterns` has no Blob host |
| E45 | `IMAGE_STORAGE=blob` (or any value other than `fake`), request to `/test-images/x.webp` | 404 whatever the table holds |
| E52 | A preview whose database came from production; owner removes an image whose URL is on production's Blob host | The row is removed; the file is **not** deleted (not this environment's store); one `image.delete_skipped` log line |
| E53 | A product's photo is removed | No order item, cart line, build snapshot or email holds its URL (checked below, R6), so the file is deleted after the commit |

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| `POST /api/admin/images` with `adminRoute`; Demo rejected before bytes are read | B14, E3–E5, R1 |
| JPEG, PNG, WebP by bytes; SVG refused; 4 MB cap with a clear error | B15, E6–E11, R2, R3 |
| Random filenames; store upload outside any transaction, before the row write | B16, E1, E7, E13, R5 |
| `IMAGE_STORAGE` `blob` / `fake`, required, Production refuses `fake`; CI and E2E use the fake | E40–E45, R12 |
| `remotePatterns` lists only our Blob host; alt text required | E43, R11, E23, R7 |
| Reorder, set main, remove; placeholder only while no real images | B10, B11, B18, E19–E26, R8 |
| Card, gallery, cart, shared-build pages and `socialMetadata` | B18–B21, E26, E30–E32 |
| Remove deletes the file best-effort after the commit, logs a failure | B11, E25, E27, R6 |
| One Blob store per environment, else a path prefix | R13, D6 |
| Hobby limits recorded in the spec or an ADR | §6 "Hosting limits", D12 |
| Writes invalidate `PRODUCTS_TAG` (`revalidateTag` in the route, `updateTag` in actions) | B15, E1, E19, R10 |
| Brand logos use the same route (#115) | B14, E17, D9 |
| (Review) Re-encode: 2000 px, no metadata, WebP, 40 MP limit, animated rule | R19, D15, E46–E51 |
| (Review) Deletion only from our own store; snapshots checked | R6, D16, E52, E53 |
| (Review) `/test-images` 404 unless fake; orphan accepted; tag invalidation | R14, R6, R20, E45 |
| Seed image writes become create-only; CLAUDE.md and specs 001/045 updated | B25, E37, E38, D2 |
| `adminAction`, audit in the same transaction, `can()` action, demo-rejection enumeration | B1, E3, E28, R9 |
| No network call inside a transaction | B16, E13, E16, E27, R5 |
| (Decided) Single image: no strip, arrows or counter; main automatically | B4, B19, E1 |
| (Decided) Several files at once | B5, B6, E2 |
| (Decided) Alt defaults to the product name, editable | B9, E1, E22 |
| (Decided) "No photos yet" filter, "next product without photos" link | B23, B24, E33–E36 |
| (Decided) Removing the last real image brings the placeholder back | B11, E26 |
| (Decided) Footer line | B22, E39 |

## 4. Rules and edge cases

- **R1 Order of checks.** Origin, session and `can("images.write")` come before anything reads the body (the guard already does this; a test passes a body whose stream fails the test if read). The query is checked before `Content-Length`, and `Content-Length` before the body.
- **R2 Type by bytes.** JPEG: `FF D8 FF`. PNG: `89 50 4E 47 0D 0A 1A 0A`. WebP: `RIFF` at 0 and `WEBP` at 8. Anything else, SVG and GIF included, is refused. The `Content-Type` header and the filename are ignored for the decision. The stored file is always the re-encoded WebP (`image/webp`, `.webp`), whatever was uploaded.
- **R3 Size.** At most 4,194,304 bytes; a missing `Content-Length` is 411 "Length required" (a browser `fetch` with a `File` body always sends it). An empty body is refused as the wrong type.
- **R4 Cap.** At most 8 real images per product (D4), checked before the upload (to spare an upload operation) and again under the product lock.
- **R5 No network call in a transaction.** The Blob `put` runs before the transaction; Blob `del` runs after the commit (remove) or after the rollback (failed upload). The integration tests use `guardTransactions` from `test-support/release.ts` around the storage adapter.
- **R6 Deleting files.** Best-effort, after the commit, never fails the request; a failure is one JSON log line (`image.delete_failed`, path, code). **Only a file on this environment's own store is deleted**: the URL's host must equal the host derived from this environment's token (the fake: a `/test-images/` URL). Any other host (production's store seen from a preview) is skipped with one log line (`image.delete_skipped`, host, code `other-store`), so a preview can never delete production's files. **Why deletion stays:** verified in the repo, no `OrderItem`, `CartItem`, `Build`/`BuildItem`, email template or outbox row stores an image URL or name (they hold product ids and name/price snapshots; emails draw no images), so no snapshot can point at a deleted file. The audit row of a removal does keep the URL as text; it is never drawn as an image. If a later story ever stores an image URL in a snapshot, deletion must be reviewed (skip those files or drop deletion) in that story. **A crash between the store upload and the transaction leaves an orphaned file; this is accepted**: it costs storage only, nothing reads it, and there is no cleanup job (out of scope); the same goes for a failed best-effort delete.
- **R7 Alt text.** Trimmed, 1–200 characters, required on every row (the column stays `NOT NULL`; a migration CHECK `length(trim(alt)) > 0`). The default at upload is the product name (at most 200 characters already, spec 045). Renaming a product later doesn't change existing alt texts (they are the owner's words once saved).
- **R8 Order.** `sortOrder` is a dense 0…n−1 after every reorder and removal (a removal renumbers the rest in the same transaction). The main image is `sortOrder` 0. A reorder sends the full ordered id list it showed; it is refused as stale unless it is exactly the product's current ids in some order. Remove sends the image id and the list it showed, with the same stale rule. Every image write locks the product row (`FOR UPDATE`) first, so uploads, reorders and removals of one product serialize.
- **R9 Admin rules.** Reorder, set main (a reorder with the image moved first), alt and remove are server actions built with `adminAction("images.write", …)`; the upload is `adminRoute("images.write", …)`. Each writes its audit row in the same `adminTransaction`. The audit coverage test and its fixtures are extended to cover the route (it refuses any `app/api/admin` route today). Image writes never change `Product.editVersion` or `updatedAt`, so an open product form isn't made stale.
- **R10 Cache.** The route calls `revalidateTag(PRODUCTS_TAG, "max")` after the commit; the actions call `updateTag(PRODUCTS_TAG)` after a saved result. Refusals invalidate nothing.
- **R11 Hosts.** `images.remotePatterns` is built in `next.config.ts` from the environment: the store host derived from `BLOB_READ_WRITE_TOKEN` (`vercel_blob_rw_{storeId}_…` → `{storeId}.public.blob.vercel-storage.com`), path `/products/**`, plus `BLOB_PRODUCTION_HOST` when it is set (D7). No wildcard host. `ProductImage.url` is written only by the route, so it is always on one of those hosts or the fake path.
- **R12 Environment.** `IMAGE_STORAGE` (`blob` | `fake`) is required with no default; `fake` with `VERCEL_ENV=production` is refused; `blob` needs `BLOB_READ_WRITE_TOKEN`. The rules live in `lib/images/env-schema.ts`, joined in `lib/env.ts`'s final schema like the payment and email schemas, and `.env.example` lists both. `vitest.db.config.ts`, CI and local runs use `fake`; Preview and Production use `blob`.
- **R13 One store per environment.** Production and Preview each connect their own Blob store (Hobby has no store limit now, see §6), so a preview's uploads never land in production's store. Local runs use `fake`; a developer who wants to try real Blob locally connects a third, development store. A path prefix per environment is the fallback only if a store can't be scoped to one environment.
- **R14 The fake.** Stores the bytes, type and name in a `FakeStoredImage` table and serves them from `GET /test-images/{name}` with the stored content type and `Cache-Control: public, max-age=31536000, immutable`; **a 404 unless `IMAGE_STORAGE=fake`**, and for an unknown name. `test-images` becomes a reserved slug. `resetCatalog()` and `--reset` name `FakeStoredImage`.
- **R15 Retired and draft products.** Images can be managed for any status. A retired product's images stay (carts and builds still show it as "No longer sold").
- **R16 Category change of a draft** (spec 045) changes its placeholder; real images stay.
- **R19 Re-encoding.** Every accepted upload is decoded and re-encoded by `sharp` before storing: input pixel limit 40,000,000 (`limitInputPixels`, so an oversized image is refused from its header, before the pixels are decoded); EXIF orientation applied; resized to fit 2000 × 2000 without enlarging; **no metadata kept** (EXIF, GPS, ICC, XMP: sharp's default, tested); WebP quality 80. Only the first frame of an animated input is kept (D15). Any decoder error is "couldn't be read as a photo". The 4 MB cap applies to the upload, not to the stored file. The stored image's `alt` and order are unaffected.
- **R20 Cache tag.** Every photo change invalidates `PRODUCTS_TAG`: `revalidateTag(PRODUCTS_TAG, "max")` in the route after the commit and `updateTag(PRODUCTS_TAG)` in the server actions after a saved result (same as R10; stated again because the home page, listings and the sitemap all read the tag).
- **R17 Image optimization budget.** Uploaded files are never renamed or overwritten, so the optimizer's cache never needs to be refreshed: `images.minimumCacheTTL` is 31 days and `images.formats` is WebP only, so each (image, width) is one transformation (D11).
- **R18 Gallery state.** A gallery receives its images in order; with one image it renders no strip, arrows or counter even when the dialog is open; the placeholder is rendered by the same `ProductImage` box without the dialog trigger.

## 5. Messages and copy

Admin, Images section:

- Heading: "Photos"
- Empty: "No photos yet. The store shows the {category} placeholder until you add one."
- Upload label: "Add photos"
- Hint: "JPEG, PNG or WebP, up to 4 MB each. Up to 8 photos per product."
- Progress: "Uploading {n} of {total}…"
- Per file, success: "{filename} added."
- Per file, refused: "{filename}: {reason}"
- Reasons: "Only JPEG, PNG and WebP photos can be uploaded." · "It is larger than 4 MB." · "It has too many pixels (the limit is 40 megapixels)." · "It couldn't be read as a photo." · "This product already has 8 photos. Remove one to add another." · "This product doesn't exist." · "The photo couldn't be stored. Try again." · "Something went wrong. Try again."
- Browser pre-check, too many: "You can add {room} more photo(s) to this product." (`{room}` 0 reads "This product already has 8 photos. Remove one to add another.")
- After an upload: "Photos added." · "Next product without photos: {name}" · "Every product now has a photo."
- Badge: "Main image"
- Buttons: "Move up", "Move down", "Make main image", "Remove", "Save alt text"; accessible names add the position, e.g. "Move photo 2 up"
- Alt field label: "Alt text"; help: "Describe the photo for shoppers who use a screen reader."
- Alt errors: "Describe the photo for people who can't see it." · "Keep it under 200 characters."
- Alt saved: "Alt text saved."
- Remove dialog: title "Remove this photo?"; body "It is deleted from the store's storage and can't be restored."; last image adds "The store will show the {category} placeholder again."; buttons "Remove photo", "Cancel"
- Removed: "Photo removed."
- Reordered: announced in the section's `aria-live` region as "Photo moved to position {n}." / "Main image changed."
- Stale: "These photos changed since you opened the page. Reload to see the current ones." with "Reload"
- Demo note: the product form's existing read-only note.

Admin, product list:

- Filter label "Photos"; options "Any", "No photos yet"
- Filter chip: "No photos yet"
- Thumbnail column header (visually hidden): "Photo"

Route-only answers (JSON `message`): "Unknown upload target." · "Length required." plus the reasons above, the guard's existing denial messages.

Storefront:

- Footer: "PC Silicon is a demo store. Product images are for illustration."

Audit labels (spec 047 registry): actions "Photo added", "Photo removed", "Photos reordered", "Alt text changed".

Logs (JSON lines, no URLs with tokens, no bodies, no filenames from the owner): `image.upload` (outcome, product id, code), `image.delete_failed` (stored path, code), `image.delete_skipped` (host, code `other-store`).

## 6. Data and interfaces

### Schema

- `ProductImage` keeps `id`, `url`, `alt`, `sortOrder`, `productId`; gains `createdAt`. Migration CHECKs: `length(trim(alt)) BETWEEN 1 AND 200`, `sortOrder >= 0`. The index on `(productId, sortOrder)` is **not unique**: serialization comes from the product row lock (R8), so a renumbering is a plain `UPDATE` (decided in the plan).
- The same migration deletes only rows whose `url` starts with `/images/placeholders/` and reports the count (`RAISE NOTICE`, visible in the `migrate deploy` output). Nothing refers to those rows: `ProductImage` has a foreign key to `Product` only, and no order item, cart line, build snapshot or email stores an image URL (verified). A test proves a real image row (an `https://` Blob URL) survives.
- `FakeStoredImage` (`name` unique, `contentType`, `bytes` bytea, `createdAt`). Never used when `IMAGE_STORAGE=blob`.
- No change to `Product`. No change to `Brand` (#115 writes `logoUrl`).

### Modules (behavior level)

- `ImageStorage` (provider-neutral, like `PaymentGateway` and `EmailTransport`): `put(path, bytes, contentType) → { url }` and `delete(url)`; `blobStorage` (Vercel Blob, `addRandomSuffix: false` since the name is already random, `access: "public"`, a timeout) and `fakeStorage`. `imageStorage()` picks one from `IMAGE_STORAGE`.
- `reencodeImage(bytes) → { bytes, width, height } | "too-many-pixels" | "unreadable"` (`sharp`; R19).
- `detectImageType(firstBytes) → "jpeg" | "png" | "webp" | null` (pure).
- `readCappedBody(request, maxBytes) → bytes | "too-large"` reads at most `maxBytes + 1`.
- `displayImages(images, categorySlug, productName)` (pure, `lib/products` or `lib/images`): the real images, or `[placeholder]` with a `placeholder: true` flag; `mainImage` is its first. Used by every storefront read listed in B20 and by the gallery.
- `addProductImage`, `reorderProductImages(actor, { productId, order })`, `setMainImage` (reorder input built from it), `setImageAlt(actor, { imageId, alt })`, `removeProductImage(actor, { productId, imageId, shown })` in `lib/admin/images/`; results `saved` | `stale` | `invalid` | `not-found`.
- `nextProductWithoutPhotos(role, currentId) → { id, name } | null`.
- `products-params` gains `photos: "missing" | null`; `listProducts` filters `images: { none: {} }` and selects the main image.
- `lib/images/env-schema.ts`: `imageStorageSchema`, `imageEnvIssues(values)`, `blobHostOf(token)`, `blobProductionHostSchema` (optional `BLOB_PRODUCTION_HOST`, must match `{id}.public.blob.vercel-storage.com`).
- New dependencies: `sharp` (direct; it is only a transitive dependency of Next today) and `@vercel/blob`. Environment: `IMAGE_STORAGE`, `BLOB_READ_WRITE_TOKEN` (Blob only), optional `BLOB_PRODUCTION_HOST` (set it on Preview only when the preview databases are branched from production).

### Routes

- `POST /api/admin/images?kind=product&id=` (B14–B17).
- `GET /test-images/[name]` (fake only).
- Server actions in `app/admin/(shell)/products/[id]/image-actions.ts` (or next to the existing products actions).

### Hosting limits (Vercel Hobby, recorded here and in ADR 0013)

- **Blob:** 1 GB storage, 2,000 advanced operations a month (each upload, and each store creation, is one), 10,000 simple operations, 10 GB data transfer. Going over can block the store for up to 30 days. Blob stores are no longer capped in number on any plan, so one store per environment is possible.
- **Image Optimization:** 5,000 transformations a month; past it, images not yet transformed return 402 and the page shows their alt text, while cached transformations keep working.
- **Hobby is for non-commercial use**, which fits a portfolio demo store with sandbox payments.
- **Budget:** about 150 products, mostly one photo each, is ~150–300 uploads once (well under 2,000 operations). Storage is no longer tight: re-encoding (R19) makes each file about 100–400 KB, so 300 photos are about 100 MB of the 1 GB. Transformations: with WebP only and the widths the pages use (card, 48/64/96 px thumbnails, 560 px main, the dialog), each photo is roughly 6–10 transformations, so 300 photos stay under 5,000 once cached (R17).

## 7. Test plan

**Unit (Vitest, no database):**

- `detectImageType`: E6–E8, an empty buffer, a truncated header, GIF, `RIFF` without `WEBP`.
- `readCappedBody`: E9–E11, exact 4 MB (E10).
- `imageEnvIssues`, `blobHostOf`: E40–E43, a malformed token.
- `displayImages`: real images in order; none → the category placeholder with the product name as alt; E26, E30.
- `products-params`: `photos=missing` round trip, E36, page reset when it changes.
- Gallery as markup: one image → no strip, arrows or counter (E1); three → all three (E2); placeholder → no Enlarge image (E30).
- `socialMetadata` with a WebP Blob URL (E1) and the placeholder (E30, already covered; extend).
- Footer markup has the line (E39).
- Copy and the audit-key registry entries for the new keys (spec 047 coverage).

**Integration (Vitest + Postgres, `IMAGE_STORAGE=fake`, a spy storage):**

- The route: E1, E3 (a body whose read fails the test), E4, E5, E9–E15, E17; the audit row and the image row commit together; E13 forced with two concurrent calls; E16 with the transaction made to fail, asserting the delete call after the rollback; `guardTransactions` around every storage call (R5).
- Actions: E19–E25, E27 (delete fails → result still saved, one log line), E28 through the existing demo enumeration `.db` test, E29, dense `sortOrder` after every write.
- `nextProductWithoutPhotos` and the list filter: E33–E35.
- Migration: placeholder rows deleted, real rows kept (E37); the alt CHECK.
- Seed: writes no image rows on create or re-run (E37, E38).
- Audit coverage test extended for the route (fixtures for valid and refused calls) and the four actions.
- Storefront reads: a product with a real image returns it from the card, cart, builder-parts and shared-build reads (E31, E32).

**E2E (Playwright, `IMAGE_STORAGE=fake`):**

- `e2e/admin-images.spec.ts` (admin project), on a throwaway product with the SKU prefix `E2E-IMG-`: Owner uploads two PNG fixture files at once, sees both, makes the second main, edits an alt text, the product page shows the photo with the edited alt and has loaded (`naturalWidth > 0`), removes both, sees the placeholder again; the "next product without photos" link appears. Demo opens the same page and every control is disabled; a direct `POST` as Demo is 403.
- The footer line on the home page (extend an existing spec).

**By hand on the preview URL:** upload a real phone photo to the Preview store; check the file is in the Preview store and not Production's; check `remotePatterns` refuses another host; remove it and check the Blob file is gone.

## 8. Out of scope

- Cropping, rotating, editing, a media library, bulk upload or an import script, browser-direct (client) uploads to Blob, Cloudinary (issue, and settled: the owner uploads by hand once on production).
- Brand logos' screen and `brands.write` behavior: [#115](https://github.com/romulojr-dev/pc-ecommerce/issues/115) adds `kind=brand` to this route (D9).
- A cleanup job for orphaned Blob files (a failed best-effort delete); not needed at this volume.
- Drag-and-drop reordering (buttons cover it and are keyboard-accessible; could be a later polish story).
- Image zoom beyond spec 010's Enlarge dialog.
- Re-seeding real photos into dev databases (dev uses the fake store and placeholders).
- SEO title and description, publish and retire: [#113](https://github.com/romulojr-dev/pc-ecommerce/issues/113).

## 9. Decisions

- **D1 (accepted at review, with conditions: see the findings in §6 Schema) The placeholder is derived, not stored.** A product with no `ProductImage` rows shows its category placeholder. Reason: "placeholder shows only while there are no real images" and "removing the last real image brings it back" then hold by construction, with no row to add back or delete. Rejected: keeping placeholder rows and swapping them on the first upload and last removal (two write paths that can disagree; the filter would need a URL-prefix test). **Changes spec 006** (the seed default and the multi-image placeholder parts) and its `ImageOff` fallback, which now shows only where no category is known.
- **D2 The seed writes no images.** Follows from D1 and is stronger than "create-only": the seed can never bring a placeholder back or touch a real photo. Rejected: create-only image rows on new products only (still re-adds placeholder rows to products the seed creates on a new database, which D1 makes pointless). CLAUDE.md's `db:seed` paragraph, spec 001's field table and spec 045 D-rows are updated in this story.
- **D3 One request per file, raw body.** Each request stays under Vercel's 4.5 MB limit, the route checks one file, and a refused file doesn't sink the others. Rejected: one multipart request with all files (passes 4.5 MB with two photos; multipart parsing reads the whole body before any check).
- **D4 Eight images per product.** Bounds storage and the gallery; "most products will have exactly one". Rejected: no cap (one stray selection of 40 photos could eat Hobby's storage).
- **D5 Buttons, not drag-and-drop, for order.** Keyboard and screen-reader friendly with no new dependency (WCAG 2.1 AA). Rejected: a drag library.
- **D6 One Blob store per environment.** Vercel removed the store limit on every plan ([changelog](https://vercel.com/changelog/unlimited-vercel-blob-stores-on-every-plan)), so the issue's preferred option is possible. Rejected: a path prefix per environment in one store (a preview with the production token could still write production's files).
- **D7 `remotePatterns` lists this environment's store, plus production's only when `BLOB_PRODUCTION_HOST` is set.** If a preview database is branched from production it holds rows whose images are on production's store, and without that host they fail to optimize on the preview. Whether previews branch from production or from `dev` is a Neon setting (docs/setup/admin-accounts.md says to look at the preview branch's parent in the Neon console) and the review left it open, so the host is a Preview-only setting instead of a guess: set it when the parent is production, leave it unset when it is `dev`. Deletion never crosses stores (R6). Rejected: always listing production's host (a `dev`-parent preview would trust a store it never uses); only the environment's own host (broken images on production-parent previews).
- **D8 The fake stores bytes in Postgres and serves them from `/test-images`.** Vercel functions have no writable, shared disk, and the fake must work in CI and E2E like `FakeEmail` and `FakeGatewaySession`. Rejected: writing to `public/` (not served after build) or `/tmp` (not shared across functions).
- **D9 The route takes a target `kind`; this story implements `product`.** #115 adds `brand` (and writes `Brand.logoUrl` with its own audit), so the logo screen reuses the same checks, storage and limits. Rejected: building brand logo uploads now (needs #115's screen; the file would be stored with nothing to point at it).
- **D10 "Next product without photos" follows the list's order.** The owner walks the same queue they see under "No photos yet". Rejected: a separate order (category, then name), which would differ from the list.
- **D11 WebP only and a 31-day optimizer cache.** Halves transformations against Hobby's 5,000 a month (AVIF would double them); file names never change, so long caching is safe. Rejected: Next's defaults.
- **D12 Hobby limits go in this spec and in ADR 0013 "Store product images in Vercel Blob".** The ADR also records choosing Blob over Cloudinary (the PRD's original image host, spec 006's example): one platform with the hosting, no second account or key, the upload goes through our own route so the checks stay ours. The notes of the Sprint 8 inspection of Cloudinary are not in the repository, so the ADR records only what the repo supports. Rejected: the spec only.
- **D13 Image writes don't touch `Product.editVersion` or `updatedAt`.** An open product form isn't made stale by a photo change (same reasoning as spec 046). Side effect: uploading doesn't move a product in the list's `updatedAt` order, which keeps the "No photos yet" queue stable.
- **D15 Re-encode every upload to WebP; an animated input keeps its first frame.** Strips GPS and other metadata, shrinks files to fit Hobby's 1 GB, and makes one transformation format. First frame (sharp's default) over refusing: the owner uploading an animated WebP still gets a usable photo, and a test pins it. Rejected: storing the original (location data leaks, storage risk); refusing animated files (a confusing refusal for a valid WebP).
- **D16 Files are deleted only from this environment's own store.** A preview whose database was branched from production could otherwise delete production's files. Skip and log instead.
- **D14 Placeholder has no Enlarge image.** Enlarging an icon helps nobody. Rejected: keeping the dialog for it.

## 10. Open questions

None.

### Review resolutions (2026-11-09)

1. **Re-encode with sharp:** yes (R19, D15). 40 megapixel input limit; metadata stripped; WebP; max 2000 px; animated input keeps the first frame, tested.
2. **D1 accepted** with conditions. Findings: nothing refers to placeholder `ProductImage` rows (foreign key to `Product` only; no order item, cart line, build snapshot, email or outbox row stores an image URL). The migration deletes only `/images/placeholders/` rows, reports the count, and a test shows a real image row survives (§6 Schema).
3. **Previews and production's Blob host:** whether previews branch from production or `dev` was left open in the review text, so production's host is listed only when `BLOB_PRODUCTION_HOST` is set (D7). Files are deleted only from this environment's own store, in every environment (R6, D16). **To decide at deploy time:** look at the preview branches' parent in the Neon console and set the variable on Preview if it is production.
4. **8 photos per product:** kept (D4).
5. **Snapshots and deletion:** no snapshot holds an image URL, so best-effort deletion stays (R6, E53).
6. **Confirmed:** photo changes invalidate `PRODUCTS_TAG` (R10, R20); `/test-images` is a 404 unless `IMAGE_STORAGE=fake` (R14, E45); a file orphaned by a crash between upload and transaction is accepted and noted (R6).
7. **ADR 0013** records Blob over Cloudinary as well as the Hobby limits (D12).
