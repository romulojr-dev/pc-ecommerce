import { describe, expect, it } from "vitest"

import { zipSchema } from "./zip"

// docs/specs/028-shipping-data-and-fee-rules, V7, V8
describe("zipSchema", () => {
  it.each(["1100", "0900", "9999", "0000"])("V7: accepts %j", (zip) => {
    expect(zipSchema.parse(zip)).toBe(zip)
  })

  it.each(["110", "11000", "11 00", "abcd", "", " 1100", "1100 ", "１１００"])(
    "V8: rejects %j",
    (zip) => {
      expect(zipSchema.safeParse(zip).success).toBe(false)
    }
  )

  it("rejects a number, so a leading zero can't be lost", () => {
    expect(zipSchema.safeParse(1100).success).toBe(false)
    expect(zipSchema.safeParse(null).success).toBe(false)
  })
})
