# 043 — Order transitions with Shipped, Ready and Delivered emails

Status: approved 2026-11-06 with three changes (the CHECK keys on `shippedAt`, Demo sees the tracking number masked to its last four, `completedAt`) and the five open questions settled; see D2, D6, D11–D14. Issue: [#108](https://github.com/romulojr-dev/pc-ecommerce/issues/108) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8; part 1 of 2, cancel is #109). PRD: AD-6 (status transitions, courier + tracking number), FR-20 (status timeline), FR-21 (transactional emails), FR-25 (cash is paid when delivered or picked up), AD-10 and AD-11 (audit, roles). Depends on [spec 041](../041-admin-orders-list-detail/spec.md) (#106, merged: the detail page this story adds buttons to) and [spec 040](../040-admin-permissions-audit-masking/spec.md) (#105, merged: `adminAction`, `recordAudit`, `can()`). Builds on [spec 035](../035-email-foundation-signed-links/spec.md) and [036](../036-order-emails/spec.md) (outbox, `emailView`, signed `view` link), [038](../038-cash-on-delivery/spec.md) (cash orders and their `paidAt` rule), [030](../030-place-an-order/spec.md) (the shopper's order page and timeline).

## 1. Summary

Staff can move a paid or confirmed order through fulfillment: Processing, then Shipped (with courier and tracking number) or Ready for pickup, then Delivered or Picked up. Each move is one conditional update on the status the staff member saw, written with its audit entry and its email in one transaction, so a lost race changes nothing and an email never exists for a move that did not happen. The customer is emailed when the order ships, is ready for pickup or is delivered, and the order page's timeline shows the new steps with their times, courier and tracking number. A cash order is recorded as paid when it is delivered or picked up, in the same statement. Cancel (#109) and refunds (#110) are separate stories.

## 2. Behavior

### Who can move what

1. **The table** (pure, `lib/orders/transitions.ts`) gives the statuses staff may move an order to, from its status, fulfillment and payment option:

   | From | Fulfillment | Staff may move to |
   | --- | --- | --- |
   | `PAID` (online) or `COD_CONFIRMED` (cash) | either | `PROCESSING` |
   | `PROCESSING` | delivery | `SHIPPED` |
   | `PROCESSING` | pickup | `READY_FOR_PICKUP` |
   | `READY_FOR_PICKUP` | pickup | `PICKED_UP` |
   | `SHIPPED` | delivery | `DELIVERED` |
   | `PENDING_PAYMENT`, `PENDING_CONFIRMATION` | either | nothing here (cancel only, #109) |
   | `DELIVERED`, `PICKED_UP`, `CANCELLED`, `REFUNDED` | either | nothing here (refunds are #110) |

   Cancel from `PAID`, `COD_CONFIRMED`, `PROCESSING` and `READY_FOR_PICKUP` belongs to #109 and is not in this table; `SHIPPED` has no cancel at all. Staff can never move an order **to** `PAID`, `COD_CONFIRMED`, `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `CANCELLED` or `REFUNDED` with this table; those are set only by the payment, confirm, release (and, later, cancel and refund) code. A combination that cannot exist (a `PAID` cash order, a `SHIPPED` pickup order) has no moves.
2. **No undo.** There is no move back. A mistaken Shipped, Delivered or Picked up stays; the screen says so before it is confirmed (B5, B6). There is also no way to edit courier or tracking number afterwards: both are emailed to the customer and stay as entered ("Correct tracking details" is backlog issue [#134](https://github.com/romulojr-dev/pc-ecommerce/issues/134), D11).
3. **Roles.** Owner and Staff may move orders (`orders.transition`, already in spec 040's table); Demo sees every control disabled with "This account is read-only" and sends nothing. The action is built with `adminAction`, so a Demo or foreign-origin request is refused before the database is read and is not audited.

### On the admin order page (`/admin/orders/[number]`)

4. A **Fulfillment** section sits under the status at the top of the detail. It shows the current status and, for a role that may move orders, **one button per allowed next status** (there is never more than one): "Start processing", "Mark as shipped", "Mark as ready for pickup", "Mark as delivered", "Mark as picked up". With no allowed move it says why in one line (B13) and shows no button.
5. **Start processing**, **Mark as ready for pickup**, **Mark as delivered** and **Mark as picked up** open a confirmation ("Mark order PCS-… as {status}?") that lists what will happen: the new status, "This can't be undone.", whether the customer is emailed ("An email goes to the customer." for Ready for pickup and Delivered; "No email is sent for this step." for Processing and Picked up) and, for a cash order's Delivered or Picked up, "₱{total} will be recorded as paid in cash." Confirm sends the move; Cancel closes it.
6. **Mark as shipped** is a two-step dialog. Step 1 has two required fields, **Courier** (free text with an HTML `datalist` of suggestions: J&T Express, LBC, Ninja Van, Flash Express, 2GO) and **Tracking number**. They are checked in the browser and again on the server with one shared schema (R5); empty or invalid input shows a message under the field and sends nothing. Step 2 is the confirmation: the courier and the tracking number are shown **prominently** (large, on their own lines) with "Both are emailed to the customer and can't be changed." and "This can't be undone.", then **Back** (returns to the fields with the values kept) and **Confirm**. Nothing is sent until Confirm.
7. While the request runs, the confirm button is busy ("Updating…") and both buttons are disabled; the dialog cannot be closed by double-clicking Confirm into a second request.
8. **On success** the dialog closes, the page shows the new status, the new time and (for Shipped) the courier and tracking number, and an `aria-live` line says what happened. A move that sends an email says so in the same sentence pair: "Marked as shipped. The customer will get an email shortly.", "Marked as ready for pickup. The customer will get an email shortly.", "Marked as delivered. The customer will get an email shortly." A move that sends none has no email line: "Marked as processing.", "Marked as picked up." Focus moves to the Fulfillment heading.
9. **If the order changed meanwhile** (the status in the database is no longer the one the screen showed), nothing is written and the dialog shows "This order was changed by someone else. Reload to see its current status." with a **Reload** button that re-reads the page. The same message appears when the same person double-submits.
10. **Other failures** show "Couldn't update the order. Try again." in the dialog (no detail of the failure) and change nothing. A request the table refuses (a stale tab, a hand-made request) shows "That change isn't allowed for this order." An order number that no longer exists is the page's usual 404 on reload, and the action says "This order wasn't found."
11. The detail's **timeline of events** (the section spec 041 added for the customer-facing dates) gains Processing, Shipped, Ready for pickup and Delivered / Picked up times (the last is `completedAt`, labeled from the order's fulfillment: Delivered for delivery, Picked up for pickup), and the courier and tracking number once shipped. **Demo sees the courier name in full and the tracking number masked to its last four ("•••• 4821")**; Owner and Staff see both in full. The emails list (spec 041) shows the three new email types with the existing labels and statuses.
12. The admin **orders list** and its status filter already carry every status; nothing changes there except that orders now actually reach Processing and later. The **packing slip** prints "ready to pack" for Processing only (spec 041 B19), so the first button here is what makes a slip printable without the "Do not ship" banner. A slip for an order that has shipped (it prints with the "Do not ship" banner) now also shows the courier and the tracking number, the tracking number masked to the last four for Demo, as on the detail.
13. **Reasons for no button**, one line each, by status: Pending payment / Pending confirmation: "Waiting for the customer. Cancel is the only change available."; Delivered: "Delivered. Nothing more to do here."; Picked up: "Picked up. Nothing more to do here."; Cancelled: "Cancelled."; Refunded: "Refunded."; Shipped: "Shipped. Mark it as delivered when the courier reports delivery." (Cancel buttons arrive with #109; until then these lines still hold.)

### What the system does on a move

14. **One statement.** The action reads the order's status, fulfillment and payment option, checks the table, then runs one `UPDATE … WHERE id = … AND status = {expected status}` that sets the new status, the step's timestamp (and `courier` / `trackingNumber` for Shipped) and, for a cash order's Delivered or Picked up, `paidAt`. If it changes no row the move is stale (B9). In the same transaction, and only when the update changed a row: the audit entry (`recordAudit`) and the email outbox row (`enqueueEmail`). After the commit: `scheduleEmailSend`. The transaction holds database work only.
15. **Emails by move:**

   | Move | Email |
   | --- | --- |
   | Paid / COD confirmed → Processing | none |
   | Processing → Shipped | `ORDER_SHIPPED` |
   | Processing → Ready for pickup | `READY_FOR_PICKUP` |
   | Shipped → Delivered | `ORDER_DELIVERED` |
   | Ready for pickup → Picked up | none (the customer is at the counter) |

16. **A cash order is recorded as paid in the same statement** that marks it Delivered or Picked up: `paidAt` is set to the move's time. No `Payment` row is created and the order never enters Paid. This is what makes the order count as a sale on the Customers screen (spec 042). An online order's `paidAt` is never touched by a move.
17. **Emails are sent after the commit** by the existing sender (spec 035). A failed or skipped send never changes the order, and a move whose email could not be queued does not happen (the whole transaction rolls back and staff see B10).
18. **The three new emails** are built by `emailView` from the order as it is when sent, with a freshly signed `view` link, the "[Demo] " subject prefix and the test-mode sentence (spec 036):
    - **Shipped** ("Order PCS-… has shipped"): lead says the order is on its way; details give courier, tracking number and the ship time; the items and the delivery address as in "Order placed"; for a cash order one line says the amount to have ready (spec 038's wording).
    - **Ready for pickup** ("Order PCS-… is ready for pickup"): lead says it is ready; details give the ready time; the store's **current** address and hours (read at send time, like spec 036's pickup block); the items; for a cash order the amount to pay at pickup.
    - **Delivered** ("Order PCS-… was delivered"): lead says it was delivered; details give the delivery time and the courier and tracking number; the items.
    - The Shipped email carries the courier and tracking number in full (the customer is the recipient; masking is for Demo's screens only).
    - All three carry "View your order" (the signed `view` link). If the order is Cancelled or Refunded when the email is built, a status line says so after the lead (the facts in the lead stay true, the order is no longer going ahead); no other later status adds a line.
19. **The per-recipient cap never skips these three types, but they still count toward it** (R9). Only the *skip* is exempt: a sent or sending Shipped, Delivered or Ready email is one of the recipient's emails in the 24-hour count, so an order placed afterwards from the same address can be skipped by the cap, as today.

### On the customer's order page (`/orders/[number]`)

20. The timeline already lists every status. The steps from Processing on now carry a time when they have one: "Started {time}", "Shipped {time}", "Ready {time}", "Delivered {time}" or "Picked up {time}" (Asia/Manila, `lib/orders/time.ts`). The Shipped step also shows "Courier: {courier}" and "Tracking number: {number}" as plain, selectable text. A step with no stored time (an order that reached the status before this story, or a fixture) shows no time and is not an error. The current step is the order's status as before. The Delivered / Picked up time is `completedAt`, labeled from the order's fulfillment (the timeline already has one terminal step per fulfillment).
21. A signed `view` link and the access-token link show the same thing. The courier and tracking number appear to anyone who can open the order, which is the customer. Nothing else about the move is shown (no staff name).

### Empty, loading and error states

22. **Loading:** the detail page has no `loading.tsx` (spec 041) so unknown numbers keep their 404; the action's pending state is B7. **Error:** B9 and B10. **Empty:** an order with no moves shows B13.

## 3. Examples

Fixtures are throwaway orders from `e2e/admin-order-fixtures.ts` (shared with specs 041 and 042) and `test-support/`. Parts come from the seed: `CPU-AMD-7600X` (Ryzen 5 7600X, ₱ price as seeded), `GPU-NVIDIA-4060` style parts as the fixtures already use. Customers: Ana Reyes (`ana.reyes@example.com`), Ben Cruz (`ben.cruz@example.com`). Each order has its own recipient unless stated (spec 036's cap note).

| # | Input | Result |
| --- | --- | --- |
| E1 | The table over every status × fulfillment × payment option (11 × 2 × 2 = 44 combinations) | exactly the moves in B1; every other combination has none; no target is ever `PAID`, `COD_CONFIRMED`, `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `CANCELLED` or `REFUNDED` |
| E2 | `PAID` online delivery order, Staff clicks "Start processing", confirms | status `PROCESSING`, `processingAt` set, audit row `order` / `status-changed` (before `PAID`, after `PROCESSING`, actor = Staff), no email row; the slip no longer prints "Do not ship" |
| E3 | `COD_CONFIRMED` cash delivery order → Processing | same as E2; `paidAt` stays null, no `Payment` row |
| E4 | `PROCESSING` delivery order, "Mark as shipped" with courier "LBC" and tracking "123456789012" | status `SHIPPED`, `shippedAt`, courier and tracking stored, one `ORDER_SHIPPED` outbox row; after the send a `FakeEmail` whose subject is "[Demo] Order PCS-… has shipped" and whose body has "LBC" and "123456789012" |
| E5 | Same, courier left empty / tracking "12 34" (a space) / courier 41 characters | field messages (R5); nothing sent; with a hand-made request the server answers invalid and writes nothing |
| E6 | `PROCESSING` pickup order → Ready for pickup | status `READY_FOR_PICKUP`, `readyAt`, one `READY_FOR_PICKUP` email with the store's address and hours as in settings **at send time** (change the settings between commit and send: the new text appears) |
| E7 | `READY_FOR_PICKUP` online pickup order → Picked up | status `PICKED_UP`, `completedAt` set, `paidAt` unchanged (already set), no outbox row |
| E8 | `READY_FOR_PICKUP` **cash** pickup order → Picked up | one statement sets `PICKED_UP`, `completedAt` and `paidAt` (equal to `completedAt`); no `Payment` row; no email; the order now counts as a sale (spec 042 `countsAsSale`) |
| E9 | `SHIPPED` cash delivery order → Delivered | `DELIVERED`, `completedAt`, `paidAt` set in the same statement, one `ORDER_DELIVERED` email, no `Payment` row, never `PAID` |
| E10 | `SHIPPED` online delivery order → Delivered | `DELIVERED`, `paidAt` unchanged, one `ORDER_DELIVERED` email |
| E11 | Two staff open a `PAID` order; both click Start processing | one wins; the other gets "This order was changed by someone else. Reload…" ; one audit row, one `processingAt`, exactly the winner's timestamp |
| E12 | One staff member double-submits Mark as shipped (same expected status) | the second request is stale; one outbox row, one audit row |
| E12a | A repeated transition attempt: the same move sent again after it succeeded (a retry, a second tab), and `enqueueEmail` called a second time for the same `(orderId, type)` | the second move is stale and enqueues nothing; a direct second `enqueueEmail` returns null and the outbox still holds exactly one row of that type for the order (the unique `(orderId, type)`); one `FakeEmail` after sending |
| E13 | Order moves to Processing while the shipped form for the old status is open (`expected = PAID`, `to = SHIPPED`) | refused by the table (not allowed from the expected status); nothing written |
| E14 | A forged request: `to = PAID`, `to = CANCELLED`, `to = DELIVERED` from `PROCESSING`, `to = SHIPPED` for a pickup order | refused "That change isn't allowed for this order."; nothing written, nothing audited |
| E15 | `PENDING_PAYMENT` and `PENDING_CONFIRMATION` orders | no button, B13 line; a forged move is refused |
| E16 | `DELIVERED`, `PICKED_UP`, `CANCELLED`, `REFUNDED` orders | no button; forged moves refused |
| E17 | Demo opens a `PAID` order | the button is disabled with "This account is read-only"; a direct call to the action is refused before any read, nothing audited, no table changes (the enumeration test) |
| E18 | Recipient has **five** other emails `SENT` in the last 24 hours; their order is marked Shipped | the `ORDER_SHIPPED` row is sent, not `SKIPPED`; the same recipient's next `ORDER_PLACED` is skipped as before |
| E18a | Recipient has four `SENT` emails plus one `SENT` `ORDER_SHIPPED` (exempt type), then an `ORDER_PLACED` is claimed | the `ORDER_PLACED` is `SKIPPED`: the exempt email counted toward the cap even though the skip never applied to it |
| E19 | Same with **six** other emails | same as E18 |
| E20 | Recipient has **four** other emails that day (the issue's example) | the shipped email is sent (also without the exemption: this is the cap's boundary); counted so a following `ORDER_PLACED` is skipped |
| E21 | The sender fails (transport error) after the commit | the order stays `SHIPPED`; the outbox row retries by the existing rules; the admin detail's email list shows Failed |
| E22 | A gateway/network call spied inside the transition's transaction | none runs (`guardTransactions`) |
| E23 | Enqueue throws inside the transaction | the status, timestamp, `paidAt` and audit row are all rolled back; staff see "Couldn't update the order. Try again." |
| E24 | The customer opens a Shipped order's page | timeline shows Shipped with the time, "Courier: LBC", "Tracking number: 123456789012"; Paid step and earlier unchanged; Delivered / Picked up upcoming |
| E25 | The customer opens a cash order that was Picked up | steps up to Picked up are done, the last is current with "Picked up {time}"; COD confirmed still shows "Confirmed {time}" |
| E26 | An order in `SHIPPED` inserted by an old fixture with no `shippedAt` | the page renders; the step has no time |
| E27 | `emailView` for each of the three types, an online and a cash order, a delivery and a pickup order | content assertions (courier, tracking, times, store hours, amount to have ready, `view` link, subject prefix, test sentence); plain-text snapshots only |
| E28 | `READY_FOR_PICKUP` built when the order is `CANCELLED` | a status line "Status: Cancelled" follows the lead; `ORDER_SHIPPED` built when the order is `DELIVERED` has no status line |
| E29 | The `courier` / `trackingNumber` CHECK ("`shippedAt` set implies both set", not tied to a status) | a row with `shippedAt` and no courier, or no tracking number, fails whatever its status; a row with `shippedAt`, courier and tracking passes; a `PROCESSING` row with none of the three passes |
| E29a | A delivered order is later refunded (fixture: `DELIVERED` with `shippedAt`, `completedAt`, courier, tracking, then `UPDATE … status = 'REFUNDED'`) | the update succeeds, courier, tracking and times are untouched, and the CHECK still holds (the case a status-tied CHECK would have broken in #110) |
| E30 | Owner opens a Shipped order's admin detail (courier "LBC", tracking "123456784821") | the Fulfillment section shows "Mark as delivered"; the events list has Processing and Shipped times, "LBC" and the full tracking number |
| E30a | Demo opens the same order's detail and its packing slip | the courier "LBC" in full; the tracking number as "•••• 4821"; the full number appears nowhere in the markup, props or RSC payload of the detail, the slip or the audit page (`expectNoRawValues` with the fixture tracking number added to the helper's raw values) |
| E30b | The masking helper on tracking numbers of 4, 7, 8 and 12 characters, and an audit row whose `after` holds `trackingNumber` | under 8 characters shows only "••••"; 8 or more shows "•••• " plus the last four; the audit JSON for Demo has the masked value |
| E31 | A Paid online order with `refundRequired` (a second payment arrived) | Start processing is still offered; the refund flag stays (#110 clears it) |
| E32 | The audit entry of E4 | `entity` order, `action` status-changed, `before` `{ status: "PROCESSING" }`, `after` `{ status: "SHIPPED", courier, trackingNumber }`; no customer data in it |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| Table unit-tested for every status, fulfillment and payment option, including refusals; staff never enter `PAID`, `COD_CONFIRMED` or a pending status | B1; E1, E13–E16; R1, R2 |
| No undo | B2, B5, B13; E16; R3 |
| One conditional update on the expected status; a lost race changes nothing and says to reload | B9, B14; E11–E13; R4 |
| Shipped needs courier and tracking; columns with a CHECK that Shipped and Delivered orders have both | B6; E4, E5, E29, E29a; R5, R6, D11 (the CHECK keys on `shippedAt`, which every Shipped and Delivered order has because the action sets it with the status) |
| `processingAt`, `shippedAt`, `readyAt`, `completedAt` added and shown in the order page's timeline with courier and tracking | B11, B20; E24–E26; R7, D2 |
| Cash order Delivered / Picked up sets `paidAt` in the same statement; no `Payment`; never Paid | B16; E8, E9; R8 |
| New email types with templates, signed `view` link, `[Demo]` prefix, enqueue in the transaction, send after commit, a `FakeEmail` test each | B14, B15, B17, B18; E4, E6, E9, E21, E27; R10 |
| Picked up sends no email | B15; E7, E8; D3 |
| Staff-triggered types not `SKIPPED` by the cap, still counted; test with a recipient that already has four emails | B19; E18–E20, E18a; R9, D4 |
| (review) Repeated attempt can't enqueue a second email of the same type | E12a; R10 |
| (review) Demo sees tracking masked to the last four, in admin screens and the slip | B11, B12; E30a, E30b; R11, D6 |
| Customer order page and timeline show new statuses, tracking and times | B20, B21; E24–E26 |
| `adminAction`, audit in the same transaction, `can()` action in the table, demo-rejection enumeration test | B3, B14; E2, E17, E32; R11 |
| No network call inside a transaction | B14, B17; E22; R12 |
| (DoD) Empty, loading, error states; desktop 1024 px and up | B7–B10, B13, B22; R13 |

## 4. Rules and edge cases

- R1. **One pure table.** `transitionsFor({ status, fulfillment, paymentOption })` in `lib/orders/transitions.ts` is the only statement of B1. The admin page (which button), the server action (what to accept) and the tests all use it. It imports nothing from the database, env, `next` or `react` (the same lint limits as `lib/orders`' other pure modules). A combination the database CHECKs forbid has no moves, so an inconsistent row can never be moved by this code.
- R2. **Targets staff can reach** are exactly `PROCESSING`, `SHIPPED`, `READY_FOR_PICKUP`, `DELIVERED` and `PICKED_UP`. A type-level test fails when a new `OrderStatus` value is added to the enum without a decision in the table (as `comparable.ts` does for rules).
- R3. **Immutable once set.** Neither the status, a step's timestamp, the courier nor the tracking number is changed by any code path here after it is written. There is no "previous status" column and no reverse transition.
- R4. **The conditional update is the lock.** The expected status comes from the form (the screen the staff member saw); the action reads the order's fulfillment and payment option (which never change) to check the table, then updates `WHERE status = {expected}`. Zero rows updated means stale, and then nothing else runs: no audit row, no outbox row, no email, no `paidAt`. #109's cancel must use the same guard so Processing → Shipped and Processing → Cancelled cannot both win. The release job and the payment webhook only touch pending orders, so they cannot race a move from `PAID`, `COD_CONFIRMED` or later.
- R5. **Courier and tracking input** (one Zod schema in a pure module, shared by the form and the action): both trimmed; courier 2–40 characters from letters, digits, space and `& . ' -`; tracking number 4–40 characters from letters, digits and `- _ / .` (no spaces, no line breaks); no control characters. Stored as typed (case kept), rendered as text only, never as HTML or a link. Both are required for Shipped and are not accepted for any other move (an extra field is invalid). The courier `datalist` (J&T Express, LBC, Ninja Van, Flash Express, 2GO) only suggests; any value that passes these rules is accepted.
- R6. **Database CHECK (migration, not expressible in Prisma):** `shippedAt IS NULL OR (courier IS NOT NULL AND trackingNumber IS NOT NULL)`. It is not tied to a status, so a Delivered order that later becomes Refunded (#110) still satisfies it (E29a). The action sets `shippedAt`, courier and tracking in one statement, so every Shipped and Delivered order made by the app has all three; the CHECK does not force a status to carry `shippedAt` (D11). The existing CHECKs stay: a cash order's `paidAt` may be set only in `DELIVERED`, `PICKED_UP` or `REFUNDED` (spec 038), and a pending order has no `paidAt`. No CHECK ties the other timestamps to statuses and none pairs statuses with fulfillment (D5). `db:drift` stays clean. Existing rows have `shippedAt` null, so the migration applies to any database.
- R6a. **Masking.** The pure masking helper (`lib/admin/mask.ts`) gains `maskTracking`: 8 or more characters show "•••• " plus the last four ("•••• 4821"); fewer than 8 show only "••••" (so a 4-character number is not revealed whole). The courier is not masked. Demo views carry the tracking number only as a `Masked` value (no field can hold the raw one), the audit masker treats the key `trackingNumber` like the other masked keys, and the helper's fixture assertions (`FIXTURE_RAW_VALUES` in `test-support/no-raw-values.ts`) gain a fixture tracking number that `expectNoRawValues` looks for in the Demo pages' HTML and RSC payloads.
- R7. **Timestamps** use one `now` read per action and injected for tests (like `confirmCodOrder`), never the database's clock; one move sets one timestamp: Processing → `processingAt`, Shipped → `shippedAt`, Ready → `readyAt`, Delivered and Picked up → `completedAt` (the time the parcel or pickup was handed over; the label comes from the status).
- R8. **Cash is paid at hand-over.** `paidAt` is set in the same `UPDATE` as the move to Delivered or Picked up, only for `paymentOption = COD`, equal to `completedAt`. It is never set for an online order here, and `paymentMethod` stays null for cash. If `paidAt` were already set on a cash order before Delivered or Picked up, the CHECK would have refused the earlier state.
- R9. **Cap exemption: only the skip.** `ORDER_SHIPPED`, `ORDER_DELIVERED` and `READY_FOR_PICKUP` are in a named list of staff-triggered types (`lib/email/due.ts`); the claim step sends them without applying `capDecision`. Their `SENT` and `SENDING` rows still count in the count other rows see. All other rules of the claim hold for them: the 24-hour window (`too-old`), the lease, the five attempts, the per-address advisory lock. The exemption lives in the pure rules next to `capDecision`, with a unit test of the list, so adding a staff-triggered type later is a visible change.
- R10. **One email per type per order**, by the existing unique `(orderId, type)`. With no undo a type is enqueued at most once; `enqueueEmail` returning null (already queued) is not an error and schedules nothing. A repeated attempt (a retry, a second tab, a double click) is stale at the conditional update and never reaches `enqueueEmail`; the unique index is the second line of defense, and E12a tests both. A pickup order never gets `ORDER_SHIPPED` or `ORDER_DELIVERED` and a delivery order never gets `READY_FOR_PICKUP`, because the table never offers those moves.
- R11. **Guard and audit.** The server action is built with `adminAction("orders.transition", schema, handler)` (no new `can()` action: `orders.transition` already covers Processing, Shipped, Ready, Delivered, Picked up, courier + tracking number and cash paid on delivery, spec 040 §4). It lives in an admin `actions.ts` under `app/admin`, so the guard-enumeration tests find it by reading the directive and the `.db` version calls it as Demo and checks no table changed. The audit row is written by `recordAudit` inside `adminTransaction`, `entity` `order`, `action` `status-changed`, with the changed fields only; there is no audit entry for a refused or stale move. The audit `after` holds the tracking number, which Demo's audit page shows masked (R6a, D6).
- R12. **No network call inside a transaction.** The transaction holds the read, the conditional update, the audit insert and the outbox insert. `scheduleEmailSend` runs after the commit and never throws. The tests run the action under `guardTransactions`.
- R13. **Desktop-first**, usable from 1024 px. The confirmation is a dialog with focus trapped and returned to the button that opened it; Escape closes it unless a request is running; the fields have labels, `aria-invalid` and `aria-describedby` for messages; the result line is an `aria-live` region, not `role="status"` (the admin shell's convention).
- R14. **The emails describe the order as it is when sent** (spec 036 D2). A Shipped email built after the order became Delivered still says it shipped, with the same courier and tracking. A missing timestamp or courier when the email is built is a bug in the caller and throws (a `render-error` that ends final), as `received` throws without `paidAt`.
- R15. **Stock and money don't change.** No move touches stock, a `StockMovement`, a voucher or an amount; totals and the Customers screen's counted totals change only through `paidAt` on cash orders (R8).
- R17. **Test-data changes are deliberate and listed** (D13). The new CHECK needs no existing fixture to change, because none sets `shippedAt`; these fixtures that insert `SHIPPED` or `DELIVERED` rows gain `shippedAt`, a courier and a tracking number anyway, so the fixture looks like an order the app could have produced: `lib/admin/queries/customers.db.test.ts` (the two `DELIVERED` inserts), `lib/admin/queries/orders-buyer.db.test.ts` (the `SHIPPED` insert), and the `SHIPPED` / `DELIVERED` cases of `lib/orders/cod-schema.db.test.ts`. `e2e/admin-order-fixtures.ts` gains status, courier and tracking options for the new E2E, and `test-support/orders.ts` (the shared order factory) gains the same optional fields. Component and unit tests that build an order DTO gain the new fields because the types require them: `components/admin/order-detail.test.tsx`, `components/orders/order-view.test.tsx`, `lib/orders/timeline.test.ts`. `lib/orders/sale-sql.db.test.ts` (a `VALUES` list) and the list/status-filter tests need no change.
- R16. **Reading is not logged.** The customer's page reads the new columns without audit, as today. The three new `EmailType` values are added to every closed list that names the types: the admin labels (`EMAIL_TYPE_LABELS`), `EMAIL_VIEW_TYPES`, the template registry and the dev emails page.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Section heading | Fulfillment |
| Buttons | Start processing · Mark as shipped · Mark as ready for pickup · Mark as delivered · Mark as picked up |
| Confirm title | Mark order {number} as {status}? |
| Confirm lines | This can't be undone. · An email goes to the customer. · No email is sent for this step. · ₱{total} will be recorded as paid in cash. |
| Masked tracking (Demo) | •••• 4821 · •••• |
| Shipped fields | Courier · Tracking number |
| Shipped confirm step | Check these details · Both are emailed to the customer and can't be changed. · This can't be undone. · Back · Confirm |
| Field errors | Enter the courier. · Courier must be 2 to 40 characters: letters, numbers, spaces and & . ' - · Enter the tracking number. · Tracking number must be 4 to 40 characters: letters, numbers and - _ / . |
| Confirm / cancel / busy | Confirm · Cancel · Updating… |
| Success (email sent) | Marked as shipped. The customer will get an email shortly. · Marked as ready for pickup. The customer will get an email shortly. · Marked as delivered. The customer will get an email shortly. |
| Success (no email) | Marked as processing. · Marked as picked up. |
| Stale | This order was changed by someone else. Reload to see its current status. · Reload |
| Not allowed | That change isn't allowed for this order. |
| Not found | This order wasn't found. |
| Failure | Couldn't update the order. Try again. |
| Demo | This account is read-only |
| No button | Waiting for the customer. Cancel is the only change available. · Delivered. Nothing more to do here. · Picked up. Nothing more to do here. · Cancelled. · Refunded. · Shipped. Mark it as delivered when the courier reports delivery. |
| Admin event rows | Processing started {time} · Shipped {time} · Ready for pickup {time} · Delivered {time} · Picked up {time} · Courier: {courier} · Tracking number: {number} |
| Admin email labels | Order shipped · Ready for pickup · Order delivered |
| Customer timeline | Started {time} · Shipped {time} · Ready {time} · Delivered {time} · Picked up {time} · Courier: {courier} · Tracking number: {number} |
| Email subject | `[Demo] Order {number} has shipped` · `[Demo] Order {number} is ready for pickup` · `[Demo] Order {number} was delivered` |
| Email leads | Your order {number} is on its way. · Your order {number} is ready for pickup. · Your order {number} was delivered. |
| Email detail lines | Courier: {courier} · Tracking number: {number} · Shipped {time} · Ready {time} · Delivered {time} · Please have ₱{total} ready when it arrives. · Please bring ₱{total} to pay when you pick it up. |
| Email status line | Status: {label} (only for Cancelled / Refunded, B18) |
| Email button | View your order |

The test-mode sentence, footer and link note are spec 036's `EMAIL_COPY`. The cash-amount lines reuse spec 038's wording where it fits (`confirmPayLine`); the strings above are the intent and the plan settles the exact reuse. New strings live in `lib/admin/copy.ts` (admin), `lib/email/copy.ts` (emails) and `lib/orders/copy.ts` / `timeline.ts` (customer).

## 6. Data and interfaces

**Schema (one migration):**
- `Order`: `courier` and `trackingNumber` (nullable text), `processingAt`, `shippedAt`, `readyAt`, `completedAt` (nullable timestamps; `completedAt` is the hand-over time of Delivered or Picked up, labeled from `fulfillment`). No index (no query filters or sorts by them).
- `EmailType` enum: `ORDER_SHIPPED`, `ORDER_DELIVERED`, `READY_FOR_PICKUP`.
- CHECK (migration-only): `shippedAt IS NULL OR (courier IS NOT NULL AND trackingNumber IS NOT NULL)`.
- Masking: `maskTracking` in `lib/admin/mask.ts`, the `trackingNumber` audit key, a fixture tracking number in `test-support/no-raw-values.ts`; the packing slip type gains `courier` and a masked-or-full tracking field.
- PRD: FR-21 in `docs/prd.md` gains "ready for pickup" (D12).
- Seed, `resetCatalog()` and `--reset` need no change (no new table).

**Permissions:** no new action; `orders.transition` (Owner, Staff yes; Demo no) is used as is. The table and `permissions.test.ts` are unchanged.

**Pure modules:**
- `lib/orders/transitions.ts`: `transitionsFor(order) → TransitionTarget[]` (0 or 1 items for the MVP table), `canTransition(order, to)`, the targets list, `emailTypeFor(to)` (`ORDER_SHIPPED` for Shipped, `READY_FOR_PICKUP`, `ORDER_DELIVERED`, otherwise none), `recordsCashPayment(order, to)`, and the step's timestamp field name for a target.
- The courier / tracking schema and the transition input schema (`orderNumber`, `expectedStatus`, `to`, optional `courier`, `trackingNumber`), pure, shared by the form and the action.
- `lib/orders/timeline.ts` gains the step details of B20 from the new fields (the signature of `orderTimeline` gets optional timestamps, courier and tracking).
- `lib/admin/orders-view.ts`: labels for the fulfillment lines, the no-button reasons, the new email-type labels.
- `lib/email/due.ts`: the staff-triggered type list and the cap rule that uses it; `lib/email/view.ts`: `emailView` for the three types (`EMAIL_VIEW_TYPES` extended); `lib/email/copy.ts`: their strings.

**Server:**
- `app/admin/(shell)/orders/[number]/actions.ts` (`"use server"`): `transitionOrderAction`, built with `adminAction("orders.transition", transitionSchema, handler)`. Result data: `{ kind: "done", status, emailQueued }`, or `{ kind: "stale" }`, `{ kind: "not-allowed" }`, `{ kind: "not-found" }`; guard errors (`unauthenticated`, `forbidden`, `invalid`, `failed`) are the guard's. The action forwards to `transitionOrder(actor, input, now)` in `lib/admin/orders/transition.ts` (name settled in the plan), which opens `adminTransaction`, reads, runs the conditional update, calls `recordAudit` and `enqueueEmail`, and returns; the action then calls `scheduleEmailSend` for the queued row.
- Templates: `lib/email/templates/order-shipped.ts`, `order-delivered.ts`, `ready-for-pickup.ts`, registered in `lib/email/templates.ts`.
- `getOrderDetail` and `OrderDetail` gain the six new fields and `transitions` (the allowed targets for the viewer's role, empty for a role without `orders.transition`, so the page shows the Demo-disabled state from `can()`); `getOrderForPage` / the order page DTO gain the same fields for the timeline. Both select named fields only.

**UI:** a Fulfillment section and a transition dialog in `components/admin/` (client component for the dialog; the page stays a server component and imports no database, `no-db-in-pages.test.ts`).

**Reused:** `adminAction`, `adminTransaction`, `recordAudit`, `enqueueEmail`, `scheduleEmailSend`, `emailView`, `renderEmail`, `mintViewLink`, `dateTimeText`, `formatPeso`, `NoAccess`, the spec 041 detail view-model, `guardTransactions`, `expectNoRawValues`.

## 7. Test plan

- **Unit (pure):** `transitionsFor` over all 44 combinations and the enum-completeness test (E1, E14–E16, R2); the courier / tracking schema (E5); `emailTypeFor`, `recordsCashPayment`; `orderTimeline` with and without the new fields, delivery and pickup, online and cash (E24–E26); the staff-triggered list and `capDecision` unchanged; `maskTracking` (E30b); `emailView` for the three types across online / cash, delivery / pickup and the Cancelled status line (E27, E28), content assertions plus plain-text snapshots only; copy completeness.
- **Integration (`*.db.test.ts`, Docker Postgres):** the CHECK (E29) and a Delivered order moving to Refunded in a fixture (E29a); a repeated attempt enqueues no second email and a direct second `enqueueEmail` returns null (E12a); exempt emails still count toward the cap (E18a); each valid move on a real row, with audit row, outbox row, timestamps and `paidAt` (E2–E10, E32); the conditional update and the stale paths, two concurrent calls with one winner, double submit (E11, E12); table refusals through the action (E13–E16); the CHECKs (E29, and that spec 038's cash `paidAt` CHECK still holds); the whole transaction rolls back when enqueue throws (E23); `guardTransactions` over the action (E22); cap exemption with four / five / six prior emails and a following `ORDER_PLACED` skipped (E18–E20); a `FakeEmail` for each of the three types through `sendPending`, the store settings read at send time (E4, E6, E9); sender failure leaves the order (E21); Demo call is refused with no table changed (the enumeration `.db` test covers the new action); Demo detail page markup and RSC payload with `expectNoRawValues` still pass with the new section; the customer page DTO has no staff field.
- **E2E (`admin` project, `e2e/admin-orders-transitions.spec.ts`, fixtures with their own recipients):** the Shipped two-step dialog (Back keeps the values, nothing is sent before Confirm, the datalist offers the five couriers); Demo sees "•••• 4821" in HTML and RSC payloads of the detail, slip and audit pages; Staff walks an online delivery order Paid → Processing → Shipped (courier, tracking) → Delivered and a cash pickup order COD confirmed → Processing → Ready → Picked up, checking the buttons, the confirmation copy, the cash-paid line and the Customers total after Picked up; a second tab shows the stale message and Reload; Demo sees disabled controls; the customer's order page (token link) shows the timeline with courier and tracking; `/dev/emails` shows the three subjects.
- Lint, typecheck and `db:drift` pass. Preview check: the acceptance list on the preview URL at 1024 px and 1280 px, including one email in `/dev/emails`.

## 8. Out of scope

- Cancel, including cancel from Processing / Ready for pickup / Paid / COD confirmed: #109 (same conditional update, `orders.cancel`, the `ORDER_CANCELLED` email, stock return).
- Refunds, `REFUNDED`, clearing "Refund required", resolving "Needs checking": #110.
- Returns, partial shipments, editing items, addresses or contact details, bulk status changes, reversing or "fixing" a status, cancel from Shipped (the issue).
- Editing courier or tracking number after Shipped: backlog issue [#134](https://github.com/romulojr-dev/pc-ecommerce/issues/134) "Correct tracking details" (D11). A closed courier list or tracking links to courier sites, tracking webhooks, shipping labels, proof of delivery.
- Resending an email, or a retry button for a failed one (#101 for the cash confirmation; the same screen later).
- An email for Processing or for Picked up (D3, confirmed), SMS or push messages.
- Stock changes, packaging weights, inventory reservations beyond what spec 030 does.
- A new `can()` action or role (D7); a new ADR (none of this changes a decision in ADRs 0009 to 0012).

## 9. Decisions

- **D1 — One server action for every move, driven by one pure table.** The table decides the button, the validation and the refusal, so the three cannot disagree. Rejected: one action per status (five places to forget a guard or an audit entry).
- **D2 — Four timestamps: `processingAt`, `shippedAt`, `readyAt` and `completedAt`, the last holding the Delivered or Picked up time.** The issue allows "or one set of timestamps"; Picked up is the hand-over of a pickup order as Delivered is of a delivery order, and an order is never both. `completedAt` (renamed from the first draft's `deliveredAt` in review) does not suggest delivery for a pickup order; the timeline and any later query label it from `fulfillment`. Rejected: a fifth column `pickedUpAt` (always null for the other half of the orders); `deliveredAt` (misleading for pickup); one `fulfilledAt` plus a per-status event table (more than the timeline needs).
- **D3 — Picked up sends no email; Processing sends none either.** Settled by the issue's default (the customer is standing at the counter); Processing has no email in the issue or FR-21 and "Ready for pickup" / "Shipped" cover the moments the customer acts on. Rejected: a "Thanks for picking up" email (no new information, counts toward the cap) and a "We're packing your order" email (noise). Confirmed in review.
- **D4 — The cap exemption is a named list of types in the pure rules, and the issue's example ("four emails that day") is not enough to test it.** With a cap of five, a recipient with four other emails is not over the cap, so a Shipped email would be sent with or without the exemption. The tests use four (boundary, sent), five and six (exempt types sent while an `ORDER_PLACED` is skipped). Flag: this is a small difference from the issue's wording, in its favor. Rejected: raising the cap for everyone (the cap is spec 035's abuse guard); sending exempt types without counting them (the issue says they count); keying the exemption off "who triggered it" (the outbox stores no actor). Review addition: only the *skip* is exempt; the exempt emails still count in the recipient's 24-hour count (R9, E18a).
- **D5 — CHECKs only for what the issue asks (courier and tracking), not for timestamps or status-vs-fulfillment pairs.** Many existing fixtures and tests insert orders at arbitrary statuses (spec 042 E32 already works around the order CHECKs); a CHECK on `shippedAt` would break them without protecting anything the table does not already protect. The pure table and the action are the guard for fulfillment. Rejected: CHECKs pairing every status with its timestamp and fulfillment (large fixture churn for display-only data).
- **D6 — Demo sees the courier in full and the tracking number masked to its last four ("•••• 4821").** Settled in review. A tracking number identifies a parcel for anyone holding it, so Demo gets the same shape as other masked identifiers while still seeing what Shipped looks like; the courier name is not personal. Numbers under 8 characters show only "••••" so a short one is never revealed whole. Applies to the detail, the events list, the packing slip and the audit page. Rejected: showing Demo everything (the first draft); masking the courier too.
- **D7 — Reuse `orders.transition` unchanged.** Spec 040's table already lists these exact moves, courier + tracking and "cash paid on delivery" under it, and the issue asks only that the action be in the table. Rejected: a separate `orders.mark-paid-cod` action (a Staff member who delivers a cash order is already trusted to move it).
- **D8 — Audit stores the status change and the courier / tracking number it set, nothing else.** The audit entry is the record of "who moved this order and when". Rejected: copying the whole row (customer data in the log).
- **D9 — A failed enqueue fails the move.** The issue asks for the email to enqueue in the transition's transaction, so there is never a move without its row; the cost is that a database fault stops the move and staff retry. Rejected: enqueue after commit (a crash between them loses the email with no trace).
- **D10 — The email's status line appears only for Cancelled / Refunded.** Every email describes the order as it is when sent (spec 036), but a Shipped email read after Delivered should not announce "Status: Delivered" as a problem. Rejected: a status line on every email built after a later step (noise); none at all (an email promising pickup for a cancelled order misleads).
- **Flag, PRD and issue differ:** FR-21 lists "shipped, delivered" but not a Ready for pickup email, and the issue adds `READY_FOR_PICKUP`. The PRD wins on scope, but a pickup order has no Shipped step and would otherwise get nothing when the parts are ready; I follow the issue and propose editing FR-21 in this story's docs step to list "ready for pickup" (D12). A second small flag: spec 035 states a flat cap of five; this story adds the exemption in R9 and spec 035/036 get a "changed by spec 043" note.
- **Flag, #106's slip text:** spec 041 B19 says a Paid or COD confirmed order "becomes Processing in #108"; this story is that move, with no conflict.
- **D11 — The CHECK is `shippedAt IS NULL OR (courier AND trackingNumber NOT NULL)`, not tied to a status.** Settled in review, so a Delivered order that becomes Refunded in #110 keeps satisfying it (E29a). Flag: the issue says "Shipped and Delivered orders have both"; this CHECK enforces it for any row with `shippedAt`, and the action always sets `shippedAt` with the status, but the database alone would accept a `SHIPPED` row with no `shippedAt`. I kept it as approved. If you want the database to refuse that too, add `status NOT IN ('SHIPPED','DELIVERED') OR shippedAt IS NOT NULL` (still survives Refunded, since it names only those two statuses) at the cost of the fixture churn in D5. Tracking stays immutable: the Shipped confirm step shows courier and tracking prominently and says both are emailed and can't be changed; "Correct tracking details" is backlog issue [#134](https://github.com/romulojr-dev/pc-ecommerce/issues/134). Rejected: an edit action now.
- **D12 — PRD FR-21 gains "ready for pickup" in this story.** Settled in review (the local `docs/prd.md` is the source). Sprint 8's row already names Shipped and Delivered emails.
- **D13 — Fixtures that gain courier / tracking / `shippedAt` are a deliberate test-data change, listed in R17.** None is forced by the CHECK; they change so a Shipped or Delivered fixture looks like one the app could produce. Rejected: leaving them bare (a future status-tied check would then break them silently).
- **D14 — Courier is free text with a `datalist` of J&T Express, LBC, Ninja Van, Flash Express and 2GO; success messages name the email only for the three types that send one.** Settled in review. Rejected: a closed list (blocks uncommon couriers).

## 10. Open questions

None. The five from the first draft were settled in review: tracking stays immutable (D11), no email for Processing or Picked up (D3), FR-21 edited (D12), courier free text with suggestions (D14), success wording (B8). One flag remains for your eye, not a blocker: the optional second CHECK in D11.
