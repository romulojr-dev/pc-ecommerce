import { describe, expect, it } from "vitest"

import { readPsgcJson } from "@/lib/psgc/files"
import type { Region } from "@/lib/psgc/types"

import { REGION_ZONE_CODES, SHIPPING_ZONES, zoneOfRegion } from "./zones"

// docs/specs/028-shipping-data-and-fee-rules, Z1–Z6 and Rules › Region → zone
// map. The expected table is the issue's, written out here on purpose.
const EXPECTED: Record<string, string> = {
  "13": "metro-manila", // NCR
  "14": "luzon", // CAR
  "01": "luzon", // I
  "02": "luzon", // II
  "03": "luzon", // III
  "04": "luzon", // IV-A
  "17": "luzon", // MIMAROPA
  "05": "luzon", // V
  "06": "visayas", // VI
  "18": "visayas", // NIR
  "07": "visayas", // VII
  "08": "visayas", // VIII
  "09": "mindanao", // IX
  "10": "mindanao", // X
  "11": "mindanao", // XI
  "12": "mindanao", // XII
  "16": "mindanao", // XIII
  "19": "mindanao", // BARMM
}

const regions = async () => (await readPsgcJson<Region[]>({ kind: "regions" }))!

describe("zoneOfRegion", () => {
  it("Z1, Z6: every region in the dataset has the expected zone", async () => {
    const list = await regions()
    expect(list).toHaveLength(18)
    for (const region of list) {
      expect(zoneOfRegion(region.code), region.name).toBe(
        EXPECTED[region.code.slice(0, 2)]
      )
    }
  })

  it("Z5: the map has no region the dataset lacks", async () => {
    const prefixes = (await regions()).map((r) => r.code.slice(0, 2)).sort()
    expect([...REGION_ZONE_CODES].sort()).toEqual(prefixes)
  })

  it("covers the four zones, and only those", () => {
    expect(new Set(Object.values(EXPECTED))).toEqual(new Set(SHIPPING_ZONES))
  })

  it("Z2, Z3: NCR is Metro Manila and NIR is Visayas", () => {
    expect(zoneOfRegion("1300000000")).toBe("metro-manila")
    expect(zoneOfRegion("1800000000")).toBe("visayas")
    expect(zoneOfRegion("1900000000")).toBe("mindanao")
    expect(zoneOfRegion("1700000000")).toBe("luzon")
  })

  it.each([
    "2000000000",
    "",
    "abc",
    "13",
    "130000000",
    "13000000000",
    "0000000000",
  ])("Z4: gives null for %j", (code) => {
    expect(zoneOfRegion(code)).toBeNull()
  })
})
