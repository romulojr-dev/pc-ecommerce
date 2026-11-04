import { describe, expect, it } from "vitest"

import { MIN_ONLINE_TOTAL } from "@/lib/payments/amount"

import { VOUCHER_COPY, voucherAppliedText, voucherRefusalText } from "./copy"

// docs/specs/037-vouchers-at-checkout, §5
describe("voucher copy", () => {
  it("has one text per refusal", () => {
    expect(voucherRefusalText({ reason: "unknown" })).toBe(VOUCHER_COPY.unknown)
    expect(voucherRefusalText({ reason: "not-started" })).toBe(
      "That code isn't active yet."
    )
    expect(voucherRefusalText({ reason: "ended" })).toBe("That code has ended.")
    expect(voucherRefusalText({ reason: "used-up" })).toBe(
      "That code has been used up."
    )
  })

  it("names the amount still to spend", () => {
    expect(voucherRefusalText({ reason: "min-spend", shortBy: 420_500 })).toBe(
      "Spend ₱4,205.00 more to use this code."
    )
  })

  it("names the floor from the constant the rule uses (O7)", () => {
    expect(MIN_ONLINE_TOTAL).toBe(2_000)
    expect(voucherRefusalText({ reason: "below-minimum" })).toBe(
      "This code would bring your total below ₱20.00, the least we can take online. Add to your cart or use another code."
    )
  })

  it("shows the applied code", () => {
    expect(voucherAppliedText("WELCOME10")).toBe("WELCOME10 applied")
  })
})
