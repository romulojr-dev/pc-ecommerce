# Plan: spec 037 — vouchers at checkout (#94)

Spec: [spec.md](spec.md). Checklist: [tasks.md](tasks.md). Example IDs (U, V, P, R, D, O, X) and Behavior numbers are the spec's. Branch: `94-vouchers-at-checkout` (#93 is merged to `main`).

## Context

The `Order` table already has `discount` and the `total = subtotal + shippingFee − discount` CHECK, the order page and the Order placed email already draw a Discount row above zero, and `placeOrder` writes `discount: 0`. What is missing is the `Voucher` table, a way to choose a code, the review's and the digest's knowledge of it, the conditional use count, the release's give-back, and the label "Discount ({code})". One migration, no new environment variable, route or reserved slug. The shipping fee code does not change at all (review of 2026-11-04: spec 028 D14 stays).

## Findings that shape the plan

- `computeReview(client, cartId, details)` ([lib/checkout/review-checkout.ts](../../../lib/checkout/review-checkout.ts)) is the one place the review and `placeOrder` share, and `buildReview` ([lib/checkout/review.ts](../../../lib/checkout/review.ts)) is pure. The voucher belongs in exactly those two: `computeReview` reads the voucher row through its client and takes the caller's `now`; `buildReview` applies the pure check, the discount and the ₱20.00 floor. `reviewCheckout` reads `now` once; `placeOrder` already has a `now` option and hands the same value to `computeReview` and to the conditional update (Behavior 16, D10).
- `buildReview` calls `shippingFee` with `view.subtotal`. It keeps doing so. The only change to the fee path is none, which U14 and U15 pin.
- `reviewDigest` hashes `{ lines, shippingFee, subtotal, total }`; adding `voucher` and `discount` changes every digest once. That is accepted by the issue and tested (an old-format digest is `changed`).
- `CheckoutReview` goes to the browser inside `ReviewActionResult`, so it must not carry the voucher's row id. `computeReview` returns `voucherId` next to `review` in `ReviewCore`, and `placeOrder` uses that.
- `placeOrder` takes the stock with `UPDATE … RETURNING "effectivePrice"` and refuses when the returned price differs from what the review used. The voucher count follows the same pattern: `UPDATE … RETURNING` the row's `type`, `value` and `minSpend`, and `changed` if they differ from what the review used (so an edit between the read and the update cannot slip through). This is inside the spec's "the voucher is the one reviewed"; it gets its own test (P16 below).
- Lock order is products by id, then the voucher row, in the placement and in the release. `releaseInPurchase` runs inside a placement's transaction before the stock step, so the release's product and voucher locks come first and the placement's later products and voucher locks follow in the same order. P13 repeats this 20 times.
- The release locks the due orders with `FOR UPDATE OF o SKIP LOCKED` and cancels `ids`; the give-back reads `voucherId` of exactly those orders, so it happens once per cancelled order.
- `EmailOrder` is `Prisma.OrderGetPayload<{ include: { items: true } }>`, so `voucherCode` reaches the email by itself once the schema has it. `OrderPageData` ([lib/orders/view.ts](../../../lib/orders/view.ts)) needs the field added by hand, and `getOrderForPage` the mapping.
- `ReviewStep` ([components/checkout/review-step.tsx](../../../components/checkout/review-step.tsx)) owns the requests; `ReviewView` is presentational. The voucher box follows that split: a presentational `VoucherBox` in the summary, state and requests in `ReviewStep`. The draft store ([lib/checkout/draft-store.ts](../../../lib/checkout/draft-store.ts)) already has `update(patch)`.
- **Existing tests and fixtures that will break or need new fields:** `lib/checkout/review.test.ts`, `digest.test.ts`, `components/checkout/review-view.test.tsx` (`CheckoutReview` gains `discount` and `voucher`), `lib/email/view.test.ts` T4 and `test-support/email-orders.ts` (label, `voucherCode: null`), `components/orders/order-view.test.tsx` (the Discount test, `OrderPageData.voucherCode`), `lib/orders/get-order.db.test.ts` and `schema.db.test.ts` (new column, CHECKs), `test-support/orders.ts` `orderData`, `place-order.db.test.ts` (its digest and `discount: 0` expectations), `test-support/db.ts` and `prisma/seed/write.ts` (the two `TRUNCATE` lists), `test-support/reset-catalog.db.test.ts`.
- `docs/setup/payments.md` already records the per-channel limits ("Confirmed in Xendit's docs"). The ₱19.99 session in test mode was created (spec 031 Q8), so session creation does not enforce the Cards minimum; whether the payment page hides Cards below ₱20.00 is the one unverified fact, handled as a manual check that does not block the story.

