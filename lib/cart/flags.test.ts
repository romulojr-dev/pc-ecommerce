import { describe, expect, test } from "vitest"

import { sharedBuildView } from "@/lib/build-state/shared"
import type { StockStatus } from "@/lib/stock"
import { buildA, seed } from "@/test-support/seed-parts"
import { partsOf, snapshot } from "@/test-support/shared-snapshot"

import {
  flaggedCount,
  type FlagProduct,
  groupPartFlags,
  productFlags,
  setToQuantity,
} from "./flags"

// docs/specs/027-cart-stock-flags, §3 E1–E9, E13, E16–E20: the flag logic,
// from lines and stock

const product = (
  stock: number,
  status: StockStatus = "in-stock",
  active = true
): FlagProduct => ({ active, status, stock })

const flagsOf = (
  lines: { productId: string; quantity: number }[],
  products: Record<string, FlagProduct>
) => productFlags(lines, new Map(Object.entries(products)))

describe("productFlags", () => {
  test("E1: a single line and a group over the stock are both counted", () => {
    const flags = flagsOf(
      [
        { productId: "7600", quantity: 2 },
        { productId: "7600", quantity: 1 },
      ],
      { "7600": product(2) }
    )
    expect(flags.get("7600")).toEqual({
      kind: "over-stock",
      stock: 2,
      total: 3,
    })
  })

  test("E4, E9: at or under the stock there is no flag", () => {
    const lines = [
      { productId: "7600", quantity: 3 },
      { productId: "7600", quantity: 1 },
    ]
    expect(flagsOf(lines, { "7600": product(5) }).size).toBe(0)
    // Total 4 against a stock of 4: the boundary
    expect(flagsOf(lines, { "7600": product(4) }).size).toBe(0)
    expect(flagsOf(lines, { "7600": product(3) }).size).toBe(1)
  })

  test("E3, E10, E11, E12: each unavailable reason has its own label", () => {
    const lines = [
      { productId: "a", quantity: 1 },
      { productId: "b", quantity: 1 },
      { productId: "c", quantity: 1 },
    ]
    const flags = flagsOf(lines, {
      a: product(0, "out-of-stock"),
      b: product(12, "pre-order"),
      c: product(12, "in-stock", false),
    })
    expect(flags.get("a")).toEqual({ kind: "out-of-stock" })
    expect(flags.get("b")).toEqual({ kind: "pre-order" })
    expect(flags.get("c")).toEqual({ kind: "retired" })
  })

  test("a retired product reads retired whatever its stock", () => {
    const flags = flagsOf([{ productId: "a", quantity: 1 }], {
      a: product(0, "out-of-stock", false),
    })
    expect(flags.get("a")).toEqual({ kind: "retired" })
  })

  test("E13: unavailable beats over stock, never 'Only 0 in stock'", () => {
    const flags = flagsOf(
      [
        { productId: "7600", quantity: 1 },
        { productId: "7600", quantity: 1 },
      ],
      { "7600": product(0, "out-of-stock") }
    )
    expect(flags.get("7600")).toEqual({ kind: "out-of-stock" })
  })

  test("low stock is not a flag by itself", () => {
    expect(
      flagsOf([{ productId: "a", quantity: 2 }], {
        a: product(4, "low-stock"),
      }).size
    ).toBe(0)
  })

  test("E8: a memory kit counts its quantity", () => {
    const flags = flagsOf(
      [
        { productId: "kit", quantity: 2 },
        { productId: "kit", quantity: 2 },
      ],
      { kit: product(3) }
    )
    expect(flags.get("kit")).toEqual({
      kind: "over-stock",
      stock: 3,
      total: 4,
    })
  })

  test("a product with no data is skipped, and others are unaffected", () => {
    const flags = flagsOf(
      [
        { productId: "gone", quantity: 5 },
        { productId: "a", quantity: 1 },
      ],
      { a: product(1) }
    )
    expect(flags.size).toBe(0)
  })

  test("E7: two groups share a product", () => {
    const flags = flagsOf(
      [
        { productId: "cooler", quantity: 1 },
        { productId: "cooler", quantity: 1 },
      ],
      { cooler: product(1) }
    )
    expect(flags.get("cooler")).toEqual({
      kind: "over-stock",
      stock: 1,
      total: 2,
    })
  })

  test("a clean cart has no flags (E18)", () => {
    expect(productFlags([], new Map()).size).toBe(0)
  })
})

