# ADR 0013 — Store product images in Vercel Blob

Status: **Accepted** · Date: 2026-11-09 · Story: #114 · Spec: [spec 049](../specs/049-product-images-upload/spec.md)

## Context

Until now every product showed a generated category placeholder ([spec 006](../specs/006-product-images/spec.md)). AD-2 needs the owner to upload real photos from Admin. The PRD's stack table first named Cloudinary; its current version names Vercel Blob through a server upload route. Photos come from one person, by hand, once, on production (about 150 products, mostly one photo each), and the app is a portfolio project on Vercel's Hobby plan.

## Decision

**Vercel Blob, written only by our own server route.**

- **Why Blob and not Cloudinary.** The app already runs on Vercel, so Blob needs no second account, dashboard or secret to manage, and each environment's store is a click in the same project. The upload goes through `POST /api/admin/images`, built with `adminRoute`, so our own checks decide what is stored: the role, the file type by its bytes, the size, the pixel count and the re-encoding. Cloudinary's strength (on-the-fly transformations and a media library) is what this story puts out of scope: `next/image` already resizes and converts at request time, and the owner uploads about 150 photos once. The task notes from the Sprint 8 inspection of Cloudinary are not in the repository, so this ADR records only the reasons the repository supports; add that inspection's findings here if they differ.
- **Server upload, not browser-direct.** The route reads the file (at most 4 MB, under Vercel's 4.5 MB request limit), re-encodes it and stores the result. A client-token upload would let the browser put anything in the store before our checks run, and would need a second route for the "upload completed" callback.
- **Always re-encoded.** `sharp` decodes with a 40-megapixel limit, applies the EXIF orientation, shrinks to at most 2000 px, drops all metadata (phone photos carry GPS) and stores WebP. Files become about 100–400 KB, so the owner's whole catalog stays well inside Hobby's 1 GB.
- **One Blob store per environment.** Production and Preview each connect their own store, so a preview's uploads never land in production's. Vercel removed the cap on the number of stores on every plan (changelog "Unlimited Vercel Blob stores on every plan"), so no path-prefix workaround is needed. `images.remotePatterns` lists only this environment's store host (and, optionally, production's on a preview whose database was branched from production: `BLOB_PRODUCTION_HOST`).
- **OIDC first, the static token as a fallback** (amended 2026-11-10). A connected store authenticates with OIDC by default: Vercel adds `BLOB_STORE_ID`, and `@vercel/blob` pairs it with the short-lived `VERCEL_OIDC_TOKEN`, which it reads and refreshes itself (the app never reads or passes it, since an explicit token would bypass the refresh). `BLOB_READ_WRITE_TOKEN` is still supported but is only added when the connection asks for it; it is the fallback for code running off Vercel. The app passes `storeId` when `BLOB_STORE_ID` is set, which lets the SDK fall back to the token in `process.env` when there is no OIDC token, so the two must name the same store; with only the token it passes the token. The store host (remote patterns, own-store deletes) comes from whichever is used.
- **A file is deleted only from this environment's own store.** A removal deletes the Blob file best-effort after the commit and logs a failure; a URL on any other host (production's, seen from a preview) is skipped and logged. No order item, cart line, build snapshot or email stores an image URL, so nothing can point at a deleted file; if a later story stores one, deletion must be reviewed there. A crash between the upload and the transaction leaves an orphaned file, which is accepted: it costs storage only.
- **`IMAGE_STORAGE` is `blob` or `fake`, required, and Production refuses `fake`**, like the payment and email variables. The fake keeps photos in a `FakeStoredImage` table and serves them from `/test-images/{name}`, which is a 404 unless `IMAGE_STORAGE=fake`. Local runs, CI and E2E use it.
- **A product's placeholder is derived, not stored.** A product without `ProductImage` rows shows its category placeholder, so removing the last real photo brings it back, and the seed writes no images at all.

## Hobby limits this depends on

Checked against Vercel's documentation on 2026-11-09; they change, so recheck before relying on a number.

- **Blob:** 1 GB storage, 2,000 advanced operations a month (each upload counts; so does creating a store), 10,000 simple operations and 10 GB data transfer a month. Going over can block the store for up to **30 days**, during which uploads and reads fail.
- **Image Optimization:** 5,000 transformations a month. After that, images not yet transformed return **402** and the page shows their alt text; transformations already cached keep working. The config lowers the count: WebP only, a long cache TTL, and file names that never change.
- **Hobby is for non-commercial use.** That fits a portfolio demo store with sandbox payments; a real store would move to Pro.
- **Budget:** about 150–300 uploads once is far below 2,000 operations; 300 re-encoded photos are about 100 MB of storage; each photo is roughly 6–10 transformations across the card, thumbnail, gallery and dialog sizes, so a full catalog stays under 5,000 once cached.

## Consequences

- `sharp` and `@vercel/blob` become direct dependencies.
- If the monthly operation or transformation budget is exceeded, the storefront shows alt text or placeholder-less boxes until the month turns (images) or the block lifts (Blob). Mitigations: one photo per product, no bulk re-uploads, no raw originals.
- Moving to Cloudinary or S3 later changes `lib/images/storage.ts` (one adapter) and `images.remotePatterns`; `ProductImage.url` already holds a full URL.

## Alternatives rejected

- **Cloudinary:** a second vendor and secret for transformations the app doesn't need (see above).
- **Browser-direct Blob uploads:** put bytes in the store before our checks, plus a callback route to secure.
- **Storing the original upload:** keeps GPS metadata and risks Hobby's 1 GB.
- **Images in the database or the repo:** the database grows and every read pays for it; the repo's `public/` is not writable at runtime on Vercel.
- **One store with a path prefix per environment:** a preview holding the production token could still write production's files.
