# 021 — Tasks: Slot part picker with compatible parts first

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 021 (approved with the review changes), this plan and task list, ADR 0006.
- [ ] **T2. Pure picker logic, test-first.**
  - `lib/build-state/candidates.ts`: `builderCandidatesQuerySchema` (E35a, E38–E38e) and the `BuilderCandidate` type.
  - `lib/build-state/slots.ts`: `plural`, storage's noun "drive", title and empty-state copy.
  - `lib/build-state/picker.ts`: `pickerList`, covering groups and precedence, cheapest-first order, markers, actions, banner, empty states and "change your" slots (E1–E9, E11a, E11b, E14, E14a, E15, E21a, E23–E29, E33).
  - `lib/build-state/picker.perf.test.ts`: E39 (5 warm-ups, median of 20 runs < 50 ms). Point the comment in `lib/builder/check.bench.ts` to it.
- [ ] **T3. Store.** `replaceDrive` (E21, E22). Memory cap through `planAdd` (E16), and the 20-product cap for adds (E20).
- [ ] **T4. Server, test-first.**
  - `toBuilderPartData` extracted from `lib/builder-parts.ts` (the parts tests stay green).
  - `lib/builder-candidates.ts`, `getBuilderCandidates`: active only (E36), card data and the four stock statuses (E35), invalid specs left out (E37), fresh price (E34).
  - `app/api/builder/candidates/route.ts`: 200 with `today` and `Cache-Control: no-store` (E35, E35a), 400s (E38–E38e).
  - *Verify:* `pnpm test:db`.
- [ ] **T5. Picker UI.**
  - `ProductCard`: greyed variant and footer; the listing markup test unchanged.
  - `picker-card.tsx` and `picker-body.tsx` with markup tests (E3, E5, E7, E14, E14a, E19, E20, E26–E28, E30, E31).
  - `hooks/use-candidates.ts`, `addLoaded` in `useBuildParts`, `slot-picker.tsx` (dialog, fixed header, scrolling list, nested "Add anyway" confirm, focus).
  - `slot-section.tsx`: buttons instead of links, "Change" per drive. `builder.tsx`: picker state, picking, focus after a pick.
- [ ] **T6. E2E and home.**
  - `e2e/builder.spec.ts`: buttons instead of links.
  - `e2e/epic-build.spec.ts`: E40–E44 (focus, Escape, focus return, Show all reason, status OK), E13, and no candidates request when toggling "Show all".
  - The home hero loses its "Coming soon" badge; update `home.spec.ts`.
  - *Verify:* E2E against `pnpm dev`, and with `CI=1` against `pnpm build && pnpm start`.
- [ ] **T7. Wrap-up.**
  - Docs: `CLAUDE.md` (the picker, the candidates route, `pickerList`, ADR 0006; drop the "until #54" wording). Tick the spec's acceptance criteria.
  - Checks: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, E2E.
  - Manual check at 1024 and 1280 px (plan › Verification).
  - PR: push with `git push -u origin HEAD`, then open the PR per the repo template.
