# 027 — Plan: Stock flags on the cart page

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #63 · Follow-up tech-debt: #74

## Context

`/cart` shows lines and build groups but says nothing when a line can't be bought as it is: stock can drop after an add (the cap only works at add time), a product can go out of stock, onto pre-order, or be retired. This story computes flags per render, on the server, with one pure function; shows them on single lines and groups; offers a one-click "Set to n" on single lines; and adds a banner counting flagged lines. No schema change, no new server action: "Set to" reuses `setCartQuantityAction` (lowering always works). Review decisions (spec D1, D9, D12): three labels ("No longer sold", "Out of stock", "Pre-order only") with one treatment; specs 025/026 and their tests stay unchanged; totals unchanged; the E2E writes stock through `DATABASE_URL` with a production guard.

## Reuse (found while exploring)

- `getCartView` ([lib/cart/cart.ts](lib/cart/cart.ts)) already reads every `CartItem` row with its product's `status`, `stock`, `lowStockAt`, `preorderShipsOn`, so flags need **no new query**. `stockStatusOf` / `isSold` / `quantityInGroups` live there and in [lib/cart/tx.ts](lib/cart/tx.ts).
- `getStockStatus`, `isBuyable`, `manilaToday`, `stockStatusLabel` ([lib/stock.ts](lib/stock.ts)); `formatDate` ([lib/format.ts](lib/format.ts)) for "Ships {date}".
- `StockLine` ([components/product/stock-line.tsx](components/product/stock-line.tsx)) for the icon + text pattern; `CartLine`, `CartGroup`, `CartBody`, `CartContent`, `CartQuantity` in `components/cart/`; copy helpers in [lib/cart/copy.ts](lib/cart/copy.ts); types in [lib/cart/types.ts](lib/cart/types.ts); `removeButtonId` and the `refocus` effect in `CartContent` for focus handling.
- Test helpers: `resetCatalog`, `db`, `FIXTURE_TODAY` ([test-support/db.ts](test-support/db.ts)), `insertParts` with stock/status overrides ([test-support/build-fixtures.ts](test-support/build-fixtures.ts)), `makeBuild`/`lineOf`/`groupLine` patterns in [lib/cart/cart.db.test.ts](lib/cart/cart.db.test.ts); `snapshot()` / `partsOf()` ([test-support/shared-snapshot.ts](test-support/shared-snapshot.ts)) and `groupOf()` in [components/cart/cart-group.test.tsx](components/cart/cart-group.test.tsx) for group markup tests; E2E `saveBuild`, `itemsFor`, the `__noReload` mark ([e2e/build-fixtures.ts](e2e/build-fixtures.ts), [e2e/cart-build.spec.ts](e2e/cart-build.spec.ts)).
- E2E guard: `assertResetAllowed(env, { requireProductionHost })` ([lib/reset-guard.ts](lib/reset-guard.ts)); `pg` and `dotenv` are already dependencies.

## Design

**Pure module `lib/cart/flags.ts`** (no database; the ESLint restriction only covers `lib/builder` and `lib/specs`):
- Types: `UnavailableKind = "retired" | "out-of-stock" | "pre-order"`; `ProductFlag = { kind: UnavailableKind } | { kind: "over-stock"; stock; total }`.
- `productFlags(lines, products)` → `Map<productId, ProductFlag>` (flagged products only). `lines` = `{ productId, quantity }` for every `CartItem` row (single and group); `products` = `{ active, status: StockStatus, stock }` by id. Order: not active → retired; status `out-of-stock` → out-of-stock; `pre-order` → pre-order; held > stock → over-stock; else none.
- `setToQuantity(flag, line quantity, held)` → `n | null` (n = stock − (held − quantity), only when 1 ≤ n < quantity).
- `groupPartFlags(slots, flags)` → `{ productId, name, flag }[]` in slot order; a `retired` row is flagged `retired` even if the product has no flag.
- `flaggedCount(entries)`.

**View (`lib/cart/types.ts`, `getCartView`):** `CartLineView` gains `flag: ProductFlag | null` and `setTo: number | null` (both required; `sold` stays for the subtotal); `CartGroupView` gains `flags: GroupPartFlag[]`; `CartView` gains `flagged: number`. `max` for an unavailable line becomes its own quantity (fixes the pre-order plus). Subtotal and group totals untouched.

