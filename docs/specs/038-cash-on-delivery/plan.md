# Plan: spec 038 — cash on delivery, confirmed by email (#95)

Spec: [spec.md](spec.md) (approved with changes 2026-11-04). Checklist: [tasks.md](tasks.md). Plan approved 2026-11-04. Example IDs (U, V, P, C, R, D, O, X) and Behavior numbers are the spec's. Branch: `95-cash-on-delivery-confirmed-by-email` (#94 is merged). One commit per step, subject line only, no attribution trailer (the user's saved git preference).

## Context

Everything a cash order needs already exists except the cash-specific parts: `OrderStatus.COD_CONFIRMED`, `EmailType.COD_CONFIRM` and the `cod-confirm` link purpose (signed and verified, opens nothing) were added in advance. What is missing: the `PENDING_CONFIRMATION` status, `Order.paymentOption` and `confirmedAt`, five COD settings, the review's Payment choice and `codEligibility`, the placement branch, the `COD_CONFIRM` template, the release for the new status, the confirm page and its POST, the COD timeline and order-page text. No new environment variable, route, reserved slug or ADR.

## Findings that shape the plan

- **`computeReview` / `buildReview`** (`lib/checkout/review-checkout.ts`, `review.ts`) are shared by the review and `placeOrder`, so cash eligibility goes in exactly those two plus a new pure `codEligibility`. `getShippingConfig` (`lib/shipping/config.ts`) already reads the settings fresh through a `client`; it gets the five fields. `computeReview` returns `holdHours` from `orderExpiryHours`; it becomes `codConfirmHours` when cash is chosen.
- **`placeOrder`** (`lib/orders/place-order.ts`) picks the status, `expiresAt` and the enqueued email type from the review's chosen option; the rest is unchanged. `placeOrderAction` (`app/(store)/checkout/actions.ts`) calls `startPayment` after placing; it must skip that for cash and return the plain link (no `payment=error`).
- **The release already works for orders with no payments**: `checkExpiredOrders` loops over an order's PENDING payments, and with none `releaseDecision([])` is `release: true`. So "no gateway step" is just widening the due query, the step-2 lock query, `isDue` and the partial index. `giveBackVoucherUses`, the stock undo and the `ORDER_CANCELLED` enqueue are reused as they are.
- **Order of work matters for email**: placement enqueues `COD_CONFIRM`, which fails final as `no-template` until the template is registered. So the template comes before the placement.
- **The `cod-confirm` page is a mode of `/orders/[number]`**. Today `loadOrder` returns `null` for any non-`view` link (`credentialOpens` → `verifyViewLink`), so the page 404s; `generateMetadata` and the page both call it. The page must branch on `p=cod-confirm` before `loadOrder`, with its own loader that verifies purpose `cod-confirm`. The status route, Pay now and the fake payment page keep using `findOrderByCredential` (view and token only), so they stay 404 (spec 035 K3).
- **A GET must not write**: the confirm view is a server component; Confirm order is a small client component calling a server action (a POST with Next's origin check).
- **Timeline**: `orderTimeline` (`lib/orders/timeline.ts`) aliases `COD_CONFIRMED` to `PAID`; that alias goes. Steps gain an optional `detail` ("Confirmed …") drawn by `components/orders/order-timeline.tsx`.
- **Past-due display**: `paymentView` turns Pending payment past `expiresAt` into `expired`, and `OrderView` derives Cancelled from it. Cash needs the same for Pending confirmation, so a pure display-status helper replaces the inline logic; `paymentView` stays online-only (it returns `none` for any other status already).
- **Migration with a new enum value**: Postgres cannot use `ADD VALUE` in the transaction that adds it, and Prisma wraps a migration in one. So two migrations: `cod_status` (just the value) and `cod_orders` (everything that uses it).
- **Partial index**: the schema declares `@@index([expiresAt], where: { status: "PENDING_PAYMENT" })`. For `IN (…)` I expect to need `raw("…")` in the `where`; `pnpm db:drift` is the check (CHECKs are not compared, indexes are).
- **Seed**: `writeShipping` creates the settings row only when missing; the existing row in every database gets the demo values from the column defaults, so the defaults and `prisma/seed/data/shipping.ts` must carry the same numbers (a test pins it).
- **Existing tests that will break or need updating** (spec §6): `lib/orders/signed-link.test.ts`, `credentials.db.test.ts`, `lib/payments/credential-payment.db.test.ts` (cod-confirm stays 404 for every other consumer; add the confirm-page case), `e2e/signed-link.spec.ts` (X2's COD link now shows the confirm page; X4's `COD_CONFIRM` row now renders), `lib/email/view.test.ts` (it asserts `COD_CONFIRM` throws), `lib/email/send.db.test.ts` and `lib/orders/release-cron.db.test.ts` (use `COD_CONFIRM` as their template-less row; switch to a type that is still unregistered or inject templates), `lib/orders/timeline.test.ts`, `components/checkout/review-view.test.tsx` and `lib/checkout/review.test.ts`/`digest.test.ts` (new `payment` field), `lib/orders/get-order.db.test.ts`, `test-support/email-orders.ts`, `e2e/orders.ts` (`dueOrdersHolding` counts only PENDING_PAYMENT).

## Risks to settle early

1. **The confirm/release race (C10).** Write it with the confirm code in step 7, before any UI. The conditional `UPDATE … SET status, confirmedAt WHERE status = 'PENDING_CONFIRMATION' AND expiresAt > now` and the release's `FOR UPDATE OF o SKIP LOCKED` re-check on status give exactly-one-wins; if a run shows both, the fix is the predicate, not a retry.
2. **Migration split and the partial index syntax** (steps 2): apply on the Docker DB, run `db:drift`, run twice.
3. **Review state in `ReviewStep`**: choosing an option is a review request like Apply. Reuse the existing `request(source, change)` path rather than a second one; the payment choice joins the draft like `voucherCode`.
4. **Clock use**: confirm reads one `now` and binds it into the update (same rule as spec 037 D10); tests assert the bound value for `confirmedAt`.
5. **Deploy window**: both migrations only add things, so old code keeps working; an open review gets "Your order changed" once (digest gains `payment`).

## Steps

### 0. Housekeeping
Copy this plan to `docs/specs/038-cash-on-delivery/plan.md`, write `tasks.md`, and commit them with the (already edited) `spec.md`.

### 1. Pure code
- `lib/checkout/cod-eligibility.ts`: `codEligibility({ method, zone, total }, settings)` → offered or `disabled | pickup-off | zone | no-total | over-limit (+ overBy)`, in that order.
- `lib/orders/timeline.ts`: `PENDING_CONFIRMATION` in `OrderStatusName` and labels; own label "COD confirmed"; the COD sequences (delivery and pickup); input takes `paymentOption` and `confirmedAt`; the COD confirmed step carries `detail` "Confirmed {dateTimeText}". Drop `POSITION_ALIAS`.
- `lib/orders/display-status.ts`: Pending (either kind) at/after `expiresAt` reads Cancelled; COD confirmed never does.
- `lib/orders/release-rules.ts`: `isDue` for both pending statuses.
- `lib/orders/cod-confirm-view.ts`: `confirmView(verdict, order, now)` → `confirm | confirmed | cancelled | not-found`.
- `lib/orders/signed-link.ts`: `codConfirmExp(expiresAt)` = `floor(ms / 1000)`; `lib/orders/order-links.ts`: `mintCodConfirmLink(orderNumber, expiresAt)` and `verifyCodConfirmLink(...)` bound to the secret.
- `lib/email/sender.ts` (pure): `senderAddress(from)` → the address part of `EMAIL_FROM`.
- Copy: `COD_COPY` in `lib/checkout/copy.ts` (every checkout string of spec §5, with `codReasonText(reason, …)` using `formatPeso`); order-page and confirm-page strings in `lib/orders/copy.ts`.
- Tests: U1–U9, U10–U14, U19, U20; copy tests.

### 2. Schema, migrations, seed
- `schema.prisma`: `OrderStatus.PENDING_CONFIRMATION`, `enum PaymentOption`, `Order.paymentOption` (default ONLINE) and `confirmedAt?`, `StoreSettings` COD fields with defaults, the index; comments updated.
- Migration `cod_status` (`ALTER TYPE … ADD VALUE`), then `cod_orders` (`--create-only`): the columns and defaults, the index swap, and the CHECKs: option/status pairing, COD `paidAt` only at Delivered/Picked up/Refunded, `confirmedAt` rules (COD only, null while pending, set from COD confirmed on), the two existing checks (`Order_paidAt_check`, `Order_pending_not_cancelled_check`) dropped and recreated for both pending statuses, `codMaxTotal` null or > 0, `codConfirmHours` ≥ 1.
- `prisma/seed/data/shipping.ts` store block + `validate-shipping` for the new fields; `getShippingConfig` returns them; `test-support` settings helper.
- Tests: D1–D6, D9, D10 (`lib/orders/cod-schema.db.test.ts`), D2 in the seed tests. `pnpm db:migrate`, `db:drift`, `test:db:migrate` pass.

### 3. The review
- `lib/checkout/input.ts`: `payment` (`online`|`cod`, default `online`) on both shapes; `draft.ts`: `payment` and `draftPayload`.
- `buildReview(…, request)` gets the requested payment and returns `payment: { requested, chosen, cod }`; `computeReview` passes it and sets `holdHours`; `reviewDigest` adds `chosen`.
- Fix fixtures (`review.test.ts`, `digest.test.ts`, `review-view.test.tsx`).
- Tests: U15, U16; `lib/checkout/review-cod.db.test.ts` for V1–V15.

### 4. The `COD_CONFIRM` email
- `lib/email/view.ts`: `codConfirm` view (subject by fulfillment, lead, confirm-by and pay-on-arrival details, Confirm order button only while confirmable, status lines otherwise, `where`, totals, View your order link); `EMAIL_VIEW_TYPES`; `EMAIL_COPY` strings; `cancelledLead(orderNumber, reason, paymentOption)`.
- `lib/email/templates/cod-confirm.ts`; register in `lib/email/templates.ts`; `EmailContext.confirmUrl` built in `lib/email/send.ts` from `mintCodConfirmLink(order.orderNumber, order.expiresAt)` (not for online orders).
- Update `view.test.ts`, `send.db.test.ts`, `release-cron.db.test.ts`, `test-support/email-orders.ts`.
- Tests: U17, U18, U21, D8.

### 5. Placement
- `place-order.ts`: `changed` when cash was requested and not chosen; status/`paymentOption`/`expiresAt` by the chosen option; `enqueueEmail` `COD_CONFIRM` or `ORDER_PLACED`; `PlaceResult` ok carries the option. `placeOrderAction` skips `startPayment` for cash.
- Tests (`place-order-cod.db.test.ts`): P1–P15 including the gateway spy (P2), forged calls (P8–P10), the rollback (P11), the unit race (P13), `ORDERS_ENABLED` off (P15). Console spy, `guardTransactions`.

### 6. The release
- `release.ts`: due query and step-2 lock query take `status IN ('PENDING_PAYMENT','PENDING_CONFIRMATION')`; comments updated. `cancelledLead` already varies by option (step 4).
- Tests: R1–R10 in `release-cod.db.test.ts` (R6 purchases, R7 cron, R9 `EXPLAIN` for the partial index); C9.
- `e2e/orders.ts` `dueOrdersHolding` counts both statuses.

### 7. Confirm
- `lib/orders/confirm-cod.ts`: `confirmCodOrder(orderNumber, link, now)` (shape check, one read, HMAC whether or not the order exists, `confirmView`, then the conditional update setting `confirmedAt`; re-read to say `already` or `expired`); `lib/orders/log.ts`: `logCodEvent` (event, outcome, order number only).
- `getCodConfirmPage` loader (React `cache`), `confirmCodOrderAction` in `app/(store)/orders/[number]/actions.ts`.
- `app/(store)/orders/[number]/page.tsx`: branch on `p=cod-confirm` in `generateMetadata` and the page (still `noindex`, no-referrer, `connection()`, `sweepAfterResponse`); `components/orders/cod-confirm-view.tsx` (server) and `cod-confirm-button.tsx` (client, busy/error states).
- Tests: C1–C8, C10 (20 repeats, `Promise.all`), U14; update `credentials.db.test.ts`, `credential-payment.db.test.ts`, `signed-link.test.ts`.

### 8. Order page
- `OrderPageData` + `getOrderForPage`: `paymentOption`, `confirmedAt`. `OrderView`: display status, the check-your-email text with `senderAddress(env.EMAIL_FROM)` passed from the page, the confirmed and cancelled lines, the Payment row; no payment panel or banner for cash; `OrderTimeline` draws `detail`.
- Tests: O1–O4 incl. O1a–O1c (`order-view.test.tsx`), `get-order.db.test.ts`.

### 9. The review UI
- `components/checkout/payment-choice.tsx` (presentational: two radios, disabled with the reason via `aria-describedby`, busy); `ReviewView`: the section, the Payment row, the cash place-note, no banner for cash; `ReviewStep`: choosing = `request()`, draft `payment`, reset when no longer offered, Place order sends the chosen option, `onPlaced` for cash has no pay URL (existing `goToOrder` path).
- Tests: O5–O7.

### 10. E2E
- `e2e/cod.spec.ts` X1–X7 (own recipient per order, a part no other spec uses with stock set and restored through `e2e/stock.ts`, deadline moved with `e2e/orders.ts`, the confirm link read from the fake outbox with the helper `order-emails.spec.ts` uses). Update `e2e/signed-link.spec.ts`.

### 11. Docs
- `docs/prd.md` (FR-20, FR-21, payments table COD row, `StoreSettings` and `Order` rows); specs 028, 030, 033, 035, 036 pointers; `CLAUDE.md` (cash orders paragraph; digest/placement, release, link and email bullets); README (demo COD values, how to try it in `/dev/emails`); spec 038 status set to implemented.

## Critical files

Modify: `prisma/schema.prisma`, `prisma/seed/data/shipping.ts`, `lib/shipping/config.ts`, `lib/checkout/{input,draft,copy,review,review-checkout,digest}.ts`, `lib/orders/{place-order,release,release-rules,timeline,copy,view,get-order,order-links,signed-link,log}.ts`, `lib/email/{view,copy,send,templates}.ts`, `app/(store)/checkout/actions.ts`, `app/(store)/orders/[number]/{page.tsx,actions.ts}`, `components/checkout/{review-view,review-step}.tsx`, `components/orders/{order-view,order-timeline}.tsx`, and the tests listed under Findings.
Create: two migrations, `lib/checkout/cod-eligibility.ts`, `lib/orders/{display-status,cod-confirm-view,confirm-cod}.ts`, `lib/email/{sender.ts,templates/cod-confirm.ts}`, `components/checkout/payment-choice.tsx`, `components/orders/{cod-confirm-view,cod-confirm-button}.tsx`, `e2e/cod.spec.ts`, tests beside each.

Reuse (do not rewrite): `giveBackVoucherUses`, `releaseExpiredOrders`' stock undo, `enqueueEmail` / `scheduleEmailSend`, `verifyOrderLink` / `linkShape`, `credentialOpens` pattern for equal-cost 404s, `dateTimeText` / `payByText` in `lib/orders/time.ts`, `formatPeso`, `shippingValue` / `addressLines`, `orderEntries`, `renderEmail`, the voucher box's request/focus pattern in `ReviewStep`, `guardTransactions`, `withPool` stock helper.

## Verification

1. After each step: `pnpm lint`, `pnpm typecheck`, `pnpm test`; from step 2 on also `pnpm test:db:up` and `pnpm test:db` (Docker Postgres, inline `TEST_DATABASE_URL`, nothing added to `.env.local`).
2. `pnpm db:deploy` + `pnpm db:drift` on a scratch database; the two migrations twice.
3. `pnpm build`, then `CI=1 pnpm test:e2e` (production build) and `pnpm test:e2e` against dev (`.env.local` needs `ORDERS_ENABLED="true"`, `ORDER_LINK_SECRET`, `PRODUCTION_DATABASE_HOST`; `pnpm db:seed` first).
4. Manual in `pnpm dev`: place a cash order (Ryzen × 2, QC), read the email in `/dev/emails`, open its link in a scanner-like GET (nothing changes), click Confirm order, see the timeline step with its time; place another, move its deadline, see it cancelled with the stock back; Build B shows the over-limit reason; a Davao address shows the zone reason; pickup shows Pay on pickup.
5. Preview URL: the acceptance criteria, an open review before the deploy getting "Your order changed" once, desktop widths 1024 px and up, empty/loading/error states.
