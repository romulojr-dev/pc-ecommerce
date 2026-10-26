import { describe, expect, it } from "vitest"

import { brandFilter } from "./brand"

const options = [
  { value: "amd", label: "AMD" },
  { value: "intel", label: "Intel" },
  { value: "msi", label: "MSI" },
]

describe("brandFilter.parse", () => {
  it("is inactive without a brand", () => {
    expect(brandFilter.parse({})).toBeNull()
    expect(brandFilter.parse({ brand: [] })).toBeNull()
  })

  it("reads one brand or several repeated ones", () => {
    expect(brandFilter.parse({ brand: "amd" })).toEqual(["amd"])
    expect(brandFilter.parse({ brand: ["intel", "amd"] })).toEqual([
      "amd",
      "intel",
    ])
  })

  it("keeps each brand once", () => {
    expect(brandFilter.parse({ brand: ["amd", "amd", "intel"] })).toEqual([
      "amd",
      "intel",
    ])
  })

  it.each(["", "AMD", "a b", "amd!", "../x", "amd,intel", "é"])(
    "ignores %j, which isn't slug-shaped",
    (value) => {
      expect(brandFilter.parse({ brand: value })).toBeNull()
      expect(brandFilter.parse({ brand: [value, "amd"] })).toEqual(["amd"])
    }
  )

  it("reads at most 20 brands", () => {
    const slugs = Array.from(
      { length: 30 },
      (_, i) => `b${String(i).padStart(2, "0")}`
    )
    const parsed = brandFilter.parse({ brand: slugs })
    expect(parsed).toHaveLength(20)
    expect(parsed).toEqual(slugs.slice(0, 20))
  })
})

describe("brandFilter.serialize", () => {
  it("writes one entry per brand", () => {
    expect(brandFilter.serialize(["amd", "intel"])).toEqual([
      ["brand", "amd"],
      ["brand", "intel"],
    ])
  })
})

describe("brandFilter.chips", () => {
  it("has one chip per brand, named after the option", () => {
    expect(brandFilter.chips(["amd", "intel"], options)).toEqual([
      { label: "Brand: AMD", without: ["intel"] },
      { label: "Brand: Intel", without: ["amd"] },
    ])
  })

  it("leaves nothing when the last brand is removed", () => {
    expect(brandFilter.chips(["msi"], options)).toEqual([
      { label: "Brand: MSI", without: null },
    ])
  })

  it("falls back to the slug for a brand that isn't an option", () => {
    expect(brandFilter.chips(["nope"], options)[0].label).toBe("Brand: nope")
  })
})

describe("brandFilter.normalize", () => {
  it("drops brands that aren't options", () => {
    expect(brandFilter.normalize(["amd", "nope"], options)).toEqual(["amd"])
    expect(brandFilter.normalize(["amd", "intel"], options)).toEqual([
      "amd",
      "intel",
    ])
  })

  it("is inactive when no brand is left", () => {
    expect(brandFilter.normalize(["nope"], options)).toBeNull()
  })
})
