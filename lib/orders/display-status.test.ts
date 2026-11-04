import { describe, expect, it } from "vitest"

import { displayStatus } from "./display-status"

// docs/specs/038-cash-on-delivery: U12
const EXPIRES = new Date("2026-11-05T02:00:00Z")

describe("displayStatus", () => {
  it("U12: Pending confirmation reads Pending until the deadline, Cancelled from it", () => {
    const order = {
      status: "PENDING_CONFIRMATION",
      expiresAt: EXPIRES,
    } as const
    expect(displayStatus(order, new Date(EXPIRES.getTime() - 1))).toBe(
      "PENDING_CONFIRMATION"
    )
    expect(displayStatus(order, EXPIRES)).toBe("CANCELLED")
  })

  it("U12: Pending payment follows the same rule", () => {
    const order = { status: "PENDING_PAYMENT", expiresAt: EXPIRES } as const
    expect(displayStatus(order, new Date(EXPIRES.getTime() - 1))).toBe(
      "PENDING_PAYMENT"
    )
    expect(displayStatus(order, EXPIRES)).toBe("CANCELLED")
  })

  it("U12: COD confirmed never expires, whatever the date", () => {
    const order = { status: "COD_CONFIRMED", expiresAt: EXPIRES } as const
    const later = new Date(EXPIRES.getTime() + 30 * 86_400_000)
    expect(displayStatus(order, later)).toBe("COD_CONFIRMED")
  })

  it.each([
    "PAID",
    "PROCESSING",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ] as const)("leaves %s alone", (status) => {
    const later = new Date(EXPIRES.getTime() + 86_400_000)
    expect(displayStatus({ status, expiresAt: EXPIRES }, later)).toBe(status)
  })
})
