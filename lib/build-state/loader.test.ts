import { describe, expect, test } from "vitest"

import type { AnyBuildPart, BuildItem, Slot } from "@/lib/builder"
import { seed } from "@/test-support/seed-parts"

import { assembleLoaded, goneChanges, partsRequest } from "./loader"
import type { BuilderPartData } from "./parts"

// The builder page's parts loader, minus React (docs/specs/020-builder-page,
// Behavior 5–8)

const item = (slot: Slot, productId: string, quantity = 1): BuildItem => ({
  slot,
  productId,
  quantity,
})

const data = (part: AnyBuildPart): BuilderPartData => ({
  part,
  slug: part.id,
  brand: "Brand",
  price: 100_000,
  salePrice: null,
  effectivePrice: 100_000,
  stock: 10,
  stockStatus: "in-stock",
  image: null,
})

const loaded = (...parts: AnyBuildPart[]) =>
  new Map(parts.map((part) => [part.id, data(part)]))

const cpu = item("cpu", seed.ryzen5_7600.id)
const gpu = item("gpu", seed.rtx4060.id)

describe("partsRequest", () => {
  test("asks for nothing for an empty build (E1)", () => {
    expect(partsRequest([], new Map())).toBeNull()
  })

  test("asks for every id when one isn't loaded yet", () => {
    expect(partsRequest([cpu, gpu], loaded(seed.ryzen5_7600))).toBe(
      `${seed.ryzen5_7600.id},${seed.rtx4060.id}`
    )
  })

  test("asks for nothing when every part is loaded (E11: removing)", () => {
    expect(
      partsRequest([cpu], loaded(seed.ryzen5_7600, seed.rtx4060))
    ).toBeNull()
  })

  test("asks for nothing when only a quantity changed (E12)", () => {
    const memory = item("memory", seed.vengeanceDdr5.id, 2)
    expect(partsRequest([memory], loaded(seed.vengeanceDdr5))).toBeNull()
  })
})

describe("assembleLoaded", () => {
  test("attaches the loaded parts to the items", () => {
    const { build } = assembleLoaded([cpu], loaded(seed.ryzen5_7600))
    expect(build.cpu).toEqual([{ part: seed.ryzen5_7600, quantity: 1 }])
  })
})

describe("goneChanges", () => {
  test("reports a requested id that didn't come back (E48)", () => {
    const missing = item("gpu", "cm0000000000000000000000000")
    const changes = goneChanges(
      [cpu, missing],
      loaded(seed.ryzen5_7600),
      new Set([cpu.productId, missing.productId])
    )
    expect(changes).toEqual([
      expect.objectContaining({
        kind: "not-found",
        slot: "gpu",
        productId: missing.productId,
      }),
    ])
  })

  test("reports a part in the wrong slot (E51)", () => {
    const misplaced = item("storage", seed.ryzen5_7600.id)
    const changes = goneChanges(
      [misplaced],
      loaded(seed.ryzen5_7600),
      new Set([misplaced.productId])
    )
    expect(changes.map((change) => change.kind)).toEqual(["wrong-category"])
  })

  test("doesn't judge an id added after the request was sent", () => {
    const changes = goneChanges(
      [cpu, gpu],
      loaded(seed.ryzen5_7600),
      new Set([cpu.productId])
    )
    expect(changes).toEqual([])
  })
})
