import { describe, expect, it } from "vitest"

import type { CartLineView, CartView } from "@/lib/cart/types"
import type { ShippingConfig } from "@/lib/shipping/config"
import type { ShippingRateTier } from "@/lib/shipping/fee"
import type { ShippingZone } from "@/lib/shipping/zones"
import { buildReview, type ReviewDestination } from "./review"

// docs/specs/038-cash-on-delivery: buildReview's payment choice as pure cases
// (V2–V13). Lines carry the exact prices and weights of the spec's examples;
// the fee tables are spec 028's demo rates and the COD settings the demo values.

const LIMITS = [1_000, 3_000, 10_000, 20_000, null]
const DEMO_FEES: Record<ShippingZone, number[]> = {
  "metro-manila": [12_000, 18_000, 30_000, 45_000, 65_000],
  luzon: [15_000, 24_000, 42_000, 65_000, 95_000],
  visayas: [19_000, 32_000, 58_000, 90_000, 130_000],
  mindanao: [21_000, 35_000, 65_000, 100_000, 145_000],
}
const ZONES = Object.keys(DEMO_FEES) as ShippingZone[]
const rates = ZONES.flatMap((zone) =>
  DEMO_FEES[zone].map<ShippingRateTier>((fee, i) => ({
    zone,
    maxWeightGrams: LIMITS[i],
    fee,
  }))
)
const config = {
  rates,
  settings: {
    freeShippingThreshold: 7_500_000,
    pickupEnabled: true,
    storeAddress: "",
    storeHours: "",
    storeInfo: "",
    orderExpiryHours: 24,
    codEnabled: true,
    codMaxTotal: 5_000_000,
    codZones: ["metro-manila", "luzon"],
    codPickupEnabled: true,
    codConfirmHours: 24,
  },
} satisfies ShippingConfig

const QC: ReviewDestination = {
  method: "delivery",
  zone: "metro-manila",
  regionName: "National Capital Region (NCR)",
}
const DAVAO: ReviewDestination = {
  method: "delivery",
  zone: "mindanao",
  regionName: "Region XI (Davao Region)",
}
const PICKUP: ReviewDestination = { method: "pickup" }

function line(
  productId: string,
  unitPrice: number,
  quantity: number
): CartLineView {
  return {
    kind: "single",
    id: `line-${productId}`,
    productId,
    name: productId,
    slug: productId,
    categorySlug: "cpu",
    brand: "Brand",
    image: null,
    price: unitPrice,
    salePrice: null,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    status: "in-stock",
    preorderShipsOn: null,
    sold: true,
    max: quantity,
    flag: null,
    setTo: null,
  }
}

// One cart of single lines and the grams each product weighs
function cartOf(...lines: CartLineView[]): CartView {
  return {
    entries: lines,
    subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
    count: lines.reduce((sum, l) => sum + l.quantity, 0),
    flagged: 0,
  }
}
const weightsOf = (...pairs: [string, number][]) => new Map(pairs)

const withCod = (over: Partial<ShippingConfig["settings"]> = {}) => ({
  ...config,
  settings: { ...config.settings, ...over },
})

const RYZEN = "ryzen"
const LANCOOL = "lancool"
const ryzen2 = () => cartOf(line(RYZEN, 1_149_500, 2))
const weights = weightsOf(
  [RYZEN, 450],
  [LANCOOL, 9_000],
  ["build-a", 15_860],
  ["build-b", 15_860]
)

const review = (
  cart: CartView,
  destination: ReviewDestination,
  payment: "online" | "cod",
  cfg: ShippingConfig = config
) => buildReview(cart, weights, destination, cfg, { requested: false }, payment)

