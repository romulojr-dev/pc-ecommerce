# 023 — Plan: "Fits your build" hints

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #61

## Context

A shopper with a build in progress should see on listing cards, search cards and the product page whether a part fits, without opening `/builder`. The badge is computed in the browser with `checkCandidate` (ADR 0006) against the saved build. Pages stay per request (ADR 0003). The server sends only `{ id, slot, name, ruleSpecs }` per builder product. Badges never change the saved build (D13). No schema change, no new route, no new dependency.

Found while planning, and fixed in the spec (T1):

- "In your build" comes before "None": E30's only-part build must read "In your build" though nothing is comparable.
- Vitest runs in Node with no DOM, so hook behavior is tested through pure functions in `lib/build-state/loader.ts`; the request count and the cross-tab update are E2E.

## Reuse

- **Engine:** `checkCandidate`, `SLOTS` ([lib/builder/index.ts](../../../lib/builder/index.ts)); `RuleId` and `builderCategories[slot].fields` with `FieldMeta.rules`, `validateSpecs`, `isBuilderCategory` ([lib/specs/index.ts](../../../lib/specs/index.ts)).
- **Build loading:** `useBuild`, `useBuildParts` ([hooks/](../../../hooks/)); `partsRequest`, `assembleLoaded`, `goneChanges` ([lib/build-state/loader.ts](../../../lib/build-state/loader.ts)); `GET /api/builder/parts` unchanged.
- **Card:** `ProductCard` already takes `children`, rendered under the row and outside the name link ([components/product/product-card.tsx](../../../components/product/product-card.tsx)). No change to it.
- **Card data:** `productCardSelect`, `toProductCardData`, `getListingPage` ([lib/products.ts](../../../lib/products.ts)); [lib/search.ts](../../../lib/search.ts).
- **Tests:** `seed`, `buildA`, `buildOf`, `seedParts`, `seedPart` ([test-support/seed-parts.ts](../../../test-support/seed-parts.ts)); the timing pattern in [lib/build-state/picker.perf.test.ts](../../../lib/build-state/picker.perf.test.ts); markup tests with `renderToStaticMarkup`.

## Design

### Pure logic (no server imports)

- `lib/specs/rule-specs.ts`: `ruleSpecsOf(slot, specs)` keeps the fields whose `FieldMeta.rules` is non-empty. Exported from `lib/specs/index.ts`.
- `lib/builder/comparable.ts`: `hasComparableParts(build, slot)`. A `Record<RuleId, slot-sets>` table (each rule lists alternative "all of these slots" sets; `integrated-graphics` is `[]`; `psu-wattage` is `[[psu, cpu], [psu, gpu]]`). Typing it as `Record<RuleId, …>` makes a new rule a type error until it has an entry, so the 14 rule files stay untouched. True when some set holds `slot` and every other slot of that set is filled in the build.
- `lib/build-state/fit.ts`: `FitPart`, `fitPartOf`, `fitOf(build, part)` returning `in-build` → `none` → `errors` / `warnings` / `fits`. One cast builds the engine's `BuildPart` from `ruleSpecs`; the equivalence test guards it.
- `lib/build-state/loader.ts`: `unreturnedIds`, and an optional `skip` set on `partsRequest`, for read-only mode.

### Hooks

- `useBuildParts({ readOnly })`: never calls `drop`; ids a successful response didn't return are remembered and skipped, so the status reaches "ready". `/builder` keeps the default.
- `useFits(parts)`: one `useBuildParts({ readOnly: true })` per page; `null` until ready.

### Server data and UI

- `ListingProduct = ProductCardData & { fit }`, `listingSelect`, `toListingProduct` in `lib/products.ts`, used by `getListingPage` and the rank-ordered search query. Home and related keep `toProductCardData`. The product page builds its `FitPart` with `fitPartOf`.
- `components/fit/fit-badge.tsx`: a reserved one-line box always; icon (`aria-hidden`), label and `sr-only` reasons when there is a state. `ListingResults` passes it in `ProductCard` `children` for products with a `fit`.
- `components/product/fit-with-build.tsx`: the product page's block after the warranty line, with the visible issue list.

## Risks

- `ProductCard` with `children` uses a column wrapper: check grid and list keep equal card heights and `h-full`.
- Hydration: the badge's first client render must equal the server render.
- The `fit` data is plain objects, so issue #44's missing-key warning shouldn't return; the E2E fixture would catch it.

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm test` after every task; `pnpm test:e2e`; a manual pass in `pnpm dev` (grid and list, product page, search, empty state, one parts request in the Network tab); the preview URL.
