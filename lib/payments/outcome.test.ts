import { describe, expect, it } from "vitest"

import type { OrderStatusName } from "@/lib/orders/timeline"

import {
  amountsMatch,
  completedOutcome,
  expiredOutcome,
  type ReceivedAmounts,
} from "./outcome"

// docs/specs/032-payment-webhooks, behavior 12–13 and 16

describe("completedOutcome", () => {
  it.each([
    ["PENDING_PAYMENT", true, "paid"],
    ["PENDING_PAYMENT", false, "mismatch"],
    ["CANCELLED", true, "late"],
    ["CANCELLED", false, "late"],
    ["REFUNDED", true, "late"],
    ["PAID", true, "second"],
    ["PAID", false, "second"],
    ["COD_CONFIRMED", true, "second"],
    ["PROCESSING", true, "second"],
    ["SHIPPED", true, "second"],
    ["READY_FOR_PICKUP", true, "second"],
    ["DELIVERED", true, "second"],
    ["PICKED_UP", true, "second"],
  ] satisfies [OrderStatusName, boolean, string][])(
    "%s, amounts match %s → %s",
    (status, match, outcome) => {
      expect(completedOutcome(status, match)).toBe(outcome)
    }
  )
})

describe("expiredOutcome", () => {
  it.each([
    ["PENDING", "expired"],
    ["EXPIRED", "already-applied"],
    ["PAID", "already-applied"],
    ["FAILED", "already-applied"],
  ] as const)("%s → %s", (status, outcome) => {
    expect(expiredOutcome(status)).toBe(outcome)
  })
})

describe("amountsMatch", () => {
  const P1: ReceivedAmounts = {
    sessionAmount: 2_311_000,
    sessionCurrency: "PHP",
    paymentAmount: 2_311_000,
    paymentCurrency: "PHP",
    rowAmount: 2_311_000,
    orderTotal: 2_311_000,
  }

  it("matches when every amount is the order's total in PHP (H1)", () => {
    expect(amountsMatch(P1)).toBe(true)
  })

  it.each([
    ["the session amount", { sessionAmount: 2_310_000 }], // H3
    ["the payment amount", { paymentAmount: 2_310_000 }],
    ["the row amount", { rowAmount: 2_310_000 }],
    ["the order total", { orderTotal: 2_310_000 }],
    ["the session currency", { sessionCurrency: "USD" }], // H3a
    ["the payment currency", { paymentCurrency: "USD" }],
    ["an unreadable session amount", { sessionAmount: null }],
    ["an unreadable payment amount", { paymentAmount: null }],
  ])("doesn't match when %s differs", (_, change) => {
    expect(amountsMatch({ ...P1, ...change })).toBe(false)
  })

  it("doesn't match two unreadable amounts", () => {
    expect(
      amountsMatch({ ...P1, sessionAmount: null, paymentAmount: null })
    ).toBe(false)
  })
})
