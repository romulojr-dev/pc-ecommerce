import { describe, expect, it } from "vitest"

import {
  checkEmailText,
  COD_ORDER_COPY,
  codConfirmedText,
  confirmLead,
  confirmPayLine,
  paymentOptionText,
} from "./copy"

// docs/specs/038-cash-on-delivery, §5; O1a, O1b
// 2026-11-05 10:00 in Manila
const EXPIRES = new Date("2026-11-05T02:00:00Z")

describe("cash order copy", () => {
  it("O1a: tells the shopper to check their email, from where, and when the order cancels itself", () => {
    expect(checkEmailText("orders@mail.pcsilicon.tech", EXPIRES)).toBe(
      "Check your email (from orders@mail.pcsilicon.tech) to confirm this order. If it doesn't arrive, the order cancels itself at Thu 5 Nov 2026, 10:00 AM and you can place a new one."
    )
  })

  it("O1b: names whatever sender it is given", () => {
    expect(checkEmailText("shop@example.com", EXPIRES)).toContain(
      "(from shop@example.com)"
    )
  })

  it("names the payment option by fulfillment", () => {
    expect(paymentOptionText(false)).toBe("Cash on delivery")
    expect(paymentOptionText(true)).toBe("Pay on pickup")
  })

  it("says what to pay and where, once confirmed", () => {
    expect(codConfirmedText(2_311_000, false)).toBe(
      "You confirmed this order. Pay ₱23,110.00 in cash when it arrives."
    )
    expect(codConfirmedText(579_500, true)).toBe(
      "You confirmed this order. Pay ₱5,795.00 in cash when you collect it."
    )
  })

  it("has the confirm page's lead and pay lines", () => {
    expect(confirmLead("PCS-7KQ2M9XD", EXPIRES)).toBe(
      "Order PCS-7KQ2M9XD. Confirm it to keep your parts reserved until Thu 5 Nov 2026, 10:00 AM."
    )
    expect(confirmPayLine(2_311_000, false)).toBe(
      "You'll pay ₱23,110.00 in cash when your order arrives."
    )
    expect(confirmPayLine(579_500, true)).toBe(
      "You'll pay ₱5,795.00 in cash at the store when you collect it."
    )
  })

  it("has the not-confirmed-in-time text", () => {
    expect(COD_ORDER_COPY.cancelledNotConfirmed).toBe(
      "This order was cancelled because it wasn't confirmed in time. Place a new order if you still want these parts."
    )
  })
})
