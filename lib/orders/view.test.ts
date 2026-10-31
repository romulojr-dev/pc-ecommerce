import { describe, expect, it } from "vitest"

import { type OrderPageItem, orderEntries } from "./view"

// docs/specs/030-place-an-order: V8, V9 (the grouping behind the page)

const single = (name: string): OrderPageItem => ({
  name,
  unitPrice: 100,
  quantity: 2,
  buildId: null,
  slot: null,
})
const part = (buildId: string, slot: string, price: number): OrderPageItem => ({
  name: `${slot} part`,
  unitPrice: price,
  quantity: 1,
  buildId,
  slot,
})

describe("orderEntries", () => {
  it("keeps singles as lines and gathers a build's parts where its first was", () => {
    const entries = orderEntries([
      single("a"),
      part("b1", "cpu", 1_000),
      single("b"),
      part("b1", "gpu", 2_000),
    ])

    expect(entries.map((e) => e.kind)).toEqual(["single", "build", "single"])
    const group = entries[1]
    expect(group.kind === "build" && group.parts.map((p) => p.slot)).toEqual([
      "cpu",
      "gpu",
    ])
    expect(group.kind === "build" && group.total).toBe(3_000)
  })

  it("leaves one group unnumbered and numbers two or more", () => {
    const one = orderEntries([part("b1", "cpu", 1)])
    expect(one[0].kind === "build" && one[0].number).toBeNull()

    const two = orderEntries([
      part("b1", "cpu", 1),
      part("b2", "cpu", 1),
      part("b1", "gpu", 1),
    ])
    expect(two.map((e) => (e.kind === "build" ? e.number : "single"))).toEqual([
      1, 2,
    ])
  })

  it("is empty for no items", () => {
    expect(orderEntries([])).toEqual([])
  })

  it("counts a part's quantity in the group total", () => {
    const entries = orderEntries([
      { ...part("b1", "memory", 500), quantity: 2 },
    ])
    expect(entries[0].kind === "build" && entries[0].total).toBe(1_000)
  })
})
