# Tasks: spec 037 — vouchers at checkout (#94)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per step, subject line only.

## 0. Housekeeping
- [x] Commit spec.md, plan.md and tasks.md on `94-vouchers-at-checkout`

## 1. Pure vouchers
- [x] `lib/vouchers/code.ts` (`normalizeVoucherCode`), `discount.ts` (`voucherDiscount`), `check.ts` (`checkVoucher`, Behavior 8 order, `shortBy`), `types.ts`
- [x] `MIN_ONLINE_TOTAL` (2,000 centavos) in `lib/payments/amount.ts`, commented with the Cards and e-wallet limits
- [x] `VOUCHER_COPY` and `voucherRefusalText` in `lib/checkout/copy.ts` (every string of spec §5)
- [x] `eslint.config.mjs`: `lib/vouchers/**` joins the pure-folder import restrictions
- [x] Unit tests U1–U13 (rounding, cap, dates, case, min-spend boundary, look-alike characters)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema, migration, seed, reset
- [x] `schema.prisma`: `VoucherType`, `Voucher`, `Order.voucherId` / `voucherCode`, index, comments
- [x] Migration `vouchers` (`--create-only`) with the Voucher and Order CHECKs; `pnpm db:migrate`, `pnpm db:drift` and `pnpm test:db:migrate` pass
- [x] `prisma/seed/data/vouchers.ts` (`WELCOME10`, `SAVE500`, `BUILD5000`), `validate-vouchers.ts` with unit tests, `writeVouchers` per code with `skipDuplicates`, seed output line
- [x] `"Voucher"` added to the `TRUNCATE` lists in `prisma/seed/write.ts` and `test-support/db.ts`
- [x] DB tests D1–D7 (CHECKs, unique, `Restrict`, seed twice, edit survives, deleted code returns, reset) in `lib/orders/voucher-schema.db.test.ts` and `prisma/seed/write-vouchers.db.test.ts`; `orderData` and the reset test updated
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 3. The review
- [x] `checkoutInputSchema`: optional `voucherCode` on both shapes (trim, empty is none, over 200 characters is `invalid`); draft `voucherCode` and `draftPayload`
- [x] `lib/checkout/voucher.ts` (`loadVoucher`, no query for a code of the wrong shape)
- [x] `computeReview(client, cartId, details, now)` loads the voucher and returns `voucherId`; `reviewCheckout` reads `now` once
- [x] `buildReview`: fee call unchanged; `discount`, `voucher` (`none` / `applied` / `refused`), `total`, the ₱20.00 floor as a second pass; `canPlace` ignores the voucher
- [x] `reviewDigest` covers the applied code and the discount
- [x] Fixtures fixed in `review.test.ts`, `digest.test.ts`, `review-view.test.tsx`
- [x] Unit tests U14–U16 (U15 is the property test: a code never raises the total or changes the fee), digest, input and draft cases
- [x] DB tests V1–V16 (V5 / V5a with a test product of ₱75,050.00 and 21,000 g)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. Placement (committed with step 5: the race test P13 needs the give-back)
- [x] `lib/orders/voucher-use.ts`: `takeVoucherUse` (one conditional `UPDATE … RETURNING`, bound `now`, returns the values to compare)
- [x] `placeOrder`: `changed` for a code the review did not apply; the count after the stock step with the same `now`; `changed` for no row or changed values; `"voucher"` step name; the insert stores `voucherId`, `voucherCode`, `discount`
- [x] DB tests P1–P16, including the races (P3, P4, P13 with `Promise.all`, repeated), P15 (one `now`, asserted on the bound value) and a rollback leaving `usedCount` alone (P10)
- [x] Console spy: no code, discount or use count in any log; `guardTransactions` still passes
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. The release
- [x] `giveBackVoucherUses(tx, orderIds)` in `lib/orders/voucher-use.ts`; `releaseExpiredOrders` calls it after the stock updates, once per cancelled order, in voucher id order, with no date condition
- [x] DB tests R1–R8 (including an ended voucher, a Paid or skipped order, a rolled-back purchase) and the P13 race against a release
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. The review UI
- [x] `components/checkout/voucher-box.tsx` (idle, applied, busy, message with `aria-invalid` / `aria-describedby` / polite live region)
- [x] `ReviewView`: the box above the totals, the Discount row after Shipping, the threshold note untouched
- [x] `ReviewStep`: Apply, Remove, refusal, failed request, arrival and Check again with a saved code; the draft holds only an applied code; Place order sends the code only from the applied review; focus to Remove after an apply and to the field after a Remove or a refusal
- [x] Component tests O4–O7 (including the ₱20.00 text from the constant)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 7. Order page and email
- [x] `OrderPageData.voucherCode`, `getOrderForPage` mapping, `discountLabel(code)`, `order-view.tsx`
- [x] `EMAIL_COPY` and `emailView`: "Discount (CODE)", row only above zero
- [x] Existing order-page, email and `get-order` tests updated; O1–O3 added
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. E2E
- [x] `e2e/vouchers.ts` (insert a test voucher, move its `endsAt`) on `withPool` with the production guard
- [x] `e2e/vouchers.spec.ts`: X1–X4, with a part no other spec takes, known stock restored in `afterAll`, and its own recipient per order
- [x] `pnpm test:e2e` passes against dev; `pnpm build` + `CI=1 pnpm test:e2e` passes against the production build

## 9. Docs
- [x] Spec 028 (pointer on D14), 029, 030 and 036 pointers ("Changed by spec 037")
- [x] `CLAUDE.md`: vouchers paragraph, placing-an-order bullet, reset table lists (not the fee paragraph)
- [x] `docs/prd.md` Voucher row; README demo codes and the Preview checklist line; `docs/setup/payments.md` (the ₱20.00 floor, the manual check)
- [x] Spec 037 status line set to implemented

## Manual, once, not blocking
- [ ] `pnpm payments:check --keep` (the ₱19.99 session): does the payment page still offer Cards below ₱20.00? Record the answer in `docs/setup/payments.md`

## Definition of done
- [ ] Acceptance criteria checked on the Preview URL (including an open review getting "Your order changed" once, and the demo codes)
- [x] Desktop widths (1024 px and up); empty, loading and error states handled
- [x] Lint and type check pass; tests at the right level (unit, DB and E2E)
- [x] Spec, README and docs updated (no ADR needed)
- [ ] PR opened from the template (`Closes #94`)
