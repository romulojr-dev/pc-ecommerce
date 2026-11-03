# Plan: spec 035 — email foundation and signed order links (#92)

Spec: [spec.md](spec.md). Checklist: [tasks.md](tasks.md). Example IDs (L, R, O, C, K, E, X) are the spec's.

## Context

Sprint 7 needs order emails (#93), vouchers (#94) and COD (#95). All of them need (a) an outbox that is written in the trigger's transaction and sent after the commit, with a per-recipient cap, and (b) a way back to an order from an email without the stored-hash access token: a signed link. This story sends no real email yet; it ships the machinery, the credential refactor and the tests.

The spec and the PRD `Order` row edit sit uncommitted on `docs/sprint-7-prd` (step 0). No PR exists for the story yet.

## Steps (one commit each, in this order)

### 0. Housekeeping
Commit the edited `docs/specs/035-…/spec.md`, `plan.md`, `tasks.md` and `docs/prd.md` (Order row) on `docs/sprint-7-prd`, so they ride with the Sprint 7 PRD PR. Branch the implementation from there.

### 1. Env and pure primitives (no database)
- `lib/email/env-schema.ts` (pure, like `lib/payments/env-schema.ts`): `EMAIL_TRANSPORT` enum (required), `RESEND_API_KEY`, `EMAIL_FROM` (default `PC Silicon <orders@mail.pcsilicon.tech>`, address check), `ORDER_LINK_SECRET` (at least 32 UTF-8 bytes); `emailEnvIssues(values)` for the cross-variable rules (fake refused when `VERCEL_ENV=production`; resend needs the key). Wire into `lib/env.ts` (server schema and `createFinalSchema`). Tests E1–E6.
- `.env.example`, `.github/workflows/ci.yml` job env (`EMAIL_TRANSPORT: fake`, `ORDER_LINK_SECRET`), `vitest.db.config.ts` env (pin `fake` and a test secret), and the Playwright web-server env if it lists variables.
- `lib/email/recipient.ts`: `recipientHash(address)`: trim, `toLowerCase`, drop `+tag` from the local part (keep it if that would empty it), SHA-256 hex. Tests R1–R2b.
- `lib/orders/signed-link.ts`: `signOrderLink`, `verifyOrderLink`, `linkShape`, `newViewLink`, `orderLinkPath` / `orderLinkUrl`. HMAC over `{number}\n{purpose}\n{exp}`, `timingSafeEqual`, secret read through `env`. Reuse `orderNumberShape` (`lib/orders/number.ts`) and the canonical base64url check in `lib/orders/secrets.ts` (export a `linkSigShape` built on it). Tests L1–L8.
- `lib/orders/credential.ts`: `OrderCredential`, `credentialFromParams`, `credentialFromHeaders`, `credentialQuery`. Tests L9.
- `lib/email/due.ts` (pure): `emailDueDecision(row, now)`, `capDecision(count)` and the constants `EMAIL_CAP`, `CAP_WINDOW_MS`, `LEASE_MS`, `RETRY_AFTER_MS`, `MAX_ATTEMPTS`, `SEND_WINDOW_MS`. The unit test also asserts the transport timeout stays under half the lease (as `attempt.ts` does for 60 s). Tests R3, R4.

### 2. Schema and migration
- `prisma/schema.prisma` and a new migration folder (`2026110…_email_outbox`): enums `EmailType` (all four) and `EmailStatus`; models `EmailOutbox` (unique `(orderId,type)`, index `(recipientHash,sentAt)`, index `(status,claimedAt)`, `orderId` Restrict) and `FakeEmail`.
- Migration-only CHECKs per spec §6: `attempts >= 0`; `sentAt` and `providerMessageId` present exactly when SENT; `claimedAt` present when SENDING; 64-hex `recipientHash`.
- Add both tables to the `TRUNCATE` lists in `prisma/seed/write.ts` (`resetCatalog`) and `test-support/db.ts`; update `reset-catalog.db.test.ts`.
- `lib/email/schema.db.test.ts` covers CHECKs, `Restrict` and reset (O15, O16). Run `pnpm db:drift`.

### 3. Outbox and sender (`lib/email/`)
- `outbox.ts`: `enqueueEmail(tx, orderId, type)` reads the order's `guestEmail` in `tx`, then `INSERT … ON CONFLICT DO NOTHING RETURNING id` (raw, no conflict target, no P2002 catch, like `upsertBuildSnapshot`).
- `transport.ts`, `resend.ts`, `fake.ts`: the `EmailTransport` interface; Resend via `fetch` with a 6 s timeout, `Idempotency-Key` header and coded failures only (modelled on `lib/payments/xendit.ts`); the fake writes `FakeEmail` and dedupes by key; `transport()` picks from `env.EMAIL_TRANSPORT`.
- `templates.ts`: empty registry plus a test hook; an unregistered type fails final as `no-template`.
- `send.ts`: `sendPending({ limit, now, transport, render })` and `sendEmail(id)`.
  - **Claim** transaction: `FOR UPDATE SKIP LOCKED` raw select of due rows, `pg_advisory_xact_lock` on the recipient hash, cap count excluding the row itself, then move to SENDING, SKIPPED or (past 24 h) FAILED `too-old`.
  - **Send** with no transaction open.
  - **Settle** transaction, conditional on `claimedAt`. Never throws (catch and `logSafeFailure`).
- `log.ts`: `logEmailEvent` (event, outbox id, type, code only; modelled on `logReleaseEvent`).
- `schedule.ts`: `scheduleEmailSend(id)` wraps `after()` and is a no-op outside a request.
- Retries: `sweepAfterResponse` in `lib/orders/release.ts` also runs `sendPending({ limit: 10 })` (own try/catch); `lib/orders/release-cron.ts` runs `sendPending` in batches of 25 after the release loop, within the remaining budget. Update the existing sweep and cron tests.
- Tests O1–O14, O12a, O12b, C1–C9, C7a–C7c in `lib/email/*.db.test.ts`, using `guardTransactions` from `test-support/release.ts` and a console-spy helper.

### 4. Credential refactor (the token path's existing tests must pass unchanged, K5)
- `lib/orders/get-order.ts`: `findOrderByKey` becomes `findOrderByCredential(number, credential)`; `getOrderForPage` takes a credential (`loadOrder` stays cached). Shape check, then null with no query; otherwise one read and either the token hash compare or `verifyOrderLink`, with the dummy value for a missing order.
- `app/(store)/orders/[number]/page.tsx`: read `key` or `sig`/`exp`/`p`; hide the save-the-link prompt for a link credential (flag on `OrderView` / `CopyLink`).
- `app/api/orders/[number]/status/route.ts`: `credentialFromHeaders` (`X-Order-Key` or the new `X-Order-Link`, constant `ORDER_LINK_HEADER` in `lib/orders/link.ts`); `lib/payments/status-poller.ts` sends whichever credential the page URL has.
- `app/(store)/orders/[number]/actions.ts` `startPaymentAction` takes the credential; `components/orders/payment-panel.tsx` and `components/checkout/checkout-flow.tsx` read it from `window.location` or the checkout's token.
- `lib/payments/start-payment.ts`: `startPayment(orderId, credential)`. `lib/payments/session-request.ts`: the context carries the credential; `returnUrl(siteUrl, number, credential, payment)` builds `?key=` as today, or a freshly signed `view` link (`newViewLink`) for a link credential (D5). `placeOrderAction` passes the token credential.
- Fake gateway: `lib/payments/fake.ts` `createSession` reads the credential query from `successUrl`; the page URL becomes `/test-payment/{id}?{credentialQuery}`. `lib/payments/fake-page.ts` (`openFakePage`, `chooseOnFakePage`), `app/(store)/test-payment/[id]/{page,actions}` and `components/payments/fake-pay-buttons.tsx` forward the credential; `orderHref` uses `credentialQuery`.
- Tests K1–K10 extend `get-order.db.test.ts`, `route.db.test.ts`, `actions.db.test.ts`, `start-payment.db.test.ts`, `fake-page.db.test.ts` and `session-request.test.ts`, plus a zero-query test for malformed links.

### 5. E2E
`e2e/orders.ts` gets `mintViewLink(orderNumber)` (HMAC with `ORDER_LINK_SECRET` through the shared signer) and `enqueueEmail` / `readOutbox` helpers on `withPool`. `e2e/signed-link.spec.ts` covers X1–X4, with its own part and stock handling like `place-order.spec.ts`.

### 6. Docs
ADR `docs/adr/0011-signed-order-links-beside-the-access-token.md`; "Changed by spec 035" notes in specs 030 and 031 and ADR 0009; a CLAUDE.md paragraph (outbox, send path, cap, signed links, credential, environment, `FakeEmail` reset); `docs/setup/domain.md` secrets checklist; spec status set to implemented.

## Reuse
`logSafeFailure` and the log style (`lib/orders/log.ts`), `secretMatches` (`lib/secrets/compare.ts`), `tokenShape` and the canonical base64url check (`lib/orders/secrets.ts`), `orderNumberShape`, `absoluteUrl` (`lib/seo/urls.ts`), `sweepAfterResponse` and the cron batching (`lib/orders/release*.ts`), `guardTransactions` (`test-support/release.ts`), `orderData` (`test-support/orders.ts`), `withPool` (`e2e/stock.ts`), the env-schema pattern of `lib/payments/env-schema.ts`, and the conditional-update / `ON CONFLICT` idioms of `lib/build-snapshot.ts` and `lib/payments/attempt.ts`.

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, then `pnpm test:db:up` and `pnpm test:db` (all `*.db.test.ts`; the existing order and payment suites are the token-path regression), and `pnpm db:drift`.
- `pnpm build`, then `pnpm test:e2e` (X1–X4 plus the existing order, payment and release specs).
- Manual with `pnpm dev` and `EMAIL_TRANSPORT=fake`: place an order, mint a link with the E2E helper, open it, Pay now → fake page → Paid; tamper with `sig` → 404.
- Acceptance criteria are checked against the spec's mapping table on the preview URL. Preview needs `ORDER_LINK_SECRET` and `EMAIL_TRANSPORT=fake`; Production needs the real values from `docs/setup/domain.md` before #93 ships.
