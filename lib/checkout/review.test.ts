import { describe, expect, it } from "vitest"

import { sharedBuildView } from "@/lib/build-state/shared"
import type { AnyBuildPart } from "@/lib/builder"
import {
  groupPartFlags,
  type ProductFlag,
  flaggedCount,
} from "@/lib/cart/flags"
import type {
  CartEntry,
  CartGroupView,
  CartLineView,
  CartView,
} from "@/lib/cart/types"
import type { ShippingConfig } from "@/lib/shipping/config"
import type { ShippingRateTier } from "@/lib/shipping/fee"
import type { ShippingZone } from "@/lib/shipping/zones"
import { buildA, buildB, seed } from "@/test-support/seed-parts"
import {
  partsOf,
  snapshot,
  type SnapshotOptions,
} from "@/test-support/shared-snapshot"
import { seedProduct } from "@/test-support/seed-products"

import { checkoutButton } from "./button"
import { problemsHeading, problemText } from "./copy"
import { cartProblems } from "./problems"
import { buildReview, type ReviewDestination } from "./review"

// docs/specs/029-checkout-steps, R1–R16 and N7, N8, from the real engine's
// output for seed parts and spec 028's demo rates (written out as fixtures)

const LIMITS = [1_000, 3_000, 10_000, 20_000, null]
const DEMO_FEES: Record<ShippingZone, number[]> = {
  "metro-manila": [12_000, 18_000, 30_000, 45_000, 65_000],
  luzon: [15_000, 24_000, 42_000, 65_000, 95_000],
  visayas: [19_000, 32_000, 58_000, 90_000, 130_000],
  mindanao: [21_000, 35_000, 65_000, 100_000, 145_000],
}
const rates = (zones = Object.keys(DEMO_FEES) as ShippingZone[]) =>
  zones.flatMap((zone) =>
    DEMO_FEES[zone].map<ShippingRateTier>((fee, i) => ({
      zone,
      maxWeightGrams: LIMITS[i],
      fee,
    }))
  )
const config = (over: Partial<ShippingConfig["settings"]> = {}, r = rates()) =>
  ({
    rates: r,
    settings: {
      freeShippingThreshold: 7_500_000,
      pickupEnabled: true,
      storeAddress: "",
      storeHours: "",
      storeInfo: "",
      orderExpiryHours: 24,
      ...over,
    },
  }) satisfies ShippingConfig

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

const price = (part: AnyBuildPart) => seedProduct(part.category, part.id).price

function single(
  part: AnyBuildPart,
  quantity: number,
  flag: ProductFlag | null = null,
  sold = true
): CartLineView {
  return {
    kind: "single",
    id: `line-${part.id}`,
    productId: part.id,
    name: part.name,
    slug: part.id,
    categorySlug: part.category,
    brand: "Brand",
    image: null,
    price: price(part),
    salePrice: null,
    unitPrice: price(part),
    quantity,
    lineTotal: price(part) * quantity,
    status: "in-stock",
    preorderShipsOn: null,
    sold,
    max: quantity,
    flag,
    setTo: null,
  }
}

function group(
  parts: AnyBuildPart[],
  options: SnapshotOptions = {},
  flags = new Map<string, ProductFlag>(),
  id = "b1"
): CartGroupView {
  // The snapshot helper prices only some parts; use the seed's price for all
  const items = snapshot(parts, options).map((item) =>
    item.state === "available"
      ? {
          ...item,
          data: {
            ...item.data,
            price: price(item.data.part),
            effectivePrice: price(item.data.part),
          },
        }
      : item
  )
  const view = sharedBuildView(items)
  const slots = view.slots.filter(({ rows }) => rows.length > 0)
  return {
    kind: "build",
    buildId: id,
    slug: "k3x9m2q7ab",
    number: null,
    partCount: slots.reduce((sum, { rows }) => sum + rows.length, 0),
    total: view.total,
    status: view.status,
    issues: view.issues,
    slots,
    flags: groupPartFlags(slots, flags),
  }
}

function cart(entries: CartEntry[]): CartView {
  const groups = entries.filter((e) => e.kind === "build")
  if (groups.length > 1) groups.forEach((g, i) => (g.number = i + 1))
  return {
    entries,
    subtotal: entries.reduce(
      (sum, e) =>
        e.kind === "build" ? sum + e.total : e.sold ? sum + e.lineTotal : sum,
      0
    ),
    count: entries.reduce(
      (sum, e) => sum + (e.kind === "build" ? 1 : e.quantity),
      0
    ),
    flagged: flaggedCount(entries),
  }
}

