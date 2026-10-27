import { describe, expect, it } from "vitest"

import { onSaleFilter } from "./on-sale"

describe("onSaleFilter", () => {
  it("is on only for 1", () => {
    expect(onSaleFilter.parse({ onSale: "1" })).toBe(true)
    expect(onSaleFilter.parse({ onSale: ["1", "0"] })).toBe(true)
  })

  it.each(["0", "true", "yes", "on", "", "01", " 1"])(
    "is off for %j",
    (value) => {
      expect(onSaleFilter.parse({ onSale: value })).toBeNull()
    }
  )

  it("is off when missing", () => {
    expect(onSaleFilter.parse({})).toBeNull()
    expect(onSaleFilter.parse({ onSale: ["0", "1"] })).toBeNull()
  })

  it("writes onSale=1", () => {
    expect(onSaleFilter.serialize()).toEqual([["onSale", "1"]])
  })

  it("has one chip that turns it off", () => {
    expect(onSaleFilter.chips()).toEqual([{ label: "On sale", without: null }])
  })
})
