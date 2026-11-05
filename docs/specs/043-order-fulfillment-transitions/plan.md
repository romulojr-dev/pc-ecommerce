# Plan: spec 043 — Order transitions with Shipped, Ready and Delivered emails (#108)

Spec: [spec.md](spec.md) (approved 2026-11-06). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `108-order-transitions-with-shipped-ready-and-delivered-emails`, from `main` (specs 040 to 042 are in the tree). One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `adminAction`, `adminTransaction`, `recordAudit` ([lib/admin/guard.ts](../../../lib/admin/guard.ts), [lib/admin/audit.ts](../../../lib/admin/audit.ts)); `can()` with `orders.transition` already in the table ([lib/admin/permissions.ts](../../../lib/admin/permissions.ts)); `enqueueEmail`, `scheduleEmailSend`, `sendPending` and the claim step ([lib/email/outbox.ts](../../../lib/email/outbox.ts), [schedule.ts](../../../lib/email/schedule.ts), [send.ts](../../../lib/email/send.ts)); `emailView`, `renderEmail`, `EMAIL_COPY`, `mintViewLink`; `orderTimeline` ([lib/orders/timeline.ts](../../../lib/orders/timeline.ts)) and `OrderTimeline`; the admin detail ([lib/admin/queries/orders.ts](../../../lib/admin/queries/orders.ts), `components/admin/order-detail.tsx`) and packing slip; the masking helper ([lib/admin/mask.ts](../../../lib/admin/mask.ts)) and `expectNoRawValues`; `guardTransactions` ([test-support/release.ts](../../../test-support/release.ts)); the guard-enumeration tests, which pick up a new admin `actions.ts` by reading its `"use server"` directive.

Does not exist yet: `lib/orders/transitions.ts`, the six `Order` columns, the three `EmailType` values and their templates, the admin Fulfillment section and dialog, the transition action, `maskTracking`, the cap exemption.

## Findings that shape the plan

- **`orders.transition` already exists** and spec 040 lists these exact moves under it. No permission change; `permissions.test.ts` stays as it is.
- **The claim step applies `capDecision` to every row** ([lib/email/send.ts](../../../lib/email/send.ts)). The exemption is a list in the pure rules ([lib/email/due.ts](../../../lib/email/due.ts)) and one condition in `claim()`: an exempt type skips the skip, but the count query is untouched, so exempt rows still count (E18a). The count query counts every type already.
- **Postgres enum values** (`ALTER TYPE … ADD VALUE`) can't be used in the transaction that adds them. The migration only adds them and the CHECK; no row uses them in the same file.
- **The CHECK keys on `shippedAt`** (D11), so no existing fixture breaks. Fixtures change anyway (R17) and the plan lists them as their own task so the diff is reviewable.
- **Timeline today carries one `detail` string** (COD confirmed). B20 needs several lines on the Shipped step. `TimelineStep` gains `details: string[]` (the old `detail` is kept or folded in; settled in task 6 by reading `order-timeline.tsx` and its tests).
- **`OrderStatusName` is written out in `timeline.ts`** to keep the file free of the generated client; `transitions.ts` follows the same pattern, plus a type-level completeness check against the Prisma enum in a test (not in the pure file), so a new status forces a decision (R2).
- **The admin detail DTOs select named fields only.** `OrderDetail`, the order-page DTO and `PackingSlip` each gain fields by name. Demo's tracking number goes through `maskTracking` in the query layer, so the DTO type for Demo can't hold the raw value (the `Masked` brand).
- **Audit masking** already walks JSON by key; `trackingnumber` is added to the masked keys.
- **No network inside the transaction.** The transition runs in `adminTransaction`; `scheduleEmailSend` is called after it returns. `guardTransactions` wraps the integration tests.
- **The Shipped dialog is two steps** (fields, then a prominent confirm). The pure Zod schema is shared with the action; the client component keeps the values when the user goes Back.

## Risks to settle early