describe("buildReview, the payment choice", () => {
  it("V1: online by default, with cash offered", () => {
    const r = buildReview(ryzen2(), weights, QC, config)
    expect(r.payment).toEqual({
      requested: "online",
      chosen: "online",
      cod: { offered: true },
      limit: 5_000_000,
    })
    expect(r.total).toBe(2_311_000)
  })

  it("V2: cash is chosen when asked for and offered, and money doesn't change", () => {
    const r = review(ryzen2(), QC, "cod")
    expect(r.payment.chosen).toBe("cod")
    expect(r.payment.requested).toBe("cod")
    expect(r.total).toBe(2_311_000)
    expect(r.shipping).toEqual({ ok: true, fee: 12_000, basis: "rate" })
  })

  it("V3: a ₱75,010.00 total is over the ₱50,000.00 limit and falls back to online", () => {
    const build = cartOf(line("build-b", 7_456_000, 1))
    const r = buildReview(
      build,
      weightsOf(["build-b", 15_860]),
      QC,
      config,
      { requested: false },
      "cod"
    )
    expect(r.total).toBe(7_501_000)
    expect(r.payment).toMatchObject({
      requested: "cod",
      chosen: "online",
      cod: { offered: false, reason: "over-limit", overBy: 2_501_000 },
    })
  })

  it("V5/V6: the limit compares the total after the discount", () => {
    const cfg = withCod({ codMaxTotal: 2_081_100 })
    const ask = (code: boolean) =>
      buildReview(
        ryzen2(),
        weights,
        QC,
        cfg,
        code
          ? {
              requested: true,
              voucher: {
                id: "v",
                code: "WELCOME10",
                type: "PERCENT",
                value: 10,
                minSpend: 500_000,
                startsAt: new Date("2026-01-01T00:00:00+08:00"),
                endsAt: null,
                usageLimit: null,
                usedCount: 0,
              },
              now: new Date("2026-11-04T02:00:00Z"),
            }
          : { requested: false },
        "cod"
      )
    expect(ask(true).total).toBe(2_081_100)
    expect(ask(true).payment.chosen).toBe("cod")
    expect(ask(false).total).toBe(2_311_000)
    expect(ask(false).payment.cod).toMatchObject({ reason: "over-limit" })
  })

  it("V7: a Mindanao address is not in the demo zones", () => {
    const r = review(ryzen2(), DAVAO, "cod")
    expect(r.payment.cod).toEqual({ offered: false, reason: "zone" })
    expect(r.payment.chosen).toBe("online")
  })

  it("V8: pickup is offered, and its total has no shipping", () => {
    const r = review(cartOf(line(LANCOOL, 579_500, 1)), PICKUP, "cod")
    expect(r.payment.chosen).toBe("cod")
    expect(r.total).toBe(579_500)
  })

  it("V9/V10: pickup off, and the master switch off", () => {
    const cart = cartOf(line(LANCOOL, 579_500, 1))
    expect(
      review(cart, PICKUP, "cod", withCod({ codPickupEnabled: false })).payment
        .cod
    ).toEqual({ offered: false, reason: "pickup-off" })
    expect(
      review(cart, PICKUP, "cod", withCod({ codEnabled: false })).payment.cod
    ).toEqual({ offered: false, reason: "disabled" })
  })

  it("V11: pickup is judged by the limit too", () => {
    const r = review(cartOf(line("build-a", 6_906_000, 1)), PICKUP, "cod")
    expect(r.payment.cod).toMatchObject({ reason: "over-limit" })
  })

  it("a delivery with no rate has no total, so cash isn't offered", () => {
    const noRates = { ...config, rates: [] }
    const r = review(ryzen2(), QC, "cod", noRates)
    expect(r.total).toBeNull()
    expect(r.payment.cod).toEqual({ offered: false, reason: "no-total" })
  })

  it("never blocks the order: canPlace ignores the payment choice", () => {
    const build = cartOf(line("build-b", 7_456_000, 1))
    const r = buildReview(
      build,
      weightsOf(["build-b", 15_860]),
      QC,
      config,
      { requested: false },
      "cod"
    )
    expect(r.canPlace).toBe(true)
  })

  it("no limit offers any total", () => {
    const r = review(
      cartOf(line("build-b", 7_456_000, 1)),
      QC,
      "cod",
      withCod({ codMaxTotal: null })
    )
    expect(r.payment.chosen).toBe("cod")
  })
})
