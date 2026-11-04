import { describe, expect, it } from "vitest"

import { confirmView } from "./cod-confirm-view"
import type { OrderStatusName, PaymentOptionName } from "./timeline"

// docs/specs/038-cash-on-delivery: U14
const EXPIRES = new Date("2026-11-05T02:00:00Z")
const BEFORE = new Date(EXPIRES.getTime() - 1)
const order = (
  status: OrderStatusName,
  paymentOption: PaymentOptionName = "COD"
) => ({
  status,
  expiresAt: EXPIRES,
  paymentOption,
})

describe("confirmView", () => {
  it("offers the button to a pending order with a live link, before the deadline", () => {
    expect(confirmView("ok", order("PENDING_CONFIRMATION"), BEFORE)).toBe(
      "confirm"
    )
  })

  it.each([
    "COD_CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "READY_FOR_PICKUP",
    "DELIVERED",
    "PICKED_UP",
  ] as const)("says already confirmed for %s", (status) => {
    expect(confirmView("ok", order(status), BEFORE)).toBe("confirmed")
  })

  it("still says confirmed once the link has expired", () => {
    expect(confirmView("expired", order("COD_CONFIRMED"), EXPIRES)).toBe(
      "confirmed"
    )
  })

  it("says cancelled for a cancelled order", () => {
    expect(confirmView("ok", order("CANCELLED"), BEFORE)).toBe("cancelled")
    expect(confirmView("expired", order("CANCELLED"), EXPIRES)).toBe(
      "cancelled"
    )
  })

  it("says cancelled at the deadline, before the release has run", () => {
    expect(confirmView("ok", order("PENDING_CONFIRMATION"), EXPIRES)).toBe(
      "cancelled"
    )
  })

  it("says cancelled when the link has expired but the row is still pending", () => {
    expect(confirmView("expired", order("PENDING_CONFIRMATION"), BEFORE)).toBe(
      "cancelled"
    )
  })

  it("is not found for a bad signature, whatever the order", () => {
    expect(confirmView("invalid", order("PENDING_CONFIRMATION"), BEFORE)).toBe(
      "not-found"
    )
    expect(confirmView("invalid", order("CANCELLED"), BEFORE)).toBe("not-found")
  })

  it("is not found for an unknown order", () => {
    expect(confirmView("ok", null, BEFORE)).toBe("not-found")
  })

  it("is not found for an online order, even with a valid signature", () => {
    expect(confirmView("ok", order("PENDING_PAYMENT", "ONLINE"), BEFORE)).toBe(
      "not-found"
    )
    expect(confirmView("ok", order("PAID", "ONLINE"), BEFORE)).toBe("not-found")
  })
})
