# Plan: spec 036 — order emails: placed, payment received, cancelled (#93)

Spec: [spec.md](spec.md). Checklist: [tasks.md](tasks.md). Example IDs (T, Q, S, V, X) are the spec's. Branch: `93-order-emails-placed-payment-received-cancelled` (#92 is merged to `main`).

## Context

Spec 035 (#92) shipped the outbox, the sender, the transports and signed `view` links, but `lib/email/templates.ts` is an empty registry, so no shopper has received an email. This story registers the three templates, enqueues them from the three writers inside their transactions, changes the order page's save-the-link prompt, and adds a fake-transport-only `/dev/emails` page. No schema change, no new environment variable.

## Findings that shape the plan

- `deliver()` in `lib/email/send.ts` already reads the order with items, mints the `view` link (`mintViewLink` + `orderLinkUrl`), calls `template({ order, siteUrl, viewUrl })` synchronously inside a try/catch (→ `render-error`), and sends with key `{orderId}:{type}`. It needs three small changes: await the template, pass `now`, pass the store's settings for pickup orders.
- `enqueueEmail(tx, orderId, type)` (`lib/email/outbox.ts`) and `scheduleEmailSend(id)` (`lib/email/schedule.ts`) exist and are ready.
- Reusable pure pieces, all shared with the order page: `orderEntries` (`lib/orders/view.ts`), `addressLines` / `shippingValue` (`lib/checkout/copy.ts`), `groupName` (`lib/cart/copy.ts`), `SLOT_COPY`, `formatPeso`, `payByText` / `dateTimeText` / `isPastDue` (`lib/orders/time.ts`), `paidLine` / `methodName` (`lib/payments/copy.ts`), `statusLabel` (`lib/orders/timeline.ts`), `ORDER_COPY.pickupNote`.
- `releaseExpiredOrders` runs in three transactions (purchase, sweep, cron); `afterRelease` / `finishRelease` already run only after a commit, so they are the one place to schedule sends. `reconcileSession`'s `apply` returns `{ outcome, toClose }` and `reconcile()` runs after-commit work; `placeOrder` already has a post-commit block for `revalidateTag`.
- **Existing tests that will break and need updating:** `e2e/signed-link.spec.ts` (X4) enqueues `ORDER_PLACED` and expects `failed` / `no-template`; switch it to `COD_CONFIRM` (still unregistered). Grep for `no-template` and for tests that read the real registry (`lib/email/send.db.test.ts` O8, `outbox.db.test.ts`). Placement, reconcile and release DB tests that count outbox or `FakeEmail` rows need the new rows accounted for.
- `server-only` is **not installed and not used anywhere** in the repo (only named in a comment and the ESLint block). It must be added, plus a Vitest alias in both configs.
- `@react-email/*` is not installed.

## Risks to settle first (step 1 is a spike)

1. **React Email under Next 16.4's server layer.** `@react-email/render` uses `react-dom/server`, whose `react-server` export condition throws. The sender is reached from server components (`sweepAfterResponse` in pages) and actions. If a build or run fails, list the packages in `serverExternalPackages` in `next.config.ts` (so they load as plain Node), or as a last resort render in a dedicated route handler. Prove it in `pnpm dev` **and** in `pnpm build && pnpm start` (CI's E2E uses the production build) before writing templates.
2. **Plain-text word wrap.** The default wraps at 80 columns and could split a signed URL (T11). Turn wrapping off in the plain-text options and assert it.
3. **React 19.3 compatibility** of the chosen React Email version. Pick the exact packages in the spike.

## Steps (one commit each, in this order; subject-only messages)

### 0. Housekeeping
Commit `docs/specs/036-order-emails/{spec,plan,tasks}.md`.

