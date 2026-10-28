# 021 — Plan: Slot part picker with compatible parts first

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #54

## Context

`/builder` (spec 020) works, but its "Choose…" and "Change" links still go to the category listings. Nothing in the UI runs `checkCandidate` yet. This story adds the picker: a dialog on `/builder` that loads a slot's active parts fresh from a new no-store route, then checks every part in the browser. The default list shows only parts that fit and can be bought. "Show all" adds the rest, greyed, with their reasons.

It also adds:
- "Add anyway" with a confirmation;
- the banner for errors the build already has;
- the empty states;
- a CI timing test;
- ADR 0006 and the epic E2E test.

There's no schema change and no new dependency.

## Reuse

- **Engine** ([lib/builder/index.ts](../../../lib/builder/index.ts)): `checkCandidate`, `applyCandidate`, `checkBuild`, `SLOTS`, `SLOT_LIMITS`, `InvalidBuildError`.
- **Build state:**
  - `planAdd` ([lib/build-state/plan-add.ts](../../../lib/build-state/plan-add.ts)) for add, raise, at-stock and full. Its "confirm-replace" quantity is the memory cap. The picker replaces right away (D4).
  - The store's `add`, `replace` and `remove` ([lib/build-state/store.ts](../../../lib/build-state/store.ts)).
  - `MAX_BUILD_PRODUCTS` and `BuilderPartData` ([lib/build-state/parts.ts](../../../lib/build-state/parts.ts)).
  - `SLOT_COPY` ([lib/build-state/slots.ts](../../../lib/build-state/slots.ts)).
  - `assembleLoaded` and `partsRequest` ([lib/build-state/loader.ts](../../../lib/build-state/loader.ts)).
- **Server:**
  - The `getBuilderParts` row mapping ([lib/builder-parts.ts](../../../lib/builder-parts.ts)).
  - `productCardSelect`, `toProductCardData`, `toDateString` ([lib/products.ts](../../../lib/products.ts)).
  - `getStockStatus`, `isBuyable`, `manilaToday`, `stockStatusLabel` ([lib/stock.ts](../../../lib/stock.ts)), and `formatDate` for "Pre-order: ships …".
  - The parts route pattern ([app/api/builder/parts/route.ts](../../../app/api/builder/parts/route.ts)).
- **UI:**
  - `ProductCard` ([components/product/product-card.tsx](../../../components/product/product-card.tsx)).
  - `Dialog*`, `Checkbox`, `Skeleton` and `Button` (`components/ui/`). Base UI's `Popup` takes `finalFocus` (a ref or a function), and nested dialogs close one at a time on Escape.
  - `SeverityMarker` ([components/builder/slot-section.tsx](../../../components/builder/slot-section.tsx)).
  - The dialog pattern in [components/product/add-to-build.tsx](../../../components/product/add-to-build.tsx).
- **Tests:**
  - `seed`, `seedParts`, `buildA`, `buildOf`, `fixturePart` ([test-support/seed-parts.ts](../../../test-support/seed-parts.ts)).
  - `resetCatalog` and `createCategoryAndBrand` ([test-support/db.ts](../../../test-support/db.ts)).
  - Markup tests with `renderToStaticMarkup`, since the repo has no DOM test library.

## Files

```
lib/build-state/candidates.ts (+test)    builderCandidatesQuerySchema: getAll("slot") → array of exactly 1,
                                         z.enum(SLOTS) (exact match); BuilderCandidate = { data: BuilderPartData;
                                         card: ProductCardData }
lib/build-state/picker.ts (+test)        pickerList(build, slot, candidates, { mode: "add"|"change", replace?,
                                         showAll, items }) → { entries, shown, total, banner, empty, changeSlots,
                                         notes }; group/precedence, cheapest-first sort, markers (current /
                                         in-build ×n), action (add | add-anyway | disabled:not-buyable |
                                         disabled:at-stock | disabled:full | none)
lib/build-state/picker.perf.test.ts      E39: 5 warm-ups, median of 20 runs over Build A × 30 GPUs < 50 ms
lib/build-state/slots.ts                 + plural, storage noun "drive"; empty-state/title copy helpers
lib/build-state/store.ts (+test)         + replaceDrive(oldId, newId, stock): keep position, quantity capped at
                                         stock, merge into an existing entry (mirrors applyCandidate)
lib/builder-parts.ts                     extract toBuilderPartData(row, today) shared with candidates
lib/builder-candidates.ts (+.db.test)    getBuilderCandidates(slot, today): ACTIVE products in the slug's category,
                                         select { ...productCardSelect, id, effectivePrice }, validateSpecs
                                         (invalid → logged, left out)
app/api/builder/candidates/route.ts      GET: schema → 400 { error } | 200 { today, candidates }; no-store both
  (+ route.db.test.ts)
hooks/use-candidates.ts                  fetch on open, ignore stale responses, error + retry
hooks/use-build-parts.ts                 + addLoaded(data): put a picked part into `loaded` before the store change
components/product/product-card.tsx      + greyed?: boolean, children (footer under the body); action sits above the
  (+test)                                ::after link overlay (relative z-10). Listings unchanged
components/builder/picker-body.tsx       presentational (markup-testable): count line (aria-live polite), notes,
  (+test)                                banner, list of PickerCard, empty/loading/error states
components/builder/picker-card.tsx       ProductCard + warnings, reasons, marker, action button, aria-describedby
components/builder/slot-picker.tsx       Dialog shell: title, Close, Show all Checkbox, fixed header + scrolling
                                         list (flex column, max-h, overflow-y-auto on the list only), nested
                                         "Add anyway" confirm dialog, finalFocus
components/builder/slot-section.tsx      Choose/Change/Add another drive → buttons calling onPick; per-drive Change;
                                         data-focus attributes for focus after a pick
components/builder/builder.tsx           picker state { slot, mode, replace?, trigger }; pick handler; focus after pick
components/home/hero.tsx (+ home.spec)   drop the "Coming soon" badge
lib/builder/check.bench.ts               comment points to picker.perf.test.ts
docs/adr/0006-filter-builder-candidates-in-memory.md
docs/specs/021-slot-picker/{plan,tasks}.md, CLAUDE.md
e2e/builder.spec.ts (updated), e2e/epic-build.spec.ts (new)
```

