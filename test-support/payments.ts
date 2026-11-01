import { randomBytes } from "node:crypto"

import { db } from "./db"

// Payment rows for the integration tests (docs/specs/031-pay-with-xendit). A
// pending fake-gateway payment for the order's whole total unless overridden.

type PaymentOverrides = Partial<Parameters<typeof db.payment.create>[0]["data"]>

// An id in Xendit's shape: "ps-" and 24 hex characters
export const sessionId = (): string => `ps-${randomBytes(12).toString("hex")}`

export function paymentData(orderId: string, overrides: PaymentOverrides = {}) {
  return {
    orderId,
    provider: "FAKE" as const,
    providerRef: sessionId(),
    referenceId: "PCS-7KQ2M9XD-1",
    amount: 2_311_000,
    expiresAt: new Date("2026-11-01T07:42:00Z"),
    ...overrides,
  } as Parameters<typeof db.payment.create>[0]["data"]
}
