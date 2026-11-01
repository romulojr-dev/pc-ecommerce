# 032 — Tasks: Payment webhooks

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md) · Issue: #80. One commit per task.

- [x] 1. Docs scaffold: spec, plan, tasks, FR-22 in the PRD
- [x] 2. `payments:check --read` for Q3 (script done; waiting on the owner's test payment and run)
- [x] 3. Schema and migration: `PaymentEvent`, paid fields, `PaymentProblem`, CHECKs, reset lists
- [x] 4. Gateway: `SessionDetails.referenceId` / `expiresAt`, fake payment-status seam
- [x] 5. Pure pieces: `parseWebhook`, outcomes, `logPaymentEvent`, `paymentView`, copy
- [ ] 6. `reconcileSession`, with the integration tests (H1–H17, C1–C6)
- [ ] 7. Handler, route, fake page, `XENDIT_WEBHOOK_TOKEN` required with both gateways
- [ ] 8. Order page states and `needs-check` in `startPayment`
- [ ] 9. `pnpm webhook:replay`
- [ ] 10. E2E (X5–X8)
- [ ] 11. Docs close-out: setup doc, CLAUDE.md, PRD data model, spec status
