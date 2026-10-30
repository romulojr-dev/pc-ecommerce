import { describe, expect, test } from "vitest"

import { addInputSchema, removeInputSchema, setInputSchema } from "./input"

// docs/specs/025-cart-single-items, Rules › Input, E10, E11, E21
const accepts =
  (schema: { safeParse: (v: unknown) => { success: boolean } }) =>
  (input: unknown) =>
    schema.safeParse(input).success

describe("addInputSchema", () => {
  const ok = accepts(addInputSchema)

  test("accepts a product and a quantity from 1 to 99", () => {
    for (const quantity of [1, 2, 99]) {
      expect(ok({ productId: "p1", quantity })).toBe(true)
    }
  })

  test("E11: drops unknown keys, such as a cart id", () => {
    expect(
      addInputSchema.parse({ productId: "p1", quantity: 1, cartId: "other" })
    ).toEqual({ productId: "p1", quantity: 1 })
  })

  test.each([0, -1, 1.5, "2", 100, null, undefined, Number.NaN])(
    "E10: rejects quantity %j",
    (quantity) => expect(ok({ productId: "p1", quantity })).toBe(false)
  )

  test.each([
    {},
    { quantity: 1 },
    { productId: "", quantity: 1 },
    { productId: "x".repeat(65), quantity: 1 },
  ])("E10: rejects %j", (input) => expect(ok(input)).toBe(false))

  test.each([null, "x", 5, []])("E10: rejects %j", (input) =>
    expect(ok(input)).toBe(false)
  )
})

describe("setInputSchema and removeInputSchema", () => {
  test("E21: set rejects a bad quantity or an empty line id", () => {
    const ok = accepts(setInputSchema)
    for (const input of [
      { lineId: "l1", quantity: 0 },
      { lineId: "l1", quantity: -1 },
      { lineId: "l1", quantity: 1.5 },
      { lineId: "l1", quantity: 100 },
      { lineId: "", quantity: 1 },
    ]) {
      expect(ok(input)).toBe(false)
    }
    expect(ok({ lineId: "l1", quantity: 2 })).toBe(true)
  })

  test("remove needs a line id", () => {
    const ok = accepts(removeInputSchema)
    expect(ok({ lineId: "l1" })).toBe(true)
    expect(ok({ lineId: "" })).toBe(false)
    expect(ok({})).toBe(false)
  })
})
