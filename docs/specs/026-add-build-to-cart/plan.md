# 026 — Plan: Add build to cart

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #62

## Context

`/builder`'s Add build to cart is a disabled "coming soon" button. This story turns it on. The server re-runs the engine on the items it receives, refuses errors, parts that can't be bought and stock shortfalls, and asks the shopper to confirm warnings they haven't seen. A build that passes is stored as a content-addressed `Build` snapshot (spec 022) plus one `CartItem` per entry with that `buildId`, all in one transaction. `/cart` shows each group as one expandable line. No schema change: spec 025 already added `CartItem.buildId`, both unique indexes, and a `cartCount` that counts a group as 1.

The review found that the snapshot write can't catch P2002 inside a transaction. `upsertBuildSnapshot(tx, …)` uses `INSERT … ON CONFLICT DO NOTHING RETURNING` with **no conflict target**, so a `shareSlug` collision doesn't abort the transaction either (spec D5 refinement), and `shareBuild` uses it too.

## Reuse

- Validation: `shareInput` (lib/build-state/share.ts), `parseBuild`/`assembleBuild`/`checkBuild`/`buildStatus` (lib/builder), `getBuilderParts` (lib/builder-parts.ts), `isBuyable`/`manilaToday` (lib/stock.ts).
- Snapshot: `contentHashOf` (lib/build-share-hash.ts), `canonicalItems` (lib/builder/canonical.ts), `randomSlug`.
- Cart: `lockCart`, `touch`, `failed`, `CartOutcome`, `quantityInGroups` (lib/cart/cart.ts → move the private helpers to `lib/cart/tx.ts` so the build file can share them); `MAX_CART_QUANTITY`, `cartCount`, `readCartId`/`writeCartId`, `cartCountStore.fromAction`, `CART_COPY`.
- Group view: `sharedBuildView`, `SharedStatus` (lib/build-state/shared.ts); the item building in `lib/shared-build.ts`'s `load()` (extract `toSharedItems(rows, parts)` and reuse it for cart groups); `StatusLine`, `IssueList`, `PowerLine` (components/builder/summary-parts.tsx); `StockLine`, `ProductImage`, `ProductPrice` markup, `formatPeso`, `SLOT_COPY`.
- UI patterns: `MisfitDialog`/`MisfitDetails` (dialog + plain body for markup tests); `ShareDialog`'s read-items-at-click; `CartContent`'s busy/status/refocus handling.
- Tests: `resetCatalog`, `db`, `FIXTURE_TODAY` (test-support/db.ts); `insertParts`, `itemsWithIds`, `partsOfBuild` (test-support/build-fixtures.ts); `buildA`/`buildB`/`seed` (test-support/seed-parts.ts); E2E `buildAItems`/`saveBuild` (e2e/build-fixtures.ts, generalized to any part list).

## Files

