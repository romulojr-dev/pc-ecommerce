import { beforeAll, describe, expect, it } from "vitest"

import { readPsgcJson, readPsgcText } from "./files"
import { independentCityProvinces } from "./independent-cities"
import type { City, Manifest, Province, Region } from "./types"
import { PSGC_VERSION } from "./version"

// Integrity of the committed 2026Q3 files (docs/specs/028-shipping-data-and-
// fee-rules, A1–A10, A12–A17). The numbers are the 2026Q3 publication's; a
// new quarter updates them on purpose.

type Full = Extract<City, { barangays: unknown }>
const isFull = (city: City): city is Full => "barangays" in city

let manifest: Manifest
let regions: Region[]
const provinces = new Map<string, Province[]>() // region code → provinces
const cities = new Map<string, City[]>() // province code → cities

const allProvinces = () => [...provinces.values()].flat()
const allCities = () => [...cities.values()].flat()
const fullCities = () => allCities().filter(isFull)
const provinceOf = (code: string) =>
  allProvinces().find((province) => province.code === code)
const citiesOf = (provinceCode: string) => cities.get(provinceCode) ?? []

beforeAll(async () => {
  manifest = (await readPsgcJson<Manifest>({ kind: "manifest" }))!
  regions = (await readPsgcJson<Region[]>({ kind: "regions" }))!
  for (const region of regions) {
    const list = await readPsgcJson<Province[]>({
      kind: "provinces",
      code: region.code,
    })
    expect(list, `provinces/${region.code}.json`).not.toBeNull()
    provinces.set(region.code, list!)
    for (const province of list!) {
      const places = await readPsgcJson<City[]>({
        kind: "cities",
        code: province.code,
      })
      expect(places, `cities/${province.code}.json`).not.toBeNull()
      cities.set(province.code, places!)
    }
  }
})

describe("counts and version", () => {
  it("A1: the files match the manifest and the 2026Q3 publication", () => {
    const counted = {
      regions: regions.length,
      provinces: allProvinces().length,
      cities: fullCities().length,
      barangays: fullCities().reduce((sum, c) => sum + c.barangays.length, 0),
    }
    expect(counted).toEqual(manifest.counts)
    // 82 provinces + 20 pseudo-provinces; 149 cities + 1,493 municipalities
    expect(counted).toEqual({
      regions: 18,
      provinces: 102,
      cities: 1642,
      barangays: 42010,
    })
    expect(allProvinces().filter((p) => p.kind === "province")).toHaveLength(82)
    expect(allProvinces().filter((p) => p.kind === "pseudo")).toHaveLength(20)
  })

  it("A12: the manifest names the version the code and the folder use", () => {
    expect(manifest.version).toBe(PSGC_VERSION)
    expect(manifest.publishedOn).toBe("2026-09-30")
    expect(manifest.source).toBe(`${PSGC_VERSION}.xlsx`)
  })
})

