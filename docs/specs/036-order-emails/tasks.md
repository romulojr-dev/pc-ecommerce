# Tasks: spec 036 — order emails: placed, payment received, cancelled (#93)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per step, subject line only.

## 0. Housekeeping
- [ ] Commit spec.md, plan.md and tasks.md on `93-order-emails-placed-payment-received-cancelled`

## 1. Dependencies, `server-only`, render spike
- [x] `pnpm add react-email server-only` (changed from `@react-email/components`, which npm marks as no longer supported; `react-email` 6 exports the components, `render` and `toPlainText`, and accepts React 19)
- [x] Alias `server-only` to an empty stub (`test-support/server-only-stub.ts`) in `vitest.config.ts` and `vitest.db.config.ts`
- [x] Spike: render a trivial component in a server component and in `after()`, in `pnpm dev` **and** in `pnpm build && pnpm start`: works in both
- [x] The spike passed, so `serverExternalPackages` is not needed (no `next.config.ts` change)
- [x] Plain-text render keeps a long signed URL on one line (`toPlainText` defaults to `wordwrap: false`); step 3 asserts it
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (typecheck and the dev server need `EMAIL_TRANSPORT` and `ORDER_LINK_SECRET` in the environment, i.e. in `.env.local`, as spec 035 requires)

## 2. Copy and the pure view-model
- [x] `lib/email/copy.ts` (`EMAIL_COPY`: "[Demo] " prefix, test-mode sentence, footer, subjects, leads, link note, pay block and status lines, cancelled reason map)
- [x] `lib/email/view.ts` (`emailView` for the three types; throws on `PAYMENT_RECEIVED` without `paidAt` and on a pickup order without settings)
- [x] Unit tests: T1–T6 data side, T3 (two groups), T4 (discount row), T5 (past-due, Paid, Cancelled: no pay block), T8 (method names), T12 (`view.test.ts`)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. Templates and the sender's changes
- [x] `lib/email/templates/layout.tsx` and `render.tsx` (one tree, HTML and plain text; the plain text is tidied) (text wordmark, test-mode note, footer; `import "server-only"`)
- [x] `order-placed.tsx` (items by build, totals, address or store and hours, pay block, Pay now and order link, link note)
- [x] `payment-received.tsx` (amount, `paidLine`, order link)
- [x] `order-cancelled.tsx` (reason line, shop link only)
- [x] Register the three in `lib/email/templates.ts`; `COD_CONFIRM` stays unregistered
- [x] `EmailTemplate` may return a promise; `EmailContext` gains `now` and `store`; `deliver()` in `send.ts` reads `StoreSettings` for pickup orders only and awaits the template inside the existing try/catch
- [x] Content assertions for T1–T11 on HTML and text (order number, items, totals, links, test-mode sentence, no `<img` / `<script`, escaping, no broken link in text)
- [x] Plain-text snapshots only: placed × delivery and pickup, received, cancelled (T10)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 4. Triggers
- [ ] `placeOrder`: enqueue `ORDER_PLACED` after the items insert; `"email"` step name in `PlaceStep`; schedule after the commit for a non-replay (Q1–Q3)
- [ ] `reconcileSession`: enqueue `PAYMENT_RECEIVED` only on outcome `paid`; return `emailId`; schedule after the transaction (Q4–Q9, Q12)
- [ ] `releaseExpiredOrders`: enqueue `ORDER_CANCELLED` per released order; `ReleaseResult` carries the ids; `afterRelease` schedules each after a commit (Q10, Q11, Q13, Q14)
- [ ] DB tests S1–S6 with real templates, `guardTransactions` and the console spy
- [ ] Update existing tests that counted outbox or `FakeEmail` rows or expected `no-template` for `ORDER_PLACED` (`send.db.test.ts` O8, `outbox.db.test.ts`, placement, reconcile and release DB tests)
- [ ] `pnpm test:db` passes (Docker Postgres)

## 5. Order page prompt
- [ ] `ORDER_COPY.saveLink` set to the approved wording
- [ ] `order-view.test.tsx`: V1 (prompt by `?key=`, none by signed link)

## 6. `/dev/emails`
- [ ] `"dev"` added to `RESERVED_SLUGS`; `reserved-slugs.test.ts` passes
- [ ] `lib/email/dev-emails.ts`: `devEmailsEnabled(transport, vercelEnv)` and `listFakeEmails()` (newest 50, `server-only`)
- [ ] `app/dev/emails/page.tsx`: guard before any read, `connection()`, `noindex`, no `loading.tsx`, empty state
- [ ] `components/email/dev-email-list.tsx`: sandboxed frame (`allow-popups allow-popups-to-escape-sandbox`), `<base target="_blank">`, text with links
- [ ] Tests: guard (V5), list markup (V2–V4, V6, V8)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 7. E2E
- [ ] `e2e/orders.ts`: `fakeEmailsFor(email)` and a link extractor
- [ ] `e2e/order-emails.spec.ts`: X1, X2, X3, X4 and V7 (popup from the frame)
- [ ] `e2e/signed-link.spec.ts` X4 switched to `COD_CONFIRM`
- [ ] `pnpm test:e2e` passes against dev; `pnpm build` + `CI=1 pnpm test:e2e` passes against the production build

## 8. Docs
- [ ] Spec 035 and spec 030 pointers ("Changed by spec 036")
- [ ] `CLAUDE.md` email and placing-an-order paragraphs
- [ ] `docs/setup/domain.md`: first real send checklist and the Preview protection check
- [ ] Spec 036 status line set to implemented

## Definition of done
- [ ] Acceptance criteria checked on the Preview URL (the three emails in `/dev/emails`)
- [ ] Vercel Preview protection confirmed on for the project (Q2)
- [ ] Desktop widths; empty, loading and error states handled
- [ ] Lint and type check pass; tests at the right level
- [ ] PR opened from the template (`Closes #93`)