## Risks to settle early

1. **The race and the lock order (P3, P4, P13).** Write these tests with the placement code in step 4, before the UI. If a deadlock shows up, the fix is lock order (voucher after products), not retries.
2. **Raw SQL with a `Date`.** The conditional update and the give-back use `$queryRaw`/`$executeRaw` with a bound `now`; the release and the stock updates already do this through the pg adapter, so the pattern exists. P15 asserts the bound value.
3. **`ReviewStep` state.** Apply, Remove, a refusal, a failed request, arrival with a saved code and Check again all go through one `request()`; the draft is written only for an applied code. Keep one function and a small reducer-like state, and cover the transitions in component tests and E2E X2–X4.
4. **Deploy window.** The migration only adds a table and nullable columns, so old code keeps working until the new build is live (`db:deploy` runs before the build on Vercel). An open review gets "Your order changed" once.

## Steps (one commit each, in this order; subject-only messages)

### 0. Housekeeping
Commit `docs/specs/037-vouchers-at-checkout/{spec,plan,tasks}.md`.

### 1. Pure vouchers
- `lib/vouchers/`: `code.ts` (`normalizeVoucherCode`: trim, shape `^[A-Za-z0-9_-]{3,32}$` before upper-casing, `null` otherwise), `discount.ts` (`voucherDiscount`: percent `floor(subtotal × value / 100)` on integers, fixed `min(value, subtotal)`, `RangeError` on non-integers), `check.ts` (`checkVoucher(voucher | null, subtotal, now)` with the Behavior 8 order and `shortBy`), `types.ts` (`VoucherInput` = the row fields the check reads; `VoucherRefusal` reasons).
- `MIN_ONLINE_TOTAL = 2_000` in `lib/payments/amount.ts`, with a comment citing the Cards and e-wallet limits (D15).
- `VOUCHER_COPY` and `voucherRefusalText(refusal)` in `lib/checkout/copy.ts` (every string of spec §5; the Min-spend and below-minimum texts use `formatPeso`).
- `eslint.config.mjs`: add `lib/vouchers/**` to the `no-restricted-imports` block of `lib/builder` and `lib/specs`; adjust its message.
- Tests: U1–U13, and the normalization cases of U7/U8.

### 2. Schema, migration, seed, reset
- `prisma/schema.prisma`: `enum VoucherType`, `model Voucher`, `Order.voucherId?`/`voucherCode?` with the relation (`Restrict`) and `@@index([voucherId])`; update the comments that say vouchers are Sprint 7.
- `pnpm db:migrate --name vouchers --create-only`, then append the CHECKs the schema cannot say (Voucher: code shape, percent 1–100, fixed > 0, minSpend ≥ 0, usageLimit null or ≥ 1, usedCount ≥ 0 and ≤ usageLimit, endsAt > startsAt; Order: `discount <= subtotal`, `(voucherId IS NULL) = (voucherCode IS NULL)`, `discount = 0 OR voucherId IS NOT NULL`). Apply with `pnpm db:migrate`, run `pnpm db:drift` and `pnpm test:db:migrate` against the Docker database.
- `prisma/seed/data/vouchers.ts` (the three demo codes, Manila-midnight `startsAt`), `validate-vouchers.ts` (shape, units, dates; unit-tested like `validate-shipping`), `writeVouchers` in `prisma/seed/write.ts` with `createMany({ skipDuplicates: true })` per code, counts in `SeedCounts`, a line in `prisma/seed.ts`'s output ("Vouchers: n added, m kept").
- Add `"Voucher"` to both `TRUNCATE` lists (`prisma/seed/write.ts` and `test-support/db.ts`) and to the comment that explains why they are named.
- Tests: D1–D7 (`lib/vouchers/schema.db.test.ts`, `prisma/seed/write-vouchers.db.test.ts`), the reset test in `test-support/reset-catalog.db.test.ts`, `orderData` accepting the new columns.

