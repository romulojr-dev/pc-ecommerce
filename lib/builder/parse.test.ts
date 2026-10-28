import { describe, expect, test } from "vitest"

import { seedPart } from "@/test-support/seed-parts"

import { validateBuild } from "./limits"
import {
  assembleBuild,
  parseBuild,
  toBuildItems,
  type BuildItem,
} from "./parse"
import type { AnyBuildPart } from "./types"

// Untrusted builds (docs/specs/018-compatibility-rules, "Parsing untrusted
// builds"; E69–E81). Seed SKUs stand in for product ids.

const ryzen5 = seedPart("cpu", "100-100001015BOX")
const i5 = seedPart("cpu", "BX8071514400F")
const strixB650 = seedPart("motherboard", "90MB1BP0-M0AAY0")
const vengeance = seedPart("memory", "CMK32GX5M2B6000C30")
const fury = seedPart("memory", "KF432C16BBK2/16")
const pro990 = seedPart("storage", "MZ-V9P1T0BW")
const sn850x = seedPart("storage", "WDS200T2X0E")
const rtx4060 = seedPart("gpu", "DUAL-RTX4060-O8G")
const lancool = seedPart("case", "LAN216X")
const mwe550 = seedPart("psu", "MPE-5501-ACAAB")
const peerless = seedPart("cpu-cooler", "PA120 SE")

const loaded: AnyBuildPart[] = [
  ryzen5,
  i5,
  strixB650,
  vengeance,
  fury,
  pro990,
  sn850x,
  rtx4060,
  lancool,
  mwe550,
  peerless,
]
const parts = new Map(loaded.map((part) => [part.id, part]))

const item = (
  slot: string,
  productId: string,
  quantity: unknown = 1
): unknown => ({ slot, productId, quantity })

// Spec 001's build A, as stored items
const buildA: BuildItem[] = [
  { slot: "cpu", productId: ryzen5.id, quantity: 1 },
  { slot: "motherboard", productId: strixB650.id, quantity: 1 },
  { slot: "memory", productId: vengeance.id, quantity: 1 },
  { slot: "storage", productId: pro990.id, quantity: 1 },
  { slot: "gpu", productId: rtx4060.id, quantity: 1 },
  { slot: "case", productId: lancool.id, quantity: 1 },
  { slot: "psu", productId: mwe550.id, quantity: 1 },
  { slot: "cpu-cooler", productId: peerless.id, quantity: 1 },
]

