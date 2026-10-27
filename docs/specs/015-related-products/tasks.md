# 015 — Tasks: related products

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm test:db` passing. Commit after each task (subject-only Conventional Commit); the PR is squash-merged.

- [ ] **T1. Query and integration tests.** `getRelatedProducts` and `RelatedSource` in `lib/products.ts`; `getProductPage` selects `id`, `categoryId`, `effectivePrice`; `lib/related-products.db.test.ts` with the plan's cases. *Verify:* `pnpm test:db`.
- [ ] **T2. Section on the product page.** `components/product/related-products.tsx` (`RelatedProducts`, `RelatedProductsSkeleton`), wrapped in `Suspense` on the product page. *Verify in `pnpm dev`:* a CPU and a GPU page show 4 cards; with a temporary delay (not committed) the details appear first and the skeleton is swapped; `/cpu/no-such-product` is a 404 and `/gpu/amd-ryzen-5-7600` a 308; `pnpm build`.
- [ ] **T3. E2E.** "Similar products" test in `e2e/product-page.spec.ts`. *Verify:* full `pnpm test:e2e`.
- [ ] **T4. Docs and wrap-up.** CLAUDE.md line, tick the spec's criteria; `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; push and open the PR per the repo template.
