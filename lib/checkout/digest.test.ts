import { describe, expect, it } from "vitest"

import { reviewDigest } from "./digest"
import type { CheckoutReview } from "./review"

// docs/specs/030-place-an-order: D2–D4, U6

type Single = {
  productId: string
  quantity: number
  unitPrice: number
  name?: string
}
type Part = {
  slot: string
  id: string
  quantity: number
  effectivePrice: number
}

function review(
  options: {
    singles?: Single[]
    parts?: Part[]
    fee?: number | null
    subtotal?: number
    total?: number | null
    warnings?: number
    flag?: boolean
  } = {}
): CheckoutReview {
  const {
    singles = [{ productId: "ryzen", quantity: 2, unitPrice: 1_149_500 }],
    parts = [],
    fee = 12_000,
    subtotal = 2_299_000,
    total = 2_311_000,
  } = options
  const entries: unknown[] = singles.map((s) => ({
    kind: "single",
    name: s.name ?? s.productId,
    flag: options.flag ? "out-of-stock" : null,
    ...s,
  }))
  if (parts.length > 0) {
    entries.push({
      kind: "build",
      buildId: "build-1",
      slots: parts.map((p) => ({
        slot: p.slot,
        rows: [
          {
            kind: "part",
            quantity: p.quantity,
            data: { part: { id: p.id }, effectivePrice: p.effectivePrice },
          },
        ],
      })),
    })
  }
  return {
    view: { entries },
    shipping:
      fee === null ? { ok: false, reason: "no-rate" } : { ok: true, fee },
    subtotal,
    total,
    warnings: Array.from({ length: options.warnings ?? 0 }),
  } as unknown as CheckoutReview
}

describe("reviewDigest", () => {
  it("is 64 lowercase hex characters", () => {
    expect(reviewDigest(review())).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is the same for the same review (D1)", () => {
    expect(reviewDigest(review())).toBe(reviewDigest(review()))
  })

  it.each([
    [
      "a quantity",
      { singles: [{ productId: "ryzen", quantity: 3, unitPrice: 1_149_500 }] },
    ],
    [
      "a unit price",
      { singles: [{ productId: "ryzen", quantity: 2, unitPrice: 1_099_500 }] },
    ],
    ["the fee", { fee: 15_000 }],
    ["no rate", { fee: null }],
    ["the subtotal", { subtotal: 2_299_001 }],
    ["the total", { total: 2_311_001 }],
    [
      "a line added",
      {
        singles: [
          { productId: "ryzen", quantity: 2, unitPrice: 1_149_500 },
          { productId: "lancool", quantity: 1, unitPrice: 579_500 },
        ],
      },
    ],
    [
      "a build part",
      {
        parts: [
          { slot: "cpu", id: "ryzen", quantity: 1, effectivePrice: 1_149_500 },
        ],
      },
    ],
  ])("differs when %s changes (D2)", (_name, change) => {
    expect(reviewDigest(review(change))).not.toBe(reviewDigest(review()))
  })

  it("ignores warnings, names and flags (D3)", () => {
    expect(reviewDigest(review({ warnings: 2 }))).toBe(reviewDigest(review()))
    expect(
      reviewDigest(
        review({
          singles: [
            {
              productId: "ryzen",
              quantity: 2,
              unitPrice: 1_149_500,
              name: "Renamed",
            },
          ],
          flag: true,
        })
      )
    ).toBe(reviewDigest(review()))
  })

  it("ignores the order of the lines (D4)", () => {
    const a: Single = { productId: "ryzen", quantity: 1, unitPrice: 100 }
    const b: Single = { productId: "lancool", quantity: 2, unitPrice: 200 }
    expect(reviewDigest(review({ singles: [a, b] }))).toBe(
      reviewDigest(review({ singles: [b, a] }))
    )
    const p1: Part = { slot: "cpu", id: "x", quantity: 1, effectivePrice: 1 }
    const p2: Part = { slot: "gpu", id: "y", quantity: 1, effectivePrice: 2 }
    expect(reviewDigest(review({ parts: [p1, p2] }))).toBe(
      reviewDigest(review({ parts: [p2, p1] }))
    )
  })

  it("tells a single line from the same product in a build", () => {
    const single = review({
      singles: [{ productId: "ryzen", quantity: 1, unitPrice: 100 }],
    })
    const inBuild = review({
      singles: [],
      parts: [{ slot: "cpu", id: "ryzen", quantity: 1, effectivePrice: 100 }],
    })
    expect(reviewDigest(single)).not.toBe(reviewDigest(inBuild))
  })
})
