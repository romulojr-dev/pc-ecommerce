# 023 — Tasks: "Fits your build" hints

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 023 (approved, with the precedence and test-plan fixes), this plan and task list. Follow-up story #68 is in Backlog.
- [x] **T2. Pure logic, test-first.**
  - `lib/specs/rule-specs.ts`: `ruleSpecsOf`, with the equivalence test over every seed part and Build A, B and C.
  - `lib/builder/comparable.ts`: `hasComparableParts` (E13–E21), every `RuleId` listed, and the drift test. Export from `lib/builder/index.ts`.
  - `lib/build-state/fit.ts`: `FitPart`, `fitPartOf`, `fitOf` (E1–E12), and `fit.perf.test.ts` (24 verdicts, median under 50 ms).
  - `lib/build-state/loader.ts`: `unreturnedIds`, `skip` on `partsRequest`, with tests.
- [x] **T3. Hooks.** `useBuildParts({ readOnly })` (D13) and `hooks/use-fits.ts`. `/builder` is unchanged.
- [ ] **T4. Listing and search.**
  - `listingSelect`, `ListingProduct`, `toListingProduct` in `lib/products.ts`; `getListingPage` and `lib/search.ts` use them; the category and search pages' types follow.
  - `components/fit/fit-badge.tsx` and its markup test.
  - `ListingResults` calls `useFits` and passes the badge in `ProductCard` `children`.
- [ ] **T5. Product page.** `components/product/fit-with-build.tsx` with its markup test, wired after the warranty line.
- [ ] **T6. E2E and docs.**
  - `e2e/fits-build.spec.ts`: named parts, accessibility (E23, E23a), card heights, one request, empty state, product pages, search, error, cross-tab.
  - CLAUDE.md paragraph; one line in ADR 0006's Consequences. Tick the spec's Definition of done.
