# 008 — Tasks: category listing page

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #21

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. The story ships as one commit (T8).

- [x] **T1. URL state and hrefs.** `lib/listing-params.ts` (sorts, page size, parse, `listingQuery`/`listingHref`, `pageCount`, `paginationItems`, view cookie) and its tests; `productHref` in `lib/site.ts` with a test.
  - Verify: `pnpm test` with `.env.local` moved aside; `pnpm typecheck`.

- [x] **T2. Data.** `getCategoryBySlug()` in `lib/categories.ts`; `lib/products.ts` with `productCardSelect`, `toProductCardData`, `getCategoryProducts()`.
  - Verify: `pnpm typecheck`; a throwaway `tsx` call against the dev branch returns CPU products in each sort order.

- [x] **T3. Product card.** `components/product/product-card.tsx` (grid and list layouts).
  - Verify: `pnpm lint`, `pnpm typecheck` (seen on the page in T4).

- [x] **T4. Category page.** shadcn `select` and `pagination`; `ListingSort`, `ListingPagination`; `app/(store)/[category]/page.tsx` with metadata, 404, canonical redirects, count line and empty state (grid only for now).
  - Verify in `pnpm dev`: every category renders; sorts change order and URL; `/cpu?sort=bogus&page=abc` and `/cpu?page=99` redirect to `/cpu`; `/nope` is a 404; titles and canonical are right; light/dark at 1280 and 1024 px.

- [x] **T5. Grid/list toggle.** shadcn `toggle-group`; `ListingResults` with cookie persistence.
  - Verify in `pnpm dev`: toggling is instant, reload keeps the view with no flash, the view carries across categories; keyboard and axe clean.

- [x] **T6. Remove `/products`.** Delete the page and its E2E; move `"products"` in `RESERVED_SLUGS`; update CLAUDE.md and the menu E2E comment.
  - Verify: `/products` 404s; `pnpm test` (reserved-slugs test) passes.

- [x] **T7. E2E.** `e2e/category-page.spec.ts` as in the plan.
  - Verify: `pnpm test:e2e` passes, all specs.

- [x] **T8. Build and wrap-up.** `pnpm build` (`/[category]` is `ƒ`, `/` still static); `pnpm format`, `pnpm lint`, `pnpm typecheck`; tick the spec's acceptance criteria and set its status; commit the story and push.
