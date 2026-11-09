import { describe, expect, test } from "vitest"

import {
  removeImageSchema,
  reorderImagesSchema,
  sameIds,
  setImageAltSchema,
} from "./input"

const id = (n: number) => `cm${String(n).padStart(23, "0")}`

describe("sameIds", () => {
  test("the same photos in any order", () => {
    expect(sameIds(["a", "b", "c"], ["c", "a", "b"])).toBe(true)
  })

  test("a missing, an extra, a foreign or a repeated photo is not the same", () => {
    expect(sameIds(["a", "b"], ["a", "b", "c"])).toBe(false)
    expect(sameIds(["a", "b", "c"], ["a", "b"])).toBe(false)
    expect(sameIds(["a", "b"], ["a", "x"])).toBe(false)
    expect(sameIds(["a", "b"], ["a", "a"])).toBe(false)
    expect(sameIds(["a", "a"], ["a", "a"])).toBe(false)
  })
})

describe("the transport schemas are strict", () => {
  test("reorder takes a product id and one to eight photo ids", () => {
    expect(
      reorderImagesSchema.safeParse({ productId: id(1), order: [id(2)] })
        .success
    ).toBe(true)
    expect(
      reorderImagesSchema.safeParse({ productId: id(1), order: [] }).success
    ).toBe(false)
    expect(
      reorderImagesSchema.safeParse({
        productId: id(1),
        order: Array.from({ length: 9 }, (_, n) => id(n)),
      }).success
    ).toBe(false)
  })

  test("a hand-made extra key is invalid", () => {
    expect(
      reorderImagesSchema.safeParse({
        productId: id(1),
        order: [id(2)],
        sortOrder: 5,
      }).success
    ).toBe(false)
    expect(
      setImageAltSchema.safeParse({ imageId: id(1), alt: "a", url: "x" })
        .success
    ).toBe(false)
    expect(
      removeImageSchema.safeParse({
        productId: id(1),
        imageId: id(2),
        shown: [id(2)],
        url: "x",
      }).success
    ).toBe(false)
  })

  test("ids must look like ids", () => {
    expect(
      setImageAltSchema.safeParse({ imageId: "X Y", alt: "a" }).success
    ).toBe(false)
    expect(
      setImageAltSchema.safeParse({ imageId: "../etc", alt: "a" }).success
    ).toBe(false)
  })

  test("alt text is only bounded in size here; the rule is validateAlt's", () => {
    expect(
      setImageAltSchema.safeParse({ imageId: id(1), alt: "" }).success
    ).toBe(true)
    expect(
      setImageAltSchema.safeParse({ imageId: id(1), alt: "x".repeat(1001) })
        .success
    ).toBe(false)
  })
})
