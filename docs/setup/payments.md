# Payments setup (Xendit test mode)

What to set up outside the code for Sprint 6 (checkout,
[#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4)). The gateway is
**Xendit**, in **test mode** only ([ADR 0010](../adr/0010-payment-gateway-xendit-test-mode.md),
[spec 031](../specs/031-pay-with-xendit/spec.md)): the app refuses a live key.

Where each environment gets its payments and payment events:

| Environment | Gateway (`PAYMENT_GATEWAY`) | Webhooks |
| --- | --- | --- |
| Local (`pnpm dev`) | `fake` by default; `xendit` only with a tunnel's https origin | The fake sends events in Xendit's format through the app's own handler; `pnpm webhook:replay` (#80). Real Xendit webhooks don't reach local runs |
| Preview (Vercel) | `fake` | None from Xendit: Deployment Protection answers `302` to anything not logged in to Vercel. The fake pay page builds the event and runs it in the app |
| CI | `fake` | The fake's events, from the E2E tests |
| Production | `xendit` (`fake` is refused) | Real, from Xendit's Dashboard webhook settings |

## Before merging #79

- [ ] In Vercel → Settings → Environment Variables, set **`PAYMENT_GATEWAY`**
  for every environment (Production `xendit`, Preview `fake`) and
  **`XENDIT_SECRET_KEY`** for Production. The variable is required: a deploy
  without it stops at startup.
- [ ] Add `PAYMENT_GATEWAY=fake` (and a dummy `XENDIT_WEBHOOK_TOKEN`) to the CI
  workflow's `env` in `.github/workflows/ci.yml`.
- [ ] Add `PAYMENT_GATEWAY="fake"` to `.env.local`.

## Checklist

### Xendit account

- [ ] Use the Xendit account in **Test mode** (the Dashboard's mode switch).
  Never switch the store to live keys.
- [ ] Dashboard → Settings → API keys: create a **secret key** in test mode with
  write permission for Money-in (payments). Keep it to `.env.local` and Vercel;
  never paste it into chat, issues or commits.
- [ ] Check that the key starts with `xnd_development_`. The app refuses one
  that starts `xnd_production_` in every environment, and requires the
  `xnd_development_` prefix (spec 031, E3).
- [ ] Activate **GCash**, **Maya** and **cards** for test mode, if the Dashboard
  asks. The store offers only these three (`allowed_payment_channels`).
- [ ] Run `pnpm payments:check` with the key in `.env.local`. It prints only
  whether the key has the test prefix (never the key), creates a ₱19.99 session
  that expires in 24 hours, prints Xendit's answer and cancels it; with
  `--keep` it leaves the session open so its link can be used to try GCash and
  Maya. Record the answers under "To confirm in test mode" below.

### Environment variables

Add each to `.env.local`, the Vercel environments named, and `.env.example`
(the story that introduces it adds it to `lib/env.ts`).

| Variable | Local | Preview | Production | CI | Story |
| --- | --- | --- | --- | --- | --- |
| `PAYMENT_GATEWAY` | `fake` (or `xendit` with a tunnel) | `fake` | `xendit` (`fake` is refused) | `fake` | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) |
| `XENDIT_SECRET_KEY` | the test key, only with `xendit` | not needed | the test key | not needed | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) |
| `XENDIT_WEBHOOK_TOKEN` | any random value (the fake uses it) | any random value | the account's webhook verification token | any random value | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) (fake), [#80](https://github.com/romulojr-dev/pc-ecommerce/issues/80) (required with `xendit`) |
| `VERCEL_ENV` | unset (reads as `development`) | set by Vercel | set by Vercel | unset | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) |
| `CRON_SECRET` | any random value | not needed | random, at least 16 characters | not needed | [#81](https://github.com/romulojr-dev/pc-ecommerce/issues/81) |
| `ORDERS_ENABLED` | `true` | `true` | leave unset (off) until #81 is deployed | `true` | [#78](https://github.com/romulojr-dev/pc-ecommerce/issues/78) |

`PAYMENT_GATEWAY` is `xendit` or `fake`, and required: any other value, or
none, stops the app at startup. With `xendit`, `XENDIT_SECRET_KEY` is required
and `NEXT_PUBLIC_SITE_URL` must be `https://`, because Xendit only accepts HTTPS
return URLs. Changing a variable on Vercel needs a redeploy.

`ORDERS_ENABLED` is `true` or `false`; unset means off, and any other value
stops the app at startup. Off, the review shows "Placing orders is coming soon."
and the server refuses to place an order. Existing orders stay viewable and
payable. A placed order holds its stock until it is paid or cancelled, and
nothing cancels it before #81, so Production keeps it off.

`VERCEL_ENV` goes into each session's metadata as the environment, so #80 can
ignore sessions created by another environment on the same test account.

### Production webhook (#80)

- [ ] Dashboard → Settings → Webhooks: set the URL for **Payment Sessions**
  events (`payment_session.completed`, `payment_session.expired`) to
  `https://<production domain>/api/webhooks/xendit`.
- [ ] Copy the **webhook verification token** from the same page into Vercel →
  Production → `XENDIT_WEBHOOK_TOKEN`, then redeploy. Xendit sends it in every
  webhook's `x-callback-token` header.
- [ ] Leave the URL on Production. The token is one per account, so every
  environment using this account shares it.

Xendit retries a webhook that doesn't get a 2xx up to six times (15 min, 1 h,
3 h, 6 h, 12 h and 24 h after the first try), and the Dashboard can resend one
by hand.

