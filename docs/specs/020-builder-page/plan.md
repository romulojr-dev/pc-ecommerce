# 020 — Plan: Builder page with saved state, summary and Add to build

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #53

## Context

`/builder` is a "coming soon" placeholder, and the product page's Add to build is a disabled button. The rules engine (`lib/builder/`, specs 018 and 019) is done but has no screen. This story adds:

- the saved build: a Zustand store in `localStorage` holding ids only;
- a no-store `GET /api/builder/parts` route that loads parts fresh;
- the `/builder` page: eight slots plus a sticky summary showing total, estimated power, status, issues and availability;
- a working Add to build on the product page.

There's no schema or migration change. The one new dependency is `zustand`.

## Reuse

- Engine, from [lib/builder/index.ts](../../../lib/builder/index.ts):
  - `parseBuild`, `assembleBuild`, `toBuildItems`, `BuildItem`, `BuildChange`;
  - `SLOTS`, `SLOT_LIMITS`;
  - `checkBuild`, `buildStatus`, `estimateWattage`.
  - Every read from `localStorage` goes through `parseBuild`.
- Stock and money:
  - `getStockStatus`, `manilaToday`, `stockStatusLabel` ([lib/stock.ts](../../../lib/stock.ts));
  - `formatPeso`, `formatDate` ([lib/format.ts](../../../lib/format.ts));
  - `toDateString` ([lib/products.ts](../../../lib/products.ts)).
- Categories and links: `builderCategories` names ([lib/specs/registry.ts](../../../lib/specs/registry.ts)), `isBuilderCategory`, `validateSpecs`, `categoryHref`, `productHref` ([lib/site.ts](../../../lib/site.ts)).
- UI:
  - `ProductImage` and `ProductPrice` (`components/product/`);
  - `Skeleton`, `Tooltip*`, `Dialog*`, `Button`, `buttonVariants` (`components/ui/`);
  - `Container`, `focusRing`.
- SEO: `socialMetadata` ([lib/seo/metadata.ts](../../../lib/seo/metadata.ts)), and the page's existing `robots: { index: false }`.
- Tests:
  - [test-support/seed-parts.ts](../../../test-support/seed-parts.ts) (`seed`, `buildA`, `fixturePart`);
  - [test-support/db.ts](../../../test-support/db.ts) (`resetCatalog`, `createCategoryAndBrand`, `FIXTURE_TODAY`);
  - markup tests with `renderToStaticMarkup`, as in `product-card.test.tsx` (Node env, no DOM library).

## Files

```
lib/stock.ts (+test)                     isBuyable(status): in-stock | low-stock
lib/build-state/                         client-safe, no db/env imports
  parts.ts (+test)                       MAX_BUILD_PRODUCTS=20, builderPartsQuerySchema (Zod: ids "a,b", 1–20,
                                         z.cuid() each, no duplicates), BuilderPartData type,
                                         capProducts(items) (drops last drives past 20)
  slots.ts                               per-slot copy: name (from builderCategories), "Choose …" label, noun
  plan-add.ts (+test)                    planAdd(items, { slot, productId, stock }) → add | raise | already |
                                         at-stock | full | confirm-replace{quantity}
  summary.ts (+test)                     buildTotal, buildNotice(changes), availabilityMessage(parts)
  store.ts (+test)                       createBuildStore(storage) + buildStore singleton (zustand/vanilla + persist)
lib/builder-parts.ts (+ .db.test.ts)     getBuilderParts(ids, today): active, builder category, valid specs
app/api/builder/parts/route.ts           GET: schema → 400 | getBuilderParts → 200, Cache-Control: no-store
hooks/use-build.ts                       useBuild(): store hydration once, storage-event sync, selectors
hooks/use-build-parts.ts                 loader: fetch, stale-response guard, drop + notice, error/retry
components/builder/
  builder.tsx                            client root: notice, slot list, summary; skeleton until ready
  slot-row.tsx, quantity-stepper.tsx     row with image, price, stock label + note, markers, actions
  build-summary.tsx (+test)              presentational: total, power + tooltip, status, issues,
                                         availability, disabled Add build to cart
  build-notice.tsx, builder-skeleton.tsx
components/product/add-to-build.tsx      client: planAdd → act or open replace Dialog; status line
app/(store)/builder/page.tsx             metadata (title, description, canonical, noindex, social) + shell
app/(store)/[category]/[product]/page.tsx  AddToBuild for builder parts; not-buyable state; "Cart is coming soon."
e2e/test.ts                              + hydration-error guard
e2e/builder.spec.ts (new); product-page.spec.ts, seo.spec.ts (updated)
CLAUDE.md
```

## Design

