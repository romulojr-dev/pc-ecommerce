import { describe, expect, it } from "vitest"

import { type CodSettings, codEligibility } from "./cod-eligibility"

// docs/specs/038-cash-on-delivery: U1–U9

const DEMO: CodSettings = {
  codEnabled: true,
  codMaxTotal: 5_000_000,
  codZones: ["metro-manila", "luzon"],
  codPickupEnabled: true,
}
const qc = (total: number | null) =>
  ({ method: "delivery", zone: "metro-manila", total }) as const

describe("codEligibility", () => {
  it("U1: offers cash within the limit, in an allowed zone", () => {
    expect(codEligibility(qc(2_311_000), DEMO)).toEqual({ offered: true })
  })

  it("U2: equal to the limit is offered, one centavo over is not", () => {
    const at = { ...DEMO, codMaxTotal: 2_311_000 }
    expect(codEligibility(qc(2_311_000), at)).toEqual({ offered: true })
    expect(
      codEligibility(qc(2_311_000), { ...DEMO, codMaxTotal: 2_310_999 })
    ).toEqual({ offered: false, reason: "over-limit", overBy: 1 })
  })

  it("U3: no limit offers any total", () => {
    expect(
      codEligibility(qc(99_999_999), { ...DEMO, codMaxTotal: null })
    ).toEqual({ offered: true })
  })

  it.each([
    ["mindanao", "zone"],
    ["visayas", "zone"],
    ["luzon", null],
  ] as const)("U4: delivery to %s", (zone, reason) => {
    const result = codEligibility(
      { method: "delivery", zone, total: 1_000_000 },
      DEMO
    )
    expect(result).toEqual(
      reason ? { offered: false, reason } : { offered: true }
    )
  })

  it("U5: no allowed zones refuses every delivery", () => {
    expect(codEligibility(qc(100_000), { ...DEMO, codZones: [] })).toEqual({
      offered: false,
      reason: "zone",
    })
  })

  it("U6: pickup is judged by its own switch, not by zones", () => {
    const pickup = { method: "pickup", total: 579_500 } as const
    expect(
      codEligibility(pickup, { ...DEMO, codPickupEnabled: false })
    ).toEqual({ offered: false, reason: "pickup-off" })
    expect(codEligibility(pickup, { ...DEMO, codZones: [] })).toEqual({
      offered: true,
    })
  })

  it("U6: pickup is judged by the limit too", () => {
    expect(
      codEligibility({ method: "pickup", total: 6_906_000 }, DEMO)
    ).toEqual({ offered: false, reason: "over-limit", overBy: 1_906_000 })
  })

  it("U7: the master switch refuses delivery and pickup", () => {
    const off = { ...DEMO, codEnabled: false }
    expect(codEligibility(qc(100_000), off)).toEqual({
      offered: false,
      reason: "disabled",
    })
    expect(codEligibility({ method: "pickup", total: 100_000 }, off)).toEqual({
      offered: false,
      reason: "disabled",
    })
  })

  it("U8: failures stack in the order disabled, zone, then limit", () => {
    const worst: CodSettings = {
      codEnabled: false,
      codMaxTotal: 1,
      codZones: [],
      codPickupEnabled: false,
    }
    expect(codEligibility(qc(9_999_999), worst)).toMatchObject({
      reason: "disabled",
    })
    expect(
      codEligibility(qc(9_999_999), { ...worst, codEnabled: true })
    ).toMatchObject({ reason: "zone" })
    expect(
      codEligibility(qc(9_999_999), {
        ...worst,
        codEnabled: true,
        codZones: ["metro-manila"],
      })
    ).toMatchObject({ reason: "over-limit" })
  })

  it("U9: a delivery with no rate has no total to compare", () => {
    expect(codEligibility(qc(null), DEMO)).toEqual({
      offered: false,
      reason: "no-total",
    })
  })
})
