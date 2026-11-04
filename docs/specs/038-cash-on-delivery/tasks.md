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
- [x] `schema.prisma`: `PENDING_CONFIRMATION`, `PaymentOption`, `Order.paymentOption` and `confirmedAt`, `StoreSettings` COD fields with defaults, the two-status partial index
- [x] Migration `cod_status` (enum value only) and migration `cod_orders` (`--create-only`): columns, index swap, CHECKs (option/status pairing, COD `paidAt`, `confirmedAt`, the two existing checks recreated, `codMaxTotal`, `codConfirmHours`)
- [x] Migrations applied and `pnpm db:drift` clean on a scratch database in the Docker Postgres (the Neon dev branch was not touched; `pnpm test:db` applies them to the test database)
- [x] Seed store block, `validate-shipping`, `getShippingConfig`, test-support settings helper
- [x] DB tests D1–D6, D9, D10 and the seed test D2
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 3. The review
- [x] `checkoutInputSchema` `payment`; draft `payment` and `draftPayload`
- [x] `buildReview` returns `payment: { requested, chosen, cod }`; `computeReview` passes it and sets `holdHours`; `reviewDigest` covers `chosen`
- [x] Fixtures fixed in `review.test.ts`, `digest.test.ts`, `review-view.test.tsx`
- [x] Unit tests U15, U16; DB tests V1–V15
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. The `COD_CONFIRM` email
- [x] `emailView` for `COD_CONFIRM` (subject by fulfillment, lead, details, button only while confirmable, status lines); `EMAIL_COPY`; `cancelledLead` by payment option
- [x] `lib/email/templates/cod-confirm.ts` registered; `EmailContext.confirmUrl` built in `send.ts`
- [x] Existing tests updated (`view.test.ts`, `release-cron.db.test.ts`, `test-support/email-orders.ts`; `send.db.test.ts` injects its templates and needed nothing). `e2e/signed-link.spec.ts` X4 still expects `no-template` and is updated in step 10
- [x] Tests U17, U18, U21, D8
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. Placement
- [x] `placeOrder`: `changed` for a cash request not chosen; status, `paymentOption`, `expiresAt` and the email type by the chosen option; `PlaceResult` carries the option
- [x] `placeOrderAction` skips `startPayment` for cash
- [x] DB tests P1, P3–P14 in `place-order-cod.db.test.ts` and P2, P15 in `actions.db.test.ts` (call-counting gateway with a control, forged calls, rollback with a log check, unit race); no gateway method is called by a cash placement, so `guardTransactions` has nothing to guard there
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. The release
- [x] Due and lock queries in `release.ts` take both pending statuses
- [x] DB tests R1–R10 and C9; `dueOrdersHolding` in `e2e/orders.ts` counts both
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Confirm
- [x] `lib/orders/confirm-cod.ts` (`confirmCodOrder`, one conditional update setting `confirmedAt`), `logCodEvent`
- [x] `getCodConfirmPage`, `confirmCodOrderAction`, the `p=cod-confirm` branch in the order page and its metadata
- [x] `cod-confirm-view.tsx` and `cod-confirm-button.tsx`; the items list and totals rows moved out of `order-view.tsx` into `order-parts.tsx` so both pages share them
- [x] DB tests C1–C8 and C10 in `confirm-cod.db.test.ts` (the 20-run race plus the three interleavings forced with the row lock: confirm between the release's check and lock, confirm waiting on the release's lock, release skipping a confirmation's lock); U14, U19; O8 in `cod-confirm-view.test.tsx`. `credentials`, `credential-payment` and `signed-link` tests needed no change (the purpose still opens nothing else; C8 pins it)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. Order page
- [x] `OrderPageData` and `getOrderForPage`: `paymentOption`, `confirmedAt`
- [x] `OrderView`: a cash order Pending confirmation past its deadline reads cancelled (through `paymentView`, now returning `expired` for it, so `displayStatus` serves the email and the confirm page), check-your-email text with the sender, confirmed and cancelled lines, Payment row, no panel or banner for cash; `OrderTimeline` draws the detail
- [x] Tests O1–O4 (incl. O1a–O1c); `get-order.db.test.ts` updated
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 9. The review UI
- [x] `components/checkout/payment-choice.tsx`; the Payment section, Payment row and cash place-note in `ReviewView`
- [x] `ReviewStep`: choosing an option is a review request; draft `payment`; reset when no longer offered; Place order sends the chosen option
- [x] Component tests O5–O7 (`payment-choice.test.tsx`, `review-view.test.tsx`); the checkout flow keeps the test-mode banner for cash but drops the gateway's instructions (spec Behavior 8 updated). The request path in `ReviewStep` (choose, fall back, focus) is covered by the E2E in step 10
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 10. E2E
- [x] `e2e/cod.spec.ts` X1–X7 (`e2e/settings.ts` moves the COD limit for X4; `orderLinkPathFor` and `codConfirmLinkQuery` in `e2e/orders.ts`) (own recipient per order; part, stock and deadline helpers)
- [x] `e2e/signed-link.spec.ts` updated
- [x] Run against a scratch database in the Docker Postgres (not the Neon dev branch): the whole suite in dev with one worker (165 of 166, the one failure a share-build navigation timeout that passes alone, 12 of 12), `pnpm build`, and the order-related specs against the production build with `CI=1` (39 of 39). With parallel workers the dev server was too slow and 18 unrelated specs timed out; they passed serially

## 11. Docs
- [x] `docs/prd.md` (FR-20, FR-21, COD row, `StoreSettings` and `Order` rows)
- [x] Pointers in specs 028, 030, 033, 035, 036
- [x] `CLAUDE.md` and README (demo COD values, trying it in `/dev/emails`)
- [x] Spec 038 status set to implemented, with "What changed while building"
- [ ] Acceptance criteria checked on the Preview URL

Open, for the review and merge: acceptance criteria checked on the Preview URL (the unchecked box above), and the PR.
