# 036 — Order emails: placed, payment received, cancelled

Status: approved with changes (2026-11-03; see the change list at the end of §10). Issue: [#93](https://github.com/romulojr-dev/pc-ecommerce/issues/93) (parent epic [#4](https://github.com/romulojr-dev/pc-ecommerce/issues/4), Checkout). PRD: FR-21 (order confirmation, payment received, order cancelled), FR-27 (test-mode notes). Depends on [#92](https://github.com/romulojr-dev/pc-ecommerce/issues/92) / [spec 035](../035-email-foundation-signed-links/spec.md) / [ADR 0011](../../adr/0011-signed-order-links-beside-the-access-token.md) (outbox, sender, signed `view` links, `FakeEmail`). Builds on [spec 030](../030-place-an-order/spec.md) (`placeOrder`, the order page and its save-the-link prompt), [spec 032](../032-payment-webhooks/spec.md) (`reconcileSession`, the one function that sets Paid) and [spec 033](../033-release-unpaid-orders/spec.md) (`releaseExpiredOrders`, the sweep and the cron). Siblings: [#94](https://github.com/romulojr-dev/pc-ecommerce/issues/94) (vouchers) and [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95) (COD and its confirmation email).

Long form: the story touches three writers, a renderer, an order-page string and a dev page.

## 1. Summary

Spec 035 built the outbox and the sender but registered no template, so no shopper has received an email yet. This story registers the three: **Order placed** (when `placeOrder` commits), **Payment received** (only when `reconcileSession` makes the order Paid) and **Order cancelled** (when the release cancels an unpaid order). Each is a React Email template with a plain-text twin and the test-mode note, built from the order row at send time, and each is enqueued inside the transaction that causes it, so a replay, a retry or a second run can never send a second one. It also adds the `/dev/emails` page (fake transport only) to read them, and changes the order page's save-the-link prompt to say an email is on its way.

## 2. Behavior

### Order placed (system → shopper)

1. **Enqueue.** `placeOrder` enqueues `ORDER_PLACED` for the new order **in its transaction**, after the order and its items are written. It is not enqueued for a replay (the same key and token from the same cart return the existing order and write nothing). A placement that refuses or rolls back leaves no row. After the commit it asks for the send (`scheduleEmailSend`), as spec 035 Behavior 2.
2. **Content.** Built when it is sent, from the order row:
   - Subject ("[Demo] Order {number} placed") and a greeting with the contact name; "We received your order {number}."
   - **Items** from the order's snapshots, grouped as the cart and the order page group them (`orderEntries`): single lines as lines, a build as a "Custom PC build" group whose parts show their slot, each with name, unit price × quantity and line total.
   - **Totals**: subtotal, shipping (the order page's wording for a rate, free or pickup), discount only when above 0, total.
   - **Where it goes**: a delivery order shows the address lines as the order page does; a pickup order shows the store's **current** address and hours (as the order page does, spec 030 D5) and the pickup note.
   - **Pay block**, only when the order can still be paid when the email is built (Pending payment and `now` before `expiresAt`): "Pay by {Manila time}" and a **Pay now** button. Otherwise no pay block, and a one-line status ("Status: Paid" / "Status: Cancelled").
   - **A link to the order** (text link), the test-mode note, a footer.
   - Pay now and the order link are the **same signed `view` link** (D1), minted when the email is built, good for 90 days.
3. **The shopper.** Lands on the order page signed in by the link: no save-the-link prompt (spec 035 D8), Pay now / Retry work through it.

### Payment received

4. **Enqueue.** `reconcileSession` enqueues `PAYMENT_RECEIVED` in the transaction in which the order **becomes Paid** (outcome `paid`), and only then. Not enqueued for: a late payment (order Cancelled or Refunded), a second payment (order already Paid or later), an amount mismatch (the order stays Pending payment, `AMOUNT_MISMATCH`), an event already recorded (`duplicate`), a session already applied (`already-applied`), an expired or active session, or any gateway failure. The webhook, the fake payment page, the status poll and the release's own check all reach this one function, so one path covers all.
5. **Content.** "We received your payment for order {number}.", the **amount** (the order's total: `paid` requires the session, payment, row and order total to be equal), "Paid on {Manila time} with {method}." (`paidLine`; an unknown method is left out), a link to the order (signed `view` link), the test-mode note, the footer. It does not vary by fulfillment.

### Order cancelled

6. **Enqueue.** `releaseExpiredOrders` enqueues `ORDER_CANCELLED` for **each order it cancels**, in the same transaction, whichever caller runs it (a purchase's transaction, the sweep, the cron). An order the release skips (locked, not due, a payment with a problem, a payment that turned out Paid) gets none. After the commit, the caller asks for the send of each (a purchase that rolls back rolls its rows back with it and schedules nothing).
7. **Content.** "Your order {number} was cancelled because it wasn't paid in time. You haven't been charged.", the order number, a link to **the shop's home page** (no order link), the test-mode note, the footer. The reason line comes from the order's `cancelReason`; today only `EXPIRED` exists ("it wasn't paid in time"). "Not confirmed in time" arrives with COD (#95). It does not vary by fulfillment.

### Every email

8. **Test-mode note**, in the HTML and the text version: "This is a demo store in test mode. No real money was charged and nothing will ship."
9. **Times** use the fixed Asia/Manila formatter (`lib/orders/time.ts`); **prices** use `formatPeso`. Every URL is absolute, built from `NEXT_PUBLIC_SITE_URL`.
10. **Plain text** carries the same facts and the same links as bare URLs. No remote images, no tracking, no scripts: the header is a text wordmark.
11. **Send-time truth.** A template reads the order as it is when the email is sent, so a late send is still consistent (a placed email sent after the order was paid has no pay block). A render failure ends the row `failed` / `render-error`, final, as spec 035; it never touches the order.
12. **No second email.** A webhook replay, a placement retry, a second release run or a second `reconcileSession` enqueue nothing, because `(orderId, type)` is unique and each enqueue is `ON CONFLICT DO NOTHING` (spec 035 Behavior 1). A failed or skipped send changes nothing else (spec 035 Behavior 7).

### The order page

13. The **save-the-link prompt** (shown when the page is opened by its `?key=` link) changes from "…until order emails arrive." to say an email with a link is also coming (§5, Q1). Still hidden on a page opened by a signed link.

### `/dev/emails` (dev tool, not part of the shop)

14. A page listing the **newest 50 `FakeEmail` rows**, newest first. Per email: to, from, subject, time (Manila), the **HTML version shown in an isolated frame** (`sandbox="allow-popups allow-popups-to-escape-sandbox"`: no scripts, no same-origin; its links are clickable and open in a new tab) and the **text version** with its URLs as links.
15. **Available only when `EMAIL_TRANSPORT=fake` and `VERCEL_ENV` is not `production`**: otherwise it is a plain 404 (the route exists but answers not found, with no read of the table). Per request, `noindex`, no `loading.tsx` (so the 404 keeps its status), not linked from anywhere, not in the sitemap. `dev` is added to `RESERVED_SLUGS`.

### Empty, loading and error states

| State | Where | What shows |
| --- | --- | --- |
| Email not sent yet, failed, skipped (cap) | Nobody sees it | Nothing; the order page and the order work as before |
| Order page opened by `?key=` | Order page | The new prompt (§5); the order shows as before |
| No emails recorded | `/dev/emails` | "No emails yet." |
| Not `fake` transport, or Production | `/dev/emails` | The shop's 404 |
| Database error | `/dev/emails` | The framework's error page (a dev tool; no custom state) |

## 3. Examples

Orders as in spec 034/035. **P1**: order **PCS-7KQ2M9XD**, contact Ana Santos `ana@example.com`, delivery to 12 Mabini St, Alicia, Quezon City, Metro Manila 1100; AMD Ryzen 5 7600 × 2 at ₱11,495.00 (subtotal ₱22,990.00), shipping ₱120.00, total **₱23,110.00**; placed 2026-11-01T07:00:00Z (Sun 1 Nov 2026, 3:00 PM), `expiresAt` 2026-11-02T07:00:00Z. **P2**: order **PCS-4TN8V2HC**, pickup, one build: AMD Ryzen 5 7600 (₱11,495.00), ASUS ROG Strix B650-A Gaming WiFi (₱14,995.00), ASUS Dual GeForce RTX 4060 OC Edition 8GB (₱17,995.00); group total and order total **₱44,485.00**, no shipping fee. Tests fix the secret, the site URL and the clock, so a signed link is reproducible.

### Templates (unit, content assertions; the plain-text versions are snapshotted)

| # | Input | Expected |
| --- | --- | --- |
| T1 | P1, `ORDER_PLACED`, built at 2026-11-01T07:00:30Z | Subject "[Demo] Order PCS-7KQ2M9XD placed"; "Hi Ana Santos,"; one line "AMD Ryzen 5 7600 · ₱11,495.00 × 2 · ₱22,990.00"; Subtotal ₱22,990.00, Shipping ₱120.00, Total ₱23,110.00; the address lines; "Pay by Mon 2 Nov 2026, 3:00 PM"; a **Pay now** button and an order link, both `…/orders/PCS-7KQ2M9XD?sig=…&exp=…&p=view` with `exp` = 2027-01-30T07:00:30Z; the test-mode note; no Discount row |
| T2 | P2, `ORDER_PLACED` | One "Custom PC build" group listing the three parts with their slot names and prices, group ₱44,485.00; **no address**; "Pick up at" with the store's current address and hours, then the pickup note; no shipping fee wording of a rate; Total ₱44,485.00 |
| T3 | P1 with a second build and a single part (two groups) | Groups numbered "Custom PC build 1" / "Custom PC build 2", the single line in cart order |
| T4 | P1 with `discount` 50,000 | A Discount row "−₱500.00" and the total as stored |
| T5 | P1, `ORDER_PLACED` built at `expiresAt` (a placed email sent late) / with status PAID / CANCELLED | No pay block and no Pay now button; "Status: Cancelled" / "Status: Paid"; the order link stays |
| T6 | P1 contact name `<b>Ana</b> & Co`, a street with `"` and `&` | Escaped in the HTML; unescaped, not tag-like, in the text |
| T7 | P1, `PAYMENT_RECEIVED`, `paidAt` 2026-11-01T07:05:00Z, method `GCASH` | Subject "[Demo] Payment received for order PCS-7KQ2M9XD"; "Amount paid: ₱23,110.00"; "Paid on Sun 1 Nov 2026, 3:05 PM with GCash."; the signed order link; the test-mode note |
| T8 | T7 with method `FAKE` / `null` / `"WIRE"` | "…with the test payment page." / "Paid on …." / "Paid on …." |
| T9 | P1, `ORDER_CANCELLED`, cancelReason `EXPIRED` | Subject "[Demo] Order PCS-7KQ2M9XD was cancelled"; "Your order PCS-7KQ2M9XD was cancelled because it wasn't paid in time. You haven't been charged."; one link, to the site root (`NEXT_PUBLIC_SITE_URL`), and **no** `/orders/` link or `sig` anywhere; the test-mode note |
| T10 | T1, T7, T9 for P2 | Same facts as P1 for T7 and T9 (no fulfillment variation); T1 as T2. The **plain-text** version of each email, for each fulfillment (placed ×2, received, cancelled), matches a stored snapshot; the HTML is **not** snapshotted, only asserted on |
| T11 | Every template | Assertions on the content, not the markup: the text version contains the order number, the total or reason, every link as a bare URL and the exact test-mode sentence; the HTML contains the same sentence; neither contains `<img`, `<script` or `style="background-image`; no link in the text is broken across lines (the plain-text renderer's word wrap must not split a signed URL) |
| T12 | `PAYMENT_RECEIVED` for an order whose `paidAt` is null | Render error → `failed` / `render-error`, final (a bug, not a state) |

### Enqueue at each trigger (integration, Docker Postgres, fake transport and gateway)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| Q1 | A cart with P1's items | `placeOrder` | One `ORDER_PLACED` row for the new order, `PENDING`, `recipientHash` of `ana@example.com`; order, items, movements and the row commit together |
| Q2 | Q1 placed | `placeOrder` again with the same key and token | `replay`; still one row |
| Q3 | Q1 with a step after the order insert forced to fail (`afterStep`) | `placeOrder` | `error`; no order, no outbox row |
| Q4 | A Pending order with an active session | A completed `payment_session` webhook | Order Paid; one `PAYMENT_RECEIVED` row |
| Q5 | Q4 | The same webhook again; then `reconcileSession` with no event; then the status poll | Still one row (`duplicate` / `already-applied`) |
| Q6 | A Pending order | A completed session whose payment amount differs | Payment `AMOUNT_MISMATCH`, order Pending, **no** row |
| Q7 | A Cancelled order with a session that completes | The webhook | Late payment, `refundRequired`, **no** `PAYMENT_RECEIVED` row (its `ORDER_CANCELLED` row is untouched) |
| Q8 | A Paid order | A second completed session | `SECOND_PAYMENT`, **no** new row |
| Q9 | A Pending order, session expired | An expired event | No row |
| Q10 | A due order with no payment | `sweepExpiredOrders`; again | Order Cancelled; one `ORDER_CANCELLED` row; the second run changes nothing |
| Q11 | Two due orders, one with a payment that has a `problem` | Sweep | The first cancelled with a row; the other untouched, no row |
| Q12 | A due order whose session is already completed at the gateway | Sweep (reconcile inside the check) | Order Paid, one `PAYMENT_RECEIVED` row, **no** `ORDER_CANCELLED` row |
| Q13 | A due order holding a product a shopper is buying | `addToCart` / `placeOrder` (the purchase's release) commits | The cancelled order has its row; if the purchase rolls back (thrown refusal), the order is still Pending and there is no row |
| Q14 | Q10 through the cron | `runReleaseCron` | The row is created and sent in the same run (`SENT`, one `FakeEmail`) |

### End to end through the sender (integration, real templates)

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| S1 | Q1 | `sendPending` | Row `SENT`; one `FakeEmail` to `ana@example.com`, subject "[Demo] Order PCS-7KQ2M9XD placed"; the link in its HTML verifies and opens the order (`findOrderByCredential`) |
| S2 | S1, then Q4 | `sendPending` | A second `FakeEmail`, "[Demo] Payment received…"; its link opens the order |
| S3 | Q10 | `sendPending` | "[Demo] Order … was cancelled"; no order link in it |
| S4 | Order placed with the transport failing once | `sendPending` ×2 at +5 min | `FAILED` then `SENT` with the same content; one `FakeEmail` |
| S5 | Any of S1–S3 | A console spy on every method | No address, link, signature, token, subject or body in any line; only the spec 035 fields |
| S6 | One shopper, three paid orders in a day (6 emails) | `sendPending` | The sixth is `SKIPPED` (cap, spec 035); the orders are untouched |

### Order page and `/dev/emails`

| # | Given | Action | Expected |
| --- | --- | --- | --- |
| V1 | P1 | Order page by `?key=` | The new prompt (§5) and the copy button; by a signed link: no prompt |
| V2 | Three fake emails | Open `/dev/emails` (fake transport) | Three entries newest first; each shows to, subject, time in Manila, a sandboxed frame with its HTML and its text with links |
| V3 | 60 fake emails | Open it | Exactly the newest 50 |
| V4 | None | Open it | "No emails yet." |
| V5 | `EMAIL_TRANSPORT=resend`; and `fake` with `VERCEL_ENV=production` | Open it | 404; the table is not read |
| V6 | An email whose HTML contains a script tag (a stored fixture) | Open it | The script does not run: the frame's sandbox lacks `allow-scripts` |
| V7 | The placed email for P1 in the list | Click its **Pay now** link inside the frame | The order page opens in a **new tab** (`allow-popups`), signed in by the link (no save-the-link prompt); the `/dev/emails` tab stays where it was and is not replaced |
| V8 | The frame's attributes | Inspect | `sandbox` is exactly `allow-popups allow-popups-to-escape-sandbox`: no `allow-scripts`, no `allow-same-origin`, no `allow-top-navigation`; a link click cannot navigate the dev page itself |

### E2E (Playwright, fake transport and gateway)

| # | Flow | Expected |
| --- | --- | --- |
| X1 | Place an order | The fake outbox has "Order placed" for the order; its Pay now link opens the order page (no save-the-link prompt) |
| X2 | From X1, pay on the fake payment page | A "Payment received" email arrives with the amount; its link opens the order, showing Paid |
| X3 | Move another order's deadline back (`setExpiresAt`) and trigger the sweep | An "Order … was cancelled" email arrives; the order page shows the cancelled text |
| X4 | Open `/dev/emails` | The three emails are listed; a link in one is clickable and opens the order in a new tab |

### Acceptance criteria → examples

| Issue criterion | Where covered |
| --- | --- |
| Order placed: contents, enqueued in `placeOrder`'s transaction, Pay now (signed `view` link) and order link | Behavior 1–3; T1–T5, Q1–Q3, S1, X1 |
| Payment received: only when Paid; never late, second or mismatch | Behavior 4–5; T7, T8, Q4–Q9, Q12, S2, X2 |
| Order cancelled: reason, shop link, enqueued in `releaseExpiredOrders` | Behavior 6–7; T9, Q10–Q14, S3, X3 |
| React Email templates, each with plain text | Behavior 10; T1–T11, D3 |
| Test-mode note in every email | Behavior 8; T1, T7, T9, T11 |
| Manila time and `formatPeso` | Behavior 9; T1, T7 |
| No second email on a replay, retry or second run | Behavior 12; Q2, Q5, Q10, S4 |
| Save-the-link prompt says the link was emailed | Behavior 13; V1, §5, Q1 |
| `/dev/emails`: fake only, never in Production | Behavior 14–15; V2–V8, X4 |
| No shopper detail, link or body in any log | Behavior 12; S5 |
| Tasks: spec, templates with plain text and tests per email and per fulfillment (changed: content assertions plus plain-text snapshots, D12), DB tests incl. not-Paid outcomes, E2E | §7; T10, T11, Q6–Q9, X1–X4 |

## 4. Rules and edge cases

**Enqueue**

- An enqueue is one more insert in a transaction that exists anyway. If it throws, Postgres aborts that transaction and the whole action fails as it would for any database error (a placement answers `error`, nothing ordered). It never makes a network call and is never a caught error (spec 035 Behavior 1).
- The three triggers enqueue **inside** their transactions and schedule the send **after** the commit. A trigger that returns "already there" (null) schedules nothing.
- `ORDER_PLACED` is enqueued only when the order is new; a replay of Place order never enqueues. `PAYMENT_RECEIVED` is enqueued only for outcome `paid`, the one outcome that sets `Order.status = PAID`. `ORDER_CANCELLED` is enqueued only for orders the release actually cancelled in that transaction (a row it lost to `SKIP LOCKED` or a webhook is not one).
- The release has several callers. The purchase's release enqueues inside the purchase's transaction, so a thrown refusal that rolls the purchase back also removes the cancellation and its email row. The send is scheduled only after a commit (`finishRelease(pending, true)`).
- Orders cancelled before this story shipped (no row) get no email later; nothing backfills.
- `after()` called inside a sweep that is itself inside `after()` may not schedule; the sweep and the cron already call `sendPending` straight after releasing, and the claim's `SKIP LOCKED` keeps two senders from sending a row twice.

**Order of events and drift**

- Emails are independent rows and may arrive in any order (the fake gateway pays within a second of placing, so "Payment received" can be sent before "Order placed"). Each is correct as of the moment it was built.
- Whether the pay block shows is decided at build time from the order's status and `expiresAt` (`isPastDue`), not at enqueue time.
- A provider outage longer than 24 hours ends the row `too-old` (spec 035 D6): a late "Order placed" is never sent.
- A shopper who places three orders and pays all three in 24 hours gets 6 emails; spec 035's cap of 5 skips the last. Accepted: the cap is an abuse guard, and no email is needed to use an order.

**Content**

- Product names, the contact name and address text are untrusted: the renderer escapes them in HTML (T6).
- Items come from the `OrderItem` snapshots, never from the live catalog, so a renamed or retired product reads as it was ordered.
- Amounts are integers in centavos and formatted only with `formatPeso`; the Payment received amount is the order's total.
- The Order placed email for a pickup order shows the store's **current** address and hours (settings read at send time); if the settings row is missing, the send fails `render-error` rather than printing an empty address.
- Link text is the same in HTML and text. The signed link's lifetime (90 days from the build) is stated in the placed and payment emails: "Keep this email. The link opens your order for 90 days."
- Every subject starts with "[Demo] " (`EMAIL_COPY.subjectPrefix`), then the order number. No subject names the product list, address or contact.

**`/dev/emails`**

- The guard is `EMAIL_TRANSPORT === "fake"` and `VERCEL_ENV !== "production"`; env validation already refuses `fake` in Production, so the second check only guards against a misconfiguration slipping through.
- The page shows demo data only, but its emails carry **bearer links** to real rows in the database it reads. On a Preview deployment that is the dev/preview database, so Vercel's Preview protection is what keeps the page private (Q2).
- It reads at most 50 rows with no filter, no pagination, no delete. The table grows with every test email; `db:seed --reset` empties it (spec 035).
- The frame uses `srcdoc` with `sandbox="allow-popups allow-popups-to-escape-sandbox"`: scripts, same-origin access and top-level navigation stay blocked, while a link may open a new tab (`allow-popups`; the escape flag lets that tab behave as an ordinary page, so the order page's own scripts work there). The page adds a `<base target="_blank">` to the frame's document when it builds it; the stored email is not changed.

## 5. Messages and copy

All shopper-facing strings this story adds. Constants go in one module so the tests read them (`EMAIL_COPY`).

| Where | Text |
| --- | --- |
| Test-mode note (all) | This is a demo store in test mode. No real money was charged and nothing will ship. |
| Footer (all) | You received this email because an order was placed with this address at PC Silicon. |
| Placed, subject | [Demo] Order {number} placed |
| Placed, greeting / lead | Hi {contactName}, / We received your order {number}. |
| Placed, pay block | Pay by {Manila time}. Unpaid orders are cancelled at that time. · button **Pay now** |
| Placed, status (no pay block) | Status: {Paid / Cancelled / …} (`statusLabel`) |
| Placed, order link | View your order |
| Placed, sections | Items · Subtotal · Shipping · Discount · Total · Delivery address · Pick up at (+ the order page's pickup note) |
| Link note (placed, received) | Keep this email. The link opens your order for 90 days. |
| Received, subject | [Demo] Payment received for order {number} |
| Received, lead | We received your payment for order {number}. |
| Received, lines | Amount paid: {₱…} · Paid on {Manila time} with {method}. · link **View your order** |
| Cancelled, subject | [Demo] Order {number} was cancelled |
| Cancelled, lead | Your order {number} was cancelled because it wasn't paid in time. You haven't been charged. |
| Cancelled, link | Still want these parts? Visit PC Silicon |
| Order page, save-the-link prompt (was "Save this link: it's the only way to see your order until order emails arrive.") | Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works. (Q1) |
| `/dev/emails` | Heading "Test emails" · "Demo data. These are the emails the fake transport recorded." · empty "No emails yet." · per email "To", "From", "Subject", "HTML", "Text" |

Existing strings reused as they are: `paidLine`, `payByText` (the date part), `statusLabel`, `groupName`, `SLOT_COPY`, `ORDER_COPY.pickupNote`, `addressLines`, `shippingValue`. The email's test-mode sentence is **not** `STEP_COPY.bannerText` (D4).

## 6. Data and interfaces

**No schema change, no new environment variable.** `EmailOutbox` and `FakeEmail` are spec 035's.

- **Templates.** The registry in `lib/email/templates.ts` gets `ORDER_PLACED`, `PAYMENT_RECEIVED`, `ORDER_CANCELLED`; `COD_CONFIRM` stays unregistered until #95 (still `no-template`). A template **may return a promise** (React Email renders asynchronously), and the sender waits for it; a rejection is `render-error`, as a throw is today. The email's HTML and text come from one component tree each (HTML render, plain-text render), so they cannot disagree.
- **`EmailContext`** gains what the three need beyond the order and the link: the **current time** (the pay-block decision, the link's clock) and, for pickup orders, the **store's address and hours**. The sender reads the settings only when the order is a pickup. `EmailOrder` already includes the items.
- **Pure view-model.** A function turns `(order, store, now)` into plain data (entries via `orderEntries`, totals, address lines, pay block yes/no, texts), shared by the HTML and text renders and tested without React.
- **Enqueue call sites.** `placeOrder` (after its `OrderItem` insert), `reconcileSession`'s `apply` (outcome `paid`), `releaseExpiredOrders` (per cancelled order). Each reports the enqueued row ids to its caller: `placeOrder` schedules after the commit; `reconcileSession` schedules after its transaction; `releaseExpiredOrders` returns them on its result so `afterRelease` schedules each once the transaction committed (a purchase that rolled back schedules none). `placeOrder`'s test seam `afterStep` gets one more step name for the enqueue (Q3).
- **Order page.** `ORDER_COPY.saveLink` changes; nothing else on the page or its loader.
- **`/dev/emails`**: a server page under `app/` (top-level segment `dev`; `dev` joins `RESERVED_SLUGS`), reading `FakeEmail` newest first, limit 50; the render of one email is a small component taking `{to, from, subject, html, text, createdAt}`. No API route.
- **Server only.** Every module that renders or builds an email (`lib/email/templates*`, the view-model, `EMAIL_COPY`, the React Email components, the `/dev/emails` reader) starts with `import "server-only"`, so React Email and its renderer can never enter the client bundle; a client component importing one fails the build. Tests need a stub for that import (the plan finds how the project's Vitest configs handle it). The email modules are not imported from `lib/builder/**` or `lib/specs/**`.
- **Dependencies**: React Email's component and render packages (the PRD's stack row "Resend + React Email"). The plan checks they work with React 19.3 and Next 16.4 and picks the exact packages; not hand-edited in `node_modules`.
- **E2E helpers** (`e2e/orders.ts`): read an order's fake emails by recipient address, extract the first link; `enqueueEmailFor` stays for the foundation's own spec.
- **Docs**: this spec; spec 035 gets a pointer where it says the registry is empty and where it says the prompt's text changes in #93 ("Changed by spec 036"); CLAUDE.md's email paragraph (templates now registered, triggers, `/dev/emails`, the `dev` reserved slug); `docs/setup/domain.md` (first real send: place an order on Production and check the three emails); spec 030's saved-link prompt text.

## 7. Test plan

| Level | What |
| --- | --- |
| Unit (pure) | The view-model (T1–T6 data side, grouping, discount row, past-due pay block); `EMAIL_COPY` strings; **content assertions** on the rendered HTML for each email and each fulfillment (order number, items, totals, links, the test-mode sentence; T1–T11), and **snapshots of the plain-text versions only** (T10); escaping (T6); method names (T8); `/dev/emails`'s guard as a pure function of the transport and `VERCEL_ENV` |
| Integration (`*.db.test.ts`, Docker Postgres, fake transport and gateway) | Q1–Q14 (every trigger, including the not-Paid outcomes Q6–Q9 and the second-run cases), S1–S6 (real templates through `sendPending`, links verified, console spy, `guardTransactions` on every send), V5 via a route test that mocks the environment, V2–V4 and V6 as component tests of the page's list |
| E2E | X1–X4 against the fake transport and gateway; X2 and X3 use the existing helpers (`stock.ts`, `orders.ts`) and need `ORDER_LINK_SECRET` locally |
| Not tested with Resend | The `resend` transport is covered by spec 035's stubbed-`fetch` tests; the first real email is the manual check in `domain.md` |

Definition of done also needs: acceptance criteria checked on the Preview URL (the emails appear in `/dev/emails`), **Vercel's Preview protection confirmed on** for the project (Q2), desktop widths, lint and type check green, and the docs in §6 updated.

## 8. Out of scope

- The COD confirmation email, the `cod-confirm` page and "not confirmed in time": [#95](https://github.com/romulojr-dev/pc-ecommerce/issues/95).
- Shipped and delivered emails; refund emails (a late or second payment today only sets `refundRequired`): Sprint 9.
- Voucher lines in the email: the Discount row already appears when `discount` is above 0, so [#94](https://github.com/romulojr-dev/pc-ecommerce/issues/94) needs no email change.
- Auth emails (verification, password reset): [#65](https://github.com/romulojr-dev/pc-ecommerce/issues/65). Abandoned-cart email: not in the MVP (PRD).
- Product images, a logo image, tracking pixels, unsubscribe links, locale or dark-mode variants.
- Resending an email by hand, an outbox admin view, bounce handling, an outbox for the shop owner: Sprint 9 and later.
- Backfilling emails for orders placed before this ships.
- Restricting `/dev/emails` beyond the transport check (Q2).
- Rate limiting of the order page and actions: [#64](https://github.com/romulojr-dev/pc-ecommerce/issues/64).

## 9. Decisions

| # | Decision | Reason | Rejected |
| --- | --- | --- | --- |
| D1 | **Pay now** and **View your order** in the placed email are the **same signed `view` link**, to the order page, where the existing Pay now button starts the payment | A link in an email is a `GET`; mail scanners and link previews open links, and a `GET` must not create a payment session. The page already starts payments through its action (spec 031/034) | A `GET /pay` link that creates and redirects to a session; a deep link with a fragment that auto-clicks |
| D2 | The pay block and Pay now button show only when the order is still payable when the email is built; otherwise the email states the status | The email is built at send time and may be late (a retry, the fake gateway paying within a second); a Pay now button on a Paid or cancelled order would mislead | Building from the state at enqueue time (a stale snapshot); skipping the email when the order moved on (Q3) |
| D3 | Templates are React Email components rendered to HTML and, separately, to plain text, over one pure view-model | The PRD's stack names React Email; one view-model keeps the two versions in agreement and is testable without React. Spec 035 D14 deferred this here | Hand-written HTML strings; one render with the text derived by stripping tags |
| D4 | The email's test-mode sentence is the issue's ("This is a demo store in test mode. No real money was charged and nothing will ship.") and lives in `EMAIL_COPY`, not `STEP_COPY.bannerText` ("This is a demo store: no real payment is taken and no order is shipped.") | The issue gives the text verbatim and the email reads after payment ("was charged"), the banner before it. Two wordings, each in its place | Reusing the banner text (not what the issue asks); changing the banner |
| D5 | `PAYMENT_RECEIVED` states the **order's total** as the amount | `paid` is reached only when the session, payment, payment row and order total are equal, so they are the same number; no `Payment` read is needed | Reading the Payment row's `receivedAmount` (same value, one more query and a dependency on the payments schema) |
| D6 | `ORDER_CANCELLED` links to the home page and has no order link | The issue asks for the shop link; a cancelled order has nothing to do, and no signed link needs to be minted | An order link (a 90-day bearer link to a dead order) |
| D7 | The release hands its enqueued ids back on its result and `afterRelease` schedules them; the purchase schedules only after its commit | The release runs inside three different transactions (purchase, sweep, cron); this keeps one rule: enqueue in the transaction, schedule after the commit | Having `releaseExpiredOrders` call `after()` itself (it would fire before the commit and for a transaction that rolls back) |
| D8 | `/dev/emails` is a plain top-level `dev` route with a `FakeEmail` reader and a sandboxed frame | The issue asks for a page of recent fake emails with clickable links; a sandbox keeps a stored email from running anything. It is a dev tool beyond the PRD's scope, kept tiny, and the PRD wins on scope | A Storybook or the `react-email` preview server (not on Vercel, not the real outbox); an API route |
| D9 | The 90-day link lifetime is told to the shopper in the placed and payment emails | The lifetime is real (spec 035) and a shopper looking for the email later should know the link can lapse; the `?key=` link has no expiry | Saying nothing |
| D10 | The email's items come from the order snapshots and totals from the order columns; no recalculation | The email must match the order page and what the shopper agreed to; recomputation could drift | Recomputing from the catalog |
| D11 | A placement whose enqueue fails fails as a whole (`error`) | Postgres aborts a transaction after any error, so the order cannot survive it; the enqueue is one insert that fails only when the transaction would anyway | Enqueueing after the commit (an order could exist with no email and no row to retry) |
| D12 | **Test style (review):** tests assert on content (order number, items, totals, links, the test-mode sentence) and only the plain-text versions are snapshotted; this replaces the issue's "markup snapshot tests" | A snapshot of React Email's HTML breaks on every library update or whitespace change and nobody reads the diff; content assertions fail only when something a shopper reads changes. Plain text is short and stable enough to review | Full-HTML snapshots per email and fulfillment (the issue's wording) |
| D13 | **Subject prefix (review):** every subject starts with "[Demo] ", and the placed subject reads "placed" (my first draft said "received") | Makes test mode obvious in the inbox before the body is opened | No prefix; the note in the body only |
| D14 | **`server-only` (review):** all email modules import it | React Email and the renderer are server-only; an accidental client import becomes a build error | Relying on nothing importing them |


## 10. Open questions

None open. The review of 2026-11-03 settled the three questions of the first draft:

1. **Q1.** The save-the-link prompt uses the proposed wording (§5): "Save this link to see your order. We're also emailing you a link to it; if it doesn't arrive, this one still works."
2. **Q2.** No extra gate on `/dev/emails`. The definition of done includes **confirming that Vercel's Preview protection is on** for the project (the page lists emails whose links open orders in the preview database).
3. **Q3.** A placed email built after the order moved on is sent without the pay block and with a status line (D2; T5).

### Changes made by the review

- Test style: content assertions, plain-text snapshots only (§3 Templates heading, T10, T11, mapping row, §7, D12).
- `server-only` on every email module (§6 Server only, D14).
- Subjects start with "[Demo] " and the placed subject reads "placed" (§2.1, T1, T7, T9, S1–S3, §4 Content, §5, D13).
- `/dev/emails` frame: `allow-popups allow-popups-to-escape-sandbox`, scripts still blocked; examples V7 and V8 added (Behavior 14, V6–V8, §4, X4).
- Q1–Q3 settled; the Preview-protection check added to the definition of done (§7).
