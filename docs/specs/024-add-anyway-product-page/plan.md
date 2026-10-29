# 024 — Plan: Add to build on a "Doesn't fit" product page asks first

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #68

## Context

Spec 023 put a "Fit with your build" block on the product page, but Add to build still adds a part the block says doesn't fit. The picker already asks first ("Add anyway", spec 021 Behavior 15). This story gives the product page the same confirmation: one dialog when it also replaces a part, and a pending state when the shopper clicks before the build's parts have loaded (it waits, then decides; a failed load adds unasked). No schema change, no new route, no new dependency.

## Reuse

- **Verdict:** `fitOf`, `Fit`, `FitPart` ([lib/build-state/fit.ts](../../../lib/build-state/fit.ts)). `Fit` carries `issues` for `errors`.
- **Plan:** `planAdd`, `AddPlan` ([lib/build-state/plan-add.ts](../../../lib/build-state/plan-add.ts)) are pure and don't apply anything. The store's `add` plans and applies in one call, so the decision plans first and calls `add` / `replace` only when it chooses to apply.
- **Loading:** `useBuildParts({ readOnly })` ([hooks/use-build-parts.ts](../../../hooks/use-build-parts.ts)) gives `status`; `useFits` ([hooks/use-fits.ts](../../../hooks/use-fits.ts)) hides it (`null` for loading and for error), so pending needs the status too.
- **Dialog:** the picker's confirmation, inline in [components/builder/slot-picker.tsx](../../../components/builder/slot-picker.tsx): extracted and shared, not copied.
- **Button:** [components/product/add-to-build.tsx](../../../components/product/add-to-build.tsx) (the "Replace?" dialog, the always-mounted `role="status"` line, `OUTCOME_TEXT`); `SLOT_COPY` ([lib/build-state/slots.ts](../../../lib/build-state/slots.ts)); `FitBlock` / `FitWithBuild` ([components/product/fit-with-build.tsx](../../../components/product/fit-with-build.tsx)).
- **Tests:** `buildA`, `buildOf`, `seed`, `seedParts` ([test-support/seed-parts.ts](../../../test-support/seed-parts.ts)); `buildAItems`, `saveBuild` ([e2e/build-fixtures.ts](../../../e2e/build-fixtures.ts)); `renderToStaticMarkup` for component tests (Vitest runs in Node with no DOM, so hooks are covered by E2E and pure functions).

## Design

### Pure decision: `lib/build-state/add-decision.ts`

`decideAdd({ status, fit, plan })` returns `wait` (status `loading`), `ask` (the fit is `errors` and the plan is `add` or `confirm-replace`; the payload is the error-severity issues and `replaces: { quantity } | null`) or `apply` (today's flow, also for a failed load). `already`, `at-stock`, `full` and `raise` never ask (D4, D6). `replaceNote(slot, quantity)` builds "This also replaces the {noun} you picked", plus ", keeping {n} kits" for memory above 1. No React or server imports; `LoadStatus` is declared here because `lib` can't import `hooks/`.

### One verdict per page: `components/product/product-fit.tsx`

A client provider calls the hook once and gives `{ status, fit }` to `FitWithBuild` and `AddToBuild`, so the page still makes one parts request. With no part (a non-builder product, or specs that don't validate) and as the context default it provides "ready, no verdict", which means "add as today". `useFitsStatus(parts)` is added to `hooks/use-fits.ts`; `useFits` wraps it and the listing keeps using it.

### Shared dialog: `components/builder/misfit-dialog.tsx`

`MisfitBody` (pure markup, so tests can render it) and `MisfitDialog` (`request | null`, as the picker's `confirming`). The picker switches to it with no change in copy or behavior.

### `AddToBuild`

A click decides at once, or goes pending when the status is `loading`. Pending: the button is disabled but stays focusable, marked busy, with a spinner and its label unchanged, and the status line says "Checking your build…". An effect resolves it when loading ends, by success or failure. `ask` opens the dialog (nothing is saved until Add anyway); `apply` is today's switch unchanged.

## Risks

- The pending effect sets state synchronously; if a react-hooks lint rule flags it, use a targeted disable with the reason.
- The picker refactor touches a tested flow: keep it mechanical and run `epic-build.spec.ts`.
- The context default must mean "apply as today", so a product with invalid specs still adds.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test` after every task; `pnpm test:e2e` for the add-anyway, fits-build, builder, epic-build and product-page specs; a manual pass in `pnpm dev` (the dialog with both errors and the replace sentence, Cancel, Add anyway, a throttled early click, one parts request, the picker unchanged); the preview URL.
