# 010 — Tasks: product detail page

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #22

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. The story ships as one commit (T7).

- [x] **T1. Docs.** `plan.md` and `tasks.md`; spec approved, pre-order parts corrected.

- [x] **T2. Schema and seed.** `preorderShipsOn` and `boxContents` on `Product`, one migration; seed schema, writer and data (box contents, two pre-orders); `validate.test.ts` cases.
  - Verify: `pnpm db:migrate`, `pnpm db:seed --reset`, `pnpm test`; check both columns in Prisma Studio.

- [x] **T3. Status and formatting.** `lib/stock.ts` (`"pre-order"`, `manilaToday`, `clampQuantity`), `lib/format.ts` (`discountPercent`, `formatWarranty`, `formatDate`) with tests; cards get `preorderShipsOn` and a `today` prop; `coverage.test.ts` updated.
  - Verify: `pnpm test` with `.env.local` moved aside; `/cpu` shows "Pre-order" on the 265K card.

- [x] **T4. Page.** `getProductPage`, `ProductPrice`, `QuantitySelector`, the route with metadata, 404, 308 redirect, breadcrumbs, buy box, overview, spec table and box contents (gallery shows the first image only for now).
  - Verify: `pnpm dev`: a sale, a pre-order, an out-of-stock product; `/gpu/amd-ryzen-5-7600` → 308; `/cpu/nope` → 404.

- [x] **T5. Gallery.** `pnpm dlx shadcn@latest add dialog`; `ProductGallery` with thumbnails and the enlarge dialog.
  - Verify: RTX 5070 by keyboard only (thumbnails, open, arrows, Esc, focus returns); light and dark; axe.

- [x] **T6. E2E.** `e2e/product-page.spec.ts`.
  - Verify: `pnpm test:e2e`.

- [x] **T7. Build and wrap-up.** `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; update issue #22's wrong-category criterion; tick the spec's acceptance criteria and set its status; commit the story and push.