// The weights of every seed part used here, by id (the sku)
const weights = new Map(
  [
    ...partsOf(buildA()),
    ...partsOf(buildB()),
    seed.ryzen5_7600,
    seed.lancool216,
  ].map((part) => [part.id, seedProduct(part.category, part.id).weightGrams])
)

const buildAParts = () => partsOf(buildA())
const buildBParts = () => partsOf(buildB())

describe("buildReview: totals and the fee", () => {
  it("R1: Ryzen 5 7600 × 2 to Quezon City", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 2)]),
      weights,
      QC,
      config()
    )
    expect(review.subtotal).toBe(2_299_000)
    expect(review.weightGrams).toBe(900)
    expect(review.shipping).toEqual({ ok: true, fee: 12_000, basis: "rate" })
    expect(review.total).toBe(2_311_000)
    expect(review.threshold).toBe(7_500_000)
    expect(review.problems).toEqual([])
    expect(review.canPlace).toBe(true)
  })

  it("R2: Build A for pickup is free and has no threshold note", () => {
    const review = buildReview(
      cart([group(buildAParts())]),
      weights,
      PICKUP,
      config()
    )
    expect(review.subtotal).toBe(6_906_000)
    expect(review.shipping).toMatchObject({ ok: true, fee: 0, basis: "pickup" })
    expect(review.total).toBe(6_906_000)
    expect(review.threshold).toBeNull()
  })

  it("R4: Build A to Davao pays the Mindanao tier", () => {
    const review = buildReview(
      cart([group(buildAParts())]),
      weights,
      DAVAO,
      config()
    )
    expect(review.weightGrams).toBe(15_860)
    expect(review.shipping).toMatchObject({ fee: 100_000 })
    expect(review.total).toBe(7_006_000)
  })

  it("R5: a single Ryzen plus Build A is free (both weigh in)", () => {
    const review = buildReview(
      cart([group(buildAParts()), single(seed.ryzen5_7600, 1)]),
      weights,
      QC,
      config()
    )
    expect(review.subtotal).toBe(8_055_500)
    expect(review.weightGrams).toBe(16_310)
    expect(review.shipping).toMatchObject({ fee: 0, basis: "free-shipping" })
    expect(review.total).toBe(8_055_500)
    expect(review.threshold).toBeNull()
  })

  it("R6: LANCOOL 216 × 3 to Davao takes the open-ended tier", () => {
    const review = buildReview(
      cart([single(seed.lancool216, 3)]),
      weights,
      DAVAO,
      config()
    )
    expect(review.weightGrams).toBe(27_000)
    expect(review.subtotal).toBe(1_738_500)
    expect(review.total).toBe(1_738_500 + 145_000)
  })

  it("R7: Build B is not blocked, and its warning is listed", () => {
    const review = buildReview(
      cart([group(buildBParts())]),
      weights,
      QC,
      config()
    )
    expect(review.subtotal).toBe(7_456_000)
    expect(review.shipping).toMatchObject({ fee: 45_000 })
    expect(review.total).toBe(7_501_000)
    expect(review.canPlace).toBe(true)
    expect(review.warnings).toHaveLength(1)
    expect(review.warnings[0].issues.map((i) => i.rule)).toEqual([
      "bios-update",
    ])
  })

  it("leaves the threshold note out when free shipping is off", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 1)]),
      weights,
      QC,
      config({ freeShippingThreshold: null })
    )
    expect(review.threshold).toBeNull()
  })

  it("counts only parts still sold in the weight and the total (R11)", () => {
    const gpu = seed.rtx4060
    const flags = new Map<string, ProductFlag>([[gpu.id, { kind: "retired" }]])
    const review = buildReview(
      cart([group(buildAParts(), { retired: [gpu] }, flags)]),
      weights,
      QC,
      config()
    )
    expect(review.subtotal).toBe(6_906_000 - 1_799_500)
    expect(review.weightGrams).toBe(15_860 - weights.get(gpu.id)!)
  })

  it("throws for a part with no weight (a caller bug)", () => {
    expect(() =>
      buildReview(cart([single(seed.ryzen5_7600, 1)]), new Map(), QC, config())
    ).toThrow(/No weight/)
  })
})

