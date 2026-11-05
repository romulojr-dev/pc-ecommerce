import { describe, expect, it } from "vitest"

import {
  shipFieldErrors,
  TRANSITION_MESSAGES,
  transitionInputSchema,
} from "./transition-input"

const base = {
  orderNumber: "PCS-7K3M9QXA",
  expectedStatus: "PROCESSING",
  to: "SHIPPED",
}

describe("the courier and tracking number (R5, E5)", () => {
  it("accepts a plain courier and tracking number", () => {
    expect(
      shipFieldErrors({
        courier: "J&T Express",
        trackingNumber: "JT-1234/AB.5",
      })
    ).toEqual({})
  })

  it("asks for both when empty", () => {
    expect(shipFieldErrors({ courier: "  ", trackingNumber: "" })).toEqual({
      courier: TRANSITION_MESSAGES.courierRequired,
      trackingNumber: TRANSITION_MESSAGES.trackingRequired,
    })
  })

  it.each([
    ["a 1-character courier", { courier: "L", trackingNumber: "12345678" }],
    [
      "a 41-character courier",
      { courier: "a".repeat(41), trackingNumber: "12345678" },
    ],
    [
      "a courier with a symbol",
      { courier: "LBC <b>", trackingNumber: "12345678" },
    ],
  ])("refuses %s", (_n, input) => {
    expect(shipFieldErrors(input).courier).toBe(
      TRANSITION_MESSAGES.courierInvalid
    )
  })

  it.each([
    ["a space inside", "12 34"],
    ["3 characters", "123"],
    ["41 characters", "1".repeat(41)],
    ["a line break", "1234\n5678"],
    ["a symbol", "1234#5678"],
  ])("refuses a tracking number with %s", (_n, trackingNumber) => {
    expect(
      shipFieldErrors({ courier: "LBC", trackingNumber }).trackingNumber
    ).toBe(TRANSITION_MESSAGES.trackingInvalid)
  })

  it("trims what is typed", () => {
    const parsed = transitionInputSchema.parse({
      ...base,
      courier: "  LBC ",
      trackingNumber: " 123456784821 ",
    })
    expect(parsed).toMatchObject({
      courier: "LBC",
      trackingNumber: "123456784821",
    })
  })
})

describe("the transition input", () => {
  it("requires both parcel fields for Shipped", () => {
    expect(transitionInputSchema.safeParse(base).success).toBe(false)
    expect(
      transitionInputSchema.safeParse({ ...base, courier: "LBC" }).success
    ).toBe(false)
  })

  it("refuses parcel fields for any other move, and unknown keys", () => {
    const processing = { ...base, to: "READY_FOR_PICKUP" }
    expect(transitionInputSchema.safeParse(processing).success).toBe(true)
    expect(
      transitionInputSchema.safeParse({ ...processing, courier: "LBC" }).success
    ).toBe(false)
    expect(
      transitionInputSchema.safeParse({ ...processing, extra: 1 }).success
    ).toBe(false)
  })

  it("refuses a target staff can't reach and a malformed number or status", () => {
    for (const to of ["PAID", "CANCELLED", "REFUNDED", ""]) {
      expect(transitionInputSchema.safeParse({ ...base, to }).success).toBe(
        false
      )
    }
    expect(
      transitionInputSchema.safeParse({ ...base, orderNumber: "x" }).success
    ).toBe(false)
    expect(
      transitionInputSchema.safeParse({ ...base, expectedStatus: "BOGUS" })
        .success
    ).toBe(false)
  })
})
