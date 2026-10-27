import { describe, expect, it } from "vitest"

import {
  isCanonicalQuery,
  listingHref,
  type ListingState,
  parseListingParams,
} from "@/lib/listing-params"
import { builderCategories, type FieldMeta } from "@/lib/specs"

import { commonFilters, listingFilters } from "./index"
import { specParamKeys } from "./spec"
import type { ListingFilter } from "./types"

// Spec filters (docs/specs/013-spec-filters), on the real metadata

// formatSpecValue joins a number and its unit with a non-breaking space
const nbsp = " "

function filterOf(slug: string, key: string): ListingFilter<unknown> {
  const filter = listingFilters(slug).find((filter) => filter.key === key)
  if (!filter) throw new Error(`${slug} has no ${key} filter`)
  return filter
}

const state = (filters: ListingState["filters"]): ListingState => ({
  sort: "newest",
  page: 1,
  filters,
})

describe("listingFilters", () => {
  it("lists the common filters, then the spec filters in metadata order", () => {
    expect(listingFilters("gpu").map((filter) => filter.key)).toEqual([
      "brand",
      "price",
      "inStock",
      "chipsetBrand",
      "chipset",
      "vramGb",
      "lengthMm",
    ])
  })

  it("has a spec filter for exactly the fields with a filter kind", () => {
    for (const [slug, { fields }] of Object.entries(builderCategories)) {
      const expected = Object.entries(fields as Record<string, FieldMeta>)
        .filter(([, meta]) => meta.filter)
        .map(([field]) => field)
      const specKeys = listingFilters(slug)
        .filter((filter) => filter.spec)
        .map((filter) => filter.key)
      expect(specKeys, slug).toEqual(expected)
    }
  })

  it("gives other categories the common filters only", () => {
    expect(listingFilters("monitor").map((filter) => filter.key)).toEqual(
      Object.keys(commonFilters)
    )
  })

  it("marks text fields for values filters", () => {
    expect(filterOf("gpu", "chipset").spec?.text).toBe(true)
    expect(filterOf("memory", "capacityGb").spec?.text).toBe(false)
  })
})

describe("URL keys", () => {
  // The common filters' keys, sort, page and search (story 4)
  const RESERVED = [
    "brand",
    "minPrice",
    "maxPrice",
    "inStock",
    "sort",
    "page",
    "q",
  ]

  it.each(Object.keys(builderCategories))(
    "%s: spec filter keys are unique and never reserved",
    (slug) => {
      const keys = listingFilters(slug).flatMap((filter) =>
        filter.spec ? specParamKeys(filter.spec.field, filter.spec.kind) : []
      )
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.filter((key) => RESERVED.includes(key))).toEqual([])
    }
  )

  it("names range bounds like the price filter", () => {
    expect(specParamKeys("vramGb", "range")).toEqual(["minVramGb", "maxVramGb"])
    expect(specParamKeys("socket", "enum")).toEqual(["socket"])
  })
})

describe("enum", () => {
  const socket = filterOf("motherboard", "socket")

  it("keeps known values once, in option order", () => {
    expect(socket.parse({ socket: ["LGA1700", "AM5", "AM5"] })).toEqual([
      "AM5",
      "LGA1700",
    ])
  })

  it("ignores unknown values and the wrong case", () => {
    expect(socket.parse({ socket: ["am5", "AM9", "__proto__"] })).toBeNull()
    expect(socket.parse({})).toBeNull()
  })

  it("writes a repeated key and labels chips with the option label", () => {
    expect(socket.serialize(["AM5", "LGA1700"])).toEqual([
      ["socket", "AM5"],
      ["socket", "LGA1700"],
    ])
    const formFactor = filterOf("motherboard", "formFactor")
    expect(formFactor.chips(["MICRO_ATX"], [])).toEqual([
      { label: "Form factor: Micro-ATX", without: null },
    ])
  })

  it("drops values the category doesn't have", () => {
    const options = [{ value: "AM5", label: "AM5" }]
    expect(socket.normalize!(["AM5", "LGA1700"], options)).toEqual(["AM5"])
    expect(socket.normalize!(["LGA1700"], options)).toBeNull()
  })
})

describe("contains", () => {
  const sockets = filterOf("cpu-cooler", "supportedSockets")

  it("parses like enum, in option order", () => {
    expect(sockets.parse({ supportedSockets: ["LGA1700", "AM4"] })).toEqual([
      "AM4",
      "LGA1700",
    ])
  })

  it("has a chip per value, each removing only itself", () => {
    expect(sockets.chips(["AM4", "AM5"], [])).toEqual([
      { label: "Socket support: AM4", without: ["AM5"] },
      { label: "Socket support: AM5", without: ["AM4"] },
    ])
  })
})

