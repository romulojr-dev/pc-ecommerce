import { describe, expect, test } from "vitest"

import { badgeText, cartCount, cartCountLabel } from "./count"

// docs/specs/025-cart-single-items, Behavior 12, 15, D7, E32, E39–E44
const single = (quantity: number) => ({ quantity, buildId: null })
const group = (buildId: string, parts = 8, kitQuantity = 1) =>
  Array.from({ length: parts }, (_, index) => ({
    quantity: index === 0 ? kitQuantity : 1,
    buildId,
  }))

describe("cartCount", () => {
  test("E39: empty", () => {
    expect(cartCount([])).toBe(0)
  })

  test("E40: units of one single line", () => {
    expect(cartCount([single(2)])).toBe(2)
  })

  test("E41: units add up across single lines", () => {
    expect(cartCount([single(2), single(1)])).toBe(3)
  })

  test("E42: a build group of 8 parts counts as 1", () => {
    expect(cartCount(group("a"))).toBe(1)
  })

  test("E43: a group with a kit × 2 is still 1; plus 2 single units", () => {
    expect(cartCount([...group("a", 8, 2), single(2)])).toBe(3)
  })

  test("E44: two groups and a single line: 2 + 1", () => {
    expect(cartCount([...group("a"), ...group("b"), single(1)])).toBe(3)
  })
})

describe("cartCountLabel", () => {
  test.each([
    [0, "Cart"],
    [1, "Cart, 1 item"],
    [2, "Cart, 2 items"],
    [150, "Cart, 150 items"],
  ])("%i → %s", (count, label) => expect(cartCountLabel(count)).toBe(label))
})

describe("badgeText", () => {
  test.each([
    [null, null],
    [0, null],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [150, "99+"],
  ])("%j → %j", (count, text) => expect(badgeText(count)).toBe(text))
})
