# 029 — Tasks: Checkout steps: contact, delivery and review

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

> Backfilled: T1–T7 were built in one pass without stopping after each task, and committed as four commits (T0–T1 and the first logic, T2–T3, T4–T5, and T6–T7). Review them as a whole. The boxes below show what exists, not an approval per task.

- [x] **T0. Docs.** Spec 029 (approved with the review changes). This plan and task list were written afterward.
- [x] **T1. Pure rules, test-first.** `lib/checkout/mobile.ts` (I2a–I3), `input.ts` (I1–I9, I13, I14, I16), `address.ts` `normalizeAddress` (AD1–AD6).
- [x] **T2. Problems, review, button, copy.** `problems.ts`, `review.ts` (`buildReview`), `button.ts`, `copy.ts`; unit tests R1–R16, N7, N8.
- [x] **T3. Server.** `review-checkout.ts` (`reviewCheckout`, `failingLevel`), `app/(store)/checkout/actions.ts`; DB tests on the Docker Postgres: R1–R4, R8–R12, R14, R15, R17, I10, I11, I13, I15, AD1–AD3, and "writes nothing".
- [x] **T4. Draft and hooks.** `draft.ts`, `draft-store.ts` (+ tests), `hooks/use-checkout-draft.ts`, `hooks/use-psgc-list.ts`.
- [x] **T5. Step 1 and the shell.** `checkout-flow`, `checkout-steps`, `test-mode-banner`, `fields`, `contact-delivery-step`, `address-fields`, `problems-box`; the page and its `outputFileTracingIncludes` key.
- [x] **T6. Review UI and the cart button.** `review-step`, `review-view`; `readOnly` and `issuesLead` on `CartLine` / `CartGroup`; Checkout link or disabled text in `cart-summary`; `cart-body.test.tsx` updated.
- [x] **T7. E2E, docs.** `e2e/checkout.spec.ts` (N1, N2–N6, N10, N13, N16, N18, N19, A2b, A3, A4, AD1, AD7, R1, R8); CLAUDE.md checkout paragraph; "Changed by spec 029" notes in specs 025 and 027; spec 029 status to Implemented (D16 added).
- [ ] **T8. Manual checks.** Look at 1024 px and 1280 px; keyboard through the form and dropdowns; a screen reader on the errors, the problems box and the step change.
- [ ] **T9. Preview deploy.** Push the branch; on the preview URL run one review with a delivery address (the `/checkout` tracing key), then the Definition of done on the preview.
- [ ] **T10. PR.** Open the PR from the repo template; wait for `ci`; check the acceptance criteria on the preview URL.
