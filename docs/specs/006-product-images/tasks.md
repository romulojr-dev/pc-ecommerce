# 006 — Tasks: product images with placeholders

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #19

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. The story ships as one commit (T6).

- [x] **T1. Placeholders.** `lib/placeholders.ts`, `scripts/generate-placeholders.tsx`, the `images:placeholders` script, and the 10 generated SVGs in `public/images/placeholders/`.
  - Verify: running the script twice leaves `git diff` empty on the second run. Each SVG opens in a browser and shows its icon centred on a transparent background.

- [x] **T2. Seed images.** `images` in the part schema (URL rule, default, alt fill-in); write images only where a product has none; images count in the summary; `images` on the 6 multi-image parts; unit tests in `validate.test.ts` and `coverage.test.ts`.
  - Verify: `pnpm test` with `.env.local` moved aside. `pnpm db:seed` on the dev branch prints `69 images added`; a second run prints `0 images added`.

- [x] **T3. Component and page.** `components/product/product-image.tsx`; thumbnail column on `/products`; E2E image assertion.
  - Verify: `/products` shows thumbnails in light and dark themes at 1280 px, loaded lazily with no layout shift. `pnpm test:e2e` passes. Delete one product's images on the dev branch → its row shows the labelled fallback → re-seed restores them.

- [x] **T4. Build check.** `pnpm build` passes; the build output still lists `/products` as `ƒ`.
  - Verify: as stated.

- [x] **T5. Docs.** CLAUDE.md: placeholders and their script, the `ProductImage` component, and the `db:seed` images behaviour.
  - Verify: the commands listed work as written.

- [x] **T6. Ship.** One commit, `git push -u origin HEAD`, PR closing #19 with the spec files.
  - Verify: CI passes on the PR.

- [ ] **T7. Re-seed production (after merge).** Done by the owner, per spec 004 "Seeding production".
  - Verify: the summary shows `0 created, 60 updated` and `69 images added`; `/products` in production shows thumbnails.