describe("setToQuantity", () => {
  const over = (stock: number, total: number) =>
    ({ kind: "over-stock", stock, total }) as const

  test("E1: stock 2, single 2 + group 1 → 1", () => {
    expect(setToQuantity(over(2, 3), 2)).toBe(1)
  })

  test("E5: no group → the stock", () => {
    expect(setToQuantity(over(2, 3), 3)).toBe(2)
  })

  test("E8: kit stock 3, single 2, group 2 → 1", () => {
    expect(setToQuantity(over(3, 4), 2)).toBe(1)
  })

  test("E6: the groups hold all the stock → no button", () => {
    expect(setToQuantity(over(1, 2), 1)).toBeNull()
  })

  test("E17: the groups hold more than the stock → no button", () => {
    expect(setToQuantity(over(1, 3), 2)).toBeNull()
  })

  test("only an over-stock flag has one", () => {
    expect(setToQuantity(null, 2)).toBeNull()
    expect(setToQuantity({ kind: "out-of-stock" }, 2)).toBeNull()
    expect(setToQuantity({ kind: "pre-order" }, 2)).toBeNull()
    expect(setToQuantity({ kind: "retired" }, 2)).toBeNull()
  })

  test("a stale flag that would raise the line gives no button", () => {
    // Others dropped since: n would be above the line's quantity
    expect(setToQuantity(over(5, 3), 3)).toBeNull()
  })
})

describe("groupPartFlags", () => {
  const slots = (options: Parameters<typeof snapshot>[1] = {}) =>
    sharedBuildView(snapshot(partsOf(buildA()), options)).slots

  test("E14, E16: flagged parts, in slot order", () => {
    const flags = productFlags(
      [
        { productId: seed.rtx4060.id, quantity: 1 },
        { productId: seed.ryzen5_7600.id, quantity: 1 },
      ],
      new Map([
        [seed.rtx4060.id, product(0, "out-of-stock")],
        [seed.ryzen5_7600.id, product(0, "out-of-stock")],
      ])
    )
    const parts = groupPartFlags(slots(), flags)
    expect(parts.map(({ name }) => name)).toEqual([
      seed.ryzen5_7600.name,
      seed.rtx4060.name,
    ])
    expect(parts.every(({ flag }) => flag.kind === "out-of-stock")).toBe(true)
  })

  test("E15: a retired row is flagged even when its product has no flag", () => {
    const parts = groupPartFlags(
      slots({ retired: [seed.lancool216] }),
      new Map()
    )
    expect(parts).toEqual([
      {
        productId: seed.lancool216.id,
        name: seed.lancool216.name,
        flag: { kind: "retired" },
      },
    ])
  })

  test("a clean group has none", () => {
    expect(groupPartFlags(slots(), new Map())).toEqual([])
  })

  test("E20: three reasons in one group", () => {
    const flags = productFlags(
      [
        { productId: seed.ryzen5_7600.id, quantity: 1 },
        { productId: seed.rtx4060.id, quantity: 1 },
        { productId: seed.peerless.id, quantity: 1 },
      ],
      new Map([
        [seed.ryzen5_7600.id, product(12, "in-stock", false)],
        [seed.rtx4060.id, product(0, "out-of-stock")],
        [seed.peerless.id, product(20, "pre-order")],
      ])
    )
    const parts = groupPartFlags(slots({ retired: [seed.ryzen5_7600] }), flags)
    expect(parts.map(({ flag }) => flag.kind).sort()).toEqual([
      "out-of-stock",
      "pre-order",
      "retired",
    ])
  })
})

describe("flaggedCount", () => {
  test("E17: a group counts once however many parts are flagged", () => {
    expect(
      flaggedCount([
        { kind: "single", flag: { kind: "out-of-stock" } },
        { kind: "build", flags: [1, 2, 3] },
        { kind: "single", flag: null },
      ])
    ).toBe(2)
  })

  test("E18: nothing flagged is 0", () => {
    expect(
      flaggedCount([
        { kind: "single", flag: null },
        { kind: "build", flags: [] },
      ])
    ).toBe(0)
    expect(flaggedCount([])).toBe(0)
  })
})
