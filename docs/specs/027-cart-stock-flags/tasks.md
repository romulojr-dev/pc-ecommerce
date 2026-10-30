# 027 — Tasks: Stock flags on the cart page

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Flag logic.** `lib/cart/flags.ts` (`productFlags`, `setToQuantity`, `groupPartFlags`, `flaggedCount`) with `flags.test.ts` (E1–E9, E13, E16–E20).
- [x] **T2. Copy.** Flag, group flag, banner and Set to text in `lib/cart/copy.ts`.
- [x] **T3. View.** Flag fields on `CartLineView`, `CartGroupView` and `CartView`; `getCartView` computes them with no new query; `flags.db.test.ts` (E1–E8, E10–E16, E20).
- [x] **T4. Line UI.** `FlagLine`, `CartLine` (flag in place of the stock line, Set to), `CartQuantity` `inputId`, Set to wiring in `CartBody` and `CartContent` (status text, focus); markup tests (E5, E6, E10–E13).
- [x] **T5. Group UI.** Collapsed flag line and per-row flags in `CartGroup`; markup tests (E3, E14–E16, E20).
- [x] **T6. Banner.** `aria-live` container and banner in `CartBody`; markup tests (E1, E3, E17–E19).
- [x] **T7. E2E.** `e2e/stock.ts` (production guard), `.env.local` loading in `playwright.config.ts`, `e2e/cart-flags.spec.ts` (E26–E28).
- [x] **T8. Docs.** CLAUDE.md cart bullets, README, this plan and task list.
