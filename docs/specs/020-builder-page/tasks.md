# 020 — Tasks: Builder page with saved state, summary and Add to build

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 020, this plan and task list. The spec's test plan records two moves: E7–E9 go to component and integration tests, and E57/E58 go to `seo.spec.ts`.
- [x] **T2. Pure foundations, test-first.**
  - `isBuyable` in `lib/stock.ts`, tested for all four statuses.
  - `lib/build-state/parts.ts`: `MAX_BUILD_PRODUCTS`, `builderPartsQuerySchema` (E40–E45), `capProducts` (E56) and the `BuilderPartData` type.
  - `lib/build-state/slots.ts`: per-slot copy.
- [x] **T3. Server, test-first.**
  - `lib/builder-parts.ts`, `getBuilderParts`: E4, E36, E38, E39, E46, E49, the four stock statuses, invalid specs left out.
  - `app/api/builder/parts/route.ts`: 200 with `Cache-Control: no-store` (E37), 400s (E41, E42).
  - *Verify:* `pnpm test:db`.
- [ ] **T4. Store, test-first.**
  - `pnpm add zustand`.
  - `plan-add.ts`: every row of Behavior 19 (E20, E22, E24–E33).
  - `store.ts`:
    - persisted shape and version 1;
    - `parseBuild` on read (E52, E53) and the cap (E56);
    - actions (E11–E13, E20, E22, E25, E27–E31);
    - no writes before hydration.
- [ ] **T5. Summary helpers, test-first.** `buildTotal` (E1–E4, E7, E11–E13), `buildNotice` (E48, E50–E53, silent kinds), `availabilityMessage` (E7–E9).
- [ ] **T6. Hooks.**
  - `hooks/use-build.ts`: hydration once, `storage`-event sync.
  - `hooks/use-build-parts.ts`: loader, stale-response guard, drop with notice only after success, error and retry.
- [ ] **T7. `/builder` UI.**
  - The page with its metadata.
  - `components/builder/`: the client root, slot rows, quantity stepper, summary, notice, skeleton.
  - Markup tests for the summary and the row: E1–E10, E14–E16, E54.
- [ ] **T8. Product page.**
  - `components/product/add-to-build.tsx`: `planAdd`, the replace dialog, the status line.
  - The not-buyable disabled state (E34, E35).
  - "Cart is coming soon."
  - Update `product-page.spec.ts`.
- [ ] **T9. E2E.**
  - The hydration guard in `e2e/test.ts`.
  - `e2e/builder.spec.ts` (spec §7 E2E row).
  - `seo.spec.ts`: E57, E58.
  - *Verify:* E2E against `pnpm dev`, and with `CI=1` against `pnpm build && pnpm start`.
- [ ] **T10. Wrap-up.**
  - Docs: the CLAUDE.md builder lines (page, store, parts route, buyable rule, ids-only saved build); tick the spec's acceptance criteria.
  - Checks: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, E2E.
  - PR: push with `git push -u origin HEAD` and open the PR per the repo template. Edit #54's acceptance criteria to match D7 only with approval (spec open question 1).
