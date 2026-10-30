import { describe, expect, it } from "vitest"

import { resolveAddress } from "@/lib/psgc/address"
import { readPsgcJson } from "@/lib/psgc/files"
import type { City } from "@/lib/psgc/types"

import { normalizeAddress } from "./address"

// Docs: docs/specs/029-checkout-steps, AD1–AD6. Reads the committed dataset.

async function firstBarangay(provinceCode: string, cityCode: string) {
  const cities = await readPsgcJson<City[]>({
    kind: "cities",
    code: provinceCode,
  })
  let city = cities!.find((c) => c.code === cityCode)!
  if (!("barangays" in city)) {
    // An independent city: its barangays are in its own file
    const own = await readPsgcJson<City[]>({ kind: "cities", code: cityCode })
    city = own!.find((c) => c.code === cityCode)!
  }
  if (!("barangays" in city)) throw new Error("no barangays")
  return city.barangays[0].code
}

async function normalized(
  regionCode: string,
  provinceCode: string,
  cityCode: string
) {
  const resolved = await resolveAddress({
    regionCode,
    provinceCode,
    cityCode,
    barangayCode: await firstBarangay(provinceCode, cityCode),
  })
  expect(resolved).not.toBeNull()
  return normalizeAddress(resolved!)
}

describe("normalizeAddress", () => {
  it("AD1: City of Cebu under Cebu gets the geographic province and no code", async () => {
    const address = await normalized("0700000000", "0702200000", "0730600000")
    expect(address).toMatchObject({
      province: { name: "Cebu", code: null, geographic: true },
      city: { code: "0730600000", name: "City of Cebu" },
      barangay: { code: "0730600001", name: "Adlaon" },
      zone: "visayas",
    })
  })

  it("AD2: City of Mandaue under Cebu", async () => {
    const address = await normalized("0700000000", "0702200000", "0731300000")
    expect(address).toMatchObject({
      province: { name: "Cebu", code: null, geographic: true },
      city: { name: "City of Mandaue" },
      zone: "visayas",
    })
  })

  it("AD3: the pseudo-province path gives the same address as AD2", async () => {
    expect(await normalized("0700000000", "0731300000", "0731300000")).toEqual(
      await normalized("0700000000", "0702200000", "0731300000")
    )
  })

  it("AD4: an NCR city keeps Metro Manila's name, with no code", async () => {
    const address = await normalized("1300000000", "1300000000", "1381300000")
    expect(address).toMatchObject({
      province: { name: "Metro Manila", code: null, geographic: false },
      city: { name: "Quezon City" },
      barangay: { code: "1381300001", name: "Alicia" },
      zone: "metro-manila",
    })
  })

  it("AD5: a city in a real province keeps the province code", async () => {
    const address = await normalized("0100000000", "0105500000", "0105518000")
    expect(address).toMatchObject({
      province: { name: "Pangasinan", code: "0105500000", geographic: false },
      city: { name: "City of Dagupan" },
      zone: "luzon",
    })
  })

  it("City of Davao under Davao del Sur is named for that province", async () => {
    const address = await normalized("1100000000", "1102400000", "1130700000")
    expect(address).toMatchObject({
      province: { name: "Davao del Sur", code: null, geographic: true },
      zone: "mindanao",
    })
  })

  it("keeps the pseudo-province name for the City of Isabela", async () => {
    const cities = await readPsgcJson<City[]>({
      kind: "cities",
      code: "0990100000",
    })
    const address = await normalized(
      "0900000000",
      "0990100000",
      cities![0].code
    )
    expect(address?.province).toEqual({
      name: "City of Isabela",
      code: null,
      geographic: false,
    })
  })

  it("AD6: Mandaue under Bohol doesn't resolve at all", async () => {
    expect(
      await resolveAddress({
        regionCode: "0700000000",
        provinceCode: "0701200000",
        cityCode: "0731300000",
        barangayCode: "0731300001",
      })
    ).toBeNull()
  })
})
