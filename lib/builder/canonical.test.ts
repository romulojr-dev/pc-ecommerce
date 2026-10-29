import { describe, expect, test } from "vitest"

import { buildA } from "@/test-support/seed-parts"

import { canonicalItems, canonicalText } from "./canonical"
import { type BuildItem, toBuildItems } from "./parse"

// The canonical form of a build's items (docs/specs/022-share-build, Rules ›
// Canonical form). It is stored as a hash, so these expectations are a
// contract: change them only with a new ADR.

const items: BuildItem[] = [
  { slot: "storage", productId: "d2", quantity: 1 },
  { slot: "cpu", productId: "c1", quantity: 1 },
  { slot: "storage", productId: "d1", quantity: 2 },
]

describe("canonicalItems", () => {
  test("sorts by slot, then product id, as [slot, productId, quantity] (E57)", () => {
    expect(canonicalItems(items)).toEqual([
      ["cpu", "c1", 1],
      ["storage", "d1", 2],
      ["storage", "d2", 1],
    ])
  })

  test("sorts slots by their name, not the builder's slot order (E59)", () => {
    expect(
      canonicalText([
        { slot: "cpu", productId: "c1", quantity: 1 },
        { slot: "case", productId: "k1", quantity: 1 },
      ])
    ).toBe('[["case","k1",1],["cpu","c1",1]]')
  })

  test("compares ids as plain strings, not as numbers or with a locale", () => {
    const sorted = canonicalItems([
      { slot: "storage", productId: "b", quantity: 1 },
      { slot: "storage", productId: "a10", quantity: 1 },
      { slot: "storage", productId: "a2", quantity: 1 },
      { slot: "storage", productId: "B", quantity: 1 },
    ]).map(([, id]) => id)
    expect(sorted).toEqual(["B", "a10", "a2", "b"])
  })

  test("doesn't change the list it is given", () => {
    const copy = structuredClone(items)
    canonicalItems(items)
    expect(items).toEqual(copy)
  })

  test("is empty for no items", () => {
    expect(canonicalItems([])).toEqual([])
    expect(canonicalText([])).toBe("[]")
  })
})

describe("canonicalText", () => {
  test("is JSON with no whitespace (E57)", () => {
    expect(canonicalText(items)).toBe(
      '[["cpu","c1",1],["storage","d1",2],["storage","d2",1]]'
    )
  })

  test("is the same in every order (E58)", () => {
    const expected = canonicalText(items)
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]
    for (const order of permutations) {
      expect(canonicalText(order.map((index) => items[index]))).toBe(expected)
    }
  })

  test("changes with a quantity (E60)", () => {
    const changed = items.map((item) =>
      item.productId === "d1" ? { ...item, quantity: 3 } : item
    )
    expect(canonicalText(changed)).not.toBe(canonicalText(items))
  })

  test("is the same for build A however its drives were added (E3)", () => {
    const items = toBuildItems(buildA())
    expect(canonicalText([...items].reverse())).toBe(canonicalText(items))
  })

  test("leaves out any other property of an item (E18)", () => {
    const extra = { ...items[1], contentHash: "x" } as BuildItem
    expect(canonicalText([extra])).toBe('[["cpu","c1",1]]')
  })
})