```
lib/build-snapshot.ts (+db.test)  server-only. upsertBuildSnapshot(tx, items, { newSlug = randomSlug })
                                  → { id, shareSlug, created }. contentHashOf(items); up to 3 tries:
                                  INSERT INTO "Build" (id randomUUID, shareSlug, contentHash) ON CONFLICT
                                  DO NOTHING RETURNING id, "shareSlug"; none → SELECT by contentHash → found:
                                  return it; none: slug collision → next slug. New row → tx.buildItem.createMany
                                  (canonicalItems). After 3 → throws SnapshotSlugError
lib/build-share.ts                validation unchanged; write = db.$transaction(tx => upsertBuildSnapshot(…));
                                  SnapshotSlugError → { ok:false, reason:"error" } (E62 "gives up" keeps passing)
lib/build-state/warnings.ts (+t)  warningKey(issue) = `${rule}:${parts.map(p => `${p.slot}/${p.id}`).join(",")}`;
                                  unacknowledged(issues, keys)
lib/cart/build-stock.ts (+test)   buildShortages(entries [{productId,name,slotIndex,needs}], inCart Map,
                                  stock Map) → Shortage[] { name, stock, inCart, needs, limit:"stock"|"max" },
                                  slot order. E14–E20
lib/cart/input.ts (+test)         addBuildInputSchema { items: unknown, acknowledgedWarnings: string(1..200)[] ≤50 }
                                  (strip unknown keys); removeBuildInputSchema { buildId }
lib/cart/types.ts                 BuildCartResult union (spec §6); CartGroupView; CartView.entries:
                                  ({kind:"single"} & CartLineView | CartGroupView)[] replacing `lines`
lib/cart/copy.ts (+test)          shortageText, unavailableText, buildResultLines, warningsLead(n, changed),
                                  groupLabel(i|null, partCount), removedGroupText
lib/build-state/cart-button.ts(+t) buildCartButton({ state, isEmpty, status, hasUnavailable })
                                  → { enabled, reasons: ("empty"|"errors"|"unavailable")[] }. E40–E43
lib/cart/tx.ts                    lockCart, touch, failed, quantityInGroups, productTotals (moved/added)
lib/cart/build.ts (+db.test)      addBuildToCart(input, { cartId, today, newSlug? }): steps 1–3 outside a tx
                                  (shareInput → getBuilderParts → assembleBuild changes → retired/not-buyable
                                  names; checkBuild errors); then db.$transaction: lockCart (no cart, or an
                                  unknown one, counts as an empty cart) → Build by contentHash with lines in
                                  this cart → already-in-cart → per-product totals in cart + buildShortages →
                                  unacknowledged warnings → confirm → only now create the cart if needed →
                                  upsertBuildSnapshot → cartItem.createMany(buildId) → touch. A refusal writes
                                  nothing because nothing is written before the last step.
                                  removeBuildFromCart({buildId}).
lib/shared-build.ts               extract toSharedItems(buildItemRows, partsMap); load() uses it
lib/cart/cart.ts                  getCartView: also read the groups' Build (shareSlug, items+product name/status/
                                  brand), getBuilderParts once for all active ids, toSharedItems →
                                  sharedBuildView → CartGroupView { buildId, slug, number|null, partCount,
                                  total, status, issues, rows }; entries ordered by min(createdAt); subtotal
                                  += group totals
app/(store)/cart/actions.ts       addBuildToCartAction, removeBuildFromCartAction (settle + refresh on remove)
hooks/use-build-parts.ts          + reload(): refetch every saved id without clearing `loaded` (status stays
                                  ready; gone parts dropped with the notice). D14
components/builder/build-summary.tsx  real button: buildCartButton reasons as visible text (unavailable →
                                  aria-describedby the availability line's id); "Adding…"/aria-busy;
                                  aria-live result region (lines + View cart); remove "coming soon"
components/builder/warnings-dialog.tsx  WarningsDialog + WarningsDetails (title, lead, list, Add to cart/Cancel,
                                  finalFocus → the button)
components/builder/builder.tsx    useAddBuildToCart flow: click → warnings? dialog : send; result handling,
                                  cartCountStore.fromAction, reload() on errors/unavailable/confirm, confirm →
                                  dialog with server warnings + "changed" lead; result cleared when items change
components/cart/cart-group.tsx    collapsed line + disclosure (aria-expanded/controls), rows, issues, View build,
                                  Remove; cart-body.tsx renders entries; cart-content.tsx removeGroup (status,
                                  refocus, not-found, error)
e2e/cart-build.spec.ts            epic E51–E55 (Build B with the Strix → fix via picker → dialog → cart → remove)
e2e/build-fixtures.ts             itemsFor(request, list) generalizing buildAItems; BUILD_B list
docs                              plan.md, tasks.md; spec 020 + 025 "Changed by spec 026" notes; ADR 0007 dated
                                  note; CLAUDE.md cart and share bullets; README if it lists cart behavior
```

## Tasks (stop after each; lint, typecheck, test pass; one subject-only commit each)

- **T1 Docs:** spec 026 and the spec 022 notes (done in review), spec 020/025 notes, ADR 0007 note, plan.md, tasks.md.
- **T2 Snapshot write:** `upsertBuildSnapshot` and the `shareBuild` switch. *Verify:* every existing `build-share.db.test.ts` test passes unchanged (parallel shares E5/E61, slug retry and give-up E62, rollback E19), plus new ones: a slug collision inside a transaction retries without aborting; called inside an outer transaction that later rolls back → no row; BuildItems written once.
- **T3 Pure logic, test-first:** warnings key, `buildShortages`, inputs, copy, `buildCartButton`.
- **T4 Server:** `lib/cart/tx.ts` move (cart.db tests still pass), `addBuildToCart`, `removeBuildFromCart`, `getCartView` groups, `toSharedItems` extraction (shared-build tests still pass). `build.db.test.ts`: E1–E31, E56–E60, **two concurrent adds of the same build → one group, `added` + `already-in-cart`, no error** (E24), E25, E26.
- **T5 Builder UI:** actions, `reload()`, summary button, result region, warnings dialog; markup tests (E40–E50 states).
- **T6 Cart page groups:** group component, body, removal; markup tests (E32–E38, numbering).
- **T7 E2E + docs:** epic spec; CLAUDE.md, README.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` per task; `pnpm test:db:up` then `TEST_DATABASE_URL=… pnpm test:db` (inline URL, Docker Postgres) for T2/T4.
- `pnpm test:e2e` against `pnpm dev` (key-warning guard) for E51–E55 and the existing builder/cart/share specs.
- Manual on `pnpm dev`: Build A → Add build to cart → header 1 → `/cart` group expands, View build opens `/builds/<slug>`, Remove keeps the shared link working; Build B dialog; same build again → "already in your cart".
- The preview URL checks from the issue's definition of done happen after the PR.
