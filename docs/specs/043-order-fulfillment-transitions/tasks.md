# Tasks: spec 043 — Order transitions with Shipped, Ready and Delivered emails (#108)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec approved with three changes and five answers (D2, D6, D11–D14)
- [x] Backlog issue [#134](https://github.com/romulojr-dev/pc-ecommerce/issues/134) "Correct tracking details" created
- [x] Commit `spec.md`, `plan.md`, `tasks.md`
- [x] `docs/prd.md` FR-21 lists "ready for pickup" (D12)

## 1. The table (pure)
- [x] `lib/orders/transitions.ts`: `transitionsFor`, `canTransition`, `emailTypeFor`, `recordsCashPayment`, timestamp field per target
- [x] Unit test over all 44 status × fulfillment × payment combinations (E1); forged targets refused (E14–E16)
- [x] Enum-completeness test against the Prisma `OrderStatus` (R2)
- [x] File imports no database, env, `next` or `react` (ESLint limits)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema
- [x] Migration: `courier`, `trackingNumber`, `processingAt`, `shippedAt`, `readyAt`, `completedAt` on `Order`; `EmailType` values `ORDER_SHIPPED`, `ORDER_DELIVERED`, `READY_FOR_PICKUP`; three CHECKs (R6)
- [x] `schema.prisma` fields and comments; `test-support/orders.ts` takes the new optional fields
- [x] Integration tests E29, E29a, E29b, E29c (each CHECK rejects a violating row and still holds after REFUNDED)
- [x] `pnpm db:drift`, `pnpm test:db` pass

## 3. The transition (server)
- [x] Input schemas: courier and tracking rules (R5), transition input
- [x] `transitionOrder` in one `adminTransaction`: read, table check, conditional update on the expected status, cash `paidAt` in the same statement, `recordAudit`, `enqueueEmail`
- [x] `app/admin/(shell)/orders/[number]/actions.ts`: `adminAction("orders.transition", …)`, `scheduleEmailSend` after commit
- [x] Integration tests E2–E4, E6–E10 (moves, timestamps, audit, outbox, cash `paidAt`, no `Payment` row)
- [x] Integration tests E11–E13 (race, double submit, stale expected status), E12a (repeated attempt, second `enqueueEmail` returns null, one row)
- [x] E15, E16, E31, E32; E22 under `guardTransactions`; E23 rollback when enqueue throws
- [x] Demo call refused with no table changed (E17); guard-enumeration tests pass
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. Emails
- [x] Copy in `lib/email/copy.ts`; `emailView` for the three types; `EMAIL_VIEW_TYPES` extended
- [x] Templates `order-shipped`, `order-delivered`, `ready-for-pickup`; registry; `EMAIL_TYPE_LABELS`; dev emails page
- [x] Unit tests E27, E28 (content assertions, plain-text snapshots only)
- [x] Integration test per type: a `FakeEmail` through `sendPending`; pickup store settings read at send time; sender failure leaves the order (E21)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. Cap exemption
- [x] Exempt-type list in `lib/email/due.ts` with a unit test; `claim()` skips the skip only
- [x] Integration tests E18 (five), E18a (exempt rows still count), E19 (six), E20 (four)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Customer timeline and order page
- [x] Order-page DTO and `getOrderForPage` select the new fields (named fields only)
- [x] `orderTimeline` details: times, courier, tracking; `completedAt` labeled from fulfillment; `OrderTimeline` renders them
- [x] Tests E24–E26
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Admin detail, dialogs and packing slip
- [x] `OrderDetail` fields and `transitions` for the viewer's role; events list lines
- [x] Fulfillment section; one-step confirm dialog; two-step Shipped dialog with the courier datalist (J&T Express, LBC, Ninja Van, Flash Express, 2GO)
- [x] Success, stale (Reload), not-allowed, not-found and failure messages; busy state; focus
- [x] Packing slip shows courier and tracking
- [x] Render tests for each state and role (Demo disabled, no-button lines)
- [x] `no-db-in-pages.test.ts` and `admin-pages.test.ts` pass
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 8. Masking
- [x] `maskTracking` ("•••• 4821", under 8 characters "••••"); `trackingNumber` audit key; Masked DTO fields
- [x] Fixture tracking number in `test-support/no-raw-values.ts`
- [x] Tests E30a, E30b; Demo detail, slip and audit checked with `expectNoRawValues`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 9. Fixtures (deliberate test-data change, R17)
- [ ] Search every fixture that inserts `SHIPPED`, `DELIVERED` or `PICKED_UP` rows (the status CHECKs need `shippedAt` / `completedAt` / courier / tracking); done inside task 2 where the CHECKs would otherwise fail the suite
- [ ] `lib/admin/queries/customers.db.test.ts`: the two `DELIVERED` inserts gain `shippedAt`, courier, tracking
- [ ] `lib/admin/queries/orders-buyer.db.test.ts`: the `SHIPPED` insert
- [ ] `lib/orders/cod-schema.db.test.ts`: the `SHIPPED` / `DELIVERED` cases
- [ ] `components/admin/order-detail.test.tsx`, `components/orders/order-view.test.tsx`, `lib/orders/timeline.test.ts`: DTOs gain the new fields
- [ ] `e2e/admin-order-fixtures.ts`: status, courier and tracking options
- [ ] `pnpm test`, `pnpm test:db` pass

## 10. E2E
- [ ] `e2e/admin-orders-transitions.spec.ts`: online delivery walk, cash pickup walk (cash line, Customers total), stale second tab, Shipped two-step dialog, Demo disabled and masked, customer timeline, `/dev/emails`
- [ ] Runs against the Docker Postgres with inline variables (no `.env.local` change)

## 11. Documentation
- [ ] CLAUDE.md bullet: transitions, cap exemption, the CHECK, masking, `completedAt`
- [ ] "Changed by spec 043" notes in specs 035, 036 and 041
- [ ] Spec "What changed while building"; README only if it lists admin screens

## 12. Final checks
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build`, `pnpm test:e2e` (admin project)
- [ ] Push (`git push -u origin HEAD`), open the PR from the template, check the acceptance list on the preview URL at 1024 px and 1280 px
