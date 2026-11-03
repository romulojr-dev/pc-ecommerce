# 035 — Email foundation and signed order links

Status: reviewed and approved with changes (2026-11-03; see the change list in §10). Issue: [#92](https://github.com/romulojr-dev/pc-ecommerce/issues/92) (parent epic [#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4), Checkout). PRD: FR-21 (part), FR-20; tech stack row "Email: Resend + React Email". First story of Sprint 7: [#93](https://github.com/romulojr-dev/pc-ecommerce/issues/93) (the three order emails), [#94](https://github.com/romulojr-dev/pc-ecommerce/issues/94) (vouchers) and [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95) (COD) build on it. Builds on [spec 030](../030-place-an-order/spec.md) / [ADR 0009](../../adr/0009-place-orders-in-one-transaction-held-by-an-access-token.md) (the access token), [spec 031](../031-pay-with-xendit/spec.md) (`startPayment`, the fake gateway and its pages), [spec 033](../033-release-unpaid-orders/spec.md) (`sweepAfterResponse`, the cron) and [spec 034](../034-start-payment-outside-transaction/spec.md) (claim / call / settle, `guardTransactions`). Setup outside the code is in [docs/setup/domain.md](../../setup/domain.md).

This is a large story, not a short-form one: it adds a table, a send path, a second order credential and three environment variables. It sends **no email the shopper receives** yet: the three order emails are #93 and the COD one #95. What ships is the machinery they use and the links they carry.

## 1. Summary

A shopper can come back to an order from a **signed link** (`/orders/{number}?sig=…&exp=…&p=view`) that an email will carry, in addition to the secret `?key=` link from checkout. The order page, its status route, Pay now / Retry and the fake payment page accept **one order credential: the access token or a valid `view` link**. Alongside, an **email outbox** records "send this email for this order" inside the transaction that causes it, and a sender delivers it **after the commit** through Resend (or a recording fake), with a lease, a retry limit and a **cap of 5 emails per recipient per 24 hours**, so a failed, skipped or slow email never changes checkout, payment or release.

## 2. Behavior

### The outbox and the send path (system)

1. **Enqueue** (`enqueueEmail(tx, orderId, type)`), called by a trigger's own transaction (placement, reconcile, release; those calls are #93 and #95). It inserts one `EmailOutbox` row, status `pending`, with `recipientHash` = SHA-256 of the order's address **normalized for the cap** (trimmed, lower-cased, and with any `+tag` dropped from the local part, §4), using `INSERT … ON CONFLICT DO NOTHING RETURNING` with no conflict target (never a caught P2002, ADR 0007). A second call for the same `(orderId, type)` writes nothing and says so. It stores no address, no rendered email and no secret.
2. **Trigger.** After the writer's transaction commits, it asks for a send of the row it enqueued with `after()` (the response never waits). Nothing in this story does that yet except the tests; #93/#95 add the calls. If `after()` never runs (the function froze), the sweeps below pick the row up.
3. **Retry.** `sweepAfterResponse` (the pages and routes of spec 033) also sends due outbox rows, up to 10 per call, after the release sweep, in its own work and never throwing. The daily cron (`GET /api/cron/release-orders`) sends due rows in batches within what is left of its time budget.
4. **Claim** (one short transaction, no network call): choose rows to send with `FOR UPDATE SKIP LOCKED`. A row is **due** when it is
   - `pending`; or
   - `sending` with `claimedAt` at least the **lease** (5 minutes) ago (the sender died; it is taken over); or
   - `failed` with a retryable code, fewer than **5 attempts**, and `claimedAt` at least 5 minutes ago.

   A due row created **24 hours or more** ago is not sent: it becomes `failed` with code `too-old` and `attempts` set to the limit, so it is **final and visible** in the table, and `email.failed` is logged with that code (D6). This covers a row that never got sent, a retryable `failed` row and a `sending` row whose lease ran out. For each other due row, in the same transaction and **serialized per recipient** by an advisory lock on `recipientHash` (taken before counting):
   1. Count the recipient's other rows that **count against the cap**: `sent` with `sentAt` within the last 24 h, or `sending` with `claimedAt` within the last 24 h. Failed and skipped rows don't count; neither does the row being claimed.
   2. 5 or more → the row becomes `skipped` (never retried), and `email.skipped` is logged with reason `recipient-cap`.
   3. Fewer than 5 → the row becomes `sending`, `claimedAt` = now, `attempts` + 1.
5. **Send** (no transaction open): read the order row and build the email from it **now** (a registered template for the type, the order's address and a freshly minted `view` link, §4); hand it to the transport with the Resend `Idempotency-Key` `{orderId}:{type}`. Every URL in the email is built from `NEXT_PUBLIC_SITE_URL`.
6. **Settle** (one short transaction): the row becomes `sent` (`sentAt`, `providerMessageId`) or `failed` (`lastErrorCode`). Only a row still `sending` **with the same `claimedAt`** is settled; a row another sender took over is left alone. A failure that retrying can't fix (the provider refused the message, no template for the type) leaves the row `failed` with `attempts` set to the limit, so it is never due again.
7. **A failed or skipped send changes nothing else.** The order, its payments, stock and cart are never touched by the outbox, and an exception in the send path is caught, logged by code and swallowed by its caller.
8. **Logs** carry the event (`email.sent`, `email.failed`, `email.skipped`), the outbox id, the type and a short code. Never the address, the hash, the link, the signature, the token, the subject or the body.

### Signed order links (shopper)

9. A signed link is `/orders/{number}?sig={sig}&exp={exp}&p={purpose}`. `p` is `view` or `cod-confirm`; **only `view` opens the order page in this story** (`cod-confirm` is signed and verified by the same code, and #95 gives it a page). `exp` is a Unix time in seconds. `sig` is the HMAC-SHA256 of the order number, purpose and `exp` under `ORDER_LINK_SECRET`.
10. **Opening a link.** The order page, the status route, the fake payment page and Pay now / Retry check the credential the same way for a link as for a token:
    1. A link of the wrong **shape** (a malformed number, a `sig` that isn't 43 canonical base64url characters, an `exp` that isn't 10 digits, an unknown or missing `p`, a `key` and a `sig` together) → 404 with **no database read**.
    2. Otherwise one read of the order by number, then the signature compared in constant time (a missing order is compared against a dummy value), then the expiry and the purpose. A wrong signature, a wrong purpose, an expired link and an unknown order are all the **same 404** as a wrong token, and the work done is the same on every path.
11. A `view` link lasts **90 days** from the moment its email is built; each email mints its own. A link opens the order **in every status** (as the token does); it is read-only: Pay now and Retry work through it, nothing else.
12. **Rotating `ORDER_LINK_SECRET`** makes every signed link already sent a 404. The shopper's `?key=` link keeps working.
13. **The page opened by a link** is the same page. The save-the-link prompt (spec 030) is **not shown**, because the shopper got there from an email they already have (D8). Pay now / Retry start a payment whose return URLs carry a **freshly signed** `view` link (D5); the fake payment page URL and its buttons carry the credential the shopper arrived with.

### One order credential

14. Everything that opened an order with its token takes **a credential**: the token, or a valid `view` link. The order page and fake payment page read it from the URL (`key`, or `sig`+`exp`+`p`); the status route from a header (`X-Order-Key`, or `X-Order-Link` with the link's query string, never the URL); the server action behind Pay now / Retry from its input. `startPayment` takes the credential instead of `accessToken`: a token credential builds the return URLs as today; a link credential builds them from a new signed `view` link. Checkout's `placeOrderAction` passes the token it just minted, unchanged.

### Empty, loading and error states

| State | Where | What shows |
| --- | --- | --- |
| Any bad link (shape, signature, expiry, purpose, unknown order) | Order page, fake page | The same 404 as a wrong key |
| Same | Status route | `404 {"error":"not-found"}`, `no-store` |
| Same | Pay now / Retry | `not-found` (the existing answer) |
| Provider is down, a send fails | Nobody sees it | The row is `failed` and retried; the order is untouched |
| Over the cap | Nobody sees it | The row is `skipped`; one log line |
| Missing or too short `ORDER_LINK_SECRET`, `EMAIL_TRANSPORT` not set, `resend` without a key, `fake` in Production | Startup | The app refuses to start with a message naming the variable (never its value) |

## 3. Examples

Values: order **PCS-7KQ2M9XD** (spec 034's P1: AMD Ryzen 5 7600 × 2, total 2,311,000 centavos, placed 2026-11-01T07:00:00Z, `expiresAt` 2026-11-02T07:00:00Z), token `T` × 43 (the fixture of `test-support/release.ts`), contact `Ana.Reyes@Example.com`. Tests use a fixed `ORDER_LINK_SECRET` and an injected clock. **E** = 2027-01-30T07:00:00Z (placed + 90 days).

### Signed links (unit, pure)

| # | Input | Expected |
| --- | --- | --- |
| L1 | Sign (PCS-7KQ2M9XD, `view`, E), verify at 2026-11-01T08:00:00Z | `ok`; `sig` is 43 characters; the same inputs always give the same `sig` |
| L2 | Verify at E − 1 s / at E | `ok` / `expired` (expired from `exp` on) |
| L3 | A link signed for PCS-7KQ2M9XD verified for another number | `invalid` |
| L4 | A `view` signature presented with `p=cod-confirm`, and the reverse | `invalid` |
| L5 | `exp` changed by one second, one `sig` character changed, `sig` of another secret | `invalid` |
| L6 | Rotated secret | every earlier link `invalid` |
| L7 | Shapes that fail with no secret ever used: `sig` 42 / 44 characters, `sig` with `=` padding or `+`, non-canonical last character, `exp` of 9 or 11 digits, `exp` `+1793…`, `p=VIEW`, `p=` missing, a number `pcs-7kq2m9xd` or `PCS-7KQ2M9XI` (not Crockford) | `malformed` |
| L8 | The link as a path | exactly `/orders/PCS-7KQ2M9XD?sig=…&exp=…&p=view` (parameters in that order); as an absolute URL, built from the site URL with no doubled slash |
| L9 | Credential from URL parameters: `{key}`; `{sig,exp,p}`; `{key,sig,exp,p}`; `{}`; `{key: [a, b]}` | token; link; `malformed`; `none`; `malformed` |

### Recipient and cap rules (unit, pure)

| # | Input | Expected |
| --- | --- | --- |
| R1 | `Ana.Reyes@Example.com`, ` ana.reyes@example.com `, `ANA.REYES@EXAMPLE.COM\n` | one `recipientHash` (64 hex) |
| R2 | `ana.reyes@example.com`, `ana.reyes+promo@example.com`, `Ana.Reyes+a+b@Example.com`, ` ana.reyes+@example.com ` | one `recipientHash` (everything from the first `+` in the local part is dropped) |
| R2a | `ana.reyes@example.com` vs `ana.reyes2@example.com`, vs `anareyes@example.com`, vs `ana.reyes+1@example.org`, vs `ana.reyes@sub.example.com` | four different hashes (dots, digits and the domain are never folded; a `+` in the domain part isn't a tag) |
| R2b | `+promo@example.com` (nothing before the `+`), `plain` (no `@`), `a@b@c.com` | the first keeps its local part (not emptied); the others are hashed trimmed and lower-cased as they are, no throw (the order's address was validated at checkout; this is only defence) |
| R3 | Cap decision with 4 / 5 counted rows | `send` / `skip` |
| R4 | Due decision for each row state at its boundaries: `sending` claimed 4:59 / 5:00 ago; `failed` with 4 / 5 attempts; `failed` claimed 4:59 / 5:00 ago; non-retryable code; created 23:59:59 / 24:00:00 ago | not due / due; due / not due; not due / due; not due; due / `too-old` |

### Outbox (integration, Vitest + Docker Postgres, fake transport)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| O1 | P1 held by Ana | `enqueueEmail(tx, order, ORDER_PLACED)` twice, in one transaction and again in another | One row, `pending`, `attempts` 0, `recipientHash` of R1, no address anywhere in the row; the second and third calls report "already there" and raise nothing |
| O2 | O1, then the transaction rolls back | | No row |
| O3 | O1 committed | `sendPending` | Row `sent`, `attempts` 1, `sentAt`, `providerMessageId` `fake_…`; one `FakeEmail` to Ana's address with the `Idempotency-Key` `{orderId}:ORDER_PLACED` |
| O4 | O3 | `sendPending` again | Nothing sent; no second `FakeEmail` |
| O5 | O1; the fake transport throws `timeout` | `sendPending` | Row `failed`, `lastErrorCode` `timeout`, `attempts` 1; order, payments, stock unchanged. Run again at +4:59: not sent; at +5:00: sent (`attempts` 2) |
| O6 | O1; the transport answers `http-422:validation_error` | `sendPending` | `failed`, final: never due again, however long afterwards |
| O7 | O1; the transport throws every time | `sendPending` every 5 minutes | `failed` with `attempts` 5 after the fifth; the sixth call doesn't send |
| O8 | O1 with no template registered for the type | `sendPending` | `failed`, `no-template`, final; no transport call |
| O9 | O1 | Two `sendPending` at once (`Promise.all`) | The transport is called **once**; one row `sent`; neither call errors (`SKIP LOCKED`) |
| O10 | O1 claimed (`sending`, `claimedAt` T) and the sender never settles | `sendPending` at T + 4:59 / T + 5:00 | Not sent / taken over: `attempts` 2, the same `Idempotency-Key`, one `FakeEmail` (the fake dedupes by key, as Resend does) |
| O11 | O10, the first sender settles late | Its settle | Changes nothing (its `claimedAt` is no longer the row's) |
| O12 | O1 created 23:59:59 ago / 24:00:00 ago | `sendPending` | Sent / `failed` with `lastErrorCode` `too-old`, `attempts` 5 (final), no transport call; one `email.failed` line with the outbox id, type and code `too-old` and nothing else; a second `sendPending` doesn't touch it or log again |
| O12a | O5's `timeout` failure, then 24:00:00 pass since `createdAt` (with the row's retries still under the limit) | `sendPending` | The row stays `failed` but its code becomes `too-old`, final, logged once; no transport call |
| O12b | O10's abandoned `sending` row, 24:00:00 after `createdAt` | `sendPending` | `failed` / `too-old`, final, logged once; no transport call (the first send's outcome is unknown and Resend's key has expired, so it isn't repeated) |
| O13 | The transport is called | Any send | `guardTransactions` fails the test if it runs inside a transaction |
| O14 | Any send, success and each failure | | A spy on every console method sees no address, hash, link, signature, token, subject or body; one JSON line with event, outbox id, type and code |
| O15 | A row for an order | `db.order.delete` | Refused (`Restrict`); `resetCatalog()` and `db:seed --reset` empty `EmailOutbox` and `FakeEmail` |
| O16 | Outbox rows for several types | | The migration refuses a second row for the same `(orderId, type)`, an `attempts` below 0, and a `sent` row with no `sentAt`; a `skipped` or `pending` row with a `sentAt` |

### Per-recipient cap (integration)

Recipient Ana with 4 other rows already counting; "now" is N.

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| C1 | 4 `sent` rows within 24 h; a 5th due | claim | 5th `sent` |
| C2 | 5 `sent` rows within 24 h; a 6th due | claim | 6th `skipped`, no transport call, log `email.skipped` with reason `recipient-cap`; never due again; the order is untouched |
| C3 | 5 rows `sent` at N − 23:59:59 | a 6th | `skipped` |
| C4 | 5 rows, one `sent` at exactly N − 24:00:00 | a 6th | `sent` (that one no longer counts) |
| C5 | 4 `sent` + 3 `failed` + 3 `skipped` | a 5th | `sent` (failed and skipped don't count) |
| C6 | 4 `sending` rows claimed within 24 h | a 5th | `sent` (`sending` counts); with 5 `sending`, `skipped` |
| C7 | 4 counted rows for `ana.reyes@example.com`; the due row's order has `  ANA.REYES@Example.com ` | claim | One recipient: the 5th is sent, and a 6th skipped |
| C7a | Counted rows: 1 to `ana.reyes@example.com`, 1 to `Ana.Reyes+promo@example.com`, 1 to `ana.reyes+order@example.com`, 1 to ` ANA.REYES+X@EXAMPLE.COM ` (all `sent` within 24 h); a 5th due for `ana.reyes+five@example.com` | claim | One recipient: the 5th is `sent`; a 6th due for plain `ana.reyes@example.com` is `skipped` |
| C7b | 5 counted rows for `ana.reyes@example.com`; a due row for `ana.reyes2@example.com` or for `ana.reyes+1@example.org` | claim | Sent (different recipients) |
| C7c | A `+tag` order | send | The email goes to the address **as the order has it**, `ana.reyes+promo@example.com`; only the cap folds the tag |
| C8 | 4 counted rows; two due rows for Ana at once | two `sendPending` at once | Exactly one is sent and one skipped (advisory lock) |
| C9 | 5 counted rows for Ana; a due row for Ben | claim | Ben's is sent (the cap is per recipient) |

### Credentials (integration and route tests)

| # | Given | Request | Expected |
| --- | --- | --- | --- |
| K1 | P1, valid `view` link | `getOrderForPage` / the page | The order, like the token's; no save-the-link prompt |
| K2 | Same | status route with `X-Order-Link` | `200 {"status":"PENDING_PAYMENT"}`, `no-store` |
| K3 | Wrong signature, expired, `cod-confirm`, another order's link | page, status route, Pay now, fake page | One identical 404 / `not-found`; each does one order read |
| K4 | Malformed link (L7 shapes), or `key` and `sig` together | page, status route | 404 with **zero** database queries |
| K5 | Token credential | everything in K1–K2 | Exactly as before (specs 030–032 tests pass unchanged) |
| K6 | Link credential | Pay now | A Pending payment; the session's success and cancel URLs are `/orders/PCS-7KQ2M9XD?sig=…&exp=…&p=view&payment=return` / `…=cancelled` on `NEXT_PUBLIC_SITE_URL`, signed at the start's time + 90 days, not the opening link's `exp` |
| K7 | Token credential | Pay now | Return URLs carry `?key=` as today |
| K8 | Fake session opened with a link credential | the fake page with that link; with a token; with a link for another order | Opens; opens; 404. Pay on it → the order is Paid through the webhook path as in spec 031 |
| K9 | Link signed with the old secret after rotation | page | 404; the token link still opens |
| K10 | A link whose `exp` is more than 90 days away but correctly signed | page | Opens (the signature is the proof; the lifetime is set when minting) |

### Environment (unit)

| # | Input | Expected |
| --- | --- | --- |
| E1 | `EMAIL_TRANSPORT` unset / `smtp` | refused: "is not set" / "must be resend or fake" |
| E2 | `fake` with `VERCEL_ENV=production` | refused: "must be resend in production" |
| E3 | `resend` with no `RESEND_API_KEY` | refused naming `RESEND_API_KEY` |
| E4 | `ORDER_LINK_SECRET` unset; 31 bytes; 32 bytes; 32 two-byte characters (64 bytes) | refused; refused; accepted; accepted (length is UTF-8 bytes) |
| E5 | `EMAIL_FROM` unset | `PC Silicon <orders@mail.pcsilicon.tech>` (D3); `not an address` refused; a bare `orders@mail.pcsilicon.tech` accepted |
| E6 | Any refusal | the message never contains the secret or key |

### E2E (Playwright, fake transport and gateway)

| # | Flow | Expected |
| --- | --- | --- |
| X1 | Place an order; read its id and number; mint a `view` link through the E2E helper (`e2e/orders.ts`, using `ORDER_LINK_SECRET`) | The link opens the order page (200), with the timeline and items; no save-the-link prompt |
| X2 | The same link with one `sig` character changed / expired `exp` / the `cod-confirm` purpose | Each is the "not found" page, same as a wrong key |
| X3 | From X1's page, Pay now | The fake payment page opens (its URL carries the link credential); Pay → the page returns, polls through the link and shows Paid |
| X4 | Enqueue an `ORDER_PLACED` row through the helper and call the cron | The row is `failed` with `no-template` (the real emails are #93's E2E) |

### Acceptance criteria → examples

| Issue criterion | Where covered |
| --- | --- |
| Outbox table, unique `(orderId, type)`, index, no address/email/secret, `Restrict`, never deleted, reset names it | Behavior 1; O1, O15, O16; §6 Schema |
| Written in the trigger's transaction, `ON CONFLICT DO NOTHING` | Behavior 1; O1, O2 |
| Sent after the commit: claim / send with idempotency key / settle; `after()`, cron, sweep; attempt limit | Behavior 2–6; O3–O13; X4 |
| A failed or skipped send never changes or fails anything else | Behavior 7; O5, O6, C2 |
| Per-recipient cap (5 / 24 h, from the outbox, at claim, serialized, skipped + log, boundaries, case, spaces, `+tags`) | Behavior 4; R1–R4, C1–C9, C7a–C7c |
| (Review) rows past the 24 h window end visible and logged | Behavior 4; O12, O12a, O12b |
| Transport `resend` / `fake`, production refusal, key required, `EMAIL_FROM`, fake table | Behavior 5; O3, O4, O10; E1–E5; §6 |
| Signed order links: format, HMAC, constant time, same 404, shape first, 90 days, per-email mint, rotation | Behavior 9–12; L1–L9, K3, K4, K9, K10, X2 |
| One order credential across page, status route, Pay now / Retry, fake page; `startPayment` takes the credential | Behavior 13–14; K1–K8, X1, X3 |
| Links in emails built from `NEXT_PUBLIC_SITE_URL` | Behavior 5; L8, K6 |
| Logs carry event, outbox id, type and code only | Behavior 8; O14 |

## 4. Rules and edge cases

**Links**

- The signed message is `{orderNumber}\n{purpose}\n{exp}` (no field can contain a newline), so no two different triples share a message.
- `exp` is whole seconds. A link is valid while `now < exp`. The signature is compared before the expiry, and both before the purpose is read, but none of them returns early: a 404 does the same work whichever check failed (the order is read once for every well-formed link).
- Nothing about the link is stored. Revoking one link is not possible; revoking all is rotating the secret (Behavior 12). A link is a bearer credential like the token: whoever holds it sees the order's contact and address, and the hosting log may record it (as it does the token, ADR 0009). The headers of spec 030 (`no-store`, `no-referrer`) already cover `/orders/*` and `/test-payment/*`.
- A `cod-confirm` link is minted with an explicit `exp` (#95 uses the order's `expiresAt`); the 90 days belong to `view` only.
- The email's own `view` link is minted when the email is built, so a retry days later still carries a link good for 90 days from that retry.

**Outbox**

- **Recipient normalization** (one pure function, used only for the cap): trim, lower-case (`toLowerCase`, not locale-aware), then drop from the first `+` to the `@` in the local part (the text before the last `@`); if that leaves an empty local part, keep it as it was. Dots, digits and the domain are never changed. The email is always sent to the address as the order stores it.
- The address comes from the order row at send time. A template that needs something else (items, totals, payment) reads the order then; a row never goes stale. Only `recipientHash` is copied, at enqueue, because the cap needs it without joining orders.
- Statuses move only forwards in these ways: `pending` → `sending` → `sent` | `failed` | (`skipped`, from the claim); `failed` → `sending` (retry); `sending` → `sending` (takeover). `sent` and `skipped` are final. Every move is a conditional update.
- `attempts` counts claims. The limit is 5. A takeover counts as an attempt.
- Retry spacing is 5 minutes after the last claim, so the sweep on every page view doesn't hammer a failing provider.
- The lease (5 minutes) is more than the transport timeout (6 s, as Xendit's) plus settling by a wide margin; a test fails if the timeout is raised past half of it.
- A `sending` row with an expired lease keeps counting against the cap until it is taken over or 24 h pass; this is deliberate (it may have been delivered).
- Resend remembers an `Idempotency-Key` for 24 hours, which is why no row is sent more than 24 hours after it was created (D6).
- The transport gets plain `from`, `to`, `subject`, `html`, `text` and the key; it knows nothing about orders. The Resend call is a `fetch` with a 6-second timeout and no SDK; failures are codes (`timeout`, `network`, `http-{status}:{name}`), never bodies. A 429, a 5xx, a 409 for a concurrent request with the same key, a timeout and a network error are retryable; other statuses are final.
- The fake transport records a `FakeEmail` row and, like Resend, returns the same message for the same key without a second row.
- Enqueue runs inside a transaction that already holds the order, so it adds one insert and can fail only when the transaction would fail anyway. It never makes a network call.
- `after()` only works inside a request. The helper that schedules a send is a no-op outside one, and the tests call the sender directly.
- With no registered template for a type (until #93 / #95), a row is `failed` / `no-template` / final. It is not silent success.

**Concurrency**

- Two senders never send one row (`SKIP LOCKED`, conditional moves, same Idempotency-Key as the last line of defence).
- The cap is checked and the row marked `sending` in one transaction under an advisory lock on the recipient hash, so two claims for one recipient can't both pass at 4.
- Different recipients don't wait for each other.

## 5. Messages and copy

No shopper-facing text is added: nothing is emailed yet, and the 404 reuses the order page's existing not-found view. Differences from today:

- The order page's **save-the-link prompt** ("Save this link: it's the only way to see your order until order emails arrive.") is not shown on a page opened with a signed link. Its text changes in #93 (to say the link was also emailed).
- Startup messages, in the style of the existing ones (each names the variable and never a value): `EMAIL_TRANSPORT is not set`, `EMAIL_TRANSPORT must be resend or fake`, `EMAIL_TRANSPORT must be resend in production`, `RESEND_API_KEY is not set (required with EMAIL_TRANSPORT=resend)`, `ORDER_LINK_SECRET is not set`, `ORDER_LINK_SECRET must be at least 32 bytes`, `EMAIL_FROM must be an address or "Name <address>"`.
- Log events: `email.sent`, `email.failed`, `email.skipped` (reason `recipient-cap`). Error codes: `timeout`, `network`, `http-{status}[:{name}]`, `no-template`, `too-old`.

## 6. Data and interfaces

### Schema (one migration)

- **`EmailOutbox`**: `id`, `orderId` (`Restrict`), `type` (enum `EmailType`: `ORDER_PLACED`, `PAYMENT_RECEIVED`, `ORDER_CANCELLED`, `COD_CONFIRM`; Q1), `status` (enum: `PENDING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED`), `recipientHash`, `attempts` (default 0), `lastErrorCode` (nullable), `claimedAt`, `sentAt`, `providerMessageId` (all nullable), `createdAt`. Unique `(orderId, type)`; index `(recipientHash, sentAt)`; an index for the due scan on `(status, claimedAt)`. Migration CHECKs: `attempts >= 0`; `sentAt` and `providerMessageId` present exactly when `SENT`; `claimedAt` present when `SENDING`; `recipientHash` is 64 hex. `db:drift` doesn't compare CHECKs, so `lib/email/schema.db.test.ts` does (as for the order tables).
- **`FakeEmail`** (test transport only): `id` (`fake_` + hex, also the `providerMessageId`), unique `idempotencyKey`, `from`, `to`, `subject`, `html`, `text`, `createdAt`. Not an app table: it holds addresses and bodies, exists for the tests and E2E, and is emptied by `resetCatalog()` and `db:seed --reset`.
- No change to `Order`; no column for the credential.

### Functions (server only)

- `lib/orders/signed-link.ts` (Node): `signOrderLink({orderNumber, purpose, exp})`, `orderLinkPath(…)` / `orderLinkUrl(siteUrl, …)`, `verifyOrderLink(order, {sig, exp, p}, now)` → `ok | invalid | expired` (constant time), `linkShape(…)`, `newViewLink(orderNumber, now)` (exp = now + 90 days). Purposes are a closed list.
- `lib/orders/credential.ts`: `OrderCredential` (`{kind:"token", token}` | `{kind:"link", sig, exp, purpose}`), `credentialFromParams(searchParams)`, `credentialFromHeaders(headers)`, and a `credentialQuery` that serializes one back to `key=…` or `sig=…&exp=…&p=view` (pure, for return URLs and the fake page).
- `findOrderByKey(number, key)` becomes `findOrderByCredential(number, credential)` (same return); `getOrderForPage(number, key)` takes a credential. One read, one constant-time comparison, same dummy for a missing order, for both kinds.
- `startPayment(orderId, credential)`; `sessionRequest`'s context carries the credential's query (a token's as today; a link's re-minted) in place of `accessToken`; `returnUrl(siteUrl, orderNumber, credential, payment)`. `startPaymentAction` input: `{orderNumber, credential}` where the client sends what it read from its own URL. Fake page actions and `FakePayButtons` forward the same.
- `lib/email/`: `recipientHash(address)`; `enqueueEmail(tx, orderId, type)` → `{ id } | null` (null = already there); `sendEmail(id)` and `sendPending({ limit })` (claim → send → settle, with the cap, lease and retry rules); `scheduleEmailSend(id)` (`after()`); `EmailTransport` (`send({from, to, subject, html, text, idempotencyKey}) → {id}`, throws a coded error); `resendTransport`, `fakeTransport`; `transport()` picks by `EMAIL_TRANSPORT`; a template registry (`type` → `(order, link) → {subject, html, text}`), empty in this story, with a test hook; constants `EMAIL_CAP` 5, `CAP_WINDOW_MS` 24 h, `LEASE_MS` 5 min, `RETRY_AFTER_MS` 5 min, `MAX_ATTEMPTS` 5, `SEND_WINDOW_MS` 24 h; `logEmailEvent`.
- `sweepAfterResponse` and `runReleaseCron` also call `sendPending`.

### Routes

- `GET /api/orders/[number]/status`: reads `X-Order-Key` or `X-Order-Link`, not both. Everything else unchanged.
- `/orders/[number]` and `/test-payment/[id]` accept `?key=` or `?sig=&exp=&p=view`. `outputFileTracingIncludes`: no change (no new dataset).

### Environment

| Variable | Rule |
| --- | --- |
| `EMAIL_TRANSPORT` | `resend` or `fake`, required, no default; `fake` refused when `VERCEL_ENV=production` |
| `RESEND_API_KEY` | required with `resend`; never logged |
| `EMAIL_FROM` | optional; default `PC Silicon <orders@mail.pcsilicon.tech>` |
| `ORDER_LINK_SECRET` | required in every environment; at least 32 UTF-8 bytes; one per environment; never logged |

`.env.example` gets all four (`EMAIL_TRANSPORT="fake"` and a throwaway local secret); CI sets them; `vitest.db.config.ts` pins `fake` and a test secret.

### Documents

ADR 0011 (signed order links beside the access token); this spec; edits to spec 030 and 031 and ADR 0009 where they say the token is the only way back (a note per place, "Changed by spec 035"); a CLAUDE.md paragraph; [docs/setup/domain.md](../../setup/domain.md)'s Resend section (the variables are already listed; confirm names and add the "rotate the secret" and "fake is refused in Production" lines); `.env.example`; a PRD PR (the `Order` row's `accessTokenHash` note and the Email row, see Decisions).

## 7. Test plan

| Level | What |
| --- | --- |
| Unit (pure) | L1–L9 (signing, shapes, credential parsing), R1–R4, E1–E6, `sessionRequest` return URLs for both credentials, `paymentView`/`OrderView` unchanged, the transport's error mapping (Resend response → code; fixtures, no network) |
| Integration (`*.db.test.ts`) | O1–O16, C1–C9, K1–K10 against Docker Postgres, with `guardTransactions` on every send test and a console spy on every log test; the status route and the order page's loader with a link; migration CHECKs |
| E2E | X1–X4 (the real emails and their links are #93's E2E) |
| Not tested with the real Resend | The `resend` transport is covered by a unit test on its request and error mapping with a stubbed `fetch`; the first real send is the manual check in domain.md |

## 8. Out of scope

- The three order emails, their templates and plain-text versions, the test-mode note, and the order page's new save-the-link text: [#93](https://github.com/romulojr-dev/pc-ecommerce/issues/93).
- A `/dev/emails` page listing recent fake-transport emails with clickable links (404 unless `EMAIL_TRANSPORT=fake`, never in Production): added to #93 as criterion 1b. This story only provides the `FakeEmail` table it reads.
- The COD confirmation email, the `cod-confirm` page and its POST: [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95). Here `cod-confirm` is only signed and verified.
- Shipped / delivered emails: Sprint 9. Auth emails (verification, reset): [#65](https://github.com/romulojr-dev/pc-ecommerce/issues/65).
- General rate limiting of the order page, status route and actions: [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64). The per-recipient cap is only an abuse guard on sending.
- Revoking a single link, resending an email by hand, an admin view of the outbox: Sprint 9.
- Bounce and complaint webhooks from Resend.
- An unsubscribe link: these are transactional emails.

## 9. Decisions

| # | Decision | Reason | Rejected |
| --- | --- | --- | --- |
| D1 | `recipientHash` is a plain SHA-256 of the address trimmed, lower-cased and with a `+tag` dropped from the local part. **Changed by review:** the issue says trimmed and lower-cased only; the `+tag` folding is added so `a+1@…`, `a+2@…` can't dodge the cap (the issue's text is updated to match) | One person can make unlimited `+tag` aliases; real distinct people rarely share a base address. Dots and the domain stay as they are, since folding them is only right for some providers | HMAC with a secret (hides guessable addresses, but rotating `ORDER_LINK_SECRET` would reset every cap). Consequence: someone with database access can test a guessed address against the hash; they can already read `guestEmail` on `Order` |
| D2 | All four `EmailType` values exist now; with no template a row fails final as `no-template` | #93 and #95 then need no enum migration, and a missing template is loud | Adding values per story (a migration each); silently marking `sent` |
| D3 | `EMAIL_FROM` is optional with the issue's value as default | One less variable to set in each environment | Required everywhere (more setup, no safety) |
| D4 | The cap, lease and retry timing use the server's clock, passed in | Windows of 5 minutes and 24 hours make seconds of skew irrelevant, and tests can place rows at exact boundaries | The database clock as in spec 034 (right for a 60 s window, awkward for boundary tests here) |
| D5 | A link credential starting a payment gets **freshly signed** return links; a token credential gets its token, as today | The opening link might expire soon; this way the return always has 90 days and the secret isn't needed for tokens | Reusing the presented link's `sig` and `exp`; switching token holders to signed links too (changes specs 031/034 behavior for no gain) |
| D6 | A row 24 h old or more at claim time is not sent: it ends `failed` / `too-old`, final, with one log line (**review: kept, made visible**) | Resend forgets an Idempotency-Key after 24 h, so a later resend could duplicate; an "order placed" email a day late is also useless. It limits the issue's daily-cron retry to one pass | Sending any age (risk of a duplicate); a longer window with a new key (loses the duplicate guarantee) |
| D7 | A `key` and a `sig` together are malformed (404, no read) | One unambiguous credential; no second path to check | Preferring one of them |
| D8 | The save-the-link prompt is hidden on a page opened by signed link | The shopper reached it from an email they hold; offering to copy a 90-day link as "the" link would mislead | Showing it unchanged; showing it with different text (copy for #93 to own) |
| D9 | Only `view` links open the page; `cod-confirm` is signed and verified but opens nothing here | The page and its POST are #95 | Shipping a placeholder confirm page |
| D10 | The sweep and cron send due rows (the sweep 10, the cron in batches) | The issue names both retriers; reusing spec 033's triggers needs no new schedule | A separate cron entry (`vercel.json` allows few on the free plan) |
| D11 | `FakeEmail` is a table, read by tests and E2E, and holds addresses and bodies | The issue says so; test-mode data only, never in Production | A log file or in-memory list (E2E and the server don't share memory) |
| D12 | The credential travels to the status route in `X-Order-Key` or `X-Order-Link` headers | Keeps secrets out of URLs, as spec 031 D11 decided | A query string |
| D13 | **PRD wording, not a conflict of scope:** the PRD's `Order` row said the access token "is only in the order link". It now says guest access is the access token **or a signed link from an email**, edited in the open Sprint 7 PRD PR (`docs/sprint-7-prd`) now, not later. ADR 0009's "the link is a credential" and "until order emails arrive" lines get a pointer to ADR 0011 | The PRD wins on scope, and scope (FR-21) is unchanged; its data model text would otherwise read wrong | Leaving the PRD as is; fixing it in this story's PR |
| D14 | The email body isn't React Email in this story | Templates are #93; the transport takes strings so any renderer works | Pulling React Email in now with no template |

## 10. Open questions

None open. The review of 2026-11-03 settled the five questions of the first draft:

1. All four `EmailType` values now (D2).
2. The 24-hour send window stays; a row past it ends `failed` / `too-old`, final and logged (D6; O12, O12a, O12b).
3. Plain SHA-256, normalized before hashing: trim, lower-case and drop a `+tag` for the cap (D1; R1–R2b, C7–C7c).
4. A payment started from a signed link returns to a freshly signed link (D5).
5. Sweep of 10 rows per call and cron batches of 25 (D10).

### Changes made by the review

- Behavior 1 and 4, §4 (recipient normalization), D1, D6, D13 and the mapping table updated; R2 rewritten, R2a, R2b, O12a, O12b, C7a–C7c added.
- Out of scope names the `/dev/emails` page as #93's criterion 1b.
- The PRD `Order` row wording is corrected in the Sprint 7 PRD branch.
