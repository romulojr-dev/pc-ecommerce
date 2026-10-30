import { describe, expect, test } from "vitest"

import { type BuildNeed, buildShortages } from "./build-stock"

// docs/specs/026-add-build-to-cart, Rules › Stock (all or nothing), E14–E20
const need = (
  productId: string,
  name: string,
  slot: BuildNeed["slot"],
  needs = 1
): BuildNeed => ({ productId, name, slot, needs })

const ryzen = need("cpu1", "AMD Ryzen 5 7600", "cpu")
const kit = need("mem1", "Corsair Vengeance DDR5-6000 32 GB", "memory", 2)
const ssd = need("ssd1", "Samsung 990 PRO 1TB NVMe SSD", "storage")

describe("buildShortages", () => {
  test("nothing short when every total fits", () => {
    expect(
      buildShortages(
        [ryzen, kit],
        new Map([["cpu1", 0]]),
        new Map([
          ["cpu1", 12],
          ["mem1", 25],
        ])
      )
    ).toEqual([])
  })

  test("E14: one in stock, one already in the cart", () => {
    expect(
      buildShortages([ryzen], new Map([["cpu1", 1]]), new Map([["cpu1", 1]]))
    ).toEqual([
      {
        productId: "cpu1",
        name: "AMD Ryzen 5 7600",
        stock: 1,
        inCart: 1,
        needs: 1,
        limit: "stock",
      },
    ])
  })

  test("E15: 2 of 3 is fine", () => {
    expect(
      buildShortages([ssd], new Map([["ssd1", 1]]), new Map([["ssd1", 3]]))
    ).toEqual([])
  })

  test("E16: exactly the stock is fine, and a kit counts its quantity", () => {
    expect(buildShortages([kit], new Map(), new Map([["mem1", 2]]))).toEqual([])
  })

  test("E17: the kit × 2 with one already in the cart", () => {
    const [short] = buildShortages(
      [kit],
      new Map([["mem1", 1]]),
      new Map([["mem1", 2]])
    )
    expect(short).toMatchObject({ stock: 2, inCart: 1, needs: 2 })
  })

  test("E18: nothing in the cart, but the build needs more than the stock", () => {
    const [short] = buildShortages([kit], new Map(), new Map([["mem1", 1]]))
    expect(short).toMatchObject({ stock: 1, inCart: 0, needs: 2 })
  })

  test("E19: every short product, in slot order and not input order", () => {
    const shortages = buildShortages(
      [ssd, ryzen],
      new Map([
        ["cpu1", 1],
        ["ssd1", 1],
      ]),
      new Map([
        ["cpu1", 1],
        ["ssd1", 1],
      ])
    )
    expect(shortages.map((short) => short.name)).toEqual([
      "AMD Ryzen 5 7600",
      "Samsung 990 PRO 1TB NVMe SSD",
    ])
  })

  test("drives in one slot go by name, A to Z", () => {
    const mx500 = need("ssd2", "Crucial MX500", "storage")
    const shortages = buildShortages([ssd, mx500], new Map(), new Map())
    expect(shortages.map((short) => short.name)).toEqual([
      "Crucial MX500",
      "Samsung 990 PRO 1TB NVMe SSD",
    ])
  })

  test("98 in the cart plus 1 reaches 99 and fits", () => {
    expect(
      buildShortages([ryzen], new Map([["cpu1", 98]]), new Map([["cpu1", 500]]))
    ).toEqual([])
  })

  test("E20: 99 decides when stock is above it", () => {
    const [short] = buildShortages(
      [ryzen],
      new Map([["cpu1", 99]]),
      new Map([["cpu1", 500]])
    )
    expect(short).toMatchObject({ stock: 500, inCart: 99, limit: "max" })
  })

  test("at exactly 99 in stock, the stock is the limit", () => {
    const [short] = buildShortages(
      [ryzen],
      new Map([["cpu1", 99]]),
      new Map([["cpu1", 99]])
    )
    expect(short.limit).toBe("stock")
  })

  test("a product with no stock entry counts as 0 in stock", () => {
    const [short] = buildShortages([ryzen], new Map(), new Map())
    expect(short).toMatchObject({ stock: 0, inCart: 0 })
  })
})
