import { describe, expect, test } from "vitest"

import { type BuildItem, toBuildItems } from "@/lib/builder"
import { buildA, seed } from "@/test-support/seed-parts"

import { MAX_SHARE_QUANTITY, shareInput } from "./share"

// What the share action accepts (docs/specs/022-share-build, Rules ›
// Validating what the server receives, steps 1–4): E9–E14, E18

const item = (
  slot: BuildItem["slot"],
  productId: string,
  quantity = 1
): BuildItem => ({ slot, productId, quantity })

// Build A's 7 other parts plus `drives` different drives
function withDrives(drives: number): BuildItem[] {
  const others = toBuildItems(buildA()).filter(
    (entry) => entry.slot !== "storage"
  )
  const storage = Array.from({ length: drives }, (_, index) =>
    item("storage", `drive-${index}`)
  )
  return [...others, ...storage]
}

describe("shareInput", () => {
  test("accepts build A as it is (E1)", () => {
    const items = toBuildItems(buildA())
    expect(shareInput(items)).toEqual({ ok: true, items })
  })

  test("accepts a single part (E8)", () => {
    const items = [item("cpu", seed.ryzen5_7600.id)]
    expect(shareInput(items)).toEqual({ ok: true, items })
  })

  test("accepts 20 different products (E10)", () => {
    const items = withDrives(13)
    expect(items).toHaveLength(20)
    expect(shareInput(items)).toMatchObject({ ok: true })
  })

  test("rejects 21 items as too many, before looking at anything else (E11)", () => {
    const items = withDrives(14)
    expect(shareInput(items)).toEqual({ ok: false, reason: "too-many-parts" })
    // Even if they are all the same junk
    expect(shareInput(Array.from({ length: 21 }, () => null))).toEqual({
      ok: false,
      reason: "too-many-parts",
    })
  })

  test("rejects an empty list as empty (E9)", () => {
    expect(shareInput([])).toEqual({ ok: false, reason: "empty" })
  })

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", {}],
    ["a string", "cpu"],
    ["a number", 3],
  ])("rejects %s as invalid (E12)", (_name, input) => {
    expect(shareInput(input)).toEqual({ ok: false, reason: "invalid" })
  })

  test.each([
    ["an item with no productId", [{ slot: "cpu", quantity: 1 }]],
    ["an empty productId", [item("cpu", "")]],
    ["an unknown slot", [{ slot: "monitor", productId: "a", quantity: 1 }]],
    ["a null item", [null]],
    ["quantity 0", [item("memory", "a", 0)]],
    ["quantity -1", [item("memory", "a", -1)]],
    ["quantity 1.5", [item("memory", "a", 1.5)]],
    [
      "a quantity written as text",
      [{ slot: "memory", productId: "a", quantity: "2" }],
    ],
  ])("rejects %s as invalid (E12)", (_name, input) => {
    expect(shareInput(input)).toEqual({ ok: false, reason: "invalid" })
  })

  test("rejects what parseBuild would repair instead of repairing it (E13)", () => {
    // The same drive twice
    expect(shareInput([item("storage", "a"), item("storage", "a")])).toEqual({
      ok: false,
      reason: "invalid",
    })
    // Two CPUs
    expect(shareInput([item("cpu", "a"), item("cpu", "b")])).toEqual({
      ok: false,
      reason: "invalid",
    })
    // The CPU at quantity 2
    expect(shareInput([item("cpu", "a", 2)])).toEqual({
      ok: false,
      reason: "invalid",
    })
  })

  test("accepts quantity 99 and nothing above it (E14)", () => {
    expect(MAX_SHARE_QUANTITY).toBe(99)
    expect(shareInput([item("memory", "kit", 99)])).toMatchObject({ ok: true })
    expect(shareInput([item("memory", "kit", 100)])).toEqual({
      ok: false,
      reason: "quantity-too-high",
      slot: "memory",
      productId: "kit",
      max: 99,
    })
  })

  test("names the first item in slot order when several are too high (E14)", () => {
    expect(
      shareInput([item("storage", "drive", 500), item("memory", "kit", 100)])
    ).toMatchObject({ reason: "quantity-too-high", slot: "memory" })
  })

  test("treats a huge quantity as invalid, not as a number to cap (E14)", () => {
    expect(shareInput([item("memory", "kit", 1e20)])).toEqual({
      ok: false,
      reason: "invalid",
    })
  })

  test("keeps only slot, productId and quantity (E18)", () => {
    const withHash = [
      { slot: "cpu", productId: "a", quantity: 1, contentHash: "x" },
    ]
    expect(shareInput(withHash)).toEqual({
      ok: true,
      items: [item("cpu", "a")],
    })
  })
})
