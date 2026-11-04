import { describe, expect, it } from "vitest"

import {
  codFallbackText,
  codHint,
  codOptionName,
  codPlaceNote,
  codReasonText,
} from "./copy"

// docs/specs/038-cash-on-delivery, §5
const ctx = (over = {}) => ({
  pickup: false,
  regionName: "Mindanao (Davao Region)",
  limit: 5_000_000,
  total: 7_501_000,
  ...over,
})

describe("COD copy", () => {
  it("names the option by fulfillment", () => {
    expect(codOptionName(false)).toBe("Cash on delivery")
    expect(codOptionName(true)).toBe("Pay on pickup")
  })

  it("says what the shopper pays and where", () => {
    expect(codHint(false, 2_311_000)).toBe(
      "Pay ₱23,110.00 in cash when your order arrives."
    )
    expect(codHint(true, 579_500)).toBe(
      "Pay ₱5,795.00 at the store when you collect your order."
    )
  })

  it("says how long parts are held and that the email confirms", () => {
    expect(codPlaceNote(24)).toBe(
      "Your parts are held for 24 hours after you place your order. Confirm your order from the email we send you, or it is cancelled."
    )
    expect(codPlaceNote(1)).toContain("held for 1 hour after")
  })

  it.each([
    [
      { offered: false, reason: "disabled" },
      ctx(),
      "Cash on delivery isn't available right now.",
    ],
    [
      { offered: false, reason: "disabled" },
      ctx({ pickup: true }),
      "Pay on pickup isn't available right now.",
    ],
    [
      { offered: false, reason: "pickup-off" },
      ctx({ pickup: true }),
      "Pay on pickup isn't available right now.",
    ],
    [
      { offered: false, reason: "zone" },
      ctx(),
      "Cash on delivery isn't available in Mindanao (Davao Region).",
    ],
    [
      { offered: false, reason: "no-total" },
      ctx(),
      "Cash on delivery isn't available until we can deliver to this address.",
    ],
    [
      { offered: false, reason: "over-limit", overBy: 2_501_000 },
      ctx(),
      "Cash on delivery is for orders up to ₱50,000.00. Your total is ₱75,010.00.",
    ],
  ] as const)("explains %j", (reason, context, text) => {
    expect(codReasonText(reason, context)).toBe(text)
  })

  it("adds the switch to online payment after a saved choice falls away", () => {
    expect(codFallbackText("Cash on delivery isn't available right now.")).toBe(
      "Cash on delivery isn't available right now. We've switched you to online payment."
    )
  })
})
