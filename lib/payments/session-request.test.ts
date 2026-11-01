import { describe, expect, it } from "vitest"

import { toProviderAmount } from "./amount"
import {
  returnUrl,
  sessionRequest,
  type SessionContext,
} from "./session-request"

// docs/specs/031-pay-with-xendit: S1, S2, S4–S8

const TOKEN = "A".repeat(43)
const order = {
  id: "cord1",
  orderNumber: "PCS-7KQ2M9XD",
  total: 2_311_000,
  // Placed 2026-11-01T07:00:00Z with a 24-hour hold
  expiresAt: new Date("2026-11-02T07:00:00Z"),
}
const context: SessionContext = {
  siteUrl: "https://pcsilicon.example",
  accessToken: TOKEN,
  environment: "production",
  attempt: 1,
  now: new Date("2026-11-01T07:00:00Z"),
}

describe("sessionRequest", () => {
  it("builds the first attempt's request (S1)", () => {
    const result = sessionRequest(order, context)
    expect(result).toEqual({
      ok: true,
      input: {
        referenceId: "PCS-7KQ2M9XD-1",
        amountCentavos: 2_311_000,
        currency: "PHP",
        description: "PC Silicon order PCS-7KQ2M9XD",
        metadata: {
          order_id: "cord1",
          order_number: "PCS-7KQ2M9XD",
          environment: "production",
        },
        successUrl: `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=return`,
        cancelUrl: `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=cancelled`,
        expiresAt: new Date("2026-11-02T07:00:00.000Z"),
      },
    })
    // What Xendit receives for that total
    expect(toProviderAmount(2_311_000)).toBe(23110)
  })

  it("numbers each attempt (S2)", () => {
    const result = sessionRequest(order, { ...context, attempt: 3 })
    expect(result.ok && result.input.referenceId).toBe("PCS-7KQ2M9XD-3")
  })

  it.each(["development", "preview"] as const)(
    "carries the %s environment (S4, S5)",
    (environment) => {
      const result = sessionRequest(order, { ...context, environment })
      expect(result.ok && result.input.metadata.environment).toBe(environment)
    }
  )

  it("accepts exactly 10 minutes left (S6)", () => {
    const now = new Date("2026-11-02T06:50:00Z")
    const result = sessionRequest(order, { ...context, now })
    expect(result.ok && result.input.expiresAt).toEqual(order.expiresAt)
  })

  it("refuses under 10 minutes left (S7)", () => {
    const now = new Date("2026-11-02T06:50:01Z")
    expect(sessionRequest(order, { ...context, now })).toEqual({
      ok: false,
      reason: "expired",
    })
  })

  it("caps a longer hold at 24 hours (S8)", () => {
    const long = { ...order, expiresAt: new Date("2026-11-03T07:00:00Z") }
    const result = sessionRequest(long, context)
    expect(result.ok && result.input.expiresAt).toEqual(
      new Date("2026-11-02T07:00:00Z")
    )
  })

  it("never sends shopper details (D6)", () => {
    const result = sessionRequest(order, context)
    expect(Object.keys(result.ok ? result.input : {}).sort()).toEqual([
      "amountCentavos",
      "cancelUrl",
      "currency",
      "description",
      "expiresAt",
      "metadata",
      "referenceId",
      "successUrl",
    ])
  })
})

describe("returnUrl", () => {
  it("ignores a trailing slash on the site URL", () => {
    expect(
      returnUrl("https://pcsilicon.example/", "PCS-7KQ2M9XD", TOKEN, "error")
    ).toBe(
      `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=error`
    )
  })
})