describe("the quirks", () => {
  it("A2: NCR has one pseudo-province, Metro Manila, holding 16 cities and Pateros", () => {
    expect(provinces.get("1300000000")).toEqual([
      { code: "1300000000", name: "Metro Manila", kind: "pseudo" },
    ])
    const ncr = citiesOf("1300000000")
    expect(ncr).toHaveLength(17)
    expect(ncr.find((c) => c.code === "1381300000")?.name).toBe("Quezon City")
    expect(ncr.find((c) => c.code === "1381701000")?.name).toBe("Pateros")
  })

  it("A3: the City of Manila has 897 barangays directly under it, and no district level", () => {
    const manila = citiesOf("1300000000").find((c) => c.code === "1380600000")
    expect(manila && isFull(manila) && manila.barangays).toHaveLength(897)
    expect(manila && isFull(manila) && manila.barangays[0]).toEqual({
      code: "1380601001",
      name: "Barangay 1",
    })
    // The 14 districts (1380601000 … 1380614000) are not places in the data
    const codes = new Set([
      ...allCities().map((c) => c.code),
      ...fullCities().flatMap((c) => c.barangays.map((b) => b.code)),
    ])
    const districts = Array.from(
      { length: 14 },
      (_, i) => `13806${String(i + 1).padStart(2, "0")}000`
    )
    expect(districts.filter((code) => codes.has(code))).toEqual([])
    expect(allCities().some((c) => c.name === "Tondo I/II")).toBe(false)
  })

  it("A4, A5: independent cities are their own pseudo-provinces", () => {
    for (const [region, code, name] of [
      ["0700000000", "0730600000", "City of Cebu"],
      ["1100000000", "1130700000", "City of Davao"],
    ]) {
      expect(provinces.get(region)).toContainEqual({
        code,
        name,
        kind: "pseudo",
      })
      const places = citiesOf(code)
      expect(places).toHaveLength(1)
      expect(places[0]).toMatchObject({ code, name })
      expect(isFull(places[0]) && places[0].barangays.length).toBeGreaterThan(0)
    }
  })

  it("A6: cities inside a province's code range stay in it", () => {
    const dagupan = citiesOf("0105500000").find((c) => c.code === "0105518000")
    expect(dagupan && isFull(dagupan)).toBe(true)
    expect(provinceOf("0105518000")).toBeUndefined()
    expect(
      citiesOf("1908700000").find((c) => c.code === "1908703000")?.name
    ).toBe("City of Cotabato")
    expect(provinceOf("1908703000")).toBeUndefined()
  })

  it("A7: City of Isabela and the Special Geographic Area are pseudo-provinces", () => {
    expect(provinces.get("0900000000")).toContainEqual({
      code: "0990100000",
      name: "City of Isabela",
      kind: "pseudo",
    })
    expect(citiesOf("0990100000").map((c) => c.code)).toEqual(["0990101000"])
    expect(provinces.get("1900000000")).toContainEqual({
      code: "1999900000",
      name: "Special Geographic Area",
      kind: "pseudo",
    })
    expect(citiesOf("1999900000")).toHaveLength(8)
  })

  it("A8: the Negros Island Region is present", () => {
    expect(regions.find((r) => r.code === "1800000000")?.name).toContain(
      "Negros Island Region"
    )
    const codes = provinces.get("1800000000")!.map((p) => p.code)
    expect(codes).toEqual(
      expect.arrayContaining([
        "1804500000", // Negros Occidental
        "1804600000", // Negros Oriental
        "1806100000", // Siquijor
        "1830200000", // City of Bacolod
      ])
    )
    expect(provinceOf("1830200000")?.kind).toBe("pseudo")
  })
})

describe("names and codes", () => {
  it("A9: cleaned names", () => {
    expect(provinces.get("0400000000")).toContainEqual({
      code: "0431200000",
      name: "City of Lucena",
      kind: "pseudo",
    })
    const names = [
      ...regions,
      ...allProvinces(),
      ...allCities(),
      ...fullCities().flatMap((c) => c.barangays),
    ].map((place) => place.name)
    const bad = names.filter(
      (name) =>
        name !== name.trim() ||
        name === "" ||
        /[a-z]\/$/.test(name) ||
        name.includes("(Not a Province)")
    )
    expect(bad).toEqual([])
  })

  it("A10: codes are unique, parents exist and prefixes agree", () => {
    const unique = (codes: string[]) => new Set(codes).size === codes.length
    expect(unique(regions.map((r) => r.code))).toBe(true)
    expect(unique(allProvinces().map((p) => p.code))).toBe(true)
    expect(unique(fullCities().map((c) => c.code))).toBe(true)
    expect(
      unique(fullCities().flatMap((c) => c.barangays.map((b) => b.code)))
    ).toBe(true)

    for (const [regionCode, list] of provinces) {
      for (const province of list) {
        expect(province.code.slice(0, 2)).toBe(regionCode.slice(0, 2))
        expect(citiesOf(province.code).length).toBeGreaterThan(0)
      }
    }
    for (const [provinceCode, list] of cities) {
      for (const city of list) {
        // Metro Manila's code is the region's; its cities carry 13…
        expect(city.code.slice(0, 2)).toBe(provinceCode.slice(0, 2))
        if (isFull(city)) {
          for (const barangay of city.barangays) {
            expect(barangay.code.slice(0, 5)).toBe(city.code.slice(0, 5))
          }
        }
      }
    }
  })
})

