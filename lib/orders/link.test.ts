import { describe, expect, it } from "vitest"

import { orderLink, savedOrderLink } from "./link"

// docs/specs/030-place-an-order, Behavior 16; docs/specs/031-pay-with-xendit,
// Behavior 12

const KEY = "abc_DEF-123"

describe("orderLink", () => {
  it("puts the number in the path and the key in the query", () => {
    expect(orderLink("PCS-7KQ2M9XD", KEY)).toBe(
      `/orders/PCS-7KQ2M9XD?key=${KEY}`
    )
  })
})

describe("savedOrderLink", () => {
  it.each(["return", "cancelled", "error"])("drops payment=%s", (payment) => {
    expect(
      savedOrderLink(
        `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${KEY}&payment=${payment}`
      )
    ).toBe(`https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${KEY}`)
  })

  it("leaves a plain order link alone", () => {
    const href = `https://pcsilicon.example/orders/PCS-7KQ2M9XD?key=${KEY}`
    expect(savedOrderLink(href)).toBe(href)
  })
})
