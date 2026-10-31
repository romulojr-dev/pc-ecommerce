import { describe, expect, it } from "vitest"

import { placeOrderInputSchema } from "./input"
import { newAccessToken, newIdempotencyKey } from "./secrets"

// docs/specs/030-place-an-order: P21 (extra fields), P22, P34

const details = {
  method: "pickup",
  contact: {
    email: "ana@example.com",
    name: "Ana Santos",
    mobile: "0917 123 4567",
  },
}
const valid = () => ({
  details,
  digest: "a".repeat(64),
  idempotencyKey: newIdempotencyKey(),
  accessToken: newAccessToken(),
})

describe("placeOrderInputSchema", () => {
  it("accepts a well-formed request and normalizes the mobile", () => {
    const parsed = placeOrderInputSchema.parse(valid())
    expect(parsed.details.contact.mobile).toBe("+639171234567")
  })

  it("drops fields it doesn't know (P21)", () => {
    const parsed = placeOrderInputSchema.parse({
      ...valid(),
      subtotal: 1,
      total: 1,
      status: "PAID",
      fee: 0,
      userId: "u1",
      cartId: "c1",
    })
    expect(Object.keys(parsed).sort()).toEqual([
      "accessToken",
      "details",
      "digest",
      "idempotencyKey",
    ])
  })

  it.each([
    ["a digest that isn't a hash", { digest: "x" }],
    ["a 64-character digest of z", { digest: "z".repeat(64) }],
    ["an uppercase digest", { digest: "A".repeat(64) }],
    ["a missing digest", { digest: undefined }],
    ["a short key", { idempotencyKey: newIdempotencyKey().slice(0, 21) }],
    ["a key of a token's length", { idempotencyKey: newAccessToken() }],
    ["a short token", { accessToken: newAccessToken().slice(0, 42) }],
    ["a token of a key's length", { accessToken: newIdempotencyKey() }],
    ["a non-canonical token", { accessToken: "A".repeat(42) + "B" }],
    ["missing details", { details: undefined }],
  ])("refuses %s", (_name, change) => {
    expect(
      placeOrderInputSchema.safeParse({ ...valid(), ...change }).success
    ).toBe(false)
  })

  it("refuses what isn't an object", () => {
    expect(placeOrderInputSchema.safeParse(null).success).toBe(false)
    expect(placeOrderInputSchema.safeParse("x".repeat(100_000)).success).toBe(
      false
    )
  })
})