### 3. The review: input, draft, `computeReview`, `buildReview`, digest
- `lib/checkout/input.ts`: optional `voucherCode` on both shapes (trim, empty → absent, max 200 → `invalid`). `lib/checkout/draft.ts`: `voucherCode` (default `""`), `draftPayload` adds it only when non-empty.
- `lib/checkout/voucher.ts` (server): `loadVoucher(client, code)` → the row or `null` (no query for a code of the wrong shape).
- `computeReview(client, cartId, details, now)`: loads the voucher, returns `voucherId` beside `review`. `reviewCheckout` reads `now` once and passes it.
- `buildReview(view, weights, destination, config, voucher)`: unchanged fee call; computes `discount`, `voucher` (`none` | `applied { code, discount }` | `refused { reason, shortBy? }`) and `total = subtotal − discount + fee`; the floor as a second pass (an applied code whose total is under `MIN_ONLINE_TOTAL` becomes `refused: below-minimum`, discount 0, total recomputed). `canPlace` ignores the voucher.
- `lib/checkout/digest.ts`: add the applied code (or null) and the discount.
- Fix the fixtures in `review.test.ts`, `digest.test.ts`, `review-view.test.tsx`.
- Tests: U14–U16 (including the property test U15 with seeded random inputs), digest changes with code and with discount, input and draft cases, then `lib/checkout/review-voucher.db.test.ts` for V1–V16 (V5/V5a create their own 21,000 g ₱75,050.00 product with `createCategoryAndBrand`).

