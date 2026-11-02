# 033 — Tasks: Auto-cancel unpaid orders and release stock

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md) · Issue: #81. One commit per task.

- [x] 1. Docs scaffold: spec, plan, tasks
- [x] 2. Schema and migration: `cancelledAt`, `cancelReason`, `ORDER_RELEASED`, the pending `expiresAt` partial index, CHECKs
- [x] 3. Gateway: `closeSession` answers `cancelled` / `not-active`; fake failure code and delay seams; `startPayment` unchanged in behavior
- [x] 4. Pure pieces: `isDue`, `releaseDecision`, constants, `logReleaseEvent`, `secretMatches` / `bearerOf`
- [x] 5. Release core: `checkExpiredOrders`, `releaseExpiredOrders`, `afterRelease`, `sweepExpiredOrders`, `timedGateway`, with the integration tests (R1–R14, G1–G5)
- [x] 6. Scoped release in `addToCart`, `setCartQuantity`, `addBuildToCart` and `placeOrder` (S1–S9c)
- [x] 7. Sweep after the product page, `/cart`, `/checkout`, the order page and the candidates route
- [x] 8. Cron route, `vercel.json`, `CRON_SECRET` in `lib/env.ts` and `.env.example` (T1–T7, N1–N3)
- [x] 9. Order page: the `expired` view, the cancelled copy, `cancelReason` (V1–V6, P1–P2)
- [x] 10. E2E (X1, X2)
- [x] 11. Docs close-out: CLAUDE.md, setup doc, notes in specs 030 and 032 and ADR 0009, spec status
