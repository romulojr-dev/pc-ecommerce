# Next.js template

This is a Next.js template with shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```

## Testing

```bash
pnpm test                              # unit tests (Vitest), no database needed
pnpm test:watch                        # unit tests in watch mode
pnpm test:db:up                        # start the test Postgres (Docker)
pnpm test:db                           # database integration tests; needs TEST_DATABASE_URL
pnpm test:db:down                      # stop it
pnpm exec playwright install chromium  # once, before the first E2E run
pnpm test:e2e                          # E2E tests (Playwright); starts the dev server
```

Unit tests are `*.test.ts` next to the code they test. Integration tests are
`*.db.test.ts`; they run real queries against Postgres. E2E tests live in `e2e/`.

E2E runs against the database the app server uses (`DATABASE_URL`: locally the
Neon dev branch, in CI a throwaway Postgres). Three specs, `e2e/cart-flags.spec.ts`,
`e2e/checkout.spec.ts` and `e2e/place-order.spec.ts`, change a product's stock
there through `e2e/stock.ts` and restore it (the last one also places orders,
which stay, and needs `ORDERS_ENABLED="true"` and `PAYMENT_GATEWAY="fake"`); the helper refuses to run on the production
database, and locally it needs `PRODUCTION_DATABASE_HOST` in `.env.local`
([spec 027](docs/specs/027-cart-stock-flags/spec.md),
[spec 029](docs/specs/029-checkout-steps/spec.md),
[spec 030](docs/specs/030-place-an-order/spec.md)).
To keep the Neon dev branch clean, point the E2E at an empty database in the
Docker Postgres by setting `DATABASE_URL` and `DATABASE_URL_UNPOOLED` inline,
after `pnpm db:deploy` and `pnpm db:seed` against it. Making that the default is
[#74](https://github.com/romulojr-dev/pc-ecommerce/issues/74).

### Integration test database

The integration tests empty the catalog tables, so they run against a Postgres
of their own, never the app's database. It runs in Docker
([docker-compose.yml](docker-compose.yml): Postgres 18 on port 5433, data in
memory, local-only credentials). With Docker Desktop running, add the
`TEST_DATABASE_URL` line from `.env.example` to your `.env.local` once, then:

```bash
pnpm test:db:up      # start it and wait until it is healthy
pnpm test:db         # apply the migrations, then run the tests
pnpm test:db:down    # stop and remove it (its data goes with it)
```

`pnpm test:db:migrate` applies the migrations by hand, for poking at the
database; `pnpm test:db` does it itself. `pnpm test:db` prints the host and
database it uses, and refuses to run when `TEST_DATABASE_URL` is missing or on
the same host as `DATABASE_URL`. (A loopback host such as this one is allowed
to share a server with the app only when the database name differs, which is
how CI runs it.)

The image's major version matches the Neon project and CI. Check Neon's with
`SHOW server_version;` in its SQL editor, or under the project's settings, and
update `docker-compose.yml` and `.github/workflows/ci.yml` together if it ever
changes.

## Schema drift

CI fails when `prisma/schema.prisma` and the migrations disagree: a model or an
index (such as the cart's partial unique index) that no migration creates, or a
migration that changes something the schema doesn't say. It replays the
migrations in an empty scratch database and compares the result with the schema
(`pnpm db:drift`, [spec 025](docs/specs/025-cart-single-items/spec.md)). To run
it yourself, point `SHADOW_DATABASE_URL` at an empty database that is not the
app's, for example one more database on the Docker Postgres:

```bash
docker exec pc-silicon-test-db psql -U postgres -c 'CREATE DATABASE pcsilicon_shadow'
SHADOW_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/pcsilicon_shadow pnpm db:drift
```

It prints "No difference detected." and exits 0 when they agree, and lists the
difference and exits 2 when they don't. It only reads; it never changes the
app's database. `CHECK` constraints and triggers live only in the migrations
(Prisma can't express them), so the check doesn't compare those.

## Cached data

The header's category menu is cached for up to an hour
([ADR 0003](docs/adr/0003-cache-shared-data-with-tags.md)). Changes made
through the app refresh it at once, but `pnpm db:seed` and manual edits in the
Neon console run outside Next, so the menu can show the old categories for up
to an hour afterwards.

To check: compare the menu with the database, e.g. in the Neon SQL editor:

```sql
SELECT name, slug, "sortOrder" FROM "Category"
WHERE "parentId" IS NULL ORDER BY "sortOrder", name;
```

If they differ, wait for the hour to pass. In production you can purge the
Data Cache from the Vercel dashboard (project Settings → Caches) instead.
Locally, stop `pnpm dev`, delete `.next/cache` and start it again.

The home page's Featured products, Deals and brand list work the same way, with
a 10-minute delay (tag `products`, [spec 016](docs/specs/016-home-page/spec.md)):
after a re-seed, its prices, stock labels and picks can be up to 10 minutes old.
Product pages, listings and search always show current prices and stock.

## Shipping data

The shipping rates and the store settings (address, hours, free-shipping
threshold, order expiry) are **demo values**: a fictional store and made-up
courier rates. `pnpm db:seed` creates the settings row only when it is missing
and inserts the rates only when the table is empty, so it never overwrites what
Admin sets later; a second run prints "kept (already set)." for each
([spec 028](docs/specs/028-shipping-data-and-fee-rules/spec.md)). With
`--reset`, the seed clears both tables along with the catalog and refills the
demo values.

The PH address data (regions, provinces, cities, barangays) comes from the PSA's
PSGC publication. `pnpm psgc:convert` turns `data/psgc/2026Q3.xlsx` into the JSON
files in `data/psgc/json/2026Q3/`, which are committed; the app serves them at
`/api/psgc/2026Q3/…` and validates addresses against the same files
([ADR 0008](docs/adr/0008-serve-address-data-as-versioned-json-through-a-route-handler.md)).
For a new quarter, put the workbook in `data/psgc/`, change `PSGC_VERSION` in
`lib/psgc/version.ts`, run `pnpm psgc:convert`, and fix what the tests name.

## Vouchers

`pnpm db:seed` adds three demo voucher codes, each only when its code is missing
(an existing row, edited or used, is never touched; `--reset` clears and refills
them). Enter one on the review step of checkout
([spec 037](docs/specs/037-vouchers-at-checkout/spec.md)):

| Code | Discount | Needs |
| --- | --- | --- |
| `WELCOME10` | 10 % off | ₱5,000.00 or more |
| `SAVE500` | ₱500.00 off | ₱10,000.00 or more |
| `BUILD5000` | ₱5,000.00 off | ₱50,000.00 or more; the first 100 uses |

The discount comes off the merchandise only, never the shipping, and never
leaves a total under ₱20.00. There is no Admin screen for vouchers yet.

## Cash on delivery

On the review step a shopper can choose **Cash on delivery** (**Pay on pickup**
for a pickup order) instead of paying online
([spec 038](docs/specs/038-cash-on-delivery/spec.md)). `pnpm db:seed` and the
migrations give the settings these demo values, which the seed never
overwrites (there is no Admin screen yet):

| Setting | Demo value |
| --- | --- |
| On | yes (pay on pickup too) |
| Limit on the total, shipping included | ₱50,000.00 |
| Zones | Metro Manila and Luzon |
| Time to confirm | 24 hours |

To try it locally with the fake email transport (`EMAIL_TRANSPORT=fake`),
choose Cash on delivery and place the order, then open `/dev/emails`: the
"Confirm your cash-on-delivery order" email has a **Confirm order** link. Open
it and press the button. An order left unconfirmed is cancelled when its time
is up and its stock goes back.

## Payments

Checkout pays through Xendit's test mode ([ADR 0010](docs/adr/0010-payment-gateway-xendit-test-mode.md),
[spec 031](docs/specs/031-pay-with-xendit/spec.md)). `PAYMENT_GATEWAY` is
required: `fake` locally, in Preview and in CI (a labelled test payment page in
the store itself), `xendit` in Production. The keys, webhooks, tunnel, cron and
preview setup are in [docs/setup/payments.md](docs/setup/payments.md);
`pnpm payments:check` checks the test key and a session against Xendit without
printing the key.

Placing an order is behind `ORDERS_ENABLED` (`"true"` or `"false"`; unset means
off). Set it to `true` in `.env.local` to place orders locally. It is on in
Preview and CI. In Production it is turned on once unpaid orders release their
stock (#81, [spec 033](docs/specs/033-release-unpaid-orders/spec.md)) is
deployed. Unpaid orders are cancelled at their deadline by the purchases that
need their stock, by a sweep after pages that show stock, and by a daily cron
(`CRON_SECRET`, see the setup page).

## Admin sign-in

`/admin` is for the shop's staff ([spec 039](docs/specs/039-staff-sign-in-admin-shell/spec.md),
[ADR 0012](docs/adr/0012-staff-auth-on-better-auth.md)). Nobody signs up:
accounts are made with `pnpm staff:create` (owner or staff) and
`pnpm db:seed --accounts-only` (the demo user), and each database needs its
own. [docs/setup/admin-accounts.md](docs/setup/admin-accounts.md) has the
commands, the Vercel settings and how to check sign-in on a preview URL.

**Roles** ([spec 040](docs/specs/040-admin-permissions-audit-masking/spec.md)): an owner can do everything; staff manage orders, see customers and adjust inventory; the demo account can open every screen the owner can, can't change anything and can't search by customer, and customer names, emails, phones and addresses are masked for it. Every change is checked on the server and recorded in an append-only audit log.

**Orders** ([spec 041](docs/specs/041-admin-orders-list-detail/spec.md)): `/admin/orders` lists orders newest first with filters (status, online or cash, order number, and for owner and staff customer name, email or mobile), `/admin/orders/<number>` shows an order with its payments, emails and flags, and `/admin/orders/<number>/packing-slip` is a print-ready page with no prices. The list shows an order's real status, with a "Due for release" badge once an unpaid order is past its deadline. Staff move an order through Processing, Shipped (with courier and tracking number) or Ready for pickup, and Delivered or Picked up ([spec 043](docs/specs/043-order-fulfillment-transitions/spec.md)); the customer is emailed when it ships, is ready for pickup or is delivered, and a cash order is recorded as paid when it is handed over. Cancel and refunds are later stories.

**Customers** ([spec 042](docs/specs/042-admin-customers/spec.md)): `/admin/customers` lists each customer (a guest email) once with how many orders they placed, how much they have paid and when they last ordered, and each row opens that customer's orders. Owner and staff can search by name, email or mobile; the demo account sees masked rows and can't search.

**Inventory** ([spec 046](docs/specs/046-admin-inventory-adjustments/spec.md)): `/admin/inventory` lists every product's stock and low-stock threshold, lowest first, and filters to low stock, out of stock or both. A product's page records a delivery, a loss or a count correction with a reason, shows "Stock 12 → 112" for you to confirm first, and keeps a history of every change with the staff member, the order and a note. An adjustment adds or removes a number rather than setting one, so it can't overwrite an order placed at the same moment, and stock never goes below 0. Owner and staff can adjust; the demo account sees it read-only.

**Dashboard** ([spec 048](docs/specs/048-admin-dashboard/spec.md)): `/admin/dashboard` shows paid sales, orders placed and the average order value for today and the last 30 days (Philippine days), the products that need restocking, the five newest orders and how many orders need payment review. Sales count when an order is paid (a cash order when it is delivered or picked up) and leave out cancelled and refunded orders; orders placed counts every order. The owner and the demo account land on it after signing in; staff land on Orders and can't open it. The demo account sees the real figures with the recent orders' customer names masked.

**Audit log** ([spec 047](docs/specs/047-admin-audit-log-view/spec.md)): `/admin/audit` lists every recorded change newest first, 25 to a page, and filters by entity, person and date (Philippine days, both ends included). Each entry opens to a before and after table (prices as pesos, statuses by name) with a link to the product or order. It is read-only and the database refuses to edit or delete a row. The owner and the demo account can open it; staff can't. The demo account sees customer details masked and free text hidden, and any field nobody has classified is hidden for it.

**Demo account** (read-only, public): email `demo@pcsilicon.tech`, password the
value of `DEMO_ACCOUNT_PASSWORD`. It is shown on the sign-in page of every
environment where that variable is set, with a "Use demo account" button.

After pulling this, add `BETTER_AUTH_SECRET` to `.env.local` (at least 32 bytes;
`.env.example` has a placeholder), or `pnpm dev` stops at startup. Sign-in is
limited to 3 attempts per 10 seconds per IP in every environment, so tests that
sign in send their own `X-Forwarded-For`.

## AI agent skills

The Prisma agent skills used by Claude Code are not committed. `.agents/` holds
the skill files and `.claude/skills/` links to them; both are gitignored.
`skills-lock.json` records which skills are installed and is committed.

On a new machine, restore them from the lockfile:

```bash
pnpm dlx skills@1.5.14 experimental_install
```

If that fails (the command is experimental), reinstall them for Claude Code only:

```bash
pnpm dlx skills@1.5.14 add prisma/skills --agent claude-code --skill '*' -y
```
