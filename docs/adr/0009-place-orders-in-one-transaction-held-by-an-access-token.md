# ADR 0009 — Place orders in one transaction, found by a secret link

Status: **Accepted** · Date: 2026-10-31 · Story: #78 · Spec: [030-place-an-order](../specs/030-place-an-order/spec.md)

## Context

A guest can place an order with no account. Four things follow:

- **Stock is money.** Two shoppers must never both get the last unit, and a failed placement must not leave stock taken, an order half written or a cart half emptied (PRD NFR Reliability).
- **A submit is not always one request.** A double-click, a second tab or a retry after a lost response must not make a second order, and must not leave the shopper without a link to the first.
- **There is no account to find the order by.** Until order emails arrive (FR-21, Sprint 7) the only way back to an order is a link, so the link is a credential.
- **Nothing releases stock yet.** An unpaid order holds its stock until it is paid or cancelled, and the cancelling job is #81.

## Decision

**Placement is one transaction, in a fixed order, and a refusal writes nothing.** In `placeOrder` ([lib/orders/place-order.ts](../../lib/orders/place-order.ts)):

1. Lock the cart row (`FOR UPDATE`, as every cart write does).
2. Look for an order from this cart with this idempotency key. If there is one, answer with it.
3. Run the review's own checks on the locked cart (`computeReview`, the code behind the review), then compare the digest of what it finds with the digest the shopper reviewed. Any problem or difference refuses with one answer, `changed`: "Your order changed. Review it again."
4. Take stock with one conditional `UPDATE … WHERE stock >= q AND status = 'ACTIVE' RETURNING "effectivePrice"` per product, products in ascending id order, so two placements can't wait on each other in a cycle. A product that doesn't update, or whose price moved, refuses.
5. Insert the order with `ON CONFLICT DO NOTHING` and no conflict target, retrying a new number on a clash. Postgres aborts a transaction after any error, so catching a unique violation inside one cannot work (ADR 0007).
6. Insert the lines and one `StockMovement` per product, and empty the cart.

A refusal is a private `Refusal` thrown inside the transaction, so everything rolls back. The checks read through the transaction's client: a read through the app's `db` from inside a transaction takes a second connection while the first is held, and ten concurrent placements would starve the pool.

**The order is inserted before its movements.** The issue listed the movements first, but a movement's `orderId` is a foreign key; both are in the one transaction, so the outcome is the same.

**The review mints a digest, an idempotency key and an access token; the browser sends them back.**

- The **digest** is a SHA-256 of the lines (kind, build, slot, product, quantity, unit price), the fee, the subtotal and the total, sorted. One function builds it for the review and the placement. Names, flags, stock and warnings are not in it.
- The **idempotency key** is 128 random bits, the **access token** 256. Both are made by the server in the (read-only) review and are new on every review. The server accepts only their exact shape: canonical base64url of exactly 16 and 32 bytes.
- The same key and token from the same cart always answer with the same order, whatever the cart holds now. Because the browser keeps the pair for the whole review, a lost response is recovered by sending the same request again.
- **The key only replays for the cart that placed the order.** Each order stores the SHA-256 of its cart id (`cartIdHash`; the cart id is a bearer cookie, so it is never copied) and the lookup matches both. Another cart that sends the key gets `duplicate` and nothing else: no link, no number. The key is also unique on its own, so two orders can never share one.

**An order is opened by number and key.** `/orders/{number}?key={token}` is per request, `noindex`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, with no canonical. Only `SHA-256(token)` is stored, and the page compares in constant time (`timingSafeEqual`). A wrong key, a missing key and an unknown number are the same 404, and a malformed number or key is a 404 without a database read.

**Secrets are never stored in clear or logged.** Postgres's duplicate-key detail repeats the value that clashed, and Prisma errors can echo arguments, so placement and review log only an error's name and a string code, never its message or object (`logSafeFailure`). Tests spy on every console method with a recognisable key, token and set of details.

**Placing is behind `ORDERS_ENABLED`**, a server variable that is `"true"` or `"false"` and means off when unset. It is off in Production until #81 is deployed, and on in Preview, CI and local runs. The server action checks it before it reads anything, so a hidden button alone doesn't stop a direct call. It gates only placing: the review, the digest and existing order pages are unchanged.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Mint the token and key at placement | A lost response would leave the shopper with reserved stock and no link, and a duplicate could only say "already placed" |
| Derive the token from the key with a server secret | A new secret to keep and rotate, and a token that is no longer purely random |
| Match the idempotency key alone | Any request that knew a key could learn that its order exists, or fetch its link by also holding the token |
| Make the key unique per cart only | Two carts could then share a token and collide on `accessTokenHash` |
| Store the raw cart id on the order | Copies a bearer cookie into a table that support and Admin will read |
| Reserve stock with a lock row or an expiry table | The conditional update already is the lock, and the `StockMovement` rows are the history |
| Read the checks outside the transaction and trust them | A stock, price or fee change between the read and the decrement would be written |
| The token in the URL fragment | The server never sees it, which keeps it out of request logs, but the page would have to be fetched by script (the issue specifies `?key=`) |
| A canonical tag on the order page | With the key it writes the secret into the markup, and without it points at a 404 |
| Accept unreleased reservations in Production | Every order would hold stock for good until #81, and `db:seed` keeps existing stock |

## Consequences

- **The token is in the URL's query string**, so the hosting platform's request log can record it. The application never logs it, but that log is outside the application. Moving the token into the fragment would avoid it.
- **A pg 9 upgrade needs a look.** Prisma's nested reads issue queries in parallel, and inside a transaction they share one connection, so pg 8 prints a deprecation notice ("Calling client.query() when the client is already executing a query") from `getCartView` run through the transaction client. The queries still run in order. pg 9 removes the behavior the notice describes, so check placement and any other transaction that reads relations before upgrading.
- **The digest is not signed.** A forged digest that equals the fresh one only confirms the shopper accepts the current state, so nothing is gained by forging it.
- **A browser can choose its own token.** The server checks its shape but can't check that it is random, so a guessable token exposes only that browser's own order.
- **Turning orders on in Production is a release step** (`docs/setup/payments.md`), after #81.
- **Reservations are real rows.** `StockMovement` records every decrement; #81 adds the release, Admin adds adjustments, and the `actorId` column waits for the `User` table.
- **`resetCatalog()` and `db:seed --reset` name `Order` and `StockMovement`.** `TRUNCATE … CASCADE` from `Product` empties `OrderItem` and `StockMovement` but not `Order`, so a reset names it; add each new table of that kind there.
- **The search vector's trigger is narrower.** Stock writes are now frequent, so `product_search_vector` fires on insert and on updates that name `name`, `sku`, `specs`, `brandId`, `categoryId` or `searchVector` itself (a direct write to the vector is still overwritten, ADR 0005). A stock-only update skips the rebuild. `db:drift` doesn't compare triggers, so `lib/orders/schema.db.test.ts` is what keeps this true.
