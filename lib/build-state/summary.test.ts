import { describe, expect, test } from "vitest"

import type { AnyBuildPart, BuildChange, Slot } from "@/lib/builder"
import { formatPeso } from "@/lib/format"
import type { StockStatus } from "@/lib/stock"
import { buildA, seed, swap } from "@/test-support/seed-parts"

import type { BuilderPartData } from "./parts"
import {
  availabilityMessage,
  buildNotice,
  buildTotal,
  unavailableParts,
} from "./summary"

// The summary's figures and the builder's notices (docs/specs/020-builder-
// page, Behavior 6 and 15, Messages). Prices are seed prices in centavos.

const prices: Record<string, [price: number, salePrice?: number]> = {
  [seed.ryzen5_7600.id]: [1_149_500],
  [seed.ryzen7_9800x3d.id]: [2_999_500],
  [seed.strixB650a.id]: [1_499_500],
  [seed.vengeanceDdr5.id]: [649_500],
  [seed.pro990.id]: [699_500],
  [seed.mx500.id]: [449_500],
  [seed.rtx4060.id]: [1_799_500],
  [seed.rtx5090Astral.id]: [17_999_500],
  [seed.lancool216.id]: [579_500],
  [seed.mwe550.id]: [299_500],
  [seed.rm850e.id]: [749_500],
  [seed.peerless.id]: [229_500],
}

// The loaded parts, keyed by id, with a stock status per id
function loaded(
  parts: AnyBuildPart[],
  statuses: Record<string, StockStatus> = {}
): Map<string, BuilderPartData> {
  return new Map(
    parts.map((part) => {
      const [price, salePrice = null] = prices[part.id] ?? [100_000]
      const data: BuilderPartData = {
        part,
        slug: part.id,
        brand: "Brand",
        price,
        salePrice,
        effectivePrice: salePrice ?? price,
        stock: 10,
        stockStatus: statuses[part.id] ?? "in-stock",
        image: null,
      }
      return [part.id, data]
    })
  )
}

const partsOf = (build: ReturnType<typeof buildA>) =>
  Object.values(build).flatMap((entries) =>
    (entries ?? []).map((entry) => entry.part as AnyBuildPart)
  )

describe("buildTotal", () => {
  test("is ₱0.00 for an empty build (E1)", () => {
    expect(buildTotal({}, new Map())).toBe(0)
  })

  test("is the effective price of one part (E2)", () => {
    const build = { cpu: [{ part: seed.ryzen5_7600, quantity: 1 }] }
    expect(buildTotal(build, loaded([seed.ryzen5_7600]))).toBe(1_149_500)
  })

  test("adds up build A to ₱69,060.00 (E3)", () => {
    const build = buildA()
    const total = buildTotal(build, loaded(partsOf(build)))
    expect(formatPeso(total)).toBe("₱69,060.00")
  })

  test("uses the sale price (E4)", () => {
    const build = { cpu: [{ part: seed.ryzen5_7600, quantity: 1 }] }
    const parts = loaded([seed.ryzen5_7600])
    parts.set(seed.ryzen5_7600.id, {
      ...parts.get(seed.ryzen5_7600.id)!,
      price: 1_249_500,
      salePrice: 1_099_500,
      effectivePrice: 1_099_500,
    })
    expect(buildTotal(build, parts)).toBe(1_099_500)
  })

  test("counts an out-of-stock part (E7)", () => {
    const build = {
      cpu: [{ part: seed.ryzen7_9800x3d, quantity: 1 }],
      gpu: [{ part: seed.rtx5090Astral, quantity: 1 }],
      psu: [{ part: seed.rm850e, quantity: 1 }],
    }
    const parts = loaded(
      [seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm850e],
      { [seed.rtx5090Astral.id]: "out-of-stock" }
    )
    expect(formatPeso(buildTotal(build, parts))).toBe("₱217,485.00")
  })

  test("drops the graphics card from build A (E11)", () => {
    const build = { ...buildA(), gpu: [] }
    expect(formatPeso(buildTotal(build, loaded(partsOf(buildA()))))).toBe(
      "₱51,065.00"
    )
  })

  test.each([
    [2, "₱75,555.00"],
    [3, "₱82,050.00"],
  ])("multiplies memory quantity %i (E12, E13)", (quantity, expected) => {
    const build = {
      ...buildA(),
      memory: [{ part: seed.vengeanceDdr5, quantity }],
    }
    expect(formatPeso(buildTotal(build, loaded(partsOf(buildA()))))).toBe(
      expected
    )
  })

  test("adds every drive with its quantity", () => {
    const build = {
      ...buildA(),
      storage: [
        { part: seed.pro990, quantity: 2 },
        { part: seed.mx500, quantity: 1 },
      ],
    }
    const parts = loaded([...partsOf(buildA()), seed.mx500])
    expect(formatPeso(buildTotal(build, parts))).toBe("₱80,550.00")
  })
})