### Local runs

- [ ] Default: `PAYMENT_GATEWAY=fake`. Place an order, and the test payment page
  ("Test payment, not Xendit") offers Pay, Cancel and Let it expire.
- [ ] To try Xendit's real pages locally: start a tunnel to
  `http://localhost:3000` (e.g. `cloudflared tunnel --url http://localhost:3000`
  or an ngrok static domain), set `NEXT_PUBLIC_SITE_URL` to its `https://`
  origin, `PAYMENT_GATEWAY=xendit` and `XENDIT_SECRET_KEY` in `.env.local`, and
  restart `pnpm dev`. Payments open and return, but webhooks still go to
  Production, which ignores them (the environment in their metadata is
  `development`), so the local order stays at "Confirming your payment…".

### One test account, several environments

Every session on the account sends its webhooks to the one URL, Production.
Production ignores a session whose metadata environment isn't `production`, and
one whose order it doesn't know, and answers `200` so Xendit doesn't retry
(#80).

### Previews

- [ ] Nothing to register with Xendit. Leave Vercel Authentication on for
  previews; don't enable Protection Bypass for Automation for webhooks.
- [ ] `PAYMENT_GATEWAY=fake` for the Preview environment.

### Test payments (FR-27)

On Xendit's test pages:

- **Cards:** 4000 0000 0000 1000 (Visa, no 3-D Secure) or 4000 0000 0000 2503
  (Visa, with a 3-D Secure step); Mastercard 5200 0000 0000 1005 /
  5200 0000 0000 2151. Any future expiry date, any CVV
  ([Xendit](https://docs.xendit.co/docs/cards-simulate-card-scenarios.md)).
- **GCash and Maya:** *to be written from the first test payment of each
  (spec 031, Q4).*

### Orders switch (#78)

- [ ] Set `ORDERS_ENABLED=true` in Vercel → Preview, and in `.env.local`.
- [ ] After #81 is merged and deployed, set `ORDERS_ENABLED=true` in Vercel →
  Production and redeploy.

### Cron (auto-cancel, #81)

- [ ] Set `CRON_SECRET` in Vercel → Production.
- [ ] After the first production deploy with `vercel.json`'s `crons`, check
  that the job shows under Project → Settings → Cron Jobs. On the Hobby plan
  it runs at most once a day, only on production, and only accurate to the hour.

### Data

- [ ] Download the latest PSGC publication from the PSA and choose the version
  to commit (#76).
- [ ] After #76 deploys, run `pnpm db:seed` once by hand on production for the
  shipping rates and store settings, as in
  [spec 004](../specs/004-product-list/spec.md) ("Seeding production"). It
  creates settings only when missing, so it never overwrites edited values.
  The store address and hours are fictional, and the rates are demo values.

## Confirmed in Xendit's docs (2026-11-01)

- A hosted one-time payment is a Payment Session: `POST /sessions` with
  `session_type: PAY`, `mode: PAYMENT_LINK`; the shopper goes to
  `payment_link_url`. Return URLs must be HTTPS.
  ([create-session](https://docs.xendit.co/apidocs/create-session.md))
- A session expires 30 minutes after creation by default; `expires_at` must be
  at least 10 minutes ahead. `POST /sessions/{id}/cancel` ends an active one
  (`422 INVALID_SESSION_STATUS` otherwise), with no webhook.
  ([cancel-session](https://docs.xendit.co/apidocs/cancel-session.md))
- A payment's real status: `GET /sessions/{id}`, then `GET /v3/payments/{id}`.
  ([get-session](https://docs.xendit.co/apidocs/get-session.md),
  [get-payment](https://docs.xendit.co/apidocs/get-payment.md))
- Webhooks: `payment_session.completed`, `payment_session.expired`; a static
  token in `x-callback-token`; no event id or signature.
  ([handling-webhooks](https://docs.xendit.co/docs/handling-webhooks.md))
- Channels: `GCASH`, `PAYMAYA` (PHP 1 to 100,000), `CARDS` (PHP 20 to 700,000).

## To confirm in test mode

The planning of #79 checks these and updates this page:

- the test key's prefix is `xnd_development_` (Q6)
- a session accepts `expires_at` 24 hours ahead (Q2)
- a PHP session accepts centavos (`amount: 19.99`); if not, totals with centavos
  can't be paid online (Q8)
- the GCash and Maya test steps, for the Test mode banner (Q4)