## Design

- **Picker logic is pure** (`pickerList`), so the toggle and build changes re-run it in a `useMemo` with no request.
  - **Options per candidate:**
    - one-part slots and memory: no options;
    - storage, change mode: `{ replace }`, but only while that drive is still in the build, otherwise add mode (E33).
  - **Group:**
    - any error → "Doesn't fit";
    - otherwise not buyable → "Fits, not buyable";
    - otherwise warnings → "Fits with warnings";
    - otherwise "Fits".
  - **Sort:** by group, then `effectivePrice`, name, id.
  - **Banner:** the errors of `checkBuild(baseline)`. The baseline is the slot emptied, or for storage the build minus the drive being replaced. A small local baseline helper reproduces `candidate.ts`'s private one, so it doesn't widen the engine's public API.
  - **Empty state:**
    - no candidates → no products;
    - some candidate has no errors → none buyable;
    - otherwise → none fit.
  - **`changeSlots`:** the slots in all the errors' `parts`, minus this slot, in `SLOTS` order.
  - **Actions:**
    - change mode: the current part gets none;
    - not buyable → disabled;
    - storage add: `planAdd` gives at-stock or full → disabled;
    - errors → add-anyway;
    - otherwise → add.
- **Picking** (`builder.tsx`):
  1. `addLoaded(candidate.data)`.
  2. Then, by slot and mode:
     - storage change → `replaceDrive`;
     - otherwise `store.add(slot, id, stock)`. If the plan is `confirm-replace`, call `store.replace(slot, id, plan.quantity)` right away (D4: no dialog in the picker; the memory cap comes from the plan).
  3. Close the picker with `finalFocus` returning `false`.
  4. Focus the slot's `[data-focus="change-{slot}-{id}"]` after the next render.
  - Escape and Close keep the default `finalFocus`, a ref to the button that opened the picker.
- **"Add anyway"** opens a nested `Dialog` that lists the card's error messages. Confirm runs the same pick. Cancel closes only the nested dialog, and focus returns to the card's button.
- **Route.** It reads `request.nextUrl.searchParams.getAll("slot")` and parses it with `builderCandidatesQuerySchema.safeParse`. It answers `Response.json({ today: manilaToday(), candidates })`, and both answers send `Cache-Control: no-store`, as the parts route does.
- **Fetching** (`useCandidates(slot | null)`): fetches with `cache: "no-store"` each time the slot opens, guarded by a request id. Its status is loading, ready or error, with `retry`. Cards get the response's `today`.
- **Layout.** `DialogContent` is widened (`sm:max-w-3xl`, `max-h-[85vh]`, flex column). The header, toggle, count line, notes and banner don't shrink, and only the `<ul>` has `overflow-y-auto`.

## Tasks

See [tasks.md](tasks.md).

## Verification

- `pnpm test`: schema, `pickerList`, store, markup and the perf test.
- `pnpm test:db` against Docker Postgres (inline `TEST_DATABASE_URL`): candidates and the route.
- `pnpm lint`, `pnpm typecheck`.
- `pnpm test:e2e` against `pnpm dev` (the key-warning and hydration guards apply). Then `pnpm build` and `CI=1 pnpm test:e2e` for the production build.
- Manual check at 1024 and 1280 px:
  - the list scrolls while the header, toggle and banner stay put;
  - keyboard only: open, Tab through cards, Escape, focus return, nested confirm;
  - a screen reader announces the count line;
  - two tabs: a change in one re-checks the open picker in the other.
