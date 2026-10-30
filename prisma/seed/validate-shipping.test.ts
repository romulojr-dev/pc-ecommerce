import { describe, expect, it } from "vitest"

import { SHIPPING_ZONES } from "@/lib/shipping/zones"

import { shippingSeed } from "./data/shipping"
import { validateShippingSeed } from "./validate-shipping"

// docs/specs/028-shipping-data-and-fee-rules, S7, S8

const rate = (
  zone: "luzon" | "visayas",
  maxWeightGrams: number | null,
  fee: number
) => ({ zone, maxWeightGrams, fee })

const seedOf = (rates: ReturnType<typeof rate>[]) => ({
  store: shippingSeed.store,
  // The other two zones stay valid
  rates: [
    ...shippingSeed.rates.filter(
      (r) => r.zone !== "luzon" && r.zone !== "visayas"
    ),
    ...rates,
  ],
})

const luzonOk = [rate("luzon", 1_000, 100), rate("luzon", null, 200)]
const visayasOk = [rate("visayas", 1_000, 100), rate("visayas", null, 200)]

describe("the demo values (S7)", () => {
  const { rates, store } = shippingSeed
  const tiers = (zone: string) => rates.filter((r) => r.zone === zone)

  it("pass the validator", () => {
    expect(validateShippingSeed(shippingSeed)).toEqual([])
  })

  it("give every zone four bounded tiers and one open-ended tier", () => {
    expect(rates).toHaveLength(20)
    for (const zone of SHIPPING_ZONES) {
      expect(tiers(zone).map((r) => r.maxWeightGrams)).toEqual([
        1_000,
        3_000,
        10_000,
        20_000,
        null,
      ])
    }
  })

  it("rise tier by tier, and zone by zone at every tier", () => {
    for (const zone of SHIPPING_ZONES) {
      const fees = tiers(zone).map((r) => r.fee)
      expect(fees).toEqual([...fees].sort((a, b) => a - b))
      expect(new Set(fees).size).toBe(fees.length)
    }
    for (let i = 0; i < 5; i++) {
      const byZone = SHIPPING_ZONES.map((zone) => tiers(zone)[i].fee)
      expect(byZone).toEqual([...byZone].sort((a, b) => a - b))
      expect(new Set(byZone).size).toBe(4)
    }
  })

  it("set the demo store and the ₱75,000 threshold", () => {
    expect(store.freeShippingThreshold).toBe(7_500_000)
    expect(store.pickupEnabled).toBe(true)
    expect(store.orderExpiryHours).toBe(24)
    expect(store.storeInfo).toMatch(/not a real shop/)
    expect(store.storeInfo).toMatch(/\.example/)
  })
})

describe("validateShippingSeed (S8)", () => {
  it("accepts a valid seed", () => {
    expect(validateShippingSeed(seedOf([...luzonOk, ...visayasOk]))).toEqual([])
  })

  it("refuses two open-ended tiers in a zone", () => {
    const errors = validateShippingSeed(
      seedOf([...luzonOk, rate("luzon", null, 300), ...visayasOk])
    )
    expect(errors).toEqual(["Shipping seed: luzon has two open-ended tiers."])
  })

  it("refuses a zone without an open-ended tier", () => {
    expect(
      validateShippingSeed(seedOf([rate("luzon", 1_000, 100), ...visayasOk]))
    ).toEqual(["Shipping seed: luzon is missing an open-ended tier."])
  })

  it("refuses a zone with no tiers at all", () => {
    const errors = validateShippingSeed({
      store: shippingSeed.store,
      rates: shippingSeed.rates.filter((r) => r.zone !== "mindanao"),
    })
    expect(errors).toEqual(["Shipping seed: mindanao has no tiers."])
  })

  it("refuses limits that don't rise, or repeat", () => {
    expect(
      validateShippingSeed(
        seedOf([
          rate("luzon", 3_000, 100),
          rate("luzon", 1_000, 200),
          rate("luzon", null, 300),
          ...visayasOk,
        ])
      )
    ).toEqual(["Shipping seed: luzon tier limits must rise: 3000 then 1000."])
    expect(
      validateShippingSeed(
        seedOf([
          rate("luzon", 1_000, 100),
          rate("luzon", 1_000, 200),
          rate("luzon", null, 300),
          ...visayasOk,
        ])
      )
    ).toEqual(["Shipping seed: luzon tier limits must rise: 1000 then 1000."])
  })

  it.each([
    ["a negative fee", -1],
    ["a fractional fee", 1.5],
  ])("refuses %s", (_name, fee) => {
    expect(
      validateShippingSeed(
        seedOf([
          rate("luzon", 1_000, fee),
          rate("luzon", null, 200),
          ...visayasOk,
        ])
      )
    ).toEqual([
      "Shipping seed: luzon fee must be a whole number of centavos, 0 or more.",
    ])
  })

  it("refuses a limit that isn't a whole number above 0", () => {
    expect(
      validateShippingSeed(
        seedOf([rate("luzon", 0, 100), rate("luzon", null, 200), ...visayasOk])
      )
    ).toEqual([
      "Shipping seed: luzon weight limit must be a whole number of grams above 0.",
    ])
  })

  it("refuses bad store settings", () => {
    const withStore = (patch: object) => ({
      ...shippingSeed,
      store: { ...shippingSeed.store, ...patch },
    })
    expect(
      validateShippingSeed(withStore({ freeShippingThreshold: 0 }))
    ).toEqual([
      "Shipping seed: the free-shipping threshold must be null or a whole number of centavos above 0.",
    ])
    expect(validateShippingSeed(withStore({ orderExpiryHours: 0 }))).toEqual([
      "Shipping seed: the order expiry must be a whole number of hours, 1 or more.",
    ])
    expect(validateShippingSeed(withStore({ storeAddress: " " }))).toEqual([
      "Shipping seed: the store address is empty.",
    ])
    expect(
      validateShippingSeed(withStore({ freeShippingThreshold: null }))
    ).toEqual([])
  })
})
