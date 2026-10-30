import { describe, expect, it } from "vitest"

import type { City } from "@/lib/psgc/types"

import {
  cleanName,
  codeFromCell,
  PsgcConvertError,
  type Row,
  toFiles,
  transformPsgc,
} from "./transform"

// docs/specs/028-shipping-data-and-fee-rules, Converter C1–C8. Rows are in
// the workbook's shape: 10-digit code, name, level (null on PSA's two "not a
// province" parents).
const row = (code: string, name: string, level: string | null): Row => ({
  code,
  name,
  level,
})

const options = {
  version: "2026Q3",
  publishedOn: "2026-09-30",
  source: "2026Q3.xlsx",
  independentCityProvinces: { "0730600000": "0702200000" },
}

// Region VII with Cebu province (and a municipality), an independent City of
// Cebu with trailing spaces, and NCR with Manila (two districts) and Pateros
const rows: Row[] = [
  row("1300000000", "National Capital Region (NCR)", "Reg"),
  row("1380600000", "City of Manila", "City"),
  row("1380601000", "Tondo I/II", "SubMun"),
  row("1380601001", "Barangay 1", "Bgy"),
  row("1380601002", "Barangay 2", "Bgy"),
  row("1380601003", "Barangay 3", "Bgy"),
  row("1380602000", "Binondo", "SubMun"),
  row("1380602001", "Barangay 287", "Bgy"),
  row("1380602002", "Barangay 288", "Bgy"),
  row("1381701000", "Pateros", "Mun"),
  row("1381701001", "Aguho ", "Bgy"),
  row("0700000000", "Region VII (Central Visayas)", "Reg"),
  row("0702200000", "Cebu", "Prov"),
  row("0702201000", "Alcantara", "Mun"),
  row("0702201001", "Lawaan", "Bgy"),
  row("0730600000", "City of Cebu ", "City"),
  row("0730600001", "Adlaon", "Bgy"),
]

describe("cleanName", () => {
  it("C2: trims surrounding spaces", () => {
    expect(cleanName("City of Cebu ")).toBe("City of Cebu")
    expect(cleanName("Zone 6 Pob. ")).toBe("Zone 6 Pob.")
    expect(cleanName(" Santa Elena ")).toBe("Santa Elena")
  })

  it("C3: removes a trailing footnote marker, and only that", () => {
    expect(cleanName("City of Lucenaa/")).toBe("City of Lucena")
    expect(cleanName("Tondo I/II")).toBe("Tondo I/II")
    expect(cleanName("City of Lucenaa/ ")).toBe("City of Lucena")
  })

  it("C4: drops (Not a Province)", () => {
    expect(cleanName("City of Isabela (Not a Province)")).toBe(
      "City of Isabela"
    )
  })
})

describe("codeFromCell", () => {
  it("restores the leading zero of a code stored as a number", () => {
    expect(codeFromCell(730600000)).toBe("0730600000")
    expect(codeFromCell(1731500000)).toBe("1731500000")
    expect(codeFromCell("0702200000")).toBe("0702200000")
  })

  it("gives null for anything that isn't a code", () => {
    expect(codeFromCell("As noted by the PSA Board")).toBeNull()
    expect(codeFromCell("a/")).toBeNull()
    expect(codeFromCell(1.5)).toBeNull()
    expect(codeFromCell(-1)).toBeNull()
    expect(codeFromCell(12345678901)).toBeNull()
    expect(codeFromCell(null)).toBeNull()
    expect(codeFromCell("")).toBeNull()
  })
})