describe("parseBuild", () => {
  test("E69: drops an entry for an unknown slot", () => {
    expect(parseBuild([item("fans", "x"), item("cpu", ryzen5.id)])).toEqual({
      items: [{ slot: "cpu", productId: ryzen5.id, quantity: 1 }],
      changes: [{ kind: "unknown-slot", detail: "fans is not a builder slot" }],
    })
  })

  test.each([0, -1, 1.5])("E70: drops a quantity of %s", (quantity) => {
    expect(parseBuild([item("memory", vengeance.id, quantity)])).toEqual({
      items: [],
      changes: [
        {
          kind: "invalid-quantity",
          slot: "memory",
          productId: vengeance.id,
          detail: `memory ${vengeance.id}: quantity ${quantity} is not a whole number of at least 1`,
        },
      ],
    })
  })

  test("E71: keeps the first of two CPUs", () => {
    expect(parseBuild([item("cpu", ryzen5.id), item("cpu", i5.id)])).toEqual({
      items: [{ slot: "cpu", productId: ryzen5.id, quantity: 1 }],
      changes: [
        {
          kind: "extra-entry",
          slot: "cpu",
          productId: i5.id,
          detail: `cpu holds one part; dropped ${i5.id}`,
        },
      ],
    })
  })

  test("E72: keeps the first of two memory kits, with its quantity", () => {
    const result = parseBuild([
      item("memory", vengeance.id, 2),
      item("memory", fury.id),
    ])
    expect(result.items).toEqual([
      { slot: "memory", productId: vengeance.id, quantity: 2 },
    ])
    expect(result.changes.map((change) => change.kind)).toEqual(["extra-entry"])
  })

  test("E73: merges duplicate drives into the first, summing quantities", () => {
    expect(
      parseBuild([
        item("storage", pro990.id),
        item("storage", sn850x.id),
        item("storage", pro990.id, 2),
      ])
    ).toEqual({
      items: [
        { slot: "storage", productId: pro990.id, quantity: 3 },
        { slot: "storage", productId: sn850x.id, quantity: 1 },
      ],
      changes: [
        {
          kind: "merged-duplicate",
          slot: "storage",
          productId: pro990.id,
          detail: `storage ${pro990.id}: merged 2 entries`,
        },
      ],
    })
  })

  test("E74: sets a one-part slot's quantity to 1", () => {
    expect(parseBuild([item("gpu", rtx4060.id, 2)])).toEqual({
      items: [{ slot: "gpu", productId: rtx4060.id, quantity: 1 }],
      changes: [
        {
          kind: "quantity-set-to-1",
          slot: "gpu",
          productId: rtx4060.id,
          detail: `gpu ${rtx4060.id}: quantity 2 set to 1`,
        },
      ],
    })
  })

  test.each([
    ["a string quantity", item("memory", vengeance.id, "2")],
    ["a missing productId", { slot: "memory", quantity: 1 }],
    ["an empty productId", item("memory", "")],
    ["a number", 42],
    ["null", null],
  ])("E75: drops an item with %s, without coercion", (_, bad) => {
    expect(parseBuild([item("cpu", ryzen5.id), bad])).toEqual({
      items: [{ slot: "cpu", productId: ryzen5.id, quantity: 1 }],
      changes: [
        { kind: "invalid-entry", detail: "item 1 is not a valid build item" },
      ],
    })
  })

  test.each(["oops", null, { cpu: [] }, 1])(
    "E76: resets input that isn't a list (%s)",
    (input) => {
      expect(parseBuild(input)).toEqual({
        items: [],
        changes: [
          { kind: "reset", detail: "stored build is not a list of items" },
        ],
      })
    }
  )

  test("E77: nothing stored is an empty build, with no changes", () => {
    expect(parseBuild(undefined)).toEqual({ items: [], changes: [] })
  })

  test("E78: a clean build passes unchanged, in slot order", () => {
    const shuffled = [...buildA].reverse()
    expect(parseBuild(shuffled)).toEqual({ items: buildA, changes: [] })
    expect(parseBuild(buildA)).toEqual({ items: buildA, changes: [] })
  })

  test("ignores extra keys on an item", () => {
    expect(parseBuild([{ ...buildA[0], addedAt: "2026-10-28" }]).items).toEqual(
      [buildA[0]]
    )
  })
})

describe("assembleBuild", () => {
  test("attaches the loaded parts", () => {
    const { build, changes } = assembleBuild(buildA, parts)
    expect(changes).toEqual([])
    expect(build.cpu).toEqual([{ part: ryzen5, quantity: 1 }])
    expect(build.storage).toEqual([{ part: pro990, quantity: 1 }])
    expect(toBuildItems(build)).toEqual(buildA)
  })

  test("E79: drops a part that wasn't found", () => {
    const { build, changes } = assembleBuild(
      [{ slot: "gpu", productId: "gone", quantity: 1 }],
      parts
    )
    expect(build).toEqual({})
    expect(changes).toEqual([
      {
        kind: "not-found",
        slot: "gpu",
        productId: "gone",
        detail: "gpu gone: part not found",
      },
    ])
  })

  test("E80: drops a part in another category's slot", () => {
    const { build, changes } = assembleBuild(
      [{ slot: "storage", productId: ryzen5.id, quantity: 1 }],
      parts
    )
    expect(build).toEqual({})
    expect(changes).toEqual([
      {
        kind: "wrong-category",
        slot: "storage",
        productId: ryzen5.id,
        detail: `storage ${ryzen5.id}: part is a cpu`,
      },
    ])
  })
})

test("E81: parsed and assembled builds always meet the slot limits", () => {
  const inputs: unknown[] = [
    [item("fans", "x"), item("cpu", ryzen5.id)],
    [item("memory", vengeance.id, 0)],
    [item("cpu", ryzen5.id), item("cpu", i5.id)],
    [item("memory", vengeance.id, 2), item("memory", fury.id)],
    [item("storage", pro990.id), item("storage", pro990.id, 2)],
    [item("gpu", rtx4060.id, 2)],
    [item("memory", vengeance.id, "2"), 42, null],
    "oops",
    undefined,
    buildA,
    [item("gpu", "gone"), item("storage", ryzen5.id)],
  ]
  for (const input of inputs) {
    const { build } = assembleBuild(parseBuild(input).items, parts)
    expect(validateBuild(build), JSON.stringify(input)).toEqual([])
  }
})
