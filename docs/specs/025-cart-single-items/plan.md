# 025 — Plan: Cart for single items

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #60

## Context

The store has no cart: the product page's Add to cart is always disabled ("Cart is coming soon.") and the header's cart icon goes nowhere. This story adds a guest cart in the database (products and quantities only, prices always current), found by a random id in a `__Host-cart` httpOnly cookie; Add to cart on the product page with the chosen quantity; `/cart` with steppers, remove, subtotal and an empty state; and a header count that updates without a page load. The stock cap counts a product's total across all lines, and `cartCount` counts build groups as 1, so #62 only adds lines. Review added a CI drift check for schema vs migrations.

Checked while planning:
- Prisma 7.10.1 has `partialIndexes` (preview); `where` takes an object (`{ buildId: null }`) or `raw("…")`.
- `prisma migrate diff` has `--from-migrations`, `--to-schema`, `--exit-code` (0 empty, 2 diff, 1 error); `--from-migrations` needs a shadow database, which Prisma 7 reads from `datasource.shadowDatabaseUrl` in the config.
- Next 16: `cookies().set` only in server actions / route handlers; setting a cookie in an action re-renders the current route in the same round trip; `refresh()` from `next/cache` refreshes the router from an action.
- Playwright's Chromium keeps a `__Host-` Secure cookie on `http://localhost` (spec D4).

## Reuse

- Stock: `getStockStatus`, `isBuyable`, `manilaToday`, `stockStatusLabel`, `clampQuantity` (`lib/stock.ts`).
- Product data: `productCardSelect` / `toProductCardData` pattern and `toDateString` (`lib/products.ts`) for the cart line select; `ProductImage`, `ProductPrice` (its struck-through markup; a smaller variant for lines), `formatPeso`.
- The product page's `StockLine` / `statusIcon` (move to `components/product/stock-line.tsx` so the cart line shows the same icon + text).
- Route handler pattern: `app/api/builder/parts/route.ts` (`no-store` headers).
- Thin server action pattern: `app/(store)/builder/actions.ts` → `lib/build-share.ts`.
- Zustand vanilla store pattern: `lib/build-state/store.ts`.
- Tests: `resetCatalog`, `db` (`test-support/db.ts`); `insertParts` with stock/price/status overrides (`test-support/build-fixtures.ts`); seed parts (`test-support/seed-parts.ts`); `shareBuild` to make `Build` rows for build-group lines; markup tests with `renderToStaticMarkup`; E2E `test`/`expect` from `e2e/test.ts`.

## Files

```
prisma7.config.ts                    datasource.shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL (optional;
                                     only CI and `pnpm db:drift` set it)
package.json                         + "db:drift": prisma migrate diff --from-migrations prisma/migrations
                                       --to-schema prisma/schema.prisma --exit-code
.github/workflows/ci.yml             create pcsilicon_shadow next to pcsilicon_test; "Check schema drift" step
                                     after "Apply migrations" with SHADOW_DATABASE_URL
prisma/schema.prisma                 previewFeatures ["partialIndexes"]; Cart (id, createdAt, updatedAt, items);
                                     CartItem (id, cartId cascade, productId restrict, quantity, buildId? restrict,
                                     createdAt); @@unique([cartId, productId], where: { buildId: null });
                                     @@unique([cartId, productId, buildId]); @@index productId, buildId;
                                     back-relations on Product and Build
prisma/migrations/…_cart/            generated + appended CHECK ("quantity" >= 1)
prisma/seed/write.ts, test-support/db.ts   TRUNCATE adds "Cart" (comment updated)
lib/cart/id.ts (+test)               isCartId(v): /^[A-Za-z0-9_-]{22}$/ (pure); newCartId() in lib/cart/server
lib/cart/cap.ts (+test)              MAX_CART_QUANTITY = 99; capQuantity({ op, requested, line, others, stock })
                                     → { quantity, note? } (spec Rules › Stock cap). E3–E7, E15, E17–E20
lib/cart/count.ts (+test)            cartCount(lines: { quantity, buildId }[]); cartCountLabel(n); badgeText(n)
                                     ("99+"). E39–E44, E32
lib/cart/input.ts (+test)            Zod: addInput { productId, quantity }, setInput { lineId, quantity },
                                     removeInput { lineId }; strip unknown keys. E10, E21, E11
lib/cart/copy.ts (+test)             capNoteText(note), addResultText(result), Messages strings
lib/cart/types.ts                    CartResult, CartNote, CartView, CartLineView (shared with client)
lib/cart/cart.ts (+db.test)          server-only. addToCart / setCartQuantity / removeFromCart(input,
                                     { cartId: string | null, today }) → CartResult & { cartId, renewCookie };
                                     getCartCount(cartId); getCartView(cartId, today) (React cache)
lib/cart/cookie.ts                   server-only: CART_COOKIE = "__Host-cart", options (httpOnly, secure,
                                     sameSite lax, path "/", maxAge 2592000), readCartId() (isCartId or null),
                                     writeCartId(id)
lib/cart/schema.db.test.ts           pg_indexes has both unique indexes (partial WHERE ("buildId" IS NULL));
                                     raw inserts: second single line refused, quantity 0 refused, product delete
                                     refused (Restrict)
app/(store)/cart/actions.ts          "use server": addToCartAction, setCartQuantityAction, removeFromCartAction:
                                     readCartId → lib call → writeCartId when renewCookie → set/remove call
                                     refresh(); return CartResult (never the cart id)
app/api/cart/count/route.ts (+test)  readCartId; null → { count: 0 } with no db import call; else
                                     getCartCount; no-store. Unit test mocks lib/cart/cart to throw if called
lib/cart/count-store.ts (+test)      vanilla Zustand { count: number | null, seq }; fromAction(n) bumps seq;
                                     fromRoute(n, seqAtStart) applies only if seq unchanged (D8)
components/layout/cart-link.tsx      client: fetch count on mount; Link "/cart" with label from
                                     cartCountLabel and aria-hidden badge; replaces the Link in site-header.tsx
components/product/stock-line.tsx    StockLine + statusIcon moved out of the product page
components/product/quantity-selector.tsx   controlled: text + onTextChange props (state lifted)
components/product/purchase.tsx      client: owns quantity text; renders QuantitySelector, AddToCart and the
 (+test)                             buttons row with AddToBuild passed as a slot; disabled + combined note when
                                     not buyable (D9, D13)
components/product/add-to-cart.tsx   client: useTransition → addToCartAction; "Adding…", aria-busy; role=status
                                     result / role=alert error; sets count store; View cart link
app/(store)/[category]/[product]/page.tsx   uses Purchase; drops "Cart is coming soon." and the old note
app/(store)/cart/page.tsx, loading.tsx      connection(); readCartId → getCartView; metadata (title "Cart",
                                     noindex, canonical /cart); empty state or lines + summary
components/cart/cart-lines.tsx (+test)      client: list, page-level status region, focus after remove
components/cart/cart-line.tsx (+test)       image, linked name, brand, unit price, CartQuantity, line total,
                                     StockLine, Remove; retired variant ("No longer sold", "Not included in the
                                     subtotal.", no link/price/stepper); per-line status/alert
components/cart/cart-quantity.tsx    minus / field / plus; sends absolute quantity; blur/Enter; disabled while pending
components/cart/cart-summary.tsx, cart-empty.tsx (+test)
e2e/cart.spec.ts                     E33–E37 (+ E38 home stays static: no Set-Cookie, badge after load)
CLAUDE.md, README                    cart bullet; db:drift and the CI step
```