1. **The conditional update and the CHECKs together** (task 3). One statement sets status, timestamp, courier, tracking and (cash) `paidAt`; the existing CHECKs (cash `paidAt` only in Delivered, Picked up or Refunded; `confirmedAt` for cash orders from COD confirmed on) must accept every legal move. Test every row of the table against a real database first.
2. **Cap exemption correctness** (task 5): the exempt row must still count for others. Tests E18, E18a, E19, E20 before the template work.
3. **Demo leak of the tracking number** (task 8): detail, slip, events list, audit page, RSC payloads. Run `expectNoRawValues` on all of them with a fixture number of 12 characters.
4. **Stale and double-submit behavior** (task 3): concurrent calls with one winner (E11, E12, E12a).
5. **Email wording vs. cash/pickup variants** (task 4): twelve combinations; the content assertions list them explicitly.

## Steps

### 0. Housekeeping
Commit `spec.md`, `plan.md` and `tasks.md`; add "ready for pickup" to PRD FR-21 (D12).

### 1. The table (pure)
`lib/orders/transitions.ts`: `transitionsFor`, `canTransition`, `emailTypeFor`, `recordsCashPayment`, the timestamp field per target. Tests E1 (44 combinations), forged targets (E14–E16), and the enum-completeness test.

### 2. Schema
Migration: six `Order` columns, three `EmailType` values, the `shippedAt` CHECK. `schema.prisma` comments. Tests E29 and E29a (a fixture delivered order moves to Refunded), `db:drift` clean. Update the test factory (`test-support/orders.ts`) with optional new fields.

### 3. The transition (server)
Input schemas (courier and tracking rules, R5), `transitionOrder(actor, input, now)` in `lib/admin/orders/transition.ts` in one `adminTransaction`: read, table check, conditional update, cash `paidAt`, `recordAudit`, `enqueueEmail`. Result kinds `done`, `stale`, `not-allowed`, `not-found`. `app/admin/(shell)/orders/[number]/actions.ts` with `adminAction("orders.transition", …)` and `scheduleEmailSend` after commit. Integration tests E2–E4, E6–E10, E11–E13, E12a, E15, E16, E22, E23, E31, E32, plus the guard-enumeration `.db` test as Demo (E17).

### 4. Emails
`copy.ts` strings, `emailView` for the three types (`EMAIL_VIEW_TYPES` extended), three templates, registry, labels in `EMAIL_TYPE_LABELS`, the dev emails page list. Unit tests E27, E28 (plain-text snapshots only); integration `FakeEmail` test per type through `sendPending` (E4, E6, E9), the pickup store settings read at send time, sender failure leaves the order (E21).

### 5. Cap exemption
Exempt-type list and the `claim()` condition; unit test of the list; integration tests E18, E18a, E19, E20.

### 6. Customer timeline and order page
`getOrderForPage` DTO and `orderTimeline` with times, courier and tracking; `OrderTimeline` component; labels from fulfillment for `completedAt`. Tests E24–E26.

### 7. Admin detail, dialog and slip
`OrderDetail` fields and `transitions`; the Fulfillment section, the one-step dialog and the two-step Shipped dialog (datalist of five couriers); the events list lines; packing slip courier and tracking; success and error messages (B8–B10). Component render tests for each state and role.

### 8. Masking
`maskTracking`, the audit key, the Masked DTO fields, the fixture value in `no-raw-values.ts`. Tests E30a, E30b; Demo page checks across detail, slip and audit.

### 9. Fixtures (deliberate test-data change, R17)
Update `customers.db.test.ts`, `orders-buyer.db.test.ts`, `cod-schema.db.test.ts`, the component and timeline tests, `e2e/admin-order-fixtures.ts`.

### 10. E2E
`e2e/admin-orders-transitions.spec.ts` as in the spec's test plan.

### 11. Documentation
CLAUDE.md bullet (transitions, the cap exemption, the CHECK, masking, `completedAt`), "changed by spec 043" notes in specs 035, 036 and 041, the spec's "What changed while building", README only if it lists admin screens.

### 12. Final checks
`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build`, `pnpm test:e2e` (admin project). Then push, open the PR from the template, and check the acceptance list on the preview URL at 1024 px and 1280 px.