describe("buildReview: problems", () => {
  const over: ProductFlag = { kind: "over-stock", stock: 2, total: 3 }

  it("R8: a single line over stock blocks, totals still shown", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 3, over)]),
      weights,
      QC,
      config()
    )
    expect(review.canPlace).toBe(false)
    expect(review.problems.map(problemText)).toEqual([
      "AMD Ryzen 5 7600: Only 2 in stock, 3 in your cart",
    ])
    expect(review.total).toBe(3_448_500 + 18_000)
  })

  it("R9: the single line and the group part both carry it", () => {
    const flag: ProductFlag = { kind: "over-stock", stock: 1, total: 2 }
    const flags = new Map([[seed.ryzen5_7600.id, flag]])
    const review = buildReview(
      cart([
        single(seed.ryzen5_7600, 1, flag),
        group(buildAParts(), {}, flags),
      ]),
      weights,
      QC,
      config()
    )
    expect(review.problems.map(problemText)).toEqual([
      "AMD Ryzen 5 7600: Only 1 in stock, 2 in your cart",
      "Custom PC build: AMD Ryzen 5 7600: Only 1 in stock, 2 in your cart",
    ])
  })

  it("R10: out of stock", () => {
    const review = buildReview(
      cart([single(seed.lancool216, 1, { kind: "out-of-stock" })]),
      weights,
      QC,
      config()
    )
    expect(review.problems.map(problemText)).toEqual([
      "Lian Li LANCOOL 216 Black: Out of stock",
    ])
  })

  it("R12: a group with errors blocks and names them", () => {
    const parts = [
      ...buildAParts().filter((p) => p.category !== "motherboard"),
      seed.proB760mDdr4,
    ]
    const review = buildReview(cart([group(parts)]), weights, QC, {
      ...config(),
    })
    const problem = review.problems.find((p) => p.kind === "build-errors")
    expect(problem?.kind).toBe("build-errors")
    expect(problemText(problem!)).toBe("Custom PC build has errors:")
    expect(
      problem?.kind === "build-errors" && problem.issues.map((i) => i.rule)
    ).toEqual(expect.arrayContaining(["socket-match", "memory-type"]))
    expect(review.canPlace).toBe(false)
  })

  it("R14: delivery with no rate blocks and has no total", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 1)]),
      weights,
      DAVAO,
      config({}, rates(["metro-manila", "luzon", "visayas"]))
    )
    expect(review.shipping).toEqual({ ok: false, reason: "no-rate" })
    expect(review.total).toBeNull()
    expect(review.problems.map(problemText)).toEqual([
      "We can't deliver to Region XI (Davao Region) yet. Choose store pickup or another address.",
    ])
  })

  it("R15: the same cart for pickup is fine", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 1)]),
      weights,
      PICKUP,
      config({}, [])
    )
    expect(review.canPlace).toBe(true)
    expect(review.shipping).toMatchObject({ ok: true, fee: 0 })
  })

  it("R16: stock problems come before the missing rate", () => {
    const review = buildReview(
      cart([single(seed.ryzen5_7600, 3, over)]),
      weights,
      DAVAO,
      config({}, [])
    )
    expect(review.problems.map((p) => p.kind)).toEqual(["line", "no-rate"])
  })
})

describe("cartProblems", () => {
  it("lists stock problems in cart order, then build errors", () => {
    const parts = [
      ...buildAParts().filter((p) => p.category !== "motherboard"),
      seed.proB760mDdr4,
    ]
    const flag: ProductFlag = { kind: "out-of-stock" }
    const view = cart([
      group(parts, {}, new Map(), "b1"),
      single(seed.lancool216, 1, flag),
    ])
    expect(cartProblems(view).map((p) => p.kind)).toEqual([
      "line",
      "build-errors",
    ])
  })

  it("is empty for a clean cart", () => {
    expect(cartProblems(cart([single(seed.ryzen5_7600, 1)]))).toEqual([])
  })

  it("has a heading that counts", () => {
    expect(problemsHeading(1)).toBe("1 problem to fix before you can order")
    expect(problemsHeading(3)).toBe("3 problems to fix before you can order")
  })
})

describe("checkoutButton", () => {
  it("is enabled for a clean cart", () => {
    expect(checkoutButton(cart([single(seed.ryzen5_7600, 1)]))).toEqual({
      enabled: true,
    })
  })

  it("N7: a flagged line disables it", () => {
    expect(
      checkoutButton(
        cart([single(seed.lancool216, 1, { kind: "out-of-stock" })])
      )
    ).toEqual({ enabled: false, flagged: true, errors: false })
  })

  it("N8: a group with errors and no flags disables it", () => {
    const parts = [
      ...buildAParts().filter((p) => p.category !== "motherboard"),
      seed.proB760mDdr4,
    ]
    expect(checkoutButton(cart([group(parts)]))).toEqual({
      enabled: false,
      flagged: false,
      errors: true,
    })
  })

  it("is disabled for an empty cart", () => {
    expect(checkoutButton(cart([]))).toMatchObject({ enabled: false })
  })
})
