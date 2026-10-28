import { describe, expect, test } from "vitest"

import type { BuildItem, Slot } from "@/lib/builder"

import { planAdd } from "./plan-add"

// What Add to build does on the product page (docs/specs/020-builder-page,
// Behavior 19). Ids stand in for the seed parts named in each test.

const item = (slot: Slot, productId: string, quantity = 1): BuildItem => ({
  slot,
  productId,
  quantity,
})

// Build A, by stand-in ids (memory: Corsair Vengeance, stock 25; storage:
// Samsung 990 PRO, stock 30)
const buildA = (
  memory = 1,
  drives: BuildItem[] = [item("storage", "pro990")]
) => [
  item("cpu", "ryzen5_7600"),
  item("motherboard", "strixB650a"),
  item("memory", "vengeance", memory),
  ...drives,
  item("gpu", "rtx4060"),
  item("case", "lancool216"),
  item("psu", "mwe550"),
  item("cpu-cooler", "peerless"),
]

describe("planAdd", () => {
  test("adds to an empty slot (E20)", () => {
    expect(
      planAdd([], { slot: "cpu", productId: "ryzen5_7600", stock: 12 })
    ).toEqual({
      kind: "add",
    })
  })

  test("asks before replacing another CPU (E22)", () => {
    const items = [item("cpu", "ryzen5_7600")]
    expect(
      planAdd(items, { slot: "cpu", productId: "i5_14400f", stock: 20 })
    ).toEqual({
      kind: "confirm-replace",
      quantity: 1,
    })
  })

  test("leaves the same CPU alone (E24)", () => {
    const items = [item("cpu", "ryzen5_7600")]
    expect(
      planAdd(items, { slot: "cpu", productId: "ryzen5_7600", stock: 12 })
    ).toEqual({
      kind: "already",
    })
  })

  test("raises the same memory kit by one (E25)", () => {
    expect(
      planAdd(buildA(), { slot: "memory", productId: "vengeance", stock: 25 })
    ).toEqual({
      kind: "raise",
      quantity: 2,
    })
  })

  test("stops the same kit at its stock (E26)", () => {
    expect(
      planAdd(buildA(25), { slot: "memory", productId: "vengeance", stock: 25 })
    ).toEqual({
      kind: "at-stock",
      stock: 25,
    })
  })

  test("asks before replacing a kit, keeping its quantity (E27)", () => {
    expect(
      planAdd(buildA(2), { slot: "memory", productId: "flareX5", stock: 11 })
    ).toEqual({
      kind: "confirm-replace",
      quantity: 2,
    })
  })

  test("caps the kept quantity at the new kit's stock (E28)", () => {
    expect(
      planAdd(buildA(12), { slot: "memory", productId: "flareX5", stock: 11 })
    ).toEqual({
      kind: "confirm-replace",
      quantity: 11,
    })
  })

  test("keeps a quantity of 1 when replacing a single kit (E29)", () => {
    expect(
      planAdd(buildA(1), { slot: "memory", productId: "flareX5", stock: 11 })
    ).toEqual({
      kind: "confirm-replace",
      quantity: 1,
    })
  })

  test("adds a different drive as a new entry (E30)", () => {
    expect(
      planAdd(buildA(), { slot: "storage", productId: "mx500", stock: 18 })
    ).toEqual({
      kind: "add",
    })
  })

  test("raises the same drive by one (E31)", () => {
    expect(
      planAdd(buildA(), { slot: "storage", productId: "pro990", stock: 30 })
    ).toEqual({
      kind: "raise",
      quantity: 2,
    })
  })

  test("stops the same drive at its stock (E32)", () => {
    const items = buildA(1, [item("storage", "pro990", 30)])
    expect(
      planAdd(items, { slot: "storage", productId: "pro990", stock: 30 })
    ).toEqual({
      kind: "at-stock",
      stock: 30,
    })
  })

  const thirteenDrives = Array.from({ length: 13 }, (_, i) =>
    item("storage", `drive${i}`)
  )

  test("refuses a new drive when the build holds 20 products (E33)", () => {
    const items = buildA(1, thirteenDrives)
    expect(
      planAdd(items, { slot: "storage", productId: "mx500", stock: 18 })
    ).toEqual({
      kind: "full",
    })
  })

  test("still raises a drive in a full build", () => {
    const items = buildA(1, thirteenDrives)
    expect(
      planAdd(items, { slot: "storage", productId: "drive0", stock: 5 })
    ).toEqual({
      kind: "raise",
      quantity: 2,
    })
  })
})