describe("values", () => {
  const capacity = filterOf("storage", "capacityGb")
  const chipset = filterOf("gpu", "chipset")

  it("takes whole numbers, sorted as numbers", () => {
    expect(capacity.parse({ capacityGb: ["2000", "500", "1000"] })).toEqual([
      "500",
      "1000",
      "2000",
    ])
  })

  it.each(["-1", "1.5", "01", "1e3", "", "abc", "12345678"])(
    "ignores the number %j",
    (value) => {
      expect(capacity.parse({ capacityGb: value })).toBeNull()
    }
  )

  it("labels numbers with their unit", () => {
    expect(capacity.chips(["2000"], [])[0].label).toBe(`Capacity: 2${nbsp}TB`)
  })

  it("takes trimmed text up to 60 characters, sorted A–Z", () => {
    expect(
      chipset.parse({ chipset: [" RX C ", "GeForce RTX 5070", "x".repeat(61)] })
    ).toEqual(["GeForce RTX 5070", "RX C"])
    expect(chipset.parse({ chipset: "   " })).toBeNull()
    expect(chipset.chips(["RX C"], [])[0].label).toBe("Chipset: RX C")
  })

  it("keeps at most 20 values", () => {
    const many = Array.from({ length: 25 }, (_, i) => String(i + 1))
    expect(capacity.parse({ capacityGb: many })).toHaveLength(20)
  })
})

describe("range", () => {
  const vram = filterOf("gpu", "vramGb")

  it("reads each bound alone and swaps them when reversed", () => {
    expect(vram.parse({ minVramGb: "12", maxVramGb: "16" })).toEqual({
      min: 12,
      max: 16,
    })
    expect(vram.parse({ minVramGb: "16", maxVramGb: "12" })).toEqual({
      min: 12,
      max: 16,
    })
    expect(vram.parse({ minVramGb: "abc", maxVramGb: "8" })).toEqual({
      min: null,
      max: 8,
    })
    expect(vram.parse({ minVramGb: "0" })).toBeNull()
    expect(vram.parse({ vramGb: "8" })).toBeNull()
  })

  it("writes min then max, only the bounds that are set", () => {
    expect(vram.serialize({ min: 12, max: null })).toEqual([
      ["minVramGb", "12"],
    ])
    expect(vram.serialize({ min: 12, max: 16 })).toEqual([
      ["minVramGb", "12"],
      ["maxVramGb", "16"],
    ])
  })

  it("has one chip in the field's unit", () => {
    const label = (min: number | null, max: number | null) =>
      vram.chips({ min, max }, [])[0].label
    expect(label(12, 16)).toBe(`VRAM: 12${nbsp}GB – 16${nbsp}GB`)
    expect(label(12, null)).toBe(`VRAM: from 12${nbsp}GB`)
    expect(label(null, 16)).toBe(`VRAM: up to 16${nbsp}GB`)
    expect(label(16, 16)).toBe(`VRAM: 16${nbsp}GB`)
    // Base units in the URL, the large unit in the chip
    const boost = filterOf("cpu", "boostClockMhz")
    expect(boost.chips({ min: 5000, max: null }, [])[0].label).toBe(
      `Boost clock: from 5${nbsp}GHz`
    )
  })
})

describe("boolean", () => {
  const wifi = filterOf("motherboard", "hasWifi")

  it("is on for 1 only", () => {
    expect(wifi.parse({ hasWifi: "1" })).toBe(true)
    expect(wifi.parse({ hasWifi: "true" })).toBeNull()
    expect(wifi.serialize(true)).toEqual([["hasWifi", "1"]])
    expect(wifi.chips(true, [])).toEqual([{ label: "Wi-Fi", without: null }])
  })
})

describe("listing URL with spec filters", () => {
  const filtered = state({
    brand: ["asus"],
    chipsetBrand: ["NVIDIA"],
    vramGb: { min: 12, max: null },
  })
  const href = "/gpu?brand=asus&chipsetBrand=NVIDIA&minVramGb=12"

  it("writes common filters first, then spec filters in metadata order", () => {
    expect(listingHref("gpu", filtered)).toBe(href)
  })

  it("round-trips with the parser", () => {
    expect(
      parseListingParams("gpu", {
        minVramGb: "12",
        chipsetBrand: "NVIDIA",
        brand: "asus",
      })
    ).toEqual(filtered)
    expect(
      isCanonicalQuery(
        "gpu",
        { brand: "asus", chipsetBrand: "NVIDIA", minVramGb: "12" },
        filtered
      )
    ).toBe(true)
  })

  it("ignores non-filterable fields and other categories' fields", () => {
    // boardPowerW isn't filterable; socket and threads belong to other categories
    const parsed = parseListingParams("gpu", {
      boardPowerW: "300",
      socket: "AM5",
      threads: "8",
      constructor: "x",
    })
    expect(parsed.filters).toEqual({})
    expect(isCanonicalQuery("gpu", { boardPowerW: "300" }, parsed)).toBe(false)
  })
})