### 4. Placement
- `lib/orders/voucher-use.ts`: `takeVoucherUse(tx, { id, now })` → the row's `{ type, value, minSpend }` or `null`, one `UPDATE … RETURNING` with the limit and date conditions and the bound `now`.
- `lib/orders/place-order.ts`: after `computeReview` (given `now`), refuse `changed` when the input carried a code and the review did not apply it; after the stock step run `takeVoucherUse` with the same `now`, refusing `changed` for no row or for values different from what the review used; add a `"voucher"` step name to `PlaceStep`; the order insert gets `voucherId`, `voucherCode` and the review's `discount` (replacing `discount: 0`). Replays return before any of this.
- Tests (`place-order.db.test.ts` or a new `place-order-voucher.db.test.ts`): P1–P16 (P16: the voucher's value changed between the read and the update, through `afterStep("checks")`), the race tests with `Promise.all`, and a console spy showing no code in a log. Keep `guardTransactions` on.

### 5. The release
- `lib/orders/release.ts`: after the stock updates in `releaseExpiredOrders`, read the cancelled orders' `voucherId`s, count per voucher and run one `UPDATE "Voucher" SET "usedCount" = "usedCount" - n` per voucher in id order (no date condition). Put the SQL in `lib/orders/voucher-use.ts` as `giveBackVoucherUses(tx, orderIds)` so Admin cancellation (Sprint 8) can call it.
- Tests: R1–R8 in `release.db.test.ts` / `release-purchases.db.test.ts`, and P13 (placements racing against a release).

### 6. The review UI
- `components/checkout/voucher-box.tsx` (presentational): idle (label, input with `maxLength` 32, Apply), applied ("{CODE} applied", Remove), busy, and the message under the field with `aria-invalid` and `aria-describedby`; the message sits in an `aria-live="polite"` region (not `role="status"`).
- `components/checkout/review-view.tsx`: the box above the totals, the Discount row after Shipping when above 0, the box's props; the threshold note stays.
- `components/checkout/review-step.tsx`: `request(source, code?)` sends `draftPayload` with the typed code on Apply; on `applied` it writes the code to the draft (`checkoutDraftStore.getState().update`); on `refused` it keeps the text, shows the reason and, when the code came from the draft, clears it from the draft; Remove clears the draft's code and asks again; a failed Apply request keeps the phase and shows the message; Place order sends the code only from `review.voucher` when applied. Focus: Remove after an apply, the input after a Remove or a refusal.
- Component tests: O4–O7 and O6 through `renderToStaticMarkup` for the pure parts; the state transitions are covered by E2E.

### 7. Order page and email
- `lib/orders/view.ts` (`voucherCode: string | null`), `lib/orders/get-order.ts` (mapping), `lib/orders/copy.ts` (`discountLabel(code)` → "Discount (CODE)"), `components/orders/order-view.tsx`.
- `lib/email/copy.ts` + `lib/email/view.ts`: the label with the code; the row only above zero.
- Update the tests listed under Findings; add O1–O3.

### 8. E2E
- `e2e/vouchers.ts`: insert a test voucher and move its `endsAt`, through `withPool` from `e2e/stock.ts` (same production guard).
- `e2e/vouchers.spec.ts` (imports from `e2e/test.ts`, role-based locators): X1–X4. It uses a part no other spec uses with a price of at least ₱5,000.00 (check `place-order.spec.ts`, `checkout.spec.ts`, `cart-flags.spec.ts` for the parts they take), sets a known stock and restores it, and gives its order its own recipient (spec 036's cap).

### 9. Docs
- Spec 028 (a pointer on D14), spec 029 (code box, Discount row), spec 030 (summary line, digest list), spec 036 (T4 label, §8).
- `CLAUDE.md`: vouchers paragraph, placing-an-order bullet (digest, the conditional update, give-back), reset table lists. Not the fee paragraph.
- `docs/prd.md` Voucher row; README demo codes (`WELCOME10`, `SAVE500`, `BUILD5000`) and the Preview checklist line; `docs/setup/payments.md` (the ₱20.00 floor and the manual check result).
- Spec 037 status line set to implemented.

## Critical files

Modify: `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/seed/write.ts`, `test-support/db.ts`, `test-support/orders.ts`, `eslint.config.mjs`, `lib/payments/amount.ts`, `lib/checkout/{input,draft,copy,review,review-checkout,digest}.ts`, `lib/orders/{place-order,release,view,get-order,copy}.ts`, `lib/email/{copy,view}.ts`, `components/checkout/{review-view,review-step}.tsx`, `components/orders/order-view.tsx`, the tests listed under Findings, and the docs above.
Create: the migration, `lib/vouchers/*`, `lib/checkout/voucher.ts`, `lib/orders/voucher-use.ts`, `prisma/seed/data/vouchers.ts`, `prisma/seed/validate-vouchers.ts`, `components/checkout/voucher-box.tsx`, `e2e/vouchers.ts`, `e2e/vouchers.spec.ts`, and tests beside each.

## Verification

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` (U-series, digest, input, draft, components).
2. `pnpm test:db:up`, then `pnpm test:db` (D, V, P, R series and every existing DB test on the Docker Postgres), and `pnpm db:drift` after `db:deploy` on a scratch database.
3. `pnpm build` then `CI=1 pnpm test:e2e` (production build, as CI), plus `pnpm test:e2e` against dev (needs `.env.local` with `ORDERS_ENABLED="true"`, `ORDER_LINK_SECRET` and `PRODUCTION_DATABASE_HOST`, and the demo codes seeded: `pnpm db:seed`).
4. Manual in `pnpm dev`: apply `WELCOME10` on a build over ₱75,000.00 and see free shipping stay; apply `SAVE500` on a small cart and read the refusal; place an order and read "Discount (WELCOME10)" on the order page and in `/dev/emails`; let an order expire and see `usedCount` drop. One-time: open the `pnpm payments:check --keep` ₱19.99 session and note whether Cards is offered.
5. On the Preview URL: the acceptance criteria, an open review before the deploy getting "Your order changed" once, and the demo codes working.
