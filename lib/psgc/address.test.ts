import { describe, expect, it } from "vitest"

import { resolveAddress } from "./address"
import { readPsgcJson } from "./files"
import type { City } from "./types"

// docs/specs/028-shipping-data-and-fee-rules, V1, V3, V5, V6
const QC = "1381300000"
const NCR = "1300000000"

async function quezonCityBarangay() {
  const cities = await readPsgcJson<City[]>({ kind: "cities", code: NCR })
  const qc = cities!.find((c) => c.code === QC)!
  if (!("barangays" in qc)) throw new Error("Quezon City has no barangays")
  return qc.barangays[0]
}

const quezonCity = async () => ({
  regionCode: NCR,
  provinceCode: NCR,
  cityCode: QC,
  barangayCode: (await quezonCityBarangay()).code,
})

describe("resolveAddress", () => {
  it("V1: gives the names and the zone for a valid chain", async () => {
    const barangay = await quezonCityBarangay()
    expect(await resolveAddress(await quezonCity())).toEqual({
      region: { code: NCR, name: "National Capital Region (NCR)" },
      province: { code: NCR, name: "Metro Manila" },
      city: { code: QC, name: "Quezon City" },
      barangay,
      zone: "metro-manila",
    })
  })

  it("V3: refuses a barangay that isn't in the city", async () => {
    expect(
      await resolveAddress({
        ...(await quezonCity()),
        barangayCode: "1380301001",
      })
    ).toBeNull()
  })

  it("refuses a city that isn't in the province, or a province that isn't in the region", async () => {
    expect(
      await resolveAddress({ ...(await quezonCity()), cityCode: "1380300000" })
    ).toBeNull()
    expect(
      await resolveAddress({
        ...(await quezonCity()),
        provinceCode: "0702200000",
      })
    ).toBeNull()
    expect(
      await resolveAddress({
        ...(await quezonCity()),
        regionCode: "0800000000",
      })
    ).toBeNull()
  })

  it.each([
    ["an unknown code", { barangayCode: "9999999999" }],
    ["a 9-digit code", { cityCode: "138130000" }],
    ["an empty code", { regionCode: "" }],
    ["a number instead of text", { provinceCode: 1300000000 }],
    ["a missing field", { barangayCode: undefined }],
  ])("V5: refuses %s", async (_name, patch) => {
    expect(
      await resolveAddress({ ...(await quezonCity()), ...patch })
    ).toBeNull()
  })

  it("V5: refuses input that isn't an object", async () => {
    expect(await resolveAddress(null)).toBeNull()
    expect(await resolveAddress("1300000000")).toBeNull()
    expect(await resolveAddress(undefined)).toBeNull()
  })

  it("V5/V6: ignores extra fields, and names sent by the client", async () => {
    const result = await resolveAddress({
      ...(await quezonCity()),
      cityName: "Somewhere else",
      cartId: "x",
    })
    expect(result?.city.name).toBe("Quezon City")
  })
})

// Independent cities (D19): valid under their own pseudo-province and under
// the geographic province the map names
async function firstBarangayOf(fileCode: string, cityCode: string) {
  const cities = await readPsgcJson<City[]>({ kind: "cities", code: fileCode })
  const city = cities!.find((c) => c.code === cityCode)!
  if (!("barangays" in city)) throw new Error(`${cityCode} has no barangays`)
  return city.barangays[0]
}

describe("resolveAddress: independent cities", () => {
  const mandaue = async () => ({
    regionCode: "0700000000",
    provinceCode: "0702200000", // Cebu
    cityCode: "0731300000",
    barangayCode: (await firstBarangayOf("0731300000", "0731300000")).code,
  })

  it("V2: City of Davao as its own pseudo-province is in Mindanao", async () => {
    const barangay = await firstBarangayOf("1130700000", "1130700000")
    expect(
      await resolveAddress({
        regionCode: "1100000000",
        provinceCode: "1130700000",
        cityCode: "1130700000",
        barangayCode: barangay.code,
      })
    ).toEqual({
      region: expect.objectContaining({ code: "1100000000" }),
      province: { code: "1130700000", name: "City of Davao" },
      city: { code: "1130700000", name: "City of Davao" },
      barangay,
      zone: "mindanao",
    })
  })

  it("V9: City of Mandaue under Cebu province names the province as chosen", async () => {
    const input = await mandaue()
    const result = await resolveAddress(input)
    expect(result).toMatchObject({
      province: { code: "0702200000", name: "Cebu" },
      city: { code: "0731300000", name: "City of Mandaue" },
      zone: "visayas",
    })
    expect(result?.barangay.code).toBe(input.barangayCode)
  })

  it("V10: the same city under its own pseudo-province", async () => {
    const input = { ...(await mandaue()), provinceCode: "0731300000" }
    expect(await resolveAddress(input)).toMatchObject({
      province: { code: "0731300000", name: "City of Mandaue" },
      city: { code: "0731300000" },
    })
  })

  it("V11: refuses an independent city under a province the map doesn't name", async () => {
    // Bohol (0701200000) with Mandaue; Cebu with the City of Davao
    expect(
      await resolveAddress({ ...(await mandaue()), provinceCode: "0701200000" })
    ).toBeNull()
    expect(
      await resolveAddress({
        regionCode: "0700000000",
        provinceCode: "0702200000",
        cityCode: "1130700000",
        barangayCode: (await firstBarangayOf("1130700000", "1130700000")).code,
      })
    ).toBeNull()
  })

  it("refuses a barangay of another city under an independent city", async () => {
    expect(
      await resolveAddress({
        ...(await mandaue()),
        barangayCode: (await firstBarangayOf("0731100000", "0731100000")).code,
      })
    ).toBeNull()
  })

  it("accepts City of Bacolod under Negros Occidental, in the Negros Island Region", async () => {
    const result = await resolveAddress({
      regionCode: "1800000000",
      provinceCode: "1804500000",
      cityCode: "1830200000",
      barangayCode: (await firstBarangayOf("1830200000", "1830200000")).code,
    })
    expect(result).toMatchObject({
      province: { name: "Negros Occidental" },
      city: { name: "City of Bacolod" },
      zone: "visayas",
    })
  })
})