describe("independent cities and their geographic province", () => {
  const entries = () =>
    [...cities].flatMap(([provinceCode, list]) =>
      list
        .filter((c) => "independent" in c)
        .map((c) => ({ provinceCode, city: c }))
    )

  it("A13: Cebu lists Cebu, Lapu-Lapu and Mandaue with no barangays", () => {
    const listed = citiesOf("0702200000").filter((c) => "independent" in c)
    expect(listed).toEqual([
      { code: "0730600000", name: "City of Cebu", independent: true },
      { code: "0731100000", name: "City of Lapu-Lapu", independent: true },
      { code: "0731300000", name: "City of Mandaue", independent: true },
    ])
    for (const { code } of listed) {
      const own = citiesOf(code)
      expect(own).toHaveLength(1)
      expect(isFull(own[0]) && own[0].barangays.length).toBeGreaterThan(0)
    }
  })

  it("A14: each of the 17 is a pseudo-province and listed once in its province", () => {
    expect(Object.keys(independentCityProvinces)).toHaveLength(17)
    expect(entries()).toHaveLength(17)
    for (const [cityCode, provinceCode] of Object.entries(
      independentCityProvinces
    )) {
      expect(provinceOf(cityCode)?.kind).toBe("pseudo")
      expect(
        entries().filter(
          (e) => e.city.code === cityCode && e.provinceCode === provinceCode
        )
      ).toHaveLength(1)
    }
    expect(
      citiesOf("1804500000").some(
        (c) => c.code === "1830200000" && "independent" in c
      )
    ).toBe(true) // Bacolod in Negros Occidental
    expect(
      citiesOf("1102400000").some(
        (c) => c.code === "1130700000" && "independent" in c
      )
    ).toBe(true) // Davao in Davao del Sur
  })

  it("A15: City of Isabela, the Special Geographic Area and NCR's cities are listed nowhere else", () => {
    const listedCodes = new Set(entries().map((e) => e.city.code))
    expect(listedCodes.has("0990101000")).toBe(false)
    for (const city of [...citiesOf("1999900000"), ...citiesOf("1300000000")]) {
      expect(listedCodes.has(city.code)).toBe(false)
    }
  })

  it("A16: the map matches the dataset", () => {
    // Independent cities in the data: a pseudo-province outside NCR whose one
    // city has the province's own code
    const independent = allProvinces()
      .filter((p) => p.kind === "pseudo" && !p.code.startsWith("13"))
      .filter((p) => citiesOf(p.code).some((c) => c.code === p.code))
      .map((p) => p.code)
      .sort()
    expect(Object.keys(independentCityProvinces).sort()).toEqual(independent)
    for (const [cityCode, provinceCode] of Object.entries(
      independentCityProvinces
    )) {
      expect(provinceOf(provinceCode)?.kind).toBe("province")
      expect(provinceCode.slice(0, 2)).toBe(cityCode.slice(0, 2))
    }
  })
})

describe("size", () => {
  it("A17: no generated file is over 120,000 bytes", async () => {
    const files = [
      { kind: "manifest" as const },
      { kind: "regions" as const },
      ...regions.map((r) => ({ kind: "provinces" as const, code: r.code })),
      ...allProvinces().map((p) => ({ kind: "cities" as const, code: p.code })),
    ]
    let largest = 0
    for (const file of files) {
      const text = await readPsgcText(file)
      largest = Math.max(largest, Buffer.byteLength(text!))
    }
    expect(largest).toBeLessThanOrEqual(120_000)
  })
})
