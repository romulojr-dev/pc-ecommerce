# 024 — Tasks: Add to build on a "Doesn't fit" product page asks first

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 024 (approved), this plan and task list, and the "Changed by spec 024 (#68)" notes in specs 020 and 023 (CLAUDE.md waits for T6).
- [x] **T2. Pure logic, test-first.** `lib/build-state/add-decision.ts`: `decideAdd`, `replaceNote`, with tests for E1, E4–E16.
- [x] **T3. One verdict.** `useFitsStatus`, `components/product/product-fit.tsx`, `FitWithBuild` reads the context, the product page wraps the buy column.
- [x] **T4. Dialog and button.** `components/builder/misfit-dialog.tsx` with markup tests, the picker switched to it, `AddToBuild` with the decision and the pending state.
- [ ] **T5. E2E.** `e2e/add-anyway.spec.ts`: E17–E22 and E26; re-run the builder, epic-build, fits-build and product-page specs.
- [ ] **T6. Docs wrap-up.** CLAUDE.md paragraph with its note; tick the spec's Definition of done.
