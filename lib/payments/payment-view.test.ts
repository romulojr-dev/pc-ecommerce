import { describe, expect, it } from "vitest"

import type { OrderStatusName } from "@/lib/orders/timeline"

import { isPayable } from "./payable"
import { parsePaymentParam, paymentView } from "./payment-view"

// docs/specs/031-pay-with-xendit: V1–V9, V5a, V5b, A8, A9

const expiresAt = new Date("2026-11-02T07:00:00Z")
const at = (iso: string) => new Date(iso)
const HOURS_LEFT_23 = at("2026-11-01T08:00:00Z")

describe("paymentView", () => {
  it.each([
    ["no value", null, "pay"], // V1
    ["return", "return", "confirming"], // V2
    ["cancelled", "cancelled", "cancelled"], // V3
    ["error", "error", "error"], // V4
  ] as const)("Pending, 23 h left, %s → %s", (_, param, view) => {
    expect(
      paymentView("PENDING_PAYMENT", expiresAt, param, HOURS_LEFT_23)
    ).toBe(view)
  })

  it("is too late with 9 min 59 s left (V5)", () => {
    const now = at("2026-11-02T06:50:01Z")
    expect(paymentView("PENDING_PAYMENT", expiresAt, null, now)).toBe(
      "too-late"
    )
  })

  it("is payable with exactly 10 min left (V5a)", () => {
    const now = at("2026-11-02T06:50:00Z")
    expect(paymentView("PENDING_PAYMENT", expiresAt, null, now)).toBe("pay")
  })

  it("says too late rather than the open error with 9 min left (V5b)", () => {
    const now = at("2026-11-02T06:51:00Z")
    expect(paymentView("PENDING_PAYMENT", expiresAt, "error", now)).toBe(
      "too-late"
    )
    expect(paymentView("PENDING_PAYMENT", expiresAt, "cancelled", now)).toBe(
      "too-late"
    )
  })

  it("keeps confirming a return in the last minutes", () => {
    const now = at("2026-11-02T06:55:00Z")
    expect(paymentView("PENDING_PAYMENT", expiresAt, "return", now)).toBe(
      "confirming"
    )
  })

  it("is past due at expiresAt (V6)", () => {
    expect(paymentView("PENDING_PAYMENT", expiresAt, "return", expiresAt)).toBe(
      "past-due"
    )
  })

  it.each([
    ["PAID", "return"], // V7
    ["CANCELLED", "cancelled"], // V8
    ["REFUNDED", null],
  ] as const)("ignores the value when %s", (status, param) => {
    expect(paymentView(status, expiresAt, param, HOURS_LEFT_23)).toBe("none")
  })
})

describe("parsePaymentParam", () => {
  it.each(["return", "cancelled", "error"])("keeps %s", (value) => {
    expect(parsePaymentParam(value)).toBe(value)
  })

  it.each(["bogus", "", "RETURN", undefined, ["return"]])(
    "drops %j (V9)",
    (value) => {
      expect(parsePaymentParam(value)).toBeNull()
    }
  )
})

describe("isPayable", () => {
  it.each<[OrderStatusName, string, boolean]>([
    ["PENDING_PAYMENT", "2026-11-01T08:00:00Z", true],
    ["PENDING_PAYMENT", "2026-11-02T06:51:00Z", false], // A9
    ["CANCELLED", "2026-11-01T08:00:00Z", false], // A8
    ["PAID", "2026-11-01T08:00:00Z", false],
  ])("%s at %s → %s", (status, now, payable) => {
    expect(isPayable(status, expiresAt, at(now))).toBe(payable)
  })
})

// docs/specs/032-payment-webhooks: V14–V16e
describe("paymentView with the order's payments", () => {
  const expired = { latest: "expired", needsCheck: false } as const
  const pending = { latest: "pending", needsCheck: false } as const
  const check = { latest: "paid", needsCheck: true } as const

  it("offers Retry when the latest session expired (V14)", () => {
    expect(
      paymentView("PENDING_PAYMENT", expiresAt, null, HOURS_LEFT_23, expired)
    ).toBe("cancelled")
  })

  it("still confirms a return after an expired session (V14a)", () => {
    expect(
      paymentView(
        "PENDING_PAYMENT",
        expiresAt,
        "return",
        HOURS_LEFT_23,
        expired
      )
    ).toBe("confirming")
  })

  it("is too late with 9 min left even after an expired session (V14b)", () => {
    expect(
      paymentView(
        "PENDING_PAYMENT",
        expiresAt,
        null,
        at("2026-11-02T06:51:00Z"),
        expired
      )
    ).toBe("too-late")
  })

  it("offers Pay now with an open session (V15)", () => {
    expect(
      paymentView("PENDING_PAYMENT", expiresAt, null, HOURS_LEFT_23, pending)
    ).toBe("pay")
  })

  it.each([null, "return", "cancelled", "error"] as const)(
    "needs checking whatever the payment value (%s) (V16, V16a)",
    (param) => {
      expect(
        paymentView("PENDING_PAYMENT", expiresAt, param, HOURS_LEFT_23, check)
      ).toBe("needs-check")
    }
  )

  it.each(["2026-11-02T06:51:00Z", "2026-11-02T08:00:00Z"])(
    "needs checking at %s, near or past expiry (V16b)",
    (now) => {
      expect(
        paymentView("PENDING_PAYMENT", expiresAt, null, at(now), check)
      ).toBe("needs-check")
    }
  )

  it("needs checking on a cancelled order (V16d)", () => {
    expect(
      paymentView("CANCELLED", expiresAt, null, HOURS_LEFT_23, check)
    ).toBe("needs-check")
  })

  it("leaves a paid order's view alone (V16e)", () => {
    expect(paymentView("PAID", expiresAt, null, HOURS_LEFT_23, check)).toBe(
      "none"
    )
  })
})
