import { describe, expect, it } from "vitest"

import { countFacet } from "./facets"
import { listingFilters } from "./index"
import type { Facet, FacetRow } from "./types"

// countFacet with the real filters' facets (docs/specs/013-spec-filters,
// "Option counts")

function facetOf(slug: string, key: string): Facet {
  const facet = listingFilters(slug).find((filter) => filter.key === key)?.facet
  if (!facet) throw new Error(`${slug}.${key} has no facet`)
  return facet
}

const row = (specs: unknown, brand = "alpha"): FacetRow => ({
  specs,
  brand: { slug: brand, name: brand.toUpperCase() },
  category: { slug: "cpu", name: "CPU" },
})

describe("countFacet", () => {
  it("offers the scope's values in option order, counted in the other rows", () => {
    const facet = facetOf("motherboard", "socket")
    const scope = [
      row({ socket: "LGA1700" }),
      row({ socket: "AM5" }),
      row({ socket: "AM5" }),
    ]
    expect(countFacet(facet, scope, scope.slice(1))).toEqual([
      { value: "AM5", label: "AM5", count: 2 },
      { value: "LGA1700", label: "LGA1700", count: 0 },
    ])
  })

  it("counts each list value once per product", () => {
    const facet = facetOf("cpu-cooler", "supportedSockets")
    const rows = [
      row({ supportedSockets: ["AM5", "AM4", "AM5"] }),
      row({ supportedSockets: ["AM5"] }),
    ]
    expect(countFacet(facet, rows, rows)).toEqual([
      { value: "AM4", label: "AM4", count: 1 },
      { value: "AM5", label: "AM5", count: 2 },
    ])
  })

  it("sorts numbers as numbers and labels them with their unit", () => {
    const facet = facetOf("storage", "capacityGb")
    const rows = [row({ capacityGb: 2000 }), row({ capacityGb: 500 })]
    expect(countFacet(facet, rows, rows)).toEqual([
      { value: "500", label: "500 GB", count: 1 },
      { value: "2000", label: "2 TB", count: 1 },
    ])
  })

  it("skips products without the field, and counts only true booleans", () => {
    const radiator = facetOf("cpu-cooler", "radiatorSizeMm")
    const coolers = [row({ type: "AIR" }), row({ radiatorSizeMm: 240 })]
    expect(countFacet(radiator, coolers, coolers)).toEqual([
      { value: "240", label: "240 mm", count: 1 },
    ])

    const wifi = facetOf("motherboard", "hasWifi")
    const boards = [row({ hasWifi: true }), row({ hasWifi: false })]
    expect(countFacet(wifi, boards, boards)).toEqual([
      { value: "1", label: "Wi-Fi", count: 1 },
    ])
  })

  it("names brands and sorts them by name", () => {
    const facet = facetOf("gpu", "brand")
    const rows = [row({}, "zotac"), row({}, "asus"), row({}, "asus")]
    expect(countFacet(facet, rows, rows)).toEqual([
      { value: "asus", label: "ASUS", count: 2 },
      { value: "zotac", label: "ZOTAC", count: 1 },
    ])
  })

  it("has no options without rows", () => {
    expect(countFacet(facetOf("gpu", "vramGb"), [], [])).toEqual([])
  })
})
