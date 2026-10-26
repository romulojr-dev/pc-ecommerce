import { describe, expect, it } from "vitest"

import { categoryHref, isCurrentCategory } from "@/lib/site"

describe("categoryHref", () => {
  it("links to the top-level category route", () => {
    expect(categoryHref("cpu-cooler")).toBe("/cpu-cooler")
  })
})

describe("isCurrentCategory", () => {
  it("matches the category page and its product pages", () => {
    expect(isCurrentCategory("/cpu", "cpu")).toBe(true)
    expect(isCurrentCategory("/cpu/amd-ryzen-5-7600", "cpu")).toBe(true)
  })

  it("does not match other routes or slugs sharing a prefix", () => {
    expect(isCurrentCategory("/", "cpu")).toBe(false)
    expect(isCurrentCategory("/cpu-cooler", "cpu")).toBe(false)
    expect(isCurrentCategory("/products", "cpu")).toBe(false)
  })
})
