import { describe, expect, test } from "vitest"

import {
  addBuildInputSchema,
  addInputSchema,
  removeBuildInputSchema,
  removeInputSchema,
  setInputSchema,
} from "./input"

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

// docs/specs/026-add-build-to-cart, Behavior 9.1, E7, E21, E22
describe("addBuildInputSchema", () => {
  const ok = accepts(addBuildInputSchema)
  const items = [{ slot: "cpu", productId: "p1", quantity: 1 }]

  test("accepts items and a list of acknowledged keys", () => {
    expect(ok({ items, acknowledgedWarnings: [] })).toBe(true)
    expect(ok({ items, acknowledgedWarnings: ["psu-wattage:psu/p1"] })).toBe(
      true
    )
  })

  test("E7, E22: drops everything else the client sends", () => {
    expect(
      addBuildInputSchema.parse({
        items,
        acknowledgedWarnings: [],
        status: "ok",
        issues: [],
        cartId: "other",
        contentHash: "forged",
      })
    ).toEqual({ items, acknowledgedWarnings: [] })
  })

  test("a missing list means nothing was acknowledged", () => {
    expect(addBuildInputSchema.parse({ items }).acknowledgedWarnings).toEqual(
      []
    )
  })

  test("leaves the items for shareInput to check", () => {
    expect(ok({ items: "not a list", acknowledgedWarnings: [] })).toBe(true)
  })

  test.each([
    "x",
    5,
    { 0: "a" },
    [1],
    [null],
    Array.from({ length: 51 }, () => "k"),
    ["x".repeat(201)],
  ])("E21: rejects acknowledgedWarnings %j", (acknowledgedWarnings) =>
    expect(ok({ items, acknowledgedWarnings })).toBe(false)
  )

  test("accepts exactly 50 keys of exactly 200 characters", () => {
    expect(
      ok({
        items,
        acknowledgedWarnings: Array.from({ length: 50 }, () => "k".repeat(200)),
      })
    ).toBe(true)
  })

  test.each([null, "x", 5, []])("rejects %j", (input) =>
    expect(ok(input)).toBe(false)
  )
})

describe("removeBuildInputSchema", () => {
  const ok = accepts(removeBuildInputSchema)

  test("needs a build id", () => {
    expect(ok({ buildId: "b1" })).toBe(true)
    expect(ok({ buildId: "" })).toBe(false)
    expect(ok({ buildId: "x".repeat(65) })).toBe(false)
    expect(ok({})).toBe(false)
  })

  test("drops a cart id", () => {
    expect(
      removeBuildInputSchema.parse({ buildId: "b1", cartId: "other" })
    ).toEqual({ buildId: "b1" })
  })
})
