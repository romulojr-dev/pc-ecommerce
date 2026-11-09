# Plan: spec 049 — Product images (#114)

Spec: [spec.md](spec.md) (approved with changes on 2026-11-09). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `114-product-images`, from `main`. One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `images.write` (Owner only) and `images.view` is not needed (the section sits on the product page, `products.view`); `adminRoute` / `adminAction`, `adminTransaction` / `recordAudit`, `AUDIT_ENTITIES` (already has `product`); the product edit page, `ProductForm`'s read-only handling, `getProductForEdit`; `PRODUCTS_TAG`; `placeholderUrl` and the eight placeholder SVGs; `ProductImage`, `ProductGallery`, `socialMetadata`; the email/payment env-schema pattern; `FakeEmail` as the model for a fake store; `guardTransactions` (`test-support/release.ts`); `e2e/stock.ts`-style throwaway-product fixtures; `expectNoRawValues`.

Does not exist yet: `lib/images/`, the upload route and `/test-images`, the Images section, `FakeStoredImage`, `ProductImage.createdAt`, the `photos` list filter, `sharp` and `@vercel/blob` as dependencies.

## Findings that shape the plan

- **Nothing refers to placeholder `ProductImage` rows.** `ProductImage` has a foreign key to `Product` only. `OrderItem`, `CartItem`, `Build`/`BuildItem`, the email templates and `EmailOutbox` store no image URL (order items keep name and price snapshots; emails draw no images; carts keep ids). So D1 is safe, and file deletion after a removal cannot break a snapshot. The only stored copy of an image URL will be the removal's audit row, as text.
- **The storefront has four image reads**, all `images: { orderBy sortOrder, take 1 }` + `images[0] ?? null`: `productCardSelect` (cards, listings, search, related, home), `getProductPage` (gallery, metadata, JSON-LD), `builderPartSelect` (builder, picker, shared build, cart groups) and the cart's single lines. Each gets `category.slug` where it lacks it (all but the page select already have it) and maps through the pure `mainImageOf` / `displayImages`. No component but the gallery changes shape. The shared build's retired row keeps `image={null}` (no category).
- **`ProductImage` (the box) needs no change** except the gallery: it keeps `image: {url, alt} | null`.
- **`sharp`** is in `node_modules/.pnpm` only as Next's optional dependency. It becomes a direct dependency (`pnpm add sharp @vercel/blob`), which the user asked for; nothing in `node_modules` is edited by hand. `sharp` on Vercel needs no config; locally it ships prebuilt binaries for Windows. If an environment can't load it, `reencodeImage` rejects at call time, not at import time (lazy `import("sharp")` inside the function), so pages and unit tests that never upload still start.
- **Docker.** The `.db` tests need the local Docker Postgres (`pnpm test:db:up`); Docker Desktop was not running when planning. The tasks that add `.db` tests start it (user's memory: Docker Desktop plus an inline `TEST_DATABASE_URL`, never `.env.local`).
- **Route test double.** The route is exercised by importing its `POST` and calling it with a `Request`; the guard's dependencies are the real ones as in `guard.db.test.ts`, so the tests sign in through the existing helpers. The body-not-read assertion uses a `ReadableStream` whose `pull` fails the test.
- **`sortOrder` renumbering.** A unique `(productId, sortOrder)` index would force deferrable constraints, which Prisma can't declare. The plan drops that unique index from the spec (the index is `(productId, sortOrder)` non-unique) and relies on the product row lock (R8) for serialization; the CHECK is `sortOrder >= 0` only. See "Deviations".
- **Audit.** Entity `product`, four new actions (`image-added`, `image-removed`, `images-reordered`, `image-alt-changed`), flat keys with registry entries (`imageid`, `url`, `alt`, `position`, `order`). The audit coverage test's "no admin route handler" guard becomes an allowlist of exactly `app/api/admin/images/route.ts`, which gets its own `.db` test proving its row, rollback and refusal, and the guard-enumeration test already calls every admin route as Demo.
- **Env.** `IMAGE_STORAGE` (required), `BLOB_READ_WRITE_TOKEN` (with `blob`), `BLOB_PRODUCTION_HOST` (optional). `vitest.db.config.ts`, `vitest.config.ts`, CI and Playwright set `IMAGE_STORAGE=fake`. `next.config.ts` imports `lib/env` already, so the remote patterns are computed from the validated env at startup.
- **`/test-images/[name]`** is a route handler under `app/test-images/` (outside the `(store)` group so no layout), reserved slug `test-images`. It reads `FakeStoredImage` only when `IMAGE_STORAGE=fake`.

## Risks to settle early

1. Whether `sharp` loads under Vitest on Windows and keeps the 40 MP limit and metadata stripping as the spec says (task 3 tests first). An animated-WebP fixture must be made in the test; if `sharp` can't create one, a tiny hand-built animated WebP byte array is committed in `test-support/`.
2. The `next/image` optimizer refusing the fake store's `/test-images/` URLs: local images are allowed by default (`localPatterns` unset), so the fake's relative URLs work with no config.
3. Whether the guard-enumeration `.db` test already covers a new route, or needs the allowlist extended (task 8).

## Deviations from the spec

- §6 Schema says the `(productId, sortOrder)` unique index is deferrable "or the renumbering goes through negative values first; the plan decides". Decision: **no unique index**; a non-unique index plus the product row lock. Renumbering is then a plain `UPDATE`. The spec's rule R8 (dense order, serialized by the lock) holds. Spec text edited to say so in task 1.

A task that finds the spec wrong stops and reports.

## Order of work

0. Housekeeping. 1. Dependencies, env, ADR. 2. Pure rules. 3. Re-encode. 4. Schema and migration. 5. Storage adapters and `/test-images`. 6. Storefront. 7. Seed. 8. Upload route. 9. Actions. 10. Admin UI and list. 11. E2E. 12. Docs and PR.
