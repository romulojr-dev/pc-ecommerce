import { describe, expect, test } from "vitest"

import type { BuildItem } from "@/lib/builder"

import { contentHashOf } from "./build-share-hash"

// docs/specs/022-share-build, Rules › Canonical form, E57–E60

const items: BuildItem[] = [
  { slot: "storage", productId: "d2", quantity: 1 },
  { slot: "cpu", productId: "c1", quantity: 1 },
  { slot: "storage", productId: "d1", quantity: 2 },
]

// SHA-256 of [["cpu","c1",1],["storage","d1",2],["storage","d2",1]]
const E57_HASH =
  "ee9da0e314b30c967e6461e1f2a7b4ad39ff848b921b354f4a5f7ff316a615dc"

describe("contentHashOf", () => {
  test("is the SHA-256 hex of the canonical text (E57)", () => {
    expect(contentHashOf(items)).toBe(E57_HASH)
  })

  test("is 64 lowercase hex characters", () => {
    expect(contentHashOf(items)).toMatch(/^[0-9a-f]{64}$/)
  })

  test("is the same in every order (E58)", () => {
    expect(contentHashOf([items[2], items[0], items[1]])).toBe(E57_HASH)
    expect(contentHashOf([...items].reverse())).toBe(E57_HASH)
  })

  test("differs when a quantity differs (E60)", () => {
    const changed = items.map((item) =>
      item.productId === "d1" ? { ...item, quantity: 3 } : item
    )
    expect(contentHashOf(changed)).not.toBe(E57_HASH)
  })
})
