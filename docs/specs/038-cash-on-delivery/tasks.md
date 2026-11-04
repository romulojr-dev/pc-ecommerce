# Tasks: spec 038 — cash on delivery, confirmed by email (#95)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per step, subject line only.

## 0. Housekeeping
- [x] Spec reviewed and updated (only `COD_CONFIRM`; check-your-email text; `confirmedAt`; demo values kept; rounding down accepted)
- [x] Backlog issue "Resend the COD confirmation email" created: [#101](https://github.com/romulojr-dev/pc-ecommerce/issues/101)
- [x] Plan written and approved
- [x] Commit `spec.md`, `plan.md` and `tasks.md` on `95-cash-on-delivery-confirmed-by-email`

## 1. Pure code
- [x] `lib/checkout/cod-eligibility.ts` (`codEligibility`: disabled → pickup-off → zone → no-total → over-limit, with `overBy`)
- [x] `lib/orders/timeline.ts`: `PENDING_CONFIRMATION`, own "COD confirmed" label, COD sequences for delivery and pickup, `paymentOption` and `confirmedAt` input, "Confirmed {time}" detail; drop `POSITION_ALIAS`
- [x] `lib/orders/display-status.ts` (Pending of either kind at or after `expiresAt` reads Cancelled; COD confirmed never does)
- [x] `lib/orders/release-rules.ts`: `isDue` for both pending statuses
- [x] `lib/orders/cod-confirm-view.ts` (`confirmView`)
- [x] `codConfirmExp` in `lib/orders/signed-link.ts`; `mintCodConfirmLink` / `verifyCodConfirmLink` in `lib/orders/order-links.ts`
- [x] `lib/email/sender.ts` (`senderAddress` from `EMAIL_FROM`)
- [x] `COD_COPY` and `codReasonText` in `lib/checkout/copy.ts`; order-page and confirm-page strings in `lib/orders/copy.ts`
- [x] Unit tests U1–U9, U10–U14, U19, U20 and copy tests
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema, migrations, seed
- [ ] `schema.prisma`: `PENDING_CONFIRMATION`, `PaymentOption`, `Order.paymentOption` and `confirmedAt`, `StoreSettings` COD fields with defaults, the two-status partial index
- [ ] Migration `cod_status` (enum value only) and migration `cod_orders` (`--create-only`): columns, index swap, CHECKs (option/status pairing, COD `paidAt`, `confirmedAt`, the two existing checks recreated, `codMaxTotal`, `codConfirmHours`)
- [ ] `pnpm db:migrate`, `pnpm db:drift` and `pnpm test:db:migrate` pass (migrations applied twice)
- [ ] Seed store block, `validate-shipping`, `getShippingConfig`, test-support settings helper
- [ ] DB tests D1–D6, D9, D10 and the seed test D2
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 3. The review
- [ ] `checkoutInputSchema` `payment`; draft `payment` and `draftPayload`
- [ ] `buildReview` returns `payment: { requested, chosen, cod }`; `computeReview` passes it and sets `holdHours`; `reviewDigest` covers `chosen`
- [ ] Fixtures fixed in `review.test.ts`, `digest.test.ts`, `review-view.test.tsx`
- [ ] Unit tests U15, U16; DB tests V1–V15
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. The `COD_CONFIRM` email
- [ ] `emailView` for `COD_CONFIRM` (subject by fulfillment, lead, details, button only while confirmable, status lines); `EMAIL_COPY`; `cancelledLead` by payment option
- [ ] `lib/email/templates/cod-confirm.ts` registered; `EmailContext.confirmUrl` built in `send.ts`
- [ ] Existing tests updated (`view.test.ts`, `send.db.test.ts`, `release-cron.db.test.ts`, `test-support/email-orders.ts`)
- [ ] Tests U17, U18, U21, D8
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. Placement
- [ ] `placeOrder`: `changed` for a cash request not chosen; status, `paymentOption`, `expiresAt` and the email type by the chosen option; `PlaceResult` carries the option
- [ ] `placeOrderAction` skips `startPayment` for cash
- [ ] DB tests P1–P15 (gateway spy, forged calls, rollback, unit race, switch off); console spy; `guardTransactions`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. The release
- [ ] Due and lock queries in `release.ts` take both pending statuses
- [ ] DB tests R1–R10 and C9; `dueOrdersHolding` in `e2e/orders.ts` counts both
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Confirm
- [ ] `lib/orders/confirm-cod.ts` (`confirmCodOrder`, one conditional update setting `confirmedAt`), `logCodEvent`
- [ ] `getCodConfirmPage`, `confirmCodOrderAction`, the `p=cod-confirm` branch in the order page and its metadata
- [ ] `cod-confirm-view.tsx` and `cod-confirm-button.tsx`
- [ ] DB tests C1–C8 and the race C10 (20 runs); U14; `credentials`, `credential-payment` and `signed-link` tests updated
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. Order page
- [ ] `OrderPageData` and `getOrderForPage`: `paymentOption`, `confirmedAt`
- [ ] `OrderView`: display status, check-your-email text with the sender, confirmed and cancelled lines, Payment row, no panel or banner for cash; `OrderTimeline` draws the detail
- [ ] Tests O1–O4 (incl. O1a–O1c); `get-order.db.test.ts` updated
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 9. The review UI
- [ ] `components/checkout/payment-choice.tsx`; the Payment section, Payment row and cash place-note in `ReviewView`
- [ ] `ReviewStep`: choosing an option is a review request; draft `payment`; reset when no longer offered; Place order sends the chosen option
- [ ] Component tests O5–O7
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 10. E2E
- [ ] `e2e/cod.spec.ts` X1–X7 (own recipient per order; part, stock and deadline helpers)
- [ ] `e2e/signed-link.spec.ts` updated
- [ ] `pnpm build` then `CI=1 pnpm test:e2e`, and `pnpm test:e2e` against dev, pass

## 11. Docs
- [ ] `docs/prd.md` (FR-20, FR-21, COD row, `StoreSettings` and `Order` rows)
- [ ] Pointers in specs 028, 030, 033, 035, 036
- [ ] `CLAUDE.md` and README (demo COD values, trying it in `/dev/emails`)
- [ ] Spec 038 status set to implemented
- [ ] Acceptance criteria checked on the Preview URL
