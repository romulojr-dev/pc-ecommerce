import { describe, expect, it } from "vitest"

import type { CartLineView, CartView } from "@/lib/cart/types"
import { MIN_ONLINE_TOTAL } from "@/lib/payments/amount"
import type { ShippingConfig } from "@/lib/shipping/config"
import type { ShippingRateTier } from "@/lib/shipping/fee"
import type { ShippingZone } from "@/lib/shipping/zones"
import type { VoucherInput } from "@/lib/vouchers"

import {
  buildReview,
  type ReviewDestination,
  type VoucherRequest,
} from "./review"

// docs/specs/037-vouchers-at-checkout: U14–U16, and V2, V4–V7, V13 and V13a
// as pure cases. Lines carry the exact prices and weights of the spec's
// examples; the fee tables are spec 028's demo rates.

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

const NOW = new Date("2026-11-04T02:00:00Z")

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

const row = (overrides: Partial<VoucherInput> = {}) => ({
  id: "v1",
  code: "TEST",
  type: "PERCENT" as const,
  value: 10,
  minSpend: 0,
  startsAt: new Date("2026-01-01T00:00:00+08:00"),
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  ...overrides,
})
const asked = (overrides: Partial<VoucherInput> = {}): VoucherRequest => ({
  requested: true,
  voucher: row(overrides),
  now: NOW,
})

const RYZEN = "ryzen"
const ryzen2 = () => cartOf(line(RYZEN, 1_149_500, 2))
const ryzenWeights = weightsOf([RYZEN, 450])

describe("buildReview with no voucher", () => {
  it("is as before: no discount, outcome none", () => {
    const review = buildReview(ryzen2(), ryzenWeights, QC, config)
    expect(review.discount).toBe(0)
    expect(review.voucher).toEqual({ kind: "none" })
    expect(review.total).toBe(2_311_000)
  })
})

describe("V2: a percent code on Ryzen × 2 to Quezon City", () => {
  const review = buildReview(ryzen2(), ryzenWeights, QC, config, asked())

  it("takes 10 % off the merchandise and leaves the fee alone", () => {
    expect(review.voucher).toEqual({
      kind: "applied",
      code: "TEST",
      discount: 229_900,
    })
    expect(review.discount).toBe(229_900)
    expect(review.subtotal).toBe(2_299_000)
    expect(review.shipping).toEqual({ ok: true, fee: 12_000, basis: "rate" })
    expect(review.total).toBe(2_081_100)
  })
})

