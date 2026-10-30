import { describe, expect, it } from "vitest"

import {
  buildAProducts,
  lancool216,
  ryzen5_7600,
} from "@/test-support/seed-products"

import { type ShippingRateTier, shippingFee } from "./fee"
import { orderWeightGrams } from "./weight"
import type { ShippingZone } from "./zones"

// docs/specs/028-shipping-data-and-fee-rules, F1–F17. The rates are the demo
// rates, written out as fixtures: the tests don't read the seed file.
const LIMITS = [1_000, 3_000, 10_000, 20_000, null]
const DEMO_FEES: Record<ShippingZone, number[]> = {
  "metro-manila": [12_000, 18_000, 30_000, 45_000, 65_000],
  luzon: [15_000, 24_000, 42_000, 65_000, 95_000],
  visayas: [19_000, 32_000, 58_000, 90_000, 130_000],
  mindanao: [21_000, 35_000, 65_000, 100_000, 145_000],
}
const ZONES = Object.keys(DEMO_FEES) as ShippingZone[]
const rates = (zones: ShippingZone[] = ZONES) =>
  zones.flatMap((zone) =>
    DEMO_FEES[zone].map<ShippingRateTier>((fee, i) => ({
      zone,
      maxWeightGrams: LIMITS[i],
      fee,
    }))
  )

const THRESHOLD = 7_500_000
const settings = { freeShippingThreshold: THRESHOLD as number | null }
const delivery = (
  zone: ShippingZone,
  weightGrams: number,
  subtotal = 100_000
) => ({ method: "delivery" as const, zone, weightGrams, subtotal })
const fee = (...args: Parameters<typeof delivery>) => {
  const result = shippingFee(delivery(...args), rates(), settings)
  return result.ok ? result.fee : result
}

const buildA = () => {
  const parts = buildAProducts()
  return {
    weightGrams: orderWeightGrams(
      parts.map((p) => ({ weightGrams: p.weightGrams, quantity: 1 }))
    ),
    subtotal: parts.reduce((sum, p) => sum + p.price, 0),
  }
}

