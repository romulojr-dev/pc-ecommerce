# Tasks: spec 035 — email foundation and signed order links (#92)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per step.

## 0. Housekeeping
- [ ] Commit spec.md, plan.md, tasks.md and the `docs/prd.md` Order row on `docs/sprint-7-prd`
- [ ] Branch the implementation from it

## 1. Env and pure primitives
- [ ] `lib/email/env-schema.ts` and its wiring in `lib/env.ts` (E1–E6)
- [ ] `.env.example`, CI env, `vitest.db.config.ts` env, Playwright env if needed
- [ ] `lib/email/recipient.ts` (R1, R2, R2a, R2b)
- [ ] `lib/orders/signed-link.ts` (L1–L8)
- [ ] `lib/orders/credential.ts` (L9)
- [ ] `lib/email/due.ts` with constants (R3, R4, timeout-vs-lease guard)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema and migration
- [ ] `EmailType`, `EmailStatus`, `EmailOutbox`, `FakeEmail` in `prisma/schema.prisma`
- [ ] Migration with the CHECKs (attempts, SENT fields, SENDING `claimedAt`, 64-hex hash)
- [ ] Add both tables to `resetCatalog()` (`prisma/seed/write.ts`) and `test-support/db.ts`; update `reset-catalog.db.test.ts`
- [ ] `lib/email/schema.db.test.ts` (O15, O16)
- [ ] `pnpm db:migrate`, `pnpm db:drift` pass

## 3. Outbox and sender
- [ ] `enqueueEmail` (O1, O2)
- [ ] Transports: Resend (stubbed-`fetch` unit test for request and error mapping), fake, `transport()`
- [ ] Template registry with `no-template` (O8)
- [ ] `sendPending` / `sendEmail`: claim, send, settle (O3–O7, O9–O11, O13)
- [ ] 24-hour window with a visible final status and one log line (O12, O12a, O12b)
- [ ] Per-recipient cap with advisory lock (C1–C9, C7a, C7b, C7c)
- [ ] `logEmailEvent` and the no-leak console spy (O14)
- [ ] `scheduleEmailSend` (`after()`, no-op outside a request)
- [ ] `sweepAfterResponse` and the cron also send due rows; update their tests
- [ ] `pnpm test:db` passes

## 4. Credential refactor
- [ ] `findOrderByCredential` and `getOrderForPage` take a credential (K1, K3, K4, K9, K10)
- [ ] Order page reads the link; save-the-link prompt hidden for a link
- [ ] Status route and poller: `X-Order-Link` (K2)
- [ ] `startPaymentAction`, `PaymentPanel`, `CheckoutFlow` pass the credential
- [ ] `startPayment`, `sessionRequest`, `returnUrl`: fresh signed return links for a link credential (K6, K7)
- [ ] Fake gateway, fake page, its actions and `FakePayButtons` accept the credential (K8)
- [ ] Existing token-path tests pass unchanged (K5)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. E2E
- [ ] `e2e/orders.ts`: `mintViewLink`, `enqueueEmail`, `readOutbox`
- [ ] `e2e/signed-link.spec.ts`: X1, X2, X3, X4
- [ ] `pnpm build` then `pnpm test:e2e` pass

## 6. Docs
- [ ] ADR 0011
- [ ] "Changed by spec 035" notes in specs 030, 031 and ADR 0009
- [ ] CLAUDE.md paragraph
- [ ] `docs/setup/domain.md` secrets checklist
- [ ] Spec status set to implemented

## Definition of done (from the issue)
- [ ] Acceptance criteria checked on the preview URL
- [ ] Desktop (1024 px and up); empty, loading and error states handled
- [ ] Lint and type check pass
- [ ] Spec, README and ADRs updated
- [ ] Merged to main and deployed
