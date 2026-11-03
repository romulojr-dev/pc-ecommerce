# ADR 0011 — Signed order links beside the access token

Status: **Accepted** · Date: 2026-11-03 · Story: #92 · Spec: [035-email-foundation-signed-links](../specs/035-email-foundation-signed-links/spec.md)

## Context

An order is opened by a link, `/orders/{number}?key={token}`, and only `SHA-256(token)` is stored ([ADR 0009](0009-place-orders-in-one-transaction-held-by-an-access-token.md)). That was enough while the shopper's browser held the only copy. Order emails (FR-21, Sprint 7) change two things:

- **An email is sent after the commit**, from a table row that must not hold a secret. The token can't be in it (the hash is one-way, and writing the token to an outbox would make the outbox a credential store), so an email can't carry the shopper's `?key=` link.
- **An email is a second place a link lives**: in a mailbox, in a forwarded message, in a link scanner's cache. It should be able to expire and be revoked without touching the link from checkout.

## Decision

**An email carries a signed link, minted when the email is built: `/orders/{number}?sig={sig}&exp={exp}&p={purpose}`.**

- `sig` is the HMAC-SHA256, base64url, of `{number}\n{purpose}\n{exp}` under `ORDER_LINK_SECRET` (at least 32 bytes, one per environment). `exp` is Unix seconds, 10 digits. Nothing about a link is stored.
- **`view` links last 90 days** and each email mints its own. `cod-confirm` links (#95) expire at the order's `expiresAt`. The purpose is part of the signed text, so a `view` signature can't be presented as a `cod-confirm` one.
- **Rotating the secret revokes every signed link at once.** The shopper's `?key=` link is unaffected. There is no per-link revocation.

**There is one order credential: the access token or a valid `view` link.** The order page, `GET /api/orders/[number]/status` (headers `X-Order-Key` or `X-Order-Link`), Pay now / Retry and the fake payment page accept either. `startPayment` takes the credential: a token builds the return URLs as before; a link builds them from a **freshly signed** link, so a link nearly out of time can't strand a shopper at the gateway.

**A bad link is the same 404 as a wrong token, at the same cost.** The shape is checked first, with no database read (a `key` and a `sig` together are malformed). A well-formed link then costs one order read and one constant-time comparison, whichever check fails: the signature is computed whether or not the order exists, and the expiry and purpose are looked at after it, none of them returning early.

**Emails go through an outbox** (`EmailOutbox`), written in the trigger's transaction and sent after the commit, with the Resend idempotency key `{orderId}:{type}`, a lease, a retry limit and a cap of 5 emails per recipient per 24 hours. The row holds the recipient's hash only; the address is read from the order at send time.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Store the token (or an encrypted copy) so emails can carry the `?key=` link | The order table would hold a bearer credential in clear or in a reversible form, which ADR 0009 decided against |
| Derive the token from the order with a server secret | Every order link would be forever valid and unrevokable, and the token would stop being random |
| A one-time "magic link" token stored with an expiry | A table of live credentials to guard, a write on every email, and a link that stops working once opened or scanned |
| Sign with a per-order key | A new secret per order to store, and nothing a single rotation can revoke |
| Include the recipient or the email id in the signature | The link is for the order, not the message; a forwarded email would break, and the outbox would have to hold the signature |
| Reuse the presented link's `exp` for the payment return URLs | The return would carry a link that may expire minutes later |

## Consequences

- **A signed link is a bearer credential like the token**: whoever holds it sees the order's contact and address. It can sit in a mailbox for 90 days, in the platform's request log (as the token can) and in a link scanner. The order page's `no-store` and `no-referrer` headers apply to it ([next.config.ts](../../next.config.ts)).
- **It can't be revoked one at a time.** Rotating `ORDER_LINK_SECRET` is the only revocation, and it invalidates every link already sent. Rotating is a deliberate act (docs/setup/domain.md), never a deploy side effect.
- **The secret is a new thing to keep.** It must be set in every environment (a missing or short one stops startup), and the E2E mints links with the same value, so the Playwright process needs it too.
- **The page opened by a link doesn't offer to save it**, because the shopper reached it from an email they hold.
- **`recipientHash` is an unsalted SHA-256** of the address (trimmed, lower-cased, with a `+tag` dropped), as the issue specifies. Someone with database access could test a guessed address against it; they can already read `Order.guestEmail`.
- **ADR 0009's lines "the link is a credential" and "until order emails arrive, the only way back is a link" are partly superseded**: the `?key=` link is still the credential checkout hands out, and a signed link is now a second one.
