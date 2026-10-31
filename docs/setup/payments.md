# Payments setup (PayMongo sandbox)

What to set up outside the code before and during Sprint 6 (checkout,
[#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4)). The store only
ever runs in PayMongo's **test mode**: the app refuses a live key.

Where each environment gets its payment events:

| Environment | Gateway | Webhooks |
| --- | --- | --- |
| Local (`pnpm dev`) | PayMongo test mode | Real, through a tunnel; or `pnpm webhook:replay` |
| Preview (Vercel) | Fake adapter | None from PayMongo: Deployment Protection answers `302` to anything not logged in to Vercel. The fake pay page signs and processes the event in the app |
| CI | Fake adapter | Signed events from the E2E tests |
| Production | PayMongo test mode | Real |

## Checklist

### PayMongo account

- [ ] Create a PayMongo account, or use an existing one, and stay in **test mode**.
- [ ] Copy the test secret key (`sk_test_…`).
- [ ] Turn on the test payment methods to demo (GCash, Maya, cards, BillEase…).
  Some may need activation even in test mode.

### Environment variables

Add each to `.env.local`, the Vercel environments named, and `.env.example`
(the story that introduces it adds it to `lib/env.ts`).

| Variable | Local | Preview | Production | CI | Story |
| --- | --- | --- | --- | --- | --- |
| `PAYMONGO_SECRET_KEY` | test key | not needed (fake adapter) | test key | not needed | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) |
| Payment adapter switch | `paymongo` (or `fake`) | `fake` | `paymongo` (`fake` is refused) | `fake` | [#79](https://github.com/romulojr-dev/pc-ecommerce/issues/79) |
| `PAYMONGO_WEBHOOK_SECRET` | the local webhook's secret | any random value (used by the fake pay page) | the production webhook's secret | any random value | [#80](https://github.com/romulojr-dev/pc-ecommerce/issues/80) |
| `CRON_SECRET` | any random value | not needed | random, at least 16 characters | not needed | [#81](https://github.com/romulojr-dev/pc-ecommerce/issues/81) |
| `ORDERS_ENABLED` | `true` | `true` | leave unset (off) until #81 is deployed | `true` | [#78](https://github.com/romulojr-dev/pc-ecommerce/issues/78) |

`ORDERS_ENABLED` is `true` or `false`; unset means off, and any other value
stops the app at startup. Off, the review shows "Placing orders is coming soon."
and the server refuses to place an order. Existing orders stay viewable. A
placed order holds its stock until it is paid or cancelled, and nothing
cancels it before #81, so Production keeps it off. Changing it on Vercel needs a
redeploy.

Each PayMongo webhook has its own secret, so local and production never share
one.

### Production webhook

- [ ] Register a webhook (PayMongo API or dashboard) for
  `https://<production domain>/api/webhooks/paymongo`, with the events
  `checkout_session.payment.paid` and `payment.failed`.
- [ ] Put its secret in Vercel → Production → `PAYMONGO_WEBHOOK_SECRET`, then
  redeploy.

### Local webhook (tunnel)

- [ ] Start a tunnel to `http://localhost:3000`, e.g. `cloudflared tunnel --url
  http://localhost:3000` or ngrok. An ngrok static domain keeps the same URL,
  so the webhook doesn't need registering again.
- [ ] Register a second webhook for `https://<tunnel host>/api/webhooks/paymongo`
  with the same events, and put its secret in `.env.local`.
- [ ] Disable that webhook when you aren't tunneling.
- [ ] Most local work doesn't need the tunnel: `pnpm webhook:replay` signs and
  posts an event to localhost.

### One test account, several webhooks

Every webhook on a PayMongo account receives every event, so production also
gets the events of orders placed locally. The handler ignores an event whose
metadata environment isn't its own, and one whose order it doesn't know, and
answers `200` so PayMongo doesn't retry (#80). Separate PayMongo accounts per
environment would avoid this, but aren't needed.

### Previews

- [ ] Nothing to register. Leave Vercel Authentication on for previews; don't
  enable Protection Bypass for Automation for webhooks.
- [ ] Set the payment adapter switch to `fake` for the Preview environment.

### Orders switch (#78)

- [ ] Set `ORDERS_ENABLED=true` in Vercel → Preview, and in `.env.local`.
- [ ] After #81 is merged and deployed, set `ORDERS_ENABLED=true` in Vercel →
  Production and redeploy.

### Cron (auto-cancel, #81)

- [ ] Set `CRON_SECRET` in Vercel → Production.
- [ ] After the first production deploy with `vercel.json`'s `crons`, check
  that the job shows under Project → Settings → Cron Jobs. On the Hobby plan
  it runs at most once a day, only on production, and only accurate to the hour.

### CI

- [ ] No PayMongo key needed. Add the adapter switch (`fake`) and a dummy
  `PAYMONGO_WEBHOOK_SECRET` to the workflow's env in
  `.github/workflows/ci.yml`.

### Data

- [ ] Download the latest PSGC publication from the PSA and choose the version
  to commit (#76).
- [ ] After #76 deploys, run `pnpm db:seed` once by hand on production for the
  shipping rates and store settings, as in
  [spec 004](../specs/004-product-list/spec.md) ("Seeding production"). It
  creates settings only when missing, so it never overwrites edited values.
  The store address and hours are fictional, and the rates are demo values.

## To confirm in PayMongo's docs

The stories check these while writing their specs; update this page if they
differ:

- the `Paymongo-Signature` header format and the signed string (#80)
- the allowed `payment_method_types`, the minimum amount, a checkout session's
  lifetime and the expire endpoint (#79)
- the current test card numbers and wallet test flow, for the Test mode banner
  (FR-27, #79)