### 1. Dependencies, `server-only`, render spike
- `pnpm add @react-email/components server-only` (exact packages confirmed in the spike; `render` with `plainText` and wrap off).
- `vitest.config.ts` and `vitest.db.config.ts`: alias `server-only` to an empty stub in `test-support/` (`resolve.alias`).
- Throwaway check, not committed: render a trivial component from `sendPending` through a page's `after()` in dev and in the production build. Fix with `serverExternalPackages` if needed (commit that config).
- Gate: lint, typecheck and `pnpm test` green with the alias.

### 2. Copy and the pure view-model (`lib/email/`)
- `copy.ts`: `EMAIL_COPY` with `subjectPrefix` "[Demo] ", `testNote` (the issue's sentence, **not** `STEP_COPY.bannerText`), footer, subjects, leads, link note, pay-block and status lines, and the cancelled reason map keyed by `cancelReason` (`EXPIRED` → "it wasn't paid in time"). Spec §5 is the source of every string.
- `view.ts`: `emailView(type, { order, store, now })` → plain data: entries via `orderEntries`, totals with a discount row only above 0, delivery address lines or pickup store and note, `payBlock` yes/no from status and `isPastDue`, status line, amount = `order.total`, `paidLine`. Throws for `PAYMENT_RECEIVED` with no `paidAt` (T12 → `render-error`) and for a pickup order with no settings.
- Unit tests: T1–T6 data side, grouping (T3), discount (T4), past-due / Paid / Cancelled pay block (T5), T8.

### 3. Templates and the sender's three changes
- `lib/email/templates/{layout,order-placed,payment-received,order-cancelled}.tsx`: React Email components over the view-model, text wordmark header, no images, hostile text escaped; each module starts with `import "server-only"`. Register the three in `lib/email/templates.ts`; leave `COD_CONFIRM` out.
- `EmailTemplate` may return a promise; `EmailContext` gains `now` and `store: { address, hours } | null`. In `send.ts` `deliver()`: read `StoreSettings` only for pickup orders and `await template(...)` inside the existing try/catch.
- Each template returns `{ subject, html, text }`, with HTML and plain text rendered from one tree.
- Tests (content assertions, per D12): T1–T12 on HTML and text: order number, items, totals, links (the signed link verifies; the cancelled email has none), the test-mode sentence, no `<img` / `<script`, escaping, no link broken across lines. **Snapshot only the plain-text versions** (placed × delivery/pickup, received, cancelled).

### 4. Triggers (enqueue in the transaction, schedule after the commit)
- `lib/orders/place-order.ts`: after the `OrderItem` insert, `enqueueEmail(tx, order.id, "ORDER_PLACED")`; add an `"email"` step name to `PlaceStep` for the rollback test (Q3); after the commit, for a non-replay, `scheduleEmailSend(id)` next to `revalidateTag`.
- `lib/payments/reconcile.ts`: in `apply`, right after the order is set Paid (outcome `paid` only), enqueue `PAYMENT_RECEIVED`; return `emailId` alongside `toClose`; schedule after the transaction in `reconcile()`. No enqueue on late, second, mismatch, duplicate, already-applied, expired or active.
- `lib/orders/release.ts`: in `releaseExpiredOrders`, enqueue `ORDER_CANCELLED` for each released order; `ReleaseResult` gains the enqueued ids; `afterRelease` schedules each (it already runs only after a commit, and with `release === null` after a rollback). The cron and the sweep already call `sendPending` after releasing; the claim's `SKIP LOCKED` prevents a double send.
- DB tests: Q1–Q14 (placement, replay, rollback; every webhook outcome including Q6–Q9; sweep twice; locked or problem orders; release-then-paid; purchase rollback; cron) and S1–S6 (real templates through `sendPending`, links open the order via `findOrderByCredential`, console spy, `guardTransactions`, cap). Fix the existing tests listed under Findings.

### 5. Order page prompt
- `lib/orders/copy.ts`: `saveLink` → "Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works."
- Update `components/orders/order-view.test.tsx` (V1: prompt by `?key=`, none by signed link).

### 6. `/dev/emails`
- Add `"dev"` to `RESERVED_SLUGS` (`lib/reserved-slugs.ts`; `reserved-slugs.test.ts` checks `app/`).
- `lib/email/dev-emails.ts`: pure `devEmailsEnabled(transport, vercelEnv)`; `listFakeEmails()` returns the newest 50 `FakeEmail` rows (`server-only`).
- `app/dev/emails/page.tsx`: guard first (`notFound()` before any read), `connection()`, `robots: noindex`, no `loading.tsx`, not in the sitemap, not linked. Empty state "No emails yet."
- `components/email/dev-email-list.tsx`: per email To / From / Subject / Manila time; HTML in `<iframe srcDoc sandbox="allow-popups allow-popups-to-escape-sandbox">` with `<base target="_blank">` injected into the frame's document; the text version with URLs linkified.
- Tests: the guard as a pure function and a route test with mocked env (V5); the list component via `renderToStaticMarkup` (V2–V4, V6, V8: exact `sandbox` attribute, no `allow-scripts` / `allow-same-origin`).

### 7. E2E
- `e2e/orders.ts`: `fakeEmailsFor(email)` and a link extractor (reads `FakeEmail`).
- New `e2e/order-emails.spec.ts` (imports `test` / `expect` from `e2e/test.ts`, role-based locators): X1 place → "Order placed" in the outbox → Pay now link opens the order with no save-the-link prompt; X2 pay on the fake page → "Payment received" → the link shows Paid; X3 `setExpiresAt` + sweep → cancelled email and cancelled order text; X4 `/dev/emails` lists them, and V7: clicking Pay now inside the frame opens a new tab (popup) on the order page while the dev tab stays put.
- Update `e2e/signed-link.spec.ts` X4 to `COD_CONFIRM`.

### 8. Docs
- Spec 035: pointers "Changed by spec 036" where the registry is described as empty and where the prompt text changes; spec 030 prompt text.
- `CLAUDE.md`: the email paragraph (templates registered, triggers, `server-only`, `/dev/emails`, the `dev` reserved slug) and the placing-an-order paragraph's mention of the prompt.
- `docs/setup/domain.md`: first real send checklist (place an order on Production, check the three emails) and "confirm Vercel Preview protection is on" (Q2).

## Critical files

Modify: `lib/email/send.ts`, `lib/email/templates.ts`, `lib/orders/place-order.ts`, `lib/payments/reconcile.ts`, `lib/orders/release.ts`, `lib/orders/copy.ts`, `lib/reserved-slugs.ts`, `vitest.config.ts`, `vitest.db.config.ts`, `package.json`, `next.config.ts` (only if the spike needs it), `e2e/orders.ts`, `e2e/signed-link.spec.ts`, `components/orders/order-view.test.tsx`, and the docs above.
Create: `lib/email/{copy,view,dev-emails}.ts`, `lib/email/templates/*.tsx`, `app/dev/emails/page.tsx`, `components/email/dev-email-list.tsx`, `test-support/server-only-stub.ts`, `e2e/order-emails.spec.ts`, and tests beside each.

## Verification

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit: T-series, view-model, dev-page guard and list).
2. `pnpm test:db:up`, then `pnpm test:db` (Q and S series, plus every existing DB test, on the Docker Postgres).
3. `pnpm build` then `CI=1 pnpm test:e2e` (production build, as CI), plus `pnpm test:e2e` against dev (needs `ORDER_LINK_SECRET` and `PRODUCTION_DATABASE_HOST` in `.env.local`, and `ORDERS_ENABLED="true"`).
4. Manual in `pnpm dev`: place an order, open `/dev/emails`, click Pay now (new tab, the order opens signed in), pay on the fake page, see the second email; set `EMAIL_TRANSPORT=resend` locally with a dummy key and confirm `/dev/emails` is a 404.
5. On the Preview URL: the acceptance criteria, the three emails in `/dev/emails`, and Vercel Preview protection confirmed on. Production's first real Resend send is the manual check in `domain.md`.
