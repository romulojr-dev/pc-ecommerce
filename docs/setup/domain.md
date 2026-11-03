# Domain and email setup (pcsilicon.tech)

What to set up outside the code to move Production to **https://pcsilicon.tech**
and send order emails from **mail.pcsilicon.tech** (Sprint 7,
[#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4); emails are
[#92](https://github.com/romulojr-dev/pc-ecommerce/issues/92) and
[#93](https://github.com/romulojr-dev/pc-ecommerce/issues/93)). Payments setup
is in [payments.md](payments.md).

Nothing in the code holds the old `*.vercel.app` address: every absolute URL
(canonicals, Open Graph, the sitemap, Xendit return URLs, links in emails) is
built from `NEXT_PUBLIC_SITE_URL`.

## The rule: callbacks never point at a redirect

**A webhook URL must be the exact address that answers, never one that
redirects.** `pcsilicon.tech` is the primary domain and `www.pcsilicon.tech`
redirects to it (308), so a webhook set to `https://www.pcsilicon.tech/…` gets
the redirect, not the handler. Gateways don't follow redirects on a webhook:
Xendit counts the 308 as a failed delivery, retries it and then gives up, and
the order never reaches Paid. The same goes for the old `*.vercel.app` alias
once it redirects. Use the primary domain, with `https://` and no trailing
slash, for every callback, and for `NEXT_PUBLIC_SITE_URL`.

## Vercel domain

- [ ] Vercel → Project → Settings → Domains: add `pcsilicon.tech` and
  `www.pcsilicon.tech`. Make `pcsilicon.tech` the primary and set `www` to
  **redirect** to it (308).
- [ ] At the registrar, add the records Vercel shows (an `A` record for the apex
  and a `CNAME` for `www`), or move the nameservers to Vercel. If DNS is on
  Vercel, the Resend records below go there too.
- [ ] Wait until Vercel shows both domains as valid with a certificate.
- [ ] Keep the old `*.vercel.app` production alias and point it at the new domain
  (redirect), so order links already sent keep working: the path and the
  `?key=` query carry over.

## NEXT_PUBLIC_SITE_URL

- [ ] Vercel → Production → `NEXT_PUBLIC_SITE_URL` = `https://pcsilicon.tech`.
  Preview keeps its own value.
- [ ] Redeploy. A `NEXT_PUBLIC_` variable is built into the code, so the change
  does nothing until the next build.
- [ ] Check on the new domain: a product page's canonical and `og:url`,
  `/sitemap.xml`, and an order's Pay now (its return URL comes back to
  `pcsilicon.tech`).

Guest carts don't move: the `__Host-cart` cookie belongs to the host that set
it, so a cart started on the old address is empty on the new one. Payment
sessions opened before the switch return to the old address, which redirects.

## Xendit webhook

- [ ] Xendit Dashboard → Settings → Webhooks → **Payment Sessions**: set the URL
  to exactly `https://pcsilicon.tech/api/webhooks/xendit` (the primary domain;
  see the rule above). The verification token doesn't change.
- [ ] Pay one test order on Production and check the Vercel log line
  `{"event":"payment.webhook","outcome":"paid",…}`
  ([payments.md](payments.md#production-webhook-80)).

The daily cron (`vercel.json`) calls the production deployment directly and
needs no change.

## Resend (mail.pcsilicon.tech)

Email goes through Resend from the subdomain `mail.pcsilicon.tech`, so the
apex's own mail records (if any) are untouched. The sender is
`PC Silicon <orders@mail.pcsilicon.tech>`.

- [ ] Resend → Domains → Add domain: `mail.pcsilicon.tech`, and pick the region.
- [ ] Add the DNS records Resend shows, **copying the values from the Resend
  dashboard** (the DKIM key is per domain and the MX host depends on the region).
  In the `pcsilicon.tech` zone they are:

  | Type | Name | Value | Purpose |
  | --- | --- | --- | --- |
  | `MX` | `send.mail` | `feedback-smtp.<region>.amazonses.com`, priority 10 | Bounces and complaints (return path) |
  | `TXT` | `send.mail` | `v=spf1 include:amazonses.com ~all` | SPF for the return path |
  | `TXT` | `resend._domainkey.mail` | the DKIM public key from Resend | DKIM signature |
  | `TXT` | `_dmarc.mail` (optional) | `v=DMARC1; p=none;` | DMARC, report only to start |

  Some DNS hosts want the full name (`send.mail.pcsilicon.tech`); others add the
  zone themselves. Don't add the zone twice.
- [ ] Wait until Resend shows the domain as **Verified**.
- [ ] Vercel → Production only: `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY` (a
  sending-only key for this domain), `EMAIL_FROM="PC Silicon <orders@mail.pcsilicon.tech>"`
  and `ORDER_LINK_SECRET` (32 random bytes or more, e.g.
  `openssl rand -base64 48`). Preview, CI and local runs use
  `EMAIL_TRANSPORT=fake`, so they never send real email, and each environment
  has its own `ORDER_LINK_SECRET`. Redeploy.
- [ ] Place one test order on Production with your own address and check that
  "[Demo] Order … placed" arrives, is not in spam, and its **Pay now** and
  **View your order** links open the order on `pcsilicon.tech`. Pay it with a
  Xendit test card and check "[Demo] Payment received…"; place another and let
  it expire (or move its deadline) to check "[Demo] Order … was cancelled"
  ([spec 036](../specs/036-order-emails/spec.md)).
- [ ] Vercel → Settings → Deployment Protection: confirm **Vercel Authentication
  is on for Preview** deployments. `/dev/emails` on a Preview lists the emails
  the fake transport recorded, and their links open orders in the preview
  database; protection is what keeps it private (it is a 404 in Production).

Changing `ORDER_LINK_SECRET` revokes every signed order link already emailed;
the shopper's original access-token link keeps working. It is the only way to
revoke a signed link, so rotate it on purpose, never as a side effect of a
deploy. The app refuses to start without it (at least 32 bytes), in every
environment, and refuses `EMAIL_TRANSPORT=fake` when `VERCEL_ENV=production`
([ADR 0011](../adr/0011-signed-order-links-beside-the-access-token.md)).

Secrets checklist (Vercel → Settings → Environment Variables):

| Variable | Production | Preview | Local (`.env.local`) |
| --- | --- | --- | --- |
| `EMAIL_TRANSPORT` | `resend` | `fake` | `fake` |
| `RESEND_API_KEY` | the sending-only key for `mail.pcsilicon.tech` | not set | not set |
| `EMAIL_FROM` | optional (default `PC Silicon <orders@mail.pcsilicon.tech>`) | not set | not set |
| `ORDER_LINK_SECRET` | its own, 32 bytes or more | its own | any long text (see `.env.example`) |

Add the two required variables to `.env.local` after pulling spec 035, or
`pnpm dev` stops at startup with "EMAIL_TRANSPORT is not set" and
"ORDER_LINK_SECRET is not set". The Playwright process reads `.env.local` too,
which the E2E needs to mint links.
