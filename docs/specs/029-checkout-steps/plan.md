# 029 — Plan: Checkout steps: contact, delivery and review

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #77

> Written after the code, not before it (the work was built in one pass before this plan and the task list were backfilled). It records what was built and the order of the commits. The first draft of the plan was approved in plan mode and lived outside the repo.

## Context

The cart's Checkout button was disabled. This story adds FR-14's steps 1 and 2: contact, delivery or pickup, and the PH address (step 1), then a server-checked review with the fee and total (step 2). Place order stays disabled until #78. Nothing is stored server-side; the details live in the tab's `sessionStorage`. Spec 028 (#76) already supplies `getShippingConfig`, `shippingFee`, `orderWeightGrams`, `resolveAddress`, `zipSchema`, the zone map and the `/api/psgc/…` route.

Checked while planning:
- `getCartView` has no product weights and `getBuilderParts` doesn't carry them, so the review reads weights in one extra query by product id; `/cart`'s output is unchanged.
- A group's status and issues already come from `sharedBuildView` (through `loadGroups`), so the problems and warnings are pure functions of a `CartView`; no new `checkBuild` call.
- `resolveAddress` already accepts the geographic-province path (spec 028 V9, V10) and its tests use `toEqual`, so it is left alone and a wrapper normalizes its result.
- Next 16: `window.history.pushState` / `replaceState` integrate with `useSearchParams` (`guides/single-page-applications.md`), so the step can change without a server round trip.
- The `react-hooks` lint rules forbid ref writes in render and synchronous `setState` in effects; two reasoned disables remain in `review-step.tsx`.

## Reuse

- Cart: `getCartView`, `readCartId`, the flags and `flagText` / `groupName` copy (`lib/cart`), `CartLine`, `CartGroup`, `IssueList`, `StatusLine`, `FlagLine`, `subtotalLabel`.
- Shipping and address: `getShippingConfig`, `shippingFee`, `orderWeightGrams`, `resolveAddress`, `zipSchema`, `independentCityProvinces`, `readPsgcJson`, the `/api/psgc` route, `PSGC_VERSION`.
- Persisted client state: the saved build's zustand `persist` + `skipHydration` + read-after-mount pattern (`lib/build-state/store.ts`, `hooks/use-build.ts`).
- Server action style: `app/(store)/cart/actions.ts`. Metadata: `socialMetadata`. UI: `Button`, `buttonVariants`, `Input`, `Label`, `Skeleton`.
- Tests: `test-support/seed-parts.ts`, `shared-snapshot.ts`, `seed-products.ts`, `build-fixtures.ts` (`insertParts`, `itemsWithIds`), `resetCatalog`, `writeSeed`; `e2e/stock.ts` and the `cart-flags.spec.ts` pattern.

## Files

```
lib/checkout/
  mobile.ts              normalizeMobile (PH mobiles to +639…)
  input.ts               checkoutInputSchema (one schema, browser and server), field copy, fieldErrors
  draft.ts               the loose step-1 draft, draftPayload, isComplete, clearFrom, storage key and version
  draft-store.ts         zustand + sessionStorage, skipHydration, versioned
  address.ts             normalizeAddress (province rule), failingLevel (first level that doesn't hold)
  problems.ts            cartProblems: unavailable and over-stock lines, then groups with errors
  review.ts              buildReview (pure): subtotal, weight, fee, total, threshold note, problems, warnings
  button.ts              checkoutButton(view) for /cart
  copy.ts                step, banner, problem, summary and cart-button copy
  review-checkout.ts     reviewCheckout(cartId, input): parse, cart, config, pickup, address, weights, buildReview
app/(store)/checkout/
  page.tsx               per request, noindex, canonical, empty-cart redirect, no loading.tsx
  actions.ts             reviewCheckoutAction: forwards with the cookie's cart id; reads only
hooks/use-checkout-draft.ts, hooks/use-psgc-list.ts
components/checkout/
  checkout-flow.tsx      step from ?step=, draft hydration, redirect to step 1, focus, refresh on return to step 1
  checkout-steps.tsx, test-mode-banner.tsx, fields.tsx
  contact-delivery-step.tsx, address-fields.tsx
  review-step.tsx        the request, the phases, the one polite live region, focus on problems
  review-view.tsx        pure markup of the review; problems-box.tsx
```

Edited: `components/cart/cart-summary.tsx` and `cart-body.tsx` (Checkout link or disabled with text), `cart-line.tsx` and `cart-group.tsx` (a `readOnly` mode and an `issuesLead` line), `next.config.ts` (`/checkout` tracing key), `e2e/cart.spec.ts` and `cart-body.test.tsx`, `CLAUDE.md`, change notes in specs 025 and 027.

## Design choices the plan commits to

- **The review is a server action that only reads** (spec D1): details travel in a POST body, never a URL; no write, lock or cookie.
- **A wrapper, not a change to `resolveAddress`** (D14): `normalizeAddress` gives one address shape whichever path the codes came by; the province code is `null` unless the PSA places the city in that province.
- **One list of problems** (`cartProblems`) feeds step 1's box and the review; the review adds no-rate.
- **The step is the URL's `?step=`**, changed with `pushState`; the browser alone picks the step after mounting, because only it can read `sessionStorage`.
- **Native `<select>`s** for the address (D16); Edit, Change delivery and Back to details are links to `/checkout`, which also reload the page's cart data.
- **Check again keeps the review mounted** so focus stays on its button; arrival and Try again show the skeleton.
- **No place names in the draft**; the lists reload and the server names the places.

## Verification

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` after each group of files.
2. `pnpm test:db` on the Docker Postgres with an inline `TEST_DATABASE_URL` (`lib/checkout/review-checkout.db.test.ts`).
3. E2E: `e2e/checkout.spec.ts` with `cart.spec.ts` and `cart-flags.spec.ts`, on `pnpm dev` and on the production build with `CI=1 pnpm start`. Locally the stock-changing specs need `PRODUCTION_DATABASE_HOST`; they were run against the Docker Postgres with the URLs given inline (seeded with `pnpm db:seed`, reset with `--reset` if earlier DB tests polluted it).
4. `pnpm build`: `/checkout` is dynamic.
5. Vercel preview: one review with a delivery address succeeds (the tracing key).

## Risks

- **File tracing** for `/checkout` is only proved on Vercel, as for spec 028.
- **Hydration:** the step shell renders the same on the server for both steps; the production-build E2E and the hydration guard in `e2e/test.ts` cover it.
- **Local stock E2E** can't run on the Neon dev branch without `PRODUCTION_DATABASE_HOST` (#74).
