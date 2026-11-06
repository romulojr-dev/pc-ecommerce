# Tasks: spec 044 — Cancel an order from Admin (#109)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec approved with the review changes (D12, D13, note for Other, nothing-received definition)
- [x] Commit `spec.md`, `plan.md`, `tasks.md`
- [x] `docs/prd.md`: Voucher row wording ("paid or unpaid"), FR-21 store-cancel email

## 1. Extract `undoReservations` (refactor)
- [x] `lib/orders/undo-reservations.ts`; `releaseExpiredOrders` calls it
- [x] Existing release tests pass with no changed expectation (R21)
- [x] Integration test E21 (three orders, two products, id order, row-for-row)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 2. Pure rules
- [x] `canCancel` over every status; staff reasons; `cancelInputSchema` (note); reason phrases; `nothingReceived`
- [x] Unit tests: 44 combinations incl. refusals (E1), completeness against the Prisma enum, input (E13), phrases and nothing-received incl. late payment (E23, E24)
- [x] File imports no database, env, `next` or `react`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. Schema and the cap
- [x] Migration: `OrderCancelReason` ×3, `EmailType.ORDER_CANCELLED_BY_STORE`; `schema.prisma`
- [x] `CAP_EXEMPT_TYPES` + unit test (exempt: by-store; not exempt: `ORDER_CANCELLED`)
- [x] Integration tests E26 (CHECKs hold), E31 (six released, capped), E32 (staff cancel over the cap sent, counts)
- [x] `pnpm db:drift`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 4. Emails
- [x] `send.ts` loads payments; `EmailOrder` gains `payments`; fixtures updated
- [x] Copy and view: received flag, closing sentences; template, registry, `EMAIL_VIEW_TYPES`, labels, dev emails page
- [x] Tests E23 (content, in `view.test.ts`); the `FakeEmail` run through `sendPending` is in task 5's cancel tests
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 5. The cancel (server)
- [x] `cancelOrder`: read, gateway step (every status), one `adminTransaction`, conditional update, payments, `undoReservations`, voucher, audit (with note), email
- [x] `cancelOrderAction` with `adminAction("orders.cancel", …)`; email scheduled and tag revalidated after commit (only when stock returned)
- [x] Integration tests E2–E12, E18–E20, E22, E29, E33–E35
- [x] Race tests E14–E17 forced both ways
- [x] E27 Demo refused, guard-enumeration passes; E28 under `guardTransactions`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Customer timeline and order page
- [ ] `orderTimeline` for cancelled orders; "Cancelled {time}"
- [ ] Order-page DTO, `getOrderForPage`, `OrderView` copy
- [ ] Tests E24, E25
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Admin detail and dialog
- [ ] `OrderDetail` fields, events list; Cancel button and dialog; result and error messages; busy state; focus
- [ ] Render tests per role and state (E30)
- [ ] `no-db-in-pages.test.ts` and `admin-pages.test.ts` pass
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 8. E2E
- [ ] `e2e/admin-cancel.spec.ts` and fixtures
- [ ] Run against the local app and Docker-free dev server as the other admin specs do

## 9. Docs
- [ ] CLAUDE.md bullet; "changed by spec 044" notes in specs 033, 035, 036
- [ ] Spec §11 "What changed while building"; tick this file

## 10. PR
- [ ] `git push -u origin HEAD`
- [ ] PR with the repo template, "Closes #109"