describe("transformPsgc", () => {
  const out = transformPsgc(rows, options)
  const cityIn = (provinceCode: string, code: string): City | undefined =>
    out.cities.get(provinceCode)?.find((c) => c.code === code)

  it("C1: keeps all of Manila's barangays under the city, no district level", () => {
    const manila = cityIn("1300000000", "1380600000")
    expect(manila && "barangays" in manila && manila.barangays).toEqual([
      { code: "1380601001", name: "Barangay 1" },
      { code: "1380601002", name: "Barangay 2" },
      { code: "1380601003", name: "Barangay 3" },
      { code: "1380602001", name: "Barangay 287" },
      { code: "1380602002", name: "Barangay 288" },
    ])
    expect(JSON.stringify([...out.cities])).not.toContain("Tondo")
  })

  it("C2: writes trimmed names", () => {
    const pateros = cityIn("1300000000", "1381701000")
    expect(pateros && "barangays" in pateros && pateros.barangays[0].name).toBe(
      "Aguho"
    )
    expect(cityIn("0730600000", "0730600000")?.name).toBe("City of Cebu")
  })

  it("C5: gives a region with no province a pseudo-province holding the cities", () => {
    expect(out.provinces.get("1300000000")).toEqual([
      { code: "1300000000", name: "Metro Manila", kind: "pseudo" },
    ])
    expect(out.cities.get("1300000000")?.map((c) => c.code)).toEqual([
      "1380600000",
      "1381701000",
    ])
  })

  it("C6: makes an independent city its own pseudo-province and lists it in its province", () => {
    expect(out.provinces.get("0700000000")).toEqual([
      { code: "0702200000", name: "Cebu", kind: "province" },
      { code: "0730600000", name: "City of Cebu", kind: "pseudo" },
    ])
    expect(out.cities.get("0730600000")).toEqual([
      {
        code: "0730600000",
        name: "City of Cebu",
        barangays: [{ code: "0730600001", name: "Adlaon" }],
      },
    ])
    expect(out.cities.get("0702200000")).toEqual([
      {
        code: "0702201000",
        name: "Alcantara",
        barangays: [{ code: "0702201001", name: "Lawaan" }],
      },
      { code: "0730600000", name: "City of Cebu", independent: true },
    ])
  })

  it("counts places once and records the version", () => {
    expect(out.manifest).toEqual({
      version: "2026Q3",
      publishedOn: "2026-09-30",
      source: "2026Q3.xlsx",
      counts: { regions: 2, provinces: 3, cities: 4, barangays: 8 },
    })
  })

  it("C8: reports every name it changed beyond trimming, and counts the trims", () => {
    const changed = transformPsgc(
      [
        row("0400000000", "Region IV-A (CALABARZON)", "Reg"),
        row("0405600000", "Quezon", "Prov"),
        row("0431200000", "City of Lucenaa/", "City"),
        row("0431200001", "Barangay I ", "Bgy"),
      ],
      {
        ...options,
        independentCityProvinces: { "0431200000": "0405600000" },
      }
    )
    expect(changed.cleaned).toEqual([
      { from: "City of Lucenaa/", to: "City of Lucena" },
    ])
    expect(changed.trimmed).toBe(1)
  })

  it("is deterministic: the same rows give the same files", () => {
    const again = toFiles(transformPsgc(rows, options))
    expect(again).toEqual(toFiles(out))
    expect(Object.keys(again).sort()).toEqual([
      "cities/0702200000.json",
      "cities/0730600000.json",
      "cities/1300000000.json",
      "manifest.json",
      "provinces/0700000000.json",
      "provinces/1300000000.json",
      "regions.json",
    ])
    expect(again["regions.json"].endsWith("]\n")).toBe(true)
    expect(again["regions.json"]).not.toMatch(/\s{2}|\n./)
  })
})

describe("transformPsgc errors (C7)", () => {
  const withRows = (extra: Row[]) => () =>
    transformPsgc([...rows, ...extra], options)

  it("stops on a barangay with no parent city, naming the code and name", () => {
    expect(withRows([row("0799900001", "Orphan", "Bgy")])).toThrow(
      /0799900001 Orphan/
    )
  })

  it("stops on an unknown level", () => {
    expect(withRows([row("0702202000", "Alegria", "Dist")])).toThrow(
      PsgcConvertError
    )
  })

  it("stops on a duplicate code", () => {
    expect(withRows([row("0702201001", "Lawaan again", "Bgy")])).toThrow(
      /duplicate/i
    )
  })

  it("stops on an independent city the map doesn't know", () => {
    expect(
      withRows([
        row("0731300000", "City of Mandaue", "City"),
        row("0731300001", "Alang-alang", "Bgy"),
      ])
    ).toThrow(/0731300000 City of Mandaue/)
  })

  it("stops when the map names a city that isn't independent in the data", () => {
    expect(() =>
      transformPsgc(rows, {
        ...options,
        independentCityProvinces: {
          ...options.independentCityProvinces,
          "0799900000": "0702200000",
        },
      })
    ).toThrow(/0799900000/)
  })
})
