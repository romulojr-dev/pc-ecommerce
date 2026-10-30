# 025 — Cart for single items

Status: **Approved** (review changes applied) · Issue: #60 (Sprint 5, Checkout epic; depends on none, #59 merged) · PRD refs: FR-3 (cart count), FR-8 (Add to cart), FR-12 (single items); Technical architecture › Data model (`Cart` / `CartItem`); Milestones (Sprint 5)

## 1. Summary

This story gives the store a cart. A shopper without an account adds a part from its product page with the chosen quantity, sees the header's cart count change at once, and on `/cart` changes quantities, removes lines and sees a subtotal at current prices. The cart stores products and quantities only, in the database, found by a random id in an httpOnly cookie. It counts a product's quantity across all its lines against stock, so #62 (Add build to cart) can add build groups to the same tables, and #63 (stock flags) and the Sprint 6 checkout build on it.

## 2. Behavior

### The cart and its cookie

1. The cart is a `Cart` row with `CartItem` lines (Data and interfaces). A line is a **single item** (`buildId` null) or part of a **build group** (`buildId` set, added by #62). This story only creates single items, but every stock cap counts both kinds.
2. The cart id is a random, unguessable id the server makes (D3). It lives in an **httpOnly, Secure, SameSite=Lax** cookie named `__Host-cart` (path `/`, no domain; D4). Nothing else about the cart is stored in the browser.
3. **Lifetime:** `Max-Age` is 30 days (2,592,000 seconds). **Every cart change** (an add, set or remove that changes or creates a line, including a capped add that added 0, since it confirms the cart is in use) sets the cookie again with a fresh 30 days. Results that change nothing (`invalid`, `unavailable`, `not-found`, `error`) leave the cookie as it is. Reads never touch it.
4. **No cart is created by reading.** The cart page, the count route and the product page never create a cart or set the cookie. The first **add** creates the cart and sets the cookie.
5. **Unknown or stale cookie:** a cookie that isn't shaped like a cart id, or names a cart that doesn't exist, counts as no cart: the count is 0 and `/cart` shows the empty state. The **next add** creates a new cart and **replaces** the cookie; a set or remove with such a cookie returns `not-found` and leaves it. A cookie the browser expired (30 days without a change) is simply gone: the next add starts a new cart, and the old row is abandoned.
6. **The cart comes only from the cookie.** No action or route accepts a cart id from the request body or URL, and a line id is only ever looked up inside the cookie's cart.

### Add to cart on the product page

7. The product page's "Cart is coming soon." note and the always-disabled button go away. **Add to cart** is enabled when the product is **buyable** (`isBuyable`: In stock or Low stock, the `inStock` meaning; spec 020 D7). It sits where it is now, before Add to build.
8. A product that isn't buyable (Out of stock, Pre-order) shows Add to cart **disabled**, with visible text linked by `aria-describedby` (Messages). The quantity selector is disabled too (D9). For builder parts this one note replaces "Only parts in stock can be added to a build." (one sentence covers both buttons).
9. Clicking Add to cart sends the product id and the **selected quantity** (the quantity selector's value, clamped 1 to stock as today) to the add action. While it runs the button shows "Adding…", is disabled and has `aria-busy`. The selected quantity stays as it was afterwards.
10. **Result** (in one polite live region under the buttons, replaced by the next result; it is `aria-live="polite"` and not `role="status"`, so the product page keeps a single status role, Add to build's, which existing tests and tools find by role):
   - Everything was added: "Added to your cart." with a **View cart** link to `/cart`.
   - Fewer were added because of the cap (Rules › Stock cap): "Added {n} to your cart." then the cap note on its own line, and View cart.
   - Nothing was added because the cart already holds the cap: the cap note alone, and View cart.
   - Not buyable any more (stock or status changed since the page loaded): "This part can't be bought right now." The page doesn't change its button until reloaded.
   - Invalid input or a server error: "Couldn't add this to your cart. Try again." (`role="alert"`). Nothing was changed.
11. After a successful add (including a capped one) the **header count updates without a page load** from the count the action returns (Behavior 14).

### The header cart count (FR-3)

12. The header's cart link shows a **badge with the cart count**: the **units of single items** (the sum of their quantities) **plus 1 per build group** (a build counts as one thing, however many parts it has; D7). One pure function, `cartCount(lines)`, computes it for the header, the count route, the action results and the cart summary, so they always agree; it already handles build-group lines, which arrive in #62 (E39–E44). Above 99 it shows "99+". At 0, and until the count has loaded, there is no badge, so the server render and the first client render match and static pages stay static.
13. The count comes from a **client component** that reads `GET /api/cart/count` (`Cache-Control: no-store`) once when it mounts. **With no cookie, or a cookie that isn't shaped like a cart id, the route returns `{ "count": 0 }` without a database query.** The store layout and header never read cookies on the server, so the home page (`revalidate = 600`) and other static pages stay static (ADR 0003). If the request fails, the link shows no badge and nothing else changes.
14. **One shared trigger.** The header count lives in a small client store. Every cart action (add, set quantity, remove, and #62's Add build to cart) returns the cart's new count, and the component that called it sets the store. The badge reads the store, so it updates at once. A later count from the route never overwrites a newer count from an action (D8).
15. The link's accessible name is "Cart" with no count, "Cart, 1 item" or "Cart, {n} items". The badge itself is hidden from screen readers.

### The cart page `/cart`

16. **Per request** (`await connection()`): it reads the cookie's cart, its lines and their products fresh, so prices, stock and status are current. Nothing is cached. It has a `loading.tsx` skeleton (no 404 to protect). Title "Cart", `noindex`, its own canonical `/cart`, not in the sitemap.
17. **Lines** are listed oldest first (the order they were added; quantity changes don't move a line; D10). Each single-item line shows:
    - the product image (`ProductImage`, with `sizes`), the name linked to its product page, and the brand;
    - the **current unit price** the shopper pays (`effectivePrice`), with the regular price struck through when on sale (`ProductPrice`'s style);
    - a **quantity stepper** (minus, number field, plus), from 1 up; plus is disabled when the product's total in the cart has reached its cap (Rules › Stock cap);
    - the **line total**, unit price × quantity, with `formatPeso`;
    - the **stock status** (`getStockStatus`, `stockStatusLabel`, icon and text as on the product page);
    - **Remove**, a button named "Remove {product name}".
18. **Summary** beside the lines (sticky from 1024 px): "Subtotal ({n} items)", where n is `cartCount` (the header's number), with Σ `effectivePrice` × quantity of every line whose product is still sold (Behavior 24), "Shipping and vouchers are calculated at checkout.", and a **Checkout** button that is disabled, with the visible text "Checkout is coming soon." linked by `aria-describedby`.
19. **Changing a quantity:** minus and plus send the new quantity at once; the number field sends it on blur or Enter (clamped to 1 or more; an empty or non-number field goes back to the line's quantity without a request). While a change for a line is running, that line's stepper and Remove are disabled and the line has `aria-busy`. When it finishes, the page shows the new line, line total and subtotal without a full reload, and the header count updates.
20. **Capped change:** if the server caps the quantity (Rules › Stock cap), the line shows the result and the cap note under the line in a `role="status"` region. It stays until the next change to that line.
21. **Removing** a line removes it at once (no confirmation; D11), updates the subtotal and count, and announces "Removed {product name} from your cart." in a page-level `role="status"` region. Focus moves to the next line's Remove button, or to the previous one's when it was the last line, or to the empty state's heading when the cart is now empty.
22. **Empty state** (no cart, an unknown cookie, or no lines): heading "Your cart is empty", the text "Add parts from a product page, or plan a whole PC in the builder.", and links **Browse the home page** (`/`) and **Open the PC Builder** (`/builder`). No summary, no Checkout button.
23. **Line no longer there** (removed in another tab): a set or remove for it returns `not-found`; the page refreshes its lines and shows "That item is no longer in your cart." in the page status region.
24. **Products that are no longer active** (retired by status) stay in the cart as lines: name and brand as text (no link, since the product page is a 404), the label "No longer sold" in place of the stock status, no price, no line total, no stepper (Remove only), and the note "Not included in the subtotal." They are **left out of the subtotal** but still in `cartCount` (they are still in the cart). Flags and fixes for lines that can't be bought are #63; this rule only keeps the page honest until then.
25. **Error state:** if the database can't be read, the app's standard error page. A failed set or remove shows "Couldn't update your cart. Try again." (`role="alert"`) on that line and changes nothing.

## 3. Examples

Seed values: **AMD Ryzen 5 7600** ₱11,495.00, stock 12, In stock. **AMD Ryzen 5 7600X** price ₱12,495.00, sale ₱10,995.00, stock 14. **AMD Ryzen 7 9800X3D** ₱29,995.00, stock 4, Low stock. **AMD Ryzen 7 5800X3D** stock 0, Out of stock. **Intel Core Ultra 7 265K** Pre-order (ships 2027-02-01). Examples that write "[n]" set the product's stock to n in the test database first; "build group" lines are `CartItem`s with a `buildId` from a `Build` made by `shareBuild`, inserted by the test (Add build to cart is #62).

### Adding (`addToCart`)

| # | Cart before | Input | Expected |
| --- | --- | --- | --- |
| E1 | No cookie | Ryzen 5 7600 × 2 | `ok`, `added: 2`, `quantity: 2`, `count: 2`, no note. A new `Cart`, one single line × 2, the cookie `__Host-cart` set (httpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000) |
| E2 | Ryzen 5 7600 × 2 | Ryzen 5 7600 × 1 | One line × 3 (merged, not a second line). `count: 3` |
| E3 | [5] Ryzen 5 7600 × 3 single | Ryzen 5 7600 × 3 | Line × 5, `added: 2`, note "Only 5 in stock. You have 5 in your cart." (issue example 1) |
| E4 | [5] empty cart | Ryzen 5 7600 × 7 | Line × 5, `added: 5`, the same note (issue example 3) |
| E5 | [5] Ryzen 5 7600 × 5 single | Ryzen 5 7600 × 1 | `added: 0`, line stays × 5, the note, `count: 5` |
| E6 | [3] a build group holds Ryzen 5 7600 × 2, no single line | Ryzen 5 7600 × 2 | A single line × 1, `added: 1`, note "Only 3 in stock. You have 3 in your cart." |
| E7 | [2] a build group holds Ryzen 5 7600 × 2 | Ryzen 5 7600 × 1 | `added: 0`, no single line created, note "Only 2 in stock. You have 2 in your cart." |
| E8 | Ryzen 5 7600 × 1 | Ryzen 7 9800X3D × 1 (Low stock) | `ok`: a second line. `count: 2` |
| E9 | any | Ryzen 7 5800X3D (stock 0); Ultra 7 265K (pre-order); a draft product; an id no product has | `unavailable`. No cart created, no cookie set, nothing changed |
| E10 | any | quantity 0, −1, 1.5, `"2"`, 100; no `productId`; `productId: ""`; not an object | `invalid`. Nothing changed |
| E11 | No cookie | Ryzen 5 7600 × 1 with an extra `cartId` of another cart | The extra field is ignored: a new cart is created; the other cart is unchanged |
| E12 | Cookie names a cart that doesn't exist (or `"x"`) | Ryzen 5 7600 × 1 | A new cart, the cookie replaced with the new id and a fresh 30 days. `count: 1` |
| E13 | [12] empty cart, two adds of Ryzen 5 7600 × 2 at the same moment | — | One line × 4. Never two lines |
| E14 | [5] empty cart, two adds of Ryzen 5 7600 × 3 at the same moment | — | One line × 5 (the cap holds under concurrency); one result `added: 3`, the other `added: 2` with the note |
| E15 | [500] Ryzen 5 7600 × 98 | Ryzen 5 7600 × 5 | Line × 99, `added: 1`, note "You can have up to 99 of one part in your cart." (D6) |

### Setting a quantity and removing (`setCartQuantity`, `removeFromCart`)

| # | Cart before | Input | Expected |
| --- | --- | --- | --- |
| E16 | Ryzen 5 7600 × 3 | set that line to 1 | Line × 1, `count: 1` |
| E17 | [2] build group Ryzen 5 7600 × 1, single × 1 | set the single line to 2 | Stays × 1, note "Only 2 in stock. You have 2 in your cart." (issue example 2) |
| E18 | [5] single × 2, build group × 1 | set the single line to 4 | Single × 4. Total 5, no note |
| E19 | [2] (stock dropped) single × 3 | set to 4 | Stays × 3 (a set never raises above the cap, and never lowers a line the shopper tried to raise), note "Only 2 in stock. You have 3 in your cart." |
| E20 | [2] (stock dropped) single × 3 | set to 2 | × 2: lowering always works, no note |
| E21 | Ryzen 5 7600 × 1 | set to 0, −1, 1.5, 100; an empty line id | `invalid`. Nothing changed |
| E22 | Two lines | remove the Ryzen 5 7600 line | One line left, `count` drops by its quantity |
| E23 | Cart A has a line; the request carries cart B's cookie | set or remove cart A's line id | `not-found`. Cart A is unchanged |
| E24 | No cookie, or an unknown cookie | set or remove any line id | `not-found`. No cart created |
| E25 | A build-group line | set its quantity, or remove it by line id | `not-found` for both: build lines change only as a group (#62) |
| E26 | Ryzen 5 7600 single, then the product set to draft | set to 2 | `unavailable`. Remove still works |

### Reading

| # | Cart | Expected |
| --- | --- | --- |
| E27 | Ryzen 5 7600 × 2 + Ryzen 5 7600X × 1 | `/cart`: two lines, oldest first. 7600: ₱11,495.00, line ₱22,990.00, "In stock". 7600X: ₱10,995.00 with ₱12,495.00 struck through, line ₱10,995.00. "Subtotal (3 items)" ₱33,985.00. Checkout disabled, "Checkout is coming soon." `GET /api/cart/count` → `{ "count": 3 }`, `no-store` |
| E28 | The same, then the 7600's price changes to ₱10,000.00 in the database | `/cart` shows ₱10,000.00 and line ₱20,000.00 on the next request: prices are never stored in the cart |
| E29 | No cookie / unknown cookie / a cart with no lines | Empty state. Count `{ "count": 0 }`. No `Cart` row created, no cookie set |
| E30 | Ryzen 7 9800X3D × 1 | "Low stock" on the line |
| E31 | Ryzen 5 7600 × 1 + a retired product × 2 | The retired line shows "No longer sold" and "Not included in the subtotal.", no link, no price, no stepper. "Subtotal (3 items)" ₱11,495.00; the header count is 3 too (both are `cartCount`) |
| E32 | Single items totalling 150 units | Badge "99+", link name "Cart, 150 items" |

### The cart count (`cartCount`, pure)

Build-group lines are written here as the group they belong to; #62 creates them, and this story's function already counts them.

| # | Lines | Count |
| --- | --- | --- |
| E39 | none | 0 |
| E40 | Ryzen 5 7600 × 2 single | 2 |
| E41 | Ryzen 5 7600 × 2 + Ryzen 7 9800X3D × 1, single | 3 |
| E42 | Build A as one group (8 lines, each × 1) | 1 |
| E43 | Build A's group with the Vengeance kit × 2 (8 lines, 9 units) + Ryzen 5 7600 × 2 single | 3 (1 group + 2 units) |
| E44 | Build A's group + another build's group (both contain the Samsung 990 PRO 1TB) + Ryzen 5 7600 × 1 single, also in Build A | 3 (2 groups + 1 unit): a product in a group and as a single item counts in each |

### The cookie

| # | Before | Action | Expected |
| --- | --- | --- | --- |
| E45 | Cookie for cart C, set 29 days ago | add Ryzen 5 7600 × 1 | The line is added to C; `Set-Cookie` for the same id with Max-Age=2592000 (renewed) |
| E46 | Cookie for cart C | set a line of C to 2; remove a line of C | Each response renews the cookie (same id, 30 days) |
| E47 | [5] cookie for cart C holding Ryzen 5 7600 × 5 | add Ryzen 5 7600 × 1 (`added: 0`) | The cookie is renewed: the cart is in use |
| E48 | Cookie for cart C | add with quantity 0 (`invalid`); add Ryzen 7 5800X3D (`unavailable`); set a line of another cart (`not-found`) | No `Set-Cookie`; the cookie keeps its old expiry |
| E49 | Cookie names a deleted cart | set or remove any line id | `not-found`, no `Set-Cookie`, no cart created. Then add Ryzen 5 7600 × 1 → a new cart and the cookie replaced (E12) |
| E50 | Cookie expired in the browser (sent nothing) while cart C still has lines | add Ryzen 5 7600 × 1 | A new cart D with one line; C is untouched and abandoned |
| E51 | No cookie / `__Host-cart=x` (not a cart id) | `GET /api/cart/count` | `{ "count": 0 }`, `no-store`, **no database query**, no `Set-Cookie` |
| E52 | Cookie for cart C | `GET /cart`, `GET /api/cart/count` | No `Set-Cookie`: reads never renew |

### Product page and header (E2E)

| # | Steps | Expected |
| --- | --- | --- |
| E33 | Fresh context → `/cpu/<Ryzen 5 7600 slug>` → quantity 2 → Add to cart | "Added to your cart." and View cart; header link "Cart, 2 items", badge 2, **no page load** |
| E34 | → View cart | One line × 2, line total and subtotal ₱22,990.00 |
| E35 | → minus | Line × 1, subtotal ₱11,495.00, header "Cart, 1 item" |
| E36 | → Remove Ryzen 5 7600 | "Removed AMD Ryzen 5 7600 from your cart.", empty state, header "Cart" with no badge |
| E37 | Ryzen 7 5800X3D's page | Add to cart and the quantity selector disabled, "Only parts in stock can be added to your cart or build." |
| E38 | The home page after an add | Still served static (no cookie read in the layout); the badge appears after the count loads |

## 4. Rules and edge cases

### Stock cap (total quantity across lines)

- **The cap for a product is `min(stock, 99)`**, and it limits the product's **total** across every line of the cart: the single line plus every build group's lines (memory counts the line's quantity). It is a convenience, not a reservation: two carts can each hold the last unit (FR-24 reserves stock at order time, Sprint 6).
- **Add** of `q`: the single line becomes `single + min(q, max(cap − total, 0))`, where `total` is the product's total before the add. When that adds 0 and there is no single line, no line is created.
- **Set** of a single line to `r` (r ≥ 1): if `r` ≤ the line's quantity, the line becomes `r` (lowering always works, even when the cart is over the cap). Otherwise the line becomes `max(line, min(r, cap − others))`, where `others` is the product's total in the other lines: never above the cap, and never below what the line already had.
- **A note** is returned whenever the result is less than asked (an add that added fewer than `q`, a set that ended below `r`). It names the stock and the product's total in the cart after the change: "Only {stock} in stock. You have {total} in your cart." When the 99 limit, not stock, decided it: "You can have up to 99 of one part in your cart."
- The cap logic is one pure function (lines + stock in, new quantity and note out), shared by add and set.

### Buyable

- Add needs the product to be **active and buyable** today (`getStockStatus` with `manilaToday()`, then `isBuyable`). A set that **raises** a line needs the same check; otherwise `unavailable`. A set that lowers a line and Remove never check the product, so a shopper can always reduce what they hold.
- The client's idea of stock is never trusted: the server reads stock, status and pre-order date itself on every write.

### Input

- Every action input is parsed with Zod; unknown keys are dropped. `productId` and line ids are non-empty strings of at most 64 characters; quantity is an integer from 1 to 99 (D6). Anything else is `invalid` with nothing changed.
- Actions are public POST endpoints: they take no cart id, prices, stock or counts from the client (Behavior 6).
- A cookie whose value isn't shaped like a cart id is treated as no cart without a database read.

### Concurrency

- **Writes to one cart are serialized** (one transaction per action that locks the cart row first), so the cap is computed on the cart as it is, and concurrent adds or sets of the same product can't push the total past the cap (E14).
- **One single line per product per cart**, enforced by the database: a partial unique index on `("cartId", "productId") WHERE "buildId" IS NULL`. Adding a single item is one `INSERT … ON CONFLICT ("cartId", "productId") WHERE "buildId" IS NULL DO UPDATE` (E13). Build groups get a unique index on `("cartId", "productId", "buildId")`.
- Two first adds at the same moment from one browser with no cookie (two tabs) may create two carts; the cookie written last wins and the other cart is abandoned. Acceptable for a guest cart (abandoned-cart cleanup is out of scope).
- On `/cart`, a line accepts one change at a time (Behavior 19); each set sends an absolute quantity, so a repeated request is harmless.

### Data

- `CartItem.quantity` ≥ 1 (a database CHECK, like `BuildItem`).
- `CartItem → Product` is `onDelete: Restrict`; products are retired by status, never deleted. `CartItem → Cart` is `onDelete: Cascade`. `CartItem → Build` is `onDelete: Restrict` (builds are immutable and never deleted, ADR 0007).
- Every cart write updates `Cart.updatedAt` (for abandoned-cart cleanup later).
- **Reset:** `TRUNCATE "Product" … CASCADE` empties `CartItem` but not `Cart`, so `resetCatalog()` names `Cart` explicitly next to `Build` (spec 022's rule). A plain `pnpm db:seed` never touches carts.

### Schema and migrations stay in step

- The partial unique index is declared in `schema.prisma` with the `partialIndexes` preview feature (D1), so Prisma knows it and never plans to drop it.
- **CI fails on drift:** a new CI step, after `db:deploy`, runs `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` and fails the job when the diff isn't empty (exit code 2) or the command errors (1). `--from-migrations` needs a shadow database, so CI creates a second empty database in its throwaway Postgres and the Prisma config reads an optional shadow URL (only CI sets it; nothing changes for local or Vercel). The plan runs the check on `main` first, to confirm today's migrations (triggers, CHECKs, the GIN indexes) give an empty diff before this story's migration is added.
- The plan's first task stays: after the migration, a second `prisma migrate dev --create-only` must create an empty migration.
- An integration test checks, on the test database after its migrations are applied from scratch, that `pg_indexes` has the partial unique index on `CartItem ("cartId", "productId")` with `WHERE ("buildId" IS NULL)`, and the unique index on `("cartId", "productId", "buildId")`.

### Static pages stay static

- No server component outside `/cart` reads the cart cookie. The header count is client-side only (Behavior 13). `/cart` and `/api/cart/count` are per request.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Product page, button | "Add to cart"; while running "Adding…" |
| Product page, not buyable (replaces "Cart is coming soon." and "Only parts in stock can be added to a build.") | "Only parts in stock can be added to your cart or build." (builder parts); "Only parts in stock can be added to your cart." (other categories) |
| Product page, result | "Added to your cart." · "Added {n} to your cart." · link "View cart" |
| Cap note (product page and cart line) | "Only {stock} in stock. You have {total} in your cart." · "You can have up to 99 of one part in your cart." |
| Product page, unavailable | "This part can't be bought right now." |
| Product page, error | "Couldn't add this to your cart. Try again." |
| Header link name | "Cart" · "Cart, 1 item" · "Cart, {n} items"; badge "{n}" or "99+" |
| Cart page | Heading "Cart"; title "Cart" |
| Cart line | Stepper labels "Decrease quantity of {name}", "Quantity of {name}", "Increase quantity of {name}"; button "Remove {name}" (visible text "Remove") |
| Cart line, retired product | "No longer sold" · "Not included in the subtotal." |
| Cart summary | "Subtotal (1 item)" / "Subtotal ({n} items)"; "Shipping and vouchers are calculated at checkout."; button "Checkout"; "Checkout is coming soon." |
| Cart status | "Removed {name} from your cart." · "That item is no longer in your cart." |
| Cart line error | "Couldn't update your cart. Try again." |
| Empty state | Heading "Your cart is empty"; "Add parts from a product page, or plan a whole PC in the builder."; links "Browse the home page", "Open the PC Builder" |
| Metadata | Title "Cart"; description "Your PC Silicon cart." |

## 6. Data and interfaces

### Schema (one migration)

- **`Cart`**: `id` (the random cart id, primary key), `createdAt`, `updatedAt`, `items`. No `userId` (Sprint 7, #65).
- **`CartItem`**: `id`, `cartId` → `Cart` (cascade), `productId` → `Product` (restrict), `quantity` (CHECK ≥ 1, raw SQL), `buildId` nullable → `Build` (restrict), `createdAt` (line order, D10). Indexes: `productId`, `buildId`; the two unique indexes in Rules › Concurrency.
- The generator gets `previewFeatures = ["partialIndexes"]`, and the partial unique index is declared with `where` (D1). Rules › Schema and migrations stay in step lists the checks (empty follow-up migration, CI drift step, `pg_indexes` test).

### Server

- `lib/cart/…` (server-only): the cookie (read, set; name, options), `getCartView()` for the page (lines with current product data, subtotal, `cartCount`), `getCartCount(cartId)`, and `addToCart(input, opts)`, `setCartQuantity(input, opts)`, `removeFromCart(input, opts)`, which the server actions only forward to (as `shareBuildAction` does) and the integration tests call directly with a cart id and `today`.
- Results: `{ ok: true, count, line: { id, quantity }, added?, note? }` or `{ ok: false, reason: "invalid" | "unavailable" | "not-found" | "error" }`. `note` is `{ kind: "stock", stock, total } | { kind: "max", max: 99 }`; the copy is made in the client from it.
- Pure (`lib/cart/cap.ts` or similar, no database): `capQuantity({ op: "add" | "set", requested, line, others, stock })` → `{ quantity, note? }`; `MAX_CART_QUANTITY = 99`; Zod schemas for the three inputs; `cartCount(lines)` (lines as `{ quantity, buildId }`: Σ quantity of lines with no `buildId`, plus the number of distinct `buildId`s); `cartCountLabel(n)`; `isCartId(value)` (the cookie's shape).
- Server actions in `app/(store)/cart/actions.ts`: `addToCartAction`, `setCartQuantityAction`, `removeFromCartAction`. Each returns the result above and makes `/cart` re-render with fresh data.
- `GET /api/cart/count` → `{ count: number }`, `Cache-Control: no-store`, never sets a cookie. No cookie, or one `isCartId` rejects → `{ count: 0 }` before any database call (E51).
- Cookie options in one place: `httpOnly`, `secure`, `sameSite: "lax"`, `path: "/"`, `maxAge: 2592000`, no `domain`; set on every result that changed the cart (Behavior 3).

### Client

- A cart-count store (Zustand, not persisted) with the count and a setter that ignores a route response older than the last action result (D8). `CartLink` in the header reads it and fetches the route on mount.
- `AddToCart` on the product page, sharing the quantity selector's value (the selector's state moves up into one client component holding both).
- Cart page components: line, stepper, remove, summary, empty state.

### Docs

- CLAUDE.md: the cart bullet (tables, cookie, cap, count rule and trigger, static pages, the drift check). `.env.example`: nothing new for the app (the shadow URL is CI-only). README if it lists routes or CI steps.
- Spec 020: "Changed by spec 025 (#60): …" notes where its product page copy changes (Behavior 18, E34, Messages: the not-buyable line and the cart note). Done with this spec.

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | `capQuantity`: add and set, across lines, stock drop, 99 limit, notes | E3–E7, E15, E17–E20 |
| Unit | Input schemas | E10, E21 |
| Unit | `cartCount` (single units + 1 per build group), `cartCountLabel`, badge text, cap note copy | E39–E44, E32, Messages |
| Unit | Count route with no cookie or a malformed one: `{ count: 0 }`, and a database stub that fails the test if called | E51 |
| Unit (render) | Cart line (sale price, low stock, retired), summary, empty state; product page's disabled Add to cart with its note | E27, E30, E31, E29, E37 |
| Integration (`*.db.test.ts`) | Add creates a cart; merge into the line; cap across single and build-group lines; set; remove; unavailable products; unknown cart id makes a new cart; another cart's line id has no effect; build lines can't be set or removed one by one; **two concurrent adds give one line**, and the cap holds under concurrency; prices read fresh; reset names `Cart`; the cookie is renewed on changes only and replaced when stale | E1–E9, E11–E14, E16–E18, E22–E26, E28, E29, E45–E50, E52 |
| Integration | Raw `CartItem` inserts: a second single line for the same product is refused; quantity 0 is refused; deleting a product in a cart is refused. Both unique indexes exist in `pg_indexes` after migrations from scratch | Rules › Data, › Schema and migrations |
| CI | `prisma migrate diff --from-migrations … --to-schema … --exit-code` fails the job on drift | Rules › Schema and migrations |
| E2E (Playwright) | Add Ryzen 5 7600 × 2 → header count 2 without reload → cart total → change to 1 → remove → empty state; disabled Add to cart on an out-of-stock page | E33–E37 |

The E2E checks "without a page load" by marking `window` before the click and checking the mark after the count changes. The `__Host-cart` cookie works in this run: Playwright's Chromium was checked to store and send a `__Host-` Secure cookie set over `http://localhost` (D4).

## 8. Out of scope

| What | Owner |
| --- | --- |
| Add build to cart, build groups on `/cart` | #62 |
| Flags and fixes for lines over stock, out of stock, pre-order or retired ("Set to …", banner) | #63 |
| Merging the guest cart into an account on login, `Cart.userId` | #65 (Accounts, Sprint 7) |
| Stock reservation, re-check at checkout | FR-24, FR-13 (Sprint 6) |
| Checkout, shipping, vouchers | Sprint 6 |
| Rate limiting the cart actions; a limit on lines per cart | #64 |
| Cleaning up abandoned carts | Not scheduled |
| Add to cart from listing cards or related products | Not scheduled (PRD FR-8 puts it on the product page) |
| Add to cart without JavaScript | Not in the MVP |
| Refreshing the count when another tab changes the cart | Not in the MVP (D8) |

## 9. Decisions

- **D1 — Prisma's partial index, not raw SQL only.** Prisma 7.10.1 (this repo's version) has partial indexes behind the `partialIndexes` preview feature (`where` on `@@unique`). Prisma's migration diff drops indexes the schema doesn't declare, so a raw-only index would risk being dropped by the next `migrate dev`; declaring it keeps it known, and the issue says to use this support and record the choice here. The plan proves it with an empty follow-up migration. *Rejected:* raw SQL plus hand-deleting the drop from every later migration; a single `NULLS NOT DISTINCT` unique index (Postgres 15+, simpler `ON CONFLICT`), because Prisma can't express it either. *Review decision:* the preview feature is accepted, guarded by the CI drift check, the empty follow-up migration and the `pg_indexes` test (Rules › Schema and migrations).
- **D2 — One `INSERT … ON CONFLICT` for single adds, inside a transaction that locks the cart row.** The issue asks for the upsert; the lock is what keeps the across-lines cap right under concurrency (E14), which the upsert alone can't. *Rejected:* read-then-write with retries, as `shareBuild` does, because a cap that reads other lines needs a consistent view.
- **D3 — The cart id is crypto-random (128 bits, URL-safe), not Prisma's `cuid()`.** It is a bearer token: anyone with it can change the cart, so it must not be guessable. *Rejected:* `cuid()` (timestamp and counter based).
- **D4 — Cookie `__Host-cart`, Max-Age 30 days, renewed on every cart change (review decision).** The `__Host-` prefix makes the browser refuse it without Secure, path `/` and no domain, which the issue's settings already require. **Checked:** Playwright's Chromium, the browser of the E2E run against `pnpm start` (`baseURL` `http://localhost:3000`) and of `pnpm dev`, stores a `__Host-cart` cookie with `Secure` set over plain `http://localhost` and sends it back, because browsers treat `localhost` as a secure context. So no dev or test fallback is needed. **Known limit:** opening the dev server by a LAN address over `http` (a phone at `http://192.168.x.x:3000`) is not a secure context, so the browser drops the cookie and the cart stays empty there. Test the cart on `localhost` or a Vercel preview (HTTPS). *Rejected:* a session cookie (the cart would vanish when the browser closes); a plain name; turning `Secure` off in development (a dev-only branch in cookie code, for a case only LAN testing hits).
- **D5 — Reading never creates a cart.** Server Components can't set cookies, and creating carts on page views would fill the table with empty carts. *Rejected:* creating the cart on the first `/cart` visit.
- **D6 — Quantity 1–99 per request, and at most 99 of one product in the cart (review decision: kept).** It bounds input and matches `MAX_SHARE_QUANTITY`; seed stock never comes near it. *Rejected:* stock as the only bound (a product with large stock could reach any number, and the set input would need a different limit from add).
- **D7 — The count is units of single items plus 1 per build group (review decision, settled now for #62).** The issue's E2E expects 2 after adding a CPU × 2, and a shopper thinks of a build as one thing in the cart, not 8 or 9. `cartCount` handles build groups from this story on, so #62 only adds lines. *Rejected:* units of every line (a build would add 8+ to the badge); counting lines (a CPU × 2 would show 1).
- **D8 — The count loads once per mount, and action results win over an older route response.** Client navigation keeps the header mounted, so the store holds the count across pages. A response that started before an action finished could otherwise show the old count. *Rejected:* refetching on focus or after every navigation (more requests for a rare case: another tab changing the cart).
- **D9 — The quantity selector is disabled whenever Add to cart is.** Choosing a quantity for something you can't add is a dead end. Today it is only disabled when out of stock. *Rejected:* leaving it enabled for pre-orders.
- **D10 — Lines are ordered by when they were added (`CartItem.createdAt`).** Lines must not jump when a quantity changes. Needs a `createdAt` the issue's field list doesn't name. *Rejected:* `updatedAt` order, or product name order.
- **D11 — Remove has no confirmation.** It is one click to add back from the product page, and spec 020 removes builder parts without asking too. *Rejected:* a confirm dialog or an undo toast.
- **D12 — Retired products stay as minimal lines but leave the subtotal (Behavior 24; review decision).** "No longer sold", no link, no price, no stepper, and "Not included in the subtotal." Spec 022 does the same for shared builds; dropping them silently would hide what happened. #63 adds the proper flags. *Rejected:* deleting such lines on read (reads don't write, D5).
- **D13 — One note for both disabled buttons on a non-buyable product page.** Two sentences saying "only parts in stock" in a row read as a mistake. This changes spec 020's product page copy ("Only parts in stock can be added to a build."); accepted in review, and spec 020 carries "Changed by spec 025 (#60): …" notes at Behavior 18, E34 and its Messages table. The slot picker (spec 021) keeps its own line.

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| Migration adds `Cart` and `CartItem` with nullable `buildId`; no `userId` | §6 Schema, Rules › Data |
| `CartItem → Product` `onDelete: Restrict` | Rules › Data, Test plan (integration) |
| No duplicate lines: partial unique index, build-group unique index, `ON CONFLICT` upsert; check migrate dev doesn't drop them | Rules › Concurrency, › Schema and migrations, D1, D2, E13, §6 Schema |
| Products and quantities only; prices always current | Behavior 16, E28 |
| Random id in an httpOnly, Secure, SameSite=Lax cookie; created on first add; unknown or stale cookie starts a new cart | Behavior 2–5, D3–D5, E1, E12, E29, E45–E52 |
| Server actions with Zod input; only buyable parts; product page Add to cart uses the selected quantity | Behavior 7–10, Rules › Input and › Buyable, E1, E9, E10, E33 |
| Stock cap counts the total across all lines, three examples | Rules › Stock cap, E3, E4, E17 (plus E5–E7, E14) |
| `/cart` per request: image, name, current unit price, stepper, line total, stock status, remove, subtotal, empty state, disabled Checkout with text | Behavior 16–22, E27, E29, E30 |
| Header count from a client component reading a `no-store` route; updates without a page load through a shared trigger; action returns the count | Behavior 11–15, D7, D8, E33, E38, E39–E44, E51 |
| Product page's "Cart is coming soon." removed | Behavior 7, Messages |
| Integration tests (add, merge, cap across lines, remove, another cart's id, concurrent adds) | Test plan, E1–E2, E6–E7, E13, E22–E23 |
| Unit test for the cap logic | Test plan, `capQuantity` |
| E2E: CPU × 2 → count 2 → total → change to 1 → remove → empty | E33–E36 |

## 10. Open questions

None. The review settled the four earlier questions:

1. Partial index: the `partialIndexes` preview feature, plus a CI drift check, the empty follow-up migration and a `pg_indexes` test (D1).
2. The 99-per-product limit stays (D6).
3. Retired products: the minimal "No longer sold" line with "Not included in the subtotal." (D12).
4. The combined not-buyable note, with "Changed by spec 025 (#60)" notes in spec 020 (D13).
