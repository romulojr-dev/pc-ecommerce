# 026 — Tasks: Add build to cart

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 026 (approved with the review changes), "Changed by spec 026 (#62)" notes in specs 020, 022 and 025, the dated note in ADR 0007, this plan and task list.
- [x] **T2. Snapshot write.** `lib/build-snapshot.ts` `upsertBuildSnapshot(tx, items)` (`INSERT … ON CONFLICT DO NOTHING RETURNING`, no conflict target), and `shareBuild` uses it in its own transaction.
  - *Verify:* every existing `lib/build-share.db.test.ts` test passes unchanged (parallel shares E5/E61, slug retry and give-up E62, rollback E19). New tests: a slug collision inside a transaction retries without aborting it; a snapshot written in an outer transaction that rolls back leaves no row; `BuildItem`s are written once per `Build`.
- [x] **T3. Pure logic, test-first.** `lib/build-state/warnings.ts`, `lib/cart/build-stock.ts`, build inputs in `lib/cart/input.ts`, copy in `lib/cart/copy.ts`, `lib/build-state/cart-button.ts` (E9, E10, E14–E21, E40–E43).
- [x] **T4. Server.** Move the cart's transaction helpers to `lib/cart/tx.ts`; `lib/cart/build.ts` `addBuildToCart` and `removeBuildFromCart`; `getCartView` groups with `toSharedItems` extracted from `lib/shared-build.ts`. `build.db.test.ts`: E1–E31, E56–E60, including two concurrent adds of the same build (one group, no error).
- [x] **T5. Builder UI.** Server actions, `reload()` in `useBuildParts`, the summary button and result region, the warnings dialog; markup tests (E40–E50).
- [x] **T6. Cart page groups.** Group line (collapsed, expanded), body, removal, focus; markup tests (E32–E38, E36 numbering).
- [ ] **T7. E2E and docs.** `e2e/cart-build.spec.ts` (E51–E55), CLAUDE.md cart and share bullets, README.
