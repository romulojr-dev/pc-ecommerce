import { describe, expect, it } from "vitest"

import { methodName, paidLine } from "./copy"

// docs/specs/032-payment-webhooks: V10, V11

const PAID_AT = new Date("2026-11-01T07:05:00Z")

describe("paidLine", () => {
  it.each([
    ["GCASH", "Paid on Sun 1 Nov 2026, 3:05 PM with GCash."],
    ["PAYMAYA", "Paid on Sun 1 Nov 2026, 3:05 PM with Maya."],
    ["CARDS", "Paid on Sun 1 Nov 2026, 3:05 PM with a card."],
    ["FAKE", "Paid on Sun 1 Nov 2026, 3:05 PM with the test payment page."],
    ["QRPH", "Paid on Sun 1 Nov 2026, 3:05 PM."],
    [null, "Paid on Sun 1 Nov 2026, 3:05 PM."],
  ])("%s → %s", (method, text) => {
    expect(paidLine(PAID_AT, method)).toBe(text)
  })

  it("doesn't name an inherited property as a method", () => {
    expect(methodName("toString")).toBeNull()
  })
})