describe("shippingFee", () => {
  it("F1: pickup is free whatever the zone, weight or rates", () => {
    const { weightGrams, subtotal } = buildA()
    expect(weightGrams).toBe(15_860)
    expect(subtotal).toBe(6_906_000)
    expect(
      shippingFee(
        { method: "pickup", zone: "mindanao", weightGrams, subtotal },
        rates(),
        settings
      )
    ).toEqual({ ok: true, fee: 0, basis: "pickup" })
  })

  it("F2: Ryzen 5 7600 × 1 to Metro Manila", () => {
    const product = ryzen5_7600()
    expect(
      shippingFee(
        delivery("metro-manila", product.weightGrams, product.price),
        rates(),
        settings
      )
    ).toEqual({ ok: true, fee: 12_000, basis: "rate" })
  })

  it.each([
    [1_000, 12_000],
    [1_001, 18_000],
    [3_000, 18_000],
    [3_001, 30_000],
    [10_000, 30_000],
    [10_001, 45_000],
    [20_000, 45_000],
    [20_001, 65_000],
  ])("F3, F4: Metro Manila at %i g costs %i", (weight, expected) => {
    expect(fee("metro-manila", weight)).toBe(expected)
  })

  it("F3, F4: every tier boundary in every zone", () => {
    for (const zone of ZONES) {
      LIMITS.slice(0, 4).forEach((limit, i) => {
        expect(fee(zone, limit!), `${zone} at ${limit}`).toBe(
          DEMO_FEES[zone][i]
        )
        expect(fee(zone, limit! + 1), `${zone} at ${limit! + 1}`).toBe(
          DEMO_FEES[zone][i + 1]
        )
      })
      expect(fee(zone, 500_000)).toBe(DEMO_FEES[zone][4])
    }
  })

  it("F5: weight 0 takes the smallest tier", () => {
    expect(fee("metro-manila", 0)).toBe(12_000)
    expect(fee("mindanao", 0)).toBe(21_000)
  })

  it("F6: Build A to each zone", () => {
    const { weightGrams, subtotal } = buildA()
    expect(fee("metro-manila", weightGrams, subtotal)).toBe(45_000)
    expect(fee("luzon", weightGrams, subtotal)).toBe(65_000)
    expect(fee("visayas", weightGrams, subtotal)).toBe(90_000)
    expect(fee("mindanao", weightGrams, subtotal)).toBe(100_000)
  })

  it("F7: LANCOOL 216 × 3 (27,000 g) to Mindanao uses the open-ended tier", () => {
    const weightGrams = orderWeightGrams([
      { weightGrams: lancool216().weightGrams, quantity: 3 },
    ])
    expect(weightGrams).toBe(27_000)
    expect(fee("mindanao", weightGrams, lancool216().price * 3)).toBe(145_000)
  })

  it("F8: LANCOOL 216 × 1 (9,000 g) to Visayas", () => {
    expect(fee("visayas", lancool216().weightGrams, lancool216().price)).toBe(
      58_000
    )
  })

  it("F9: a subtotal equal to the threshold is free", () => {
    expect(
      shippingFee(delivery("luzon", 15_860, THRESHOLD), rates(), settings)
    ).toEqual({ ok: true, fee: 0, basis: "free-shipping" })
  })

  it("F10: one centavo under the threshold pays the tier", () => {
    expect(
      shippingFee(delivery("luzon", 15_860, THRESHOLD - 1), rates(), settings)
    ).toEqual({ ok: true, fee: 65_000, basis: "rate" })
  })

  it("F11: with the threshold off, nothing is free", () => {
    expect(
      shippingFee(delivery("luzon", 15_860, 20_000_000), rates(), {
        freeShippingThreshold: null,
      })
    ).toEqual({ ok: true, fee: 65_000, basis: "rate" })
  })

  it("F12: a zone with no rates can't be delivered to, at any weight or subtotal", () => {
    const noMindanao = rates(["metro-manila", "luzon", "visayas"])
    for (const [weight, subtotal] of [
      [0, 0],
      [450, 1_149_500],
      [27_000, 20_000_000],
    ]) {
      expect(
        shippingFee(
          delivery("mindanao", weight, subtotal),
          noMindanao,
          settings
        )
      ).toEqual({ ok: false, reason: "no-rate" })
    }
  })

  it("F13: pickup still works when the zone has no rates", () => {
    expect(
      shippingFee(
        { method: "pickup", zone: "mindanao", weightGrams: 500, subtotal: 1 },
        [],
        settings
      )
    ).toEqual({ ok: true, fee: 0, basis: "pickup" })
  })

  it("F14: without an open-ended tier, an order over the last bound has no rate", () => {
    const bounded = rates().filter((r) => r.maxWeightGrams !== null)
    expect(shippingFee(delivery("luzon", 20_001), bounded, settings)).toEqual({
      ok: false,
      reason: "no-rate",
    })
    expect(shippingFee(delivery("luzon", 20_000), bounded, settings)).toEqual({
      ok: true,
      fee: 65_000,
      basis: "rate",
    })
  })

  it("F15: the order of the rates doesn't matter", () => {
    const shuffled = [...rates()].reverse()
    shuffled.push(shuffled.shift()!)
    expect(shuffled).not.toEqual(rates())
    for (const weight of [0, 1_000, 1_001, 3_001, 10_001, 20_001]) {
      for (const zone of ZONES) {
        expect(shippingFee(delivery(zone, weight), shuffled, settings)).toEqual(
          shippingFee(delivery(zone, weight), rates(), settings)
        )
      }
    }
  })

  it("F16: no rates wins over the free-shipping threshold", () => {
    expect(
      shippingFee(
        delivery("mindanao", 450, THRESHOLD),
        rates(["metro-manila", "luzon", "visayas"]),
        settings
      )
    ).toEqual({ ok: false, reason: "no-rate" })
  })

  describe("F17: throws for input that is a caller bug", () => {
    const ok = delivery("luzon", 450)

    it.each([
      ["a negative weight", { ...ok, weightGrams: -1 }],
      ["a fractional weight", { ...ok, weightGrams: 1.5 }],
      ["a NaN weight", { ...ok, weightGrams: Number.NaN }],
      ["a negative subtotal", { ...ok, subtotal: -1 }],
      ["a fractional subtotal", { ...ok, subtotal: 1.5 }],
    ])("%s", (_name, input) => {
      expect(() => shippingFee(input, rates(), settings)).toThrow(RangeError)
    })

    it.each([
      ["a fractional fee", { zone: "luzon", maxWeightGrams: 1_000, fee: 1.5 }],
      ["a negative fee", { zone: "luzon", maxWeightGrams: 1_000, fee: -1 }],
      ["a fractional limit", { zone: "luzon", maxWeightGrams: 1.5, fee: 100 }],
      ["a limit of 0", { zone: "luzon", maxWeightGrams: 0, fee: 100 }],
    ] as const)("a rate with %s", (_name, bad) => {
      expect(() => shippingFee(ok, [...rates(), bad], settings)).toThrow(
        RangeError
      )
    })

    it.each([0, -1, 1.5, Number.NaN])("a threshold of %s", (value) => {
      expect(() =>
        shippingFee(ok, rates(), { freeShippingThreshold: value })
      ).toThrow(RangeError)
    })

    it("two open-ended tiers, or one limit twice, in a zone", () => {
      expect(() =>
        shippingFee(
          ok,
          [...rates(), { zone: "luzon", maxWeightGrams: null, fee: 1 }],
          settings
        )
      ).toThrow(RangeError)
      expect(() =>
        shippingFee(
          ok,
          [...rates(), { zone: "luzon", maxWeightGrams: 3_000, fee: 1 }],
          settings
        )
      ).toThrow(RangeError)
    })

    it("pickup is validated too, so a bad rate table shows up early", () => {
      expect(() =>
        shippingFee(
          { method: "pickup", zone: "luzon", weightGrams: -1, subtotal: 0 },
          rates(),
          settings
        )
      ).toThrow(RangeError)
    })
  })
})
