import { describe, expect, test } from "vitest"

import { isCartId, newCartId } from "./id"

// docs/specs/025-cart-single-items, Behavior 5, D3, E12, E51
describe("newCartId", () => {
  test("is 22 URL-safe characters, different every time", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newCartId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })
})

describe("isCartId", () => {
  test("accepts a made id", () => {
    expect(isCartId(newCartId())).toBe(true)
  })

  test.each([
    "",
    "x",
    "a".repeat(21),
    "a".repeat(23),
    "a".repeat(21) + "!",
    " " + "a".repeat(21),
  ])("rejects %j", (value) => expect(isCartId(value)).toBe(false))

  test.each([null, undefined, 5, {}])("rejects %j", (value) =>
    expect(isCartId(value)).toBe(false)
  )
})
