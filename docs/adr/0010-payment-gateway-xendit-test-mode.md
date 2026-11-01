# ADR 0010 — Payment gateway: Xendit (test mode)

Status: **Accepted** · Date: 2026-11-01 · Story: #79 · Spec: [031-pay-with-xendit](../specs/031-pay-with-xendit/spec.md)

## Context

Online payments (GCash, Maya, cards) go through one Philippine gateway in test mode (PRD, Payments and fulfillment). The PRD recommended PayMongo and named Xendit as the fallback with a similar method list. The project owner has a Xendit test account, not a PayMongo one, so the choice is Xendit.

The design has to hold whichever gateway is used:

- **Only a verified webhook marks an order Paid** (FR-22); the browser's return proves nothing.
- **One payment record per attempt** (FR-23), and a shopper can retry while the order is unpaid.
- **Previews and CI receive no real webhooks** (Vercel Deployment Protection), yet the E2E suite must reach "paid" (epic #4's done-when).
- **The store never takes real money**: a live key must never run.

Xendit offers several ways to take a one-off payment. As read on 2026-11-01:

- **Payment Sessions** (`POST /sessions`, `session_type: PAY`, `mode: PAYMENT_LINK`): a Xendit-hosted page; the response carries `payment_link_url`. [create-session](https://docs.xendit.co/apidocs/create-session.md)
- **Invoices** (`POST /v2/invoices`): the legacy hosted page. Xendit's migration guide (updated 2026-10-22) moves merchants from Invoices to Sessions, which have "Full channel and region coverage". [migrate-to-payment-session](https://docs.xendit.co/docs/migrate-to-payment-session.md)
- **Payment Requests** (`/v3/payment_requests`): one channel per request; the store would build the method picker and handle each wallet's redirect.
- **Components** mode of a session: Xendit's UI embedded in our page.

## Decision

**Xendit Payment Sessions in `PAYMENT_LINK` mode, test mode only.**

- **The session:**
  - **Request:** `PHP`, `PH`, `allowed_payment_channels` `GCASH`, `PAYMAYA` and `CARDS`, `reference_id` `{orderNumber}-{attempt}`, `metadata` with the order id, order number and environment, and `success_return_url` / `cancel_return_url` back to the order page.
  - **Lifetime:** the order's remaining time, capped at 24 h. Xendit needs at least 10 minutes, so under that no session is opened ([create-session](https://docs.xendit.co/apidocs/create-session.md)).
  - **No shopper data:** no name, contact or address is sent.
- **One open session per order.** Pay now and Retry payment lock the order row, cancel the open session (`POST /sessions/{id}/cancel`, [cancel-session](https://docs.xendit.co/apidocs/cancel-session.md)) and create a new one. A cancel refused because the session already completed stops the retry: a payment is on its way.
- **Amounts cross the boundary in pesos, converted exactly.** Our unit stays integer centavos. Xendit's `amount` is a JSON number in pesos, built from the integer's digits, never by floating-point division (spec 031, *Amounts*).
- **A provider-neutral `PaymentGateway`** (`createSession`, `closeSession`, `getSession`, `getPayment`), in neutral units and statuses, with two adapters:
  - **`xendit`:** `fetch` with Basic auth (the secret key as the username), no SDK.
  - **`fake`:** speaks Xendit's shapes and statuses, keeps its own `FakeGatewaySession` table, and serves a labelled "Test payment, not Xendit" page whose Pay builds a `payment_session.completed` event with the `x-callback-token` header and runs it through the webhook handler in process.
- **`PAYMENT_GATEWAY`** (`xendit` or `fake`) is required:
  - Production refuses `fake`.
  - `XENDIT_SECRET_KEY` must be a test key (`xnd_development_…`); a live key (`xnd_production_…`) stops startup in every environment.
  - The real gateway needs an `https` `NEXT_PUBLIC_SITE_URL`, because Xendit requires HTTPS return URLs.
- **Where each gateway runs:**
  - Production: `xendit`.
  - Previews and CI: `fake`.
  - Local: `fake` by default; `xendit` with a tunnel's https origin.
- **The webhook is a hint, confirmed through the API (#80).** Xendit's webhooks carry a static per-account token in `x-callback-token` and no signature, timestamp or event id ([handling-webhooks](https://docs.xendit.co/docs/handling-webhooks.md), [session webhook](https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md)). The handler:
  1. Compares the token in constant time.
  2. Reads the session (`GET /sessions/{id}`) and the payment (`GET /v3/payments/{id}`).
  3. Marks Paid only when Xendit itself reports the session `COMPLETED` and the payment `SUCCEEDED`, for this environment's order, with matching amount and currency.
  4. Deduplicates on a derived key, `{event}:{payment_session_id}`.

## Why the access token may travel in the return URLs

The return URLs are the order link (`/orders/{number}?key={token}`) plus a `payment` value, so Xendit stores the token with the session. Accepted, because:

- **A wallet payment can come back in a different browser.** GCash and Maya hand off to the wallet app or another browser, and the return lands wherever that hand-off ends. A return URL without the key would land a shopper who paid on a 404. Only the key opens the order, and there are no accounts yet (ADR 0009).
- **Xendit is the payment processor.** It already holds the payment and the order reference. The token opens only that one order's page (its items, contact and address), never another order and nothing that changes data beyond paying for it. Handing a link for the order to the party that processes its payment is within what a shopper paying through Xendit already trusts it with.
- **The order page sends no referrer** (`Referrer-Policy: no-referrer`, ADR 0009), so the token doesn't leak back out to Xendit's page or any other link the shopper follows. The fake's page has the same headers.

## Alternatives considered

| Option | Why not |
| --- | --- |
| PayMongo Checkout Sessions (the PRD's first choice) | No test account; the interface keeps it possible later (an adapter, not a rewrite) |
| Xendit Invoices | Legacy: Xendit moves merchants off it, it covers an older set of channels, and its expire endpoint isn't in the current docs |
| Xendit Payment Requests directly | We'd build the method picker and handle every wallet's redirect and 3-D Secure ourselves |
| Components mode | Embedded UI, more code and more of Xendit's script on our page, no benefit for a demo |
| The `xendit-node` SDK | Four endpoints don't need it; `fetch` with our own types keeps the server bundle small and the adapter tests simple |
| Reusing an open session on Pay now | Needs its URL stored and a check that it isn't about to expire; closing and recreating also tells us if it already completed |
| A return URL without the key, opened by a short-lived code | A wallet return in another browser couldn't open it, and the code would be one more secret to store and expire |
| Defaulting `PAYMENT_GATEWAY` to `fake` | A forgotten variable would silently run the fake |

## Consequences

- **Xendit stores the order's access token** (inside the return URLs). Anyone with access to the test account's sessions can open those orders' pages. Acceptable for a test-mode store; revisit if live payments ever arrive.
- **The webhook body can't be trusted on its own**, because the token is static and shared: every Paid costs two API reads (#80), and a Xendit outage delays Paid. Xendit retries a failed webhook up to six times over 24 hours ([webhook-behavior](https://docs.xendit.co/apidocs/webhook-behavior.md)).
- **One verification token per Xendit account**, shared by every environment that uses the account. Production keeps the Dashboard's webhook URL; local work uses the fake. The handler ignores another environment's sessions by their `metadata.environment` (#80).
- **Production needs its variables before the merge.** With `PAYMENT_GATEWAY` required, a deploy without it fails at startup, so `PAYMENT_GATEWAY=xendit` and `XENDIT_SECRET_KEY` are set on Vercel first ([setup](../setup/payments.md)).
- **Real Xendit locally needs HTTPS:** a tunnel origin as `NEXT_PUBLIC_SITE_URL`.
- **A session can be orphaned:** created at Xendit while our transaction fails. Its `metadata.order_id` lets #80 record a payment made on it.
- **Checked in test mode** (`pnpm payments:check`, 2026-11-01; spec 031, Q2, Q6, Q8): test keys start `xnd_development_`; a session accepts `expires_at` 24 hours ahead; a PHP session accepts centavos (`amount: 19.99`), so every total can be paid online. On the test page, GCash and Maya complete the payment as soon as the shopper picks one and continues (Q4).
- **Switching gateways is an adapter**, plus the webhook route and the setup page: the rest of the app speaks `PaymentGateway`.
