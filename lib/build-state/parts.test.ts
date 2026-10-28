import { describe, expect, test } from "vitest"

import type { BuildItem, Slot } from "@/lib/builder"

import {
  builderPartsQuerySchema,
  capProducts,
  MAX_BUILD_PRODUCTS,
} from "./parts"

// Cuid-shaped ids, like Product.id
const id = (n: number) => `cm${String(n).padStart(23, "0")}`

const parse = (ids: string | null) => builderPartsQuerySchema.safeParse(ids)

// docs/specs/020-builder-page, Rules › Parts request
describe("builderPartsQuerySchema", () => {
  test("splits a comma-separated list into ids", () => {
    expect(parse(`${id(1)},${id(2)}`).data).toEqual([id(1), id(2)])
  })

  test("takes 20 ids (E40)", () => {
    const ids = Array.from({ length: MAX_BUILD_PRODUCTS }, (_, i) => id(i))
    expect(parse(ids.join(",")).success).toBe(true)
  })

  test("refuses 21 ids (E41)", () => {
    const ids = Array.from({ length: MAX_BUILD_PRODUCTS + 1 }, (_, i) => id(i))
    expect(parse(ids.join(",")).success).toBe(false)
  })

  test.each([
    ["no parameter", null],
    ["an empty parameter", ""],
  ])("refuses %s (E42)", (_, value) => {
    expect(parse(value).success).toBe(false)
  })

  test("refuses an empty id in the list (E43)", () => {
    expect(parse(`${id(1)},,${id(2)}`).success).toBe(false)
  })

  test.each([
    ["a path", "../admin"],
    ["markup", "<script>"],
    ["upper case", "CM0000000000000000000000001"],
    ["200 characters", "c".repeat(200)],
  ])(
    "refuses an id that isn't shaped like a product id: %s (E44)",
    (_, bad) => {
      expect(parse(`${id(1)},${bad}`).success).toBe(false)
    }
  )

  test("refuses duplicate ids (E45)", () => {
    expect(parse(`${id(1)},${id(1)}`).success).toBe(false)
  })
})

const item = (slot: Slot, n: number): BuildItem => ({
  slot,
  productId: id(n),
  quantity: 1,
})

// One part in each slot other than storage
const others: BuildItem[] = [
  item("cpu", 1),
  item("motherboard", 2),
  item("memory", 3),
]
const tail: BuildItem[] = [
  item("gpu", 4),
  item("case", 5),
  item("psu", 6),
  item("cpu-cooler", 7),
]
const drives = (count: number) =>
  Array.from({ length: count }, (_, i) => item("storage", 100 + i))

// docs/specs/020-builder-page, Rules › Store
describe("capProducts", () => {
  test("keeps a build of 20 different products", () => {
    const items = [...others, ...drives(13), ...tail]
    expect(capProducts(items)).toEqual(items)
  })

  test("drops the last drives past 20, keeping every other slot (E56)", () => {
    const items = [...others, ...drives(14), ...tail]
    expect(capProducts(items)).toEqual([...others, ...drives(13), ...tail])
  })

  test("counts products, not units", () => {
    const items = [...others, { ...item("storage", 100), quantity: 30 }]
    expect(capProducts(items)).toEqual(items)
  })
})