## Design

- **Writes** run in one `db.$transaction`: if the cookie's cart exists, `SELECT … FROM "Cart" WHERE id = $1 FOR UPDATE`; otherwise (add only) insert a new cart with `newCartId()` (crypto `randomBytes(16).toString("base64url")`). Read the product (status, stock, lowStockAt, preorderShipsOn) and the product's lines in this cart; compute with `capQuantity`; write the single line with one raw `INSERT … ON CONFLICT ("cartId","productId") WHERE "buildId" IS NULL DO UPDATE SET quantity = EXCLUDED.quantity` (id from `randomUUID()`); `UPDATE "Cart" SET "updatedAt" = now()`; return `cartCount` of the cart's lines. Added 0 with no single line: no insert, but `renewCookie: true`.
- **Set / remove** look the line up by `id` AND `cartId` AND `buildId IS NULL` (else `not-found`, E23–E25). A raising set re-checks active + buyable (E26); lowering and remove never do.
- **Results** never include the cart id; the lib returns it beside the result for the action to write the cookie. `renewCookie` is true only for `ok` results (E45–E48).
- **Count**: header `CartLink` fetches `/api/cart/count` once on mount; actions return `count`, and the caller calls `countStore.fromAction`. The badge is absent while `count` is null or 0, so SSR and first client render match.
- **Re-render**: set/remove call `refresh()`; the cookie write also re-renders the current route. The add on the product page re-renders the product page (per request already); client state (quantity, result line) survives because the UI isn't unmounted.
- **Cart view** reads lines ordered by `createdAt`, with product fields via a select modelled on `productCardSelect` plus `id`, `status`, `effectivePrice`; status via `getStockStatus(today)`; retired = `status !== ACTIVE`, left out of the subtotal; `count` = `cartCount(all lines)`. Build-group lines are ignored by the view (#62 renders them) but counted.
- **Drift check** goes first (T2) and must pass on `main`'s migrations before the cart migration exists; if it reports today's raw objects (triggers, CHECKs) as drift, stop and report before going further.

## Tasks

See [tasks.md](tasks.md).


## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- `pnpm test:db:up`, then `pnpm test:db` with the inline Docker `TEST_DATABASE_URL`.
- `pnpm db:drift` with an inline `SHADOW_DATABASE_URL` on the Docker Postgres: exit 0 after T4; editing the schema without a migration makes it exit 2.
- `pnpm test:e2e` against `pnpm dev`, then `pnpm build` and `CI=1 pnpm test:e2e`.
- Manual at 1024 and 1280 px, then on the Vercel preview: add with a quantity, capped add, header count without reload, stepper and remove (keyboard, focus after remove, announcements), empty state, out-of-stock and pre-order pages, the cookie's attributes in DevTools, and the home page still static (`x-nextjs-cache` / no `Set-Cookie`).