- **Store** (`store.ts`).
  - Built with `createStore` and `persist`:
    - storage key `pc-silicon-build`, `version: 1`;
    - `partialize` saves only `{ items }`;
    - `skipHydration: true`.
  - A custom `PersistStorage` wraps `localStorage`:
    - `getItem` returns `{ state: { items: null }, version: 1 }` when the value isn't JSON, so `parseBuild(null)` gives the `reset` change;
    - a storage error (private mode, quota) is swallowed: the build stays in memory (spec Rules › Store).
  - `merge` runs `parseBuild(persisted.items)`, then `capProducts`. It keeps only a `reset` change, as `notice`. `migrate` passes the stored value through, and `merge` cleans it.
  - State: `items`, `hydrated`, `notice`.
  - Actions:
    - `add` and `raise`, following `planAdd`;
    - `replace(slot, productId, quantity)`;
    - `remove(slot, productId)` and `setQuantity`;
    - `drop(productIds)` and `dismissNotice`.
  - Every action does nothing while `!hydrated`. Storage keeps insertion order, and items stay in slot order.
  - Tests use `createBuildStore(fakeStorage)`.
- **Hydration.** `useBuild()`:
  - calls `buildStore.persist.rehydrate()` once on mount, then sets `hydrated`;
  - listens for `storage` events on the key and rehydrates.
  - Before hydration, components render the initial state (empty and not hydrated), the same as the server, which shows the skeleton. That's why there's no mismatch.
- **Parts loader** (`useBuildParts(items)`):
  - Holds a `Map<id, BuilderPartData>` and a status: `idle`, `loading`, `ready` or `error`.
  - Fetches `/api/builder/parts?ids=…` (every id in the build) only when an id isn't in the map. An empty build stays at `ready` without a request.
  - A request counter ignores stale responses.
  - On success, it runs `assembleBuild` against the map. It drops only the `not-found` and `wrong-category` ids that were in that request, then calls `store.drop` and sets the "no longer available" notice through `buildNotice`.
  - A 400 or a network error sets `error` and leaves the store untouched. Retry refetches.
- **Route.**
  - Reads `request.nextUrl.searchParams.get("ids")` and checks it with `builderPartsQuerySchema.safeParse`.
  - Bad input gets `Response.json({ error: "Invalid ids" }, { status: 400 })`. Good input gets `Response.json({ parts })`.
  - Both answers send `Cache-Control: no-store`. GET route handlers aren't cached by default in Next 16 (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`), and the header also keeps CDNs and browsers from caching.
  - `getBuilderParts`:
    - one `findMany` with `id in`, `status: "ACTIVE"`;
    - selects `effectivePrice`, `price`, `salePrice`, stock fields, `specs`, brand, category slug and the first image;
    - skips non-builder categories and specs that fail `validateSpecs` (logged with `console.error`, as the product page does);
    - `stockStatus` comes from `getStockStatus(row, today)`.
- **Summary** (`build-summary.tsx`, presentational).
  - Props: `state` (`loading`, `error` or `ready`), `isEmpty`, `total`, `power` (a `PowerEstimate`), `status`, `issues`, `unavailable` (part names) and `onRetry`. `builder.tsx` computes them: `checkBuild` and `estimateWattage` on the assembled `Build`, `buildTotal` from the map.
  - Sticky from `lg` up in a two-column grid. Status and severity come as icon plus text.
- **Slot row.**
  - Shows `ProductImage` (`sizes="64px"`), the name as a link (`productHref`), the brand and `ProductPrice` (shows the sale price).
  - Shows `stockStatusLabel` plus the not-buyable note when `!isBuyable`.
  - An Error or Warning marker comes from issues whose `parts` include the part's `{ slot, id }`.
  - The stepper (memory and storage) runs from 1 to `stock`. Increase is enabled only if the part is buyable and `quantity < stock`, and decrease only if `quantity > 1`.
  - "Choose" and "Change" link to `categoryHref(slot)`. Storage gets "Add another drive" → `/storage`.
- **Add to build** (`add-to-build.tsx`).
  - Props: `{ productId, name, slot, stock }`. The server renders it only for buyable builder parts.
  - A not-buyable part gets a plain disabled `Button` plus "Only parts in stock can be added to a build." through `aria-describedby`. That part is server-only, so no client JS runs for it.
  - On click, if hydrated, it runs `planAdd(buildStore.getState().items, …)`:
    - `add` and `raise` act;
    - `confirm-replace` opens a controlled `Dialog` (title and body from `slots.ts`, kept quantity);
    - `already`, `at-stock` and `full` only set the status line.
  - The status region is always mounted (`role="status"`) with a "View build" link.
- **Hydration guard** (`e2e/test.ts`). The auto fixture also collects console errors matching `/Hydration failed|didn't match the client|Minified React error #(418|423|425)/`.

## Verification

- `pnpm test`: the unit tests for `isBuyable`, the query schema and cap, `planAdd`, the store (with fake storage), the summary helpers and the summary/row markup.
- `pnpm test:db` (Docker Postgres): `getBuilderParts` and the route handler. That means active only, unknown and draft ids absent, current prices, all four stock statuses, 200 with no-store and 400s.
- `pnpm test:e2e` against `pnpm dev`:
  - `builder.spec.ts`;
  - the updated `product-page.spec.ts` and `seo.spec.ts`;
  - the hydration guard on every test.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, then `pnpm start` and E2E with `CI=1`, so the production build's minified hydration errors are covered too.
- Manual check on the preview URL at 1024 and 1280 px: the summary stays sticky, keyboard use works (dialog focus, tooltip, steppers), and two tabs stay in sync.
