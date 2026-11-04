# Tasks: spec 037 — vouchers at checkout (#94)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per step, subject line only.

## 0. Housekeeping
- [ ] Commit spec.md, plan.md and tasks.md on `94-vouchers-at-checkout`

## 1. Pure vouchers
- [ ] `lib/vouchers/code.ts` (`normalizeVoucherCode`), `discount.ts` (`voucherDiscount`), `check.ts` (`checkVoucher`, Behavior 8 order, `shortBy`), `types.ts`
- [ ] `MIN_ONLINE_TOTAL` (2,000 centavos) in `lib/payments/amount.ts`, commented with the Cards and e-wallet limits
- [ ] `VOUCHER_COPY` and `voucherRefusalText` in `lib/checkout/copy.ts` (every string of spec §5)
- [ ] `eslint.config.mjs`: `lib/vouchers/**` joins the pure-folder import restrictions
- [ ] Unit tests U1–U13 (rounding, cap, dates, case, min-spend boundary, look-alike characters)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema, migration, seed, reset
- [ ] `schema.prisma`: `VoucherType`, `Voucher`, `Order.voucherId` / `voucherCode`, index, comments
- [ ] Migration `vouchers` (`--create-only`) with the Voucher and Order CHECKs; `pnpm db:migrate`, `pnpm db:drift` and `pnpm test:db:migrate` pass
- [ ] `prisma/seed/data/vouchers.ts` (`WELCOME10`, `SAVE500`, `BUILD5000`), `validate-vouchers.ts` with unit tests, `writeVouchers` per code with `skipDuplicates`, seed output line
- [ ] `"Voucher"` added to the `TRUNCATE` lists in `prisma/seed/write.ts` and `test-support/db.ts`
- [ ] DB tests D1–D7 (CHECKs, unique, `Restrict`, seed twice, edit survives, deleted code returns, reset); `orderData` and the reset test updated
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 3. The review
- [ ] `checkoutInputSchema`: optional `voucherCode` on both shapes (trim, empty is none, over 200 characters is `invalid`); draft `voucherCode` and `draftPayload`
- [ ] `lib/checkout/voucher.ts` (`loadVoucher`, no query for a code of the wrong shape)
- [ ] `computeReview(client, cartId, details, now)` loads the voucher and returns `voucherId`; `reviewCheckout` reads `now` once
- [ ] `buildReview`: fee call unchanged; `discount`, `voucher` (`none` / `applied` / `refused`), `total`, the ₱20.00 floor as a second pass; `canPlace` ignores the voucher
- [ ] `reviewDigest` covers the applied code and the discount
- [ ] Fixtures fixed in `review.test.ts`, `digest.test.ts`, `review-view.test.tsx`
- [ ] Unit tests U14–U16 (U15 is the property test: a code never raises the total or changes the fee), digest, input and draft cases
- [ ] DB tests V1–V16 (V5 / V5a with a test product of ₱75,050.00 and 21,000 g)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. Placement
- [ ] `lib/orders/voucher-use.ts`: `takeVoucherUse` (one conditional `UPDATE … RETURNING`, bound `now`, returns the values to compare)
- [ ] `placeOrder`: `changed` for a code the review did not apply; the count after the stock step with the same `now`; `changed` for no row or changed values; `"voucher"` step name; the insert stores `voucherId`, `voucherCode`, `discount`
- [ ] DB tests P1–P16, including the races (P3, P4, P13 with `Promise.all`, repeated), P15 (one `now`, asserted on the bound value) and a rollback leaving `usedCount` alone (P10)
- [ ] Console spy: no code, discount or use count in any log; `guardTransactions` still passes
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. The release
- [ ] `giveBackVoucherUses(tx, orderIds)` in `lib/orders/voucher-use.ts`; `releaseExpiredOrders` calls it after the stock updates, once per cancelled order, in voucher id order, with no date condition
- [ ] DB tests R1–R8 (including an ended voucher, a Paid or skipped order, a rolled-back purchase) and the P13 race against a release
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. The review UI
- [ ] `components/checkout/voucher-box.tsx` (idle, applied, busy, message with `aria-invalid` / `aria-describedby` / polite live region)
- [ ] `ReviewView`: the box above the totals, the Discount row after Shipping, the threshold note untouched
- [ ] `ReviewStep`: Apply, Remove, refusal, failed request, arrival and Check again with a saved code; the draft holds only an applied code; Place order sends the code only from the applied review; focus to Remove after an apply and to the field after a Remove or a refusal
- [ ] Component tests O4–O7 (including the ₱20.00 text from the constant)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 7. Order page and email
- [ ] `OrderPageData.voucherCode`, `getOrderForPage` mapping, `discountLabel(code)`, `order-view.tsx`
- [ ] `EMAIL_COPY` and `emailView`: "Discount (CODE)", row only above zero
- [ ] Existing order-page, email and `get-order` tests updated; O1–O3 added
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. E2E
- [ ] `e2e/vouchers.ts` (insert a test voucher, move its `endsAt`) on `withPool` with the production guard
- [ ] `e2e/vouchers.spec.ts`: X1–X4, with a part no other spec takes, known stock restored in `afterAll`, and its own recipient per order
- [ ] `pnpm test:e2e` passes against dev; `pnpm build` + `CI=1 pnpm test:e2e` passes against the production build

## 9. Docs
- [ ] Spec 028 (pointer on D14), 029, 030 and 036 pointers ("Changed by spec 037")
- [ ] `CLAUDE.md`: vouchers paragraph, placing-an-order bullet, reset table lists (not the fee paragraph)
- [ ] `docs/prd.md` Voucher row; README demo codes and the Preview checklist line; `docs/setup/payments.md` (the ₱20.00 floor, the manual check)
- [ ] Spec 037 status line set to implemented

## Manual, once, not blocking
- [ ] `pnpm payments:check --keep` (the ₱19.99 session): does the payment page still offer Cards below ₱20.00? Record the answer in `docs/setup/payments.md`

## Definition of done
- [ ] Acceptance criteria checked on the Preview URL (including an open review getting "Your order changed" once, and the demo codes)
- [ ] Desktop widths (1024 px and up); empty, loading and error states handled
- [ ] Lint and type check pass; tests at the right level (unit, DB and E2E)
- [ ] Spec, README and docs updated (no ADR needed)
- [ ] PR opened from the template (`Closes #94`)
