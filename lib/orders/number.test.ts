import { describe, expect, it } from "vitest"

import {
  newOrderNumber,
  ORDER_NUMBER_ALPHABET,
  orderNumberShape,
} from "./number"

// docs/specs/030-place-an-order: U1, U2

describe("newOrderNumber", () => {
  it("is PCS- and 8 Crockford characters, never I, L, O or U (U1)", () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const number = newOrderNumber()
      expect(number).toMatch(/^PCS-[0-9A-HJKMNP-TV-Z]{8}$/)
      expect(number.slice(4)).not.toMatch(/[ILOU]/)
      seen.add(number)
    }
    expect(seen.size).toBe(1000)
  })

  it("has 32 symbols, so 5 bits each", () => {
    expect(ORDER_NUMBER_ALPHABET).toHaveLength(32)
    expect(new Set(ORDER_NUMBER_ALPHABET).size).toBe(32)
  })

  it("draws from the given source", () => {
    expect(newOrderNumber(() => 0)).toBe("PCS-00000000")
    expect(newOrderNumber(() => 31)).toBe("PCS-ZZZZZZZZ")
    let n = 0
    expect(newOrderNumber(() => n++)).toBe("PCS-01234567")
  })
})

describe("orderNumberShape (U2)", () => {
  it("accepts a well-formed number", () => {
    expect(orderNumberShape("PCS-7K3M9QXZ")).toBe(true)
  })

  it.each([
    "pcs-7k3m9qxz",
    "PCS-7K3M9QX",
    "PCS-7K3M9QXZ1",
    "PCS-IIIIIIII",
    "PCS-OOOOOOOO",
    "",
    "pcs 12345678",
    "PCS7K3M9QXZ",
    " PCS-7K3M9QXZ",
  ])("refuses %j", (value) => {
    expect(orderNumberShape(value)).toBe(false)
  })

  it("refuses what isn't text", () => {
    expect(orderNumberShape(undefined)).toBe(false)
    expect(orderNumberShape(["PCS-7K3M9QXZ"])).toBe(false)
  })
})