**UI:**
- `components/cart/cart-flag.tsx` (new, presentational): `FlagLine` (icon + text; destructive style for the three unavailable kinds, warning style for over-stock).
- `CartLine`: for an active unavailable line, `FlagLine` replaces `StockLine`, plus "Ships {date}" for pre-order; over-stock shows `StockLine` then `FlagLine` and a **Set to n** button (`onSetTo`). The retired branch keeps its markup (it already is the flag). `CartQuantity` gets an optional `inputId` so focus can land on the field.
- `CartGroup`: collapsed flag line (one part named / "n parts need attention") under the status line; `GroupRow` takes the part's flag: unavailable replaces its `StockLine`, over-stock adds the text under it. Retired rows unchanged.
- `CartBody`: an always-present `aria-live="polite"` container above the list holding the banner when `view.flagged > 0`; passes `onSetTo`.
- `CartContent`: `setTo(line, n)` = the existing set-quantity flow; on success status "Set {name} to {n}." and queue focus to the line's quantity field (the existing `useEffect([view])` handles it, because the field is disabled until the busy state commits); failure and not-found reuse `explain`.
- `lib/cart/copy.ts`: `flagText`, `groupFlagText`, `bannerText`, `setToLabel`, `setToStatusText`.

**E2E helper `e2e/stock.ts`:** `setStock(productName, stock)` via `pg` on `process.env.DATABASE_URL`; calls `assertResetAllowed(process.env, { requireProductionHost: !process.env.CI })` first; throws unless exactly one row changed. `playwright.config.ts` loads `.env.local` with `dotenv` when present (CI has no file; `DATABASE_URL` is a job env var). The spec sets stock to the known seed value (20) first and again in `finally`.

## Tasks (commit after each; subject-only messages, no trailer; stage only that task's files)

1. **Flag logic** — `lib/cart/flags.ts` + `flags.test.ts`: the three issue examples, boundary, label order, unavailable beats over-stock, `setTo` present/absent, several groups, kit × 2, group-part rules, count. (E1–E9, E13, E16–E20)
2. **Copy** — extend `lib/cart/copy.ts` and `copy.test.ts`: flag text (all four), group flag (1 / n), banner (1 / n), Set to label/status.
3. **View** — `types.ts` fields; `getCartView` builds `productFlags` from `rows`, sets `flag`/`setTo`/`max`, group `flags`, `flagged`. Update `CartLineView`/`CartGroupView`/`CartView` literals in existing tests (`cart-body.test.tsx`, `cart-group.test.tsx`) with the new required fields. Add `lib/cart/flags.db.test.ts` (or extend `cart.db.test.ts`): stock lowered after adds, retired/draft, pre-order, out of stock, groups sharing a product (Build A + Build B cooler), reading creates nothing, Set to through `setCartQuantity` clears both flags. (E1–E8, E10–E16, E20)
4. **Line UI** — `cart-flag.tsx`, `CartLine`, `CartQuantity` `inputId`; render tests for every variant incl. disabled plus and "Ships {date}". (E5, E6, E10–E13)
5. **Group UI** — `CartGroup`/`GroupRow` flags; render tests collapsed (one / several) and expanded, three reasons in one group. (E3, E14–E16, E20)
6. **Banner + Set to wiring** — `CartBody` banner container, `CartContent` `setTo`, focus, status; render tests for banner presence/absence/plural. (E1, E2, E17–E19, E21–E25)
7. **E2E** — `e2e/stock.ts`, `playwright.config.ts` env loading, `e2e/cart-flags.spec.ts` (E26–E28) with MSI MAG A650BN 650W. Before writing it, `grep` `e2e/` and confirm the part is unused and that a PSU-only build has no errors (else pick another unused part).
8. **Docs** — CLAUDE.md cart bullet (replace the "No longer sold… flags are #63" sentence with the flag rules, the E2E helper and #74); README if it describes the cart or E2E; add `plan.md` and `tasks.md` to `docs/specs/027-cart-stock-flags/` per the 025/026 convention.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit + render), `pnpm test:db` (Docker Postgres: `pnpm test:db:up`, inline `TEST_DATABASE_URL`; don't add it to `.env.local`), `pnpm build`, `pnpm test:e2e` (the new spec plus cart, cart-build and builder specs to confirm nothing regressed; `.env.local` must have `PRODUCTION_DATABASE_HOST` for the helper locally).
- Manual on a dev run: add Ryzen 5 7600 × 2 and Build A, lower the 7600's stock to 2 in the database → both lines flagged, banner "2 lines need attention…", Set to 1 clears both; then stock 0 → "Out of stock"; draft → "No longer sold"; pre-order → "Pre-order only" + ship date. Restore stock afterwards.
- Check on the preview URL at 1024 px and wider (definition of done).

## Risks

- E2E writes to the Neon dev branch locally (spec D12): guarded, restored in `finally`, tracked in #74. `db:seed` keeps existing stock, so a crashed run leaves it changed until the next run resets it to 20.
- Making `flag`/`setTo`/`flags`/`flagged` required breaks existing test literals; the type checker lists them, and task 3 updates them.
- `process.env.CI` decides whether `PRODUCTION_DATABASE_HOST` is required; CI never sets it, so there the guard checks only `NODE_ENV`.
