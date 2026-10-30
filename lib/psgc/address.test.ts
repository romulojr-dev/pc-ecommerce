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