describe("unavailableParts", () => {
  test("is empty when every part is buyable (E3)", () => {
    const build = buildA()
    expect(unavailableParts(build, loaded(partsOf(build)))).toEqual([])
  })

  test("names out-of-stock and pre-order parts in slot order, not low stock (E7, E9)", () => {
    const build = swap(buildA(), seed.ryzen7_9800x3d)
    const parts = loaded(partsOf(build), {
      [seed.ryzen7_9800x3d.id]: "low-stock",
      [seed.rtx4060.id]: "out-of-stock",
      [seed.pro990.id]: "pre-order",
    })
    expect(unavailableParts(build, parts)).toEqual([
      seed.pro990.name,
      seed.rtx4060.name,
    ])
  })
})

describe("availabilityMessage", () => {
  test("says nothing when every part is buyable", () => {
    expect(availabilityMessage([])).toBeNull()
  })

  test("names one part (E7)", () => {
    expect(
      availabilityMessage(["ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB"])
    ).toBe(
      "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB isn't available to buy right now. Replace it to add this build to cart."
    )
  })

  test("counts several (E9)", () => {
    expect(availabilityMessage(["A", "B"])).toBe(
      "2 parts in this build aren't available to buy right now. Replace them to add this build to cart."
    )
  })
})

const change = (
  kind: BuildChange["kind"],
  slot?: Slot,
  productId = "x"
): BuildChange => ({ kind, slot, productId, detail: "" })

describe("buildNotice", () => {
  test("is empty with nothing to tell", () => {
    expect(buildNotice([])).toEqual([])
  })

  test("names the slot of one removed part (E48)", () => {
    expect(buildNotice([change("not-found", "gpu")])).toEqual([
      "A part in your saved build is no longer available, so we removed it: Graphics Card.",
    ])
  })

  test("lists the slots of several, once each, in slot order (E50)", () => {
    expect(
      buildNotice([
        change("not-found", "gpu"),
        change("not-found", "storage", "a"),
        change("not-found", "storage", "b"),
      ])
    ).toEqual([
      "Some parts in your saved build are no longer available, so we removed them: Storage, Graphics Card.",
    ])
  })

  test("counts a part in the wrong slot as removed (E51)", () => {
    expect(buildNotice([change("wrong-category", "storage")])).toEqual([
      "A part in your saved build is no longer available, so we removed it: Storage.",
    ])
  })

  test("says when the saved build couldn't be read (E52)", () => {
    expect(buildNotice([change("reset")])).toEqual([
      "We couldn't read your saved build, so we started a new one.",
    ])
  })

  describe("for a shared build opened in the builder (E52, E53)", () => {
    test("names the slot of one part left out", () => {
      expect(buildNotice([], [change("not-found", "gpu")])).toEqual([
        "A part from the shared build is no longer available, so we left it out: Graphics Card.",
      ])
    })

    test("lists the slots of several, once each, in slot order", () => {
      expect(
        buildNotice(
          [],
          [change("not-found", "gpu"), change("not-found", "storage", "a")]
        )
      ).toEqual([
        "Some parts from the shared build are no longer available, so we left them out: Storage, Graphics Card.",
      ])
    })

    test("counts two drives as several parts in one slot", () => {
      expect(
        buildNotice(
          [],
          [
            change("not-found", "storage", "a"),
            change("not-found", "storage", "b"),
          ]
        )
      ).toEqual([
        "Some parts from the shared build are no longer available, so we left them out: Storage.",
      ])
    })

    test("comes after the saved-build lines and ignores other repairs", () => {
      expect(
        buildNotice(
          [change("reset")],
          [change("merged-duplicate", "storage"), change("not-found", "case")]
        )
      ).toEqual([
        "We couldn't read your saved build, so we started a new one.",
        "A part from the shared build is no longer available, so we left it out: Case.",
      ])
    })
  })

  test.each([
    "invalid-entry",
    "unknown-slot",
    "invalid-quantity",
    "merged-duplicate",
    "extra-entry",
    "quantity-set-to-1",
  ] as const)("keeps quiet about %s (E53)", (kind) => {
    expect(buildNotice([change(kind, "storage")])).toEqual([])
  })
})