describe("the fee does not depend on the voucher (D2)", () => {
  // Build A + Ryzen as one 16,310 g line of ₱80,555.00
  const big = () => cartOf(line("bundle", 8_055_500, 1))
  const bigWeights = weightsOf(["bundle", 16_310])

  it("V3/V4: free shipping stays free after a 10 % code", () => {
    const without = buildReview(big(), bigWeights, QC, config)
    expect(without.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(without.total).toBe(8_055_500)

    const review = buildReview(big(), bigWeights, QC, config, asked())
    expect(review.discount).toBe(805_550)
    expect(review.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(review.total).toBe(7_249_950)
    expect(review.threshold).toBeNull()
  })

  it("V5/V5a: ₱75,050.00 to Mindanao ships free, and a ₱100.00 code lowers the total", () => {
    const heavy = () => cartOf(line("tower", 7_505_000, 1))
    const w = weightsOf(["tower", 21_000])
    const without = buildReview(heavy(), w, DAVAO, config)
    expect(without.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(without.total).toBe(7_505_000)

    const review = buildReview(
      heavy(),
      w,
      DAVAO,
      config,
      asked({ type: "FIXED", value: 10_000 })
    )
    expect(review.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(review.total).toBe(7_495_000)
    expect(review.total!).toBeLessThan(without.total!)
  })

  it("U14: the threshold boundary is on the subtotal before the discount", () => {
    const fixed = asked({ type: "FIXED", value: 10_000 })
    const at = cartOf(line("a", 7_500_000, 1))
    const below = cartOf(line("a", 7_499_999, 1))
    const w = weightsOf(["a", 21_000])
    // 21 kg to Mindanao is the open-ended tier, ₱1,450.00
    for (const request of [fixed, { requested: false } as VoucherRequest]) {
      expect(buildReview(at, w, DAVAO, config, request).shipping).toMatchObject(
        { fee: 0, basis: "free-shipping" }
      )
      expect(
        buildReview(below, w, DAVAO, config, request).shipping
      ).toMatchObject({ fee: 145_000, basis: "rate" })
    }
  })

  it("V6: below the threshold the fee is the same with and without the code", () => {
    const build = () => cartOf(line("buildb", 7_456_000, 1))
    const w = weightsOf(["buildb", 15_000])
    const without = buildReview(build(), w, QC, config)
    const review = buildReview(
      build(),
      w,
      QC,
      config,
      asked({ type: "FIXED", value: 500_000 })
    )
    expect(without.shipping).toMatchObject({ fee: 45_000 })
    expect(review.shipping).toEqual(without.shipping)
    expect(review.total).toBe(7_001_000)
    expect(review.threshold).toBe(7_500_000)
  })

  it("V7: pickup is free and the discount comes off the subtotal", () => {
    const review = buildReview(
      cartOf(line("buildaa", 6_906_000, 1)),
      weightsOf(["buildaa", 15_860]),
      PICKUP,
      config,
      asked()
    )
    expect(review.discount).toBe(690_600)
    expect(review.shipping).toMatchObject({ fee: 0, basis: "pickup" })
    expect(review.total).toBe(6_215_400)
  })
})

describe("U15: a voucher never raises the total or changes the fee", () => {
  // A small deterministic generator, so a failure repeats
  let seedValue = 20261104
  const next = (limit: number) => {
    seedValue = (seedValue * 1_103_515_245 + 12_345) % 2_147_483_648
    return seedValue % limit
  }

  it("holds for random carts, addresses and codes", () => {
    let applied = 0
    for (let i = 0; i < 2_000; i++) {
      const price = 100_000 + next(9_000_000)
      const quantity = 1 + next(3)
      const grams = 100 + next(40_000)
      const destination =
        next(5) === 0
          ? PICKUP
          : ({
              method: "delivery",
              zone: ZONES[next(ZONES.length)],
              regionName: "Region",
            } as ReviewDestination)
      const cart = cartOf(line("p", price, quantity))
      const w = weightsOf(["p", grams])
      const request = asked(
        next(2) === 0
          ? { type: "FIXED", value: 1 + next(2_000_000) }
          : { type: "PERCENT", value: 1 + next(100) }
      )

      const without = buildReview(cart, w, destination, config)
      const review = buildReview(cart, w, destination, config, request)

      expect(review.shipping).toEqual(without.shipping)
      if (review.voucher.kind === "applied") {
        applied++
        expect(review.total!).toBeLessThanOrEqual(without.total!)
        expect(review.total!).toBe(without.total! - review.discount)
        expect(review.total!).toBeGreaterThanOrEqual(MIN_ONLINE_TOTAL)
      } else {
        expect(review.total).toBe(without.total)
        expect(review.discount).toBe(0)
      }
    }
    // The generator really exercised the applied case
    expect(applied).toBeGreaterThan(1_000)
  })
})

describe("U16 and V13: the lowest total a code may leave", () => {
  const lancool = () => cartOf(line("lancool", 579_500, 1))
  const w = weightsOf(["lancool", 9_000])

  it("accepts a total of exactly ₱20.00", () => {
    const review = buildReview(
      lancool(),
      w,
      PICKUP,
      config,
      asked({ type: "FIXED", value: 577_500 })
    )
    expect(review.voucher.kind).toBe("applied")
    expect(review.total).toBe(MIN_ONLINE_TOTAL)
  })

  it("refuses a total of ₱19.99", () => {
    const review = buildReview(
      lancool(),
      w,
      PICKUP,
      config,
      asked({ type: "FIXED", value: 577_501 })
    )
    expect(review.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "below-minimum" },
    })
    expect(review.discount).toBe(0)
    expect(review.total).toBe(579_500)
  })

  it("refuses a total of ₱0.00", () => {
    for (const request of [
      asked({ type: "PERCENT", value: 100 }),
      asked({ type: "FIXED", value: 579_500 }),
      asked({ type: "FIXED", value: 900_000 }),
    ]) {
      const review = buildReview(lancool(), w, PICKUP, config, request)
      expect(review.voucher).toMatchObject({ kind: "refused" })
      expect(review.total).toBe(579_500)
    }
  })

  it("V13a: refuses a full discount on an order that ships free", () => {
    const big = () => cartOf(line("bundle", 8_055_500, 1))
    const bw = weightsOf(["bundle", 16_310])
    const refused = buildReview(
      big(),
      bw,
      QC,
      config,
      asked({ type: "FIXED", value: 8_055_500 })
    )
    expect(refused.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "below-minimum" },
    })
    const ok = buildReview(
      big(),
      bw,
      QC,
      config,
      asked({ type: "FIXED", value: 8_053_500 })
    )
    expect(ok.voucher.kind).toBe("applied")
    expect(ok.total).toBe(MIN_ONLINE_TOTAL)
  })

  it("lets a 100 % code through on delivery, where the fee remains", () => {
    const review = buildReview(
      lancool(),
      w,
      QC,
      config,
      asked({ type: "PERCENT", value: 100 })
    )
    expect(review.voucher.kind).toBe("applied")
    expect(review.total).toBe(
      review.shipping.ok ? review.shipping.fee : Number.NaN
    )
  })
})

describe("refusals", () => {
  it("passes the reason through, and the cart is unchanged", () => {
    const cart = cartOf(line("lancool", 579_500, 1))
    const w = weightsOf(["lancool", 9_000])
    const short = buildReview(
      cart,
      w,
      PICKUP,
      config,
      asked({ minSpend: 1_000_000 })
    )
    expect(short.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "min-spend", shortBy: 420_500 },
    })
    expect(short.discount).toBe(0)
    expect(short.total).toBe(579_500)
    expect(short.canPlace).toBe(true)

    const unknown = buildReview(cart, w, PICKUP, config, {
      requested: true,
      voucher: null,
      now: NOW,
    })
    expect(unknown.voucher).toEqual({
      kind: "refused",
      refusal: { reason: "unknown" },
    })
  })

  it("judges the dates against the one clock it is given", () => {
    const cart = cartOf(line("lancool", 579_500, 1))
    const w = weightsOf(["lancool", 9_000])
    const request = asked({ endsAt: NOW })
    expect(buildReview(cart, w, PICKUP, config, request).voucher).toEqual({
      kind: "refused",
      refusal: { reason: "ended" },
    })
  })

  it("applies a code on a delivery order with no rate, with no total", () => {
    const only: ShippingConfig = { ...config, rates: [] }
    const review = buildReview(ryzen2(), ryzenWeights, QC, only, asked())
    expect(review.shipping).toEqual({ ok: false, reason: "no-rate" })
    expect(review.voucher.kind).toBe("applied")
    expect(review.total).toBeNull()
    expect(review.canPlace).toBe(false)
  })
})
