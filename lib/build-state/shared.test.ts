import { describe, expect, test } from "vitest"

import { type BuildItem, type Slot, toBuildItems } from "@/lib/builder"
import { formatPeso } from "@/lib/format"
import { partsOf, snapshot } from "@/test-support/shared-snapshot"
import { buildA, seed } from "@/test-support/seed-parts"

import {
  retiredBanner,
  type SharedItem,
  sharedAvailabilityMessage,
  sharedBuildView,
} from "./shared"

// The shared page's figures (docs/specs/022-share-build, Behavior 12–17 and
// the Shared page examples). Prices are seed prices in centavos.

const A = partsOf(buildA())

const rowsOf = (view: ReturnType<typeof sharedBuildView>, slot: Slot) =>
  view.slots.find((entry) => entry.slot === slot)!.rows

describe("sharedBuildView", () => {
  test("shows build A in full (E24)", () => {
    const view = sharedBuildView(snapshot(A))
    expect(view.slots.map((entry) => entry.slot)).toEqual([
      "cpu",
      "motherboard",
      "memory",
      "storage",
      "gpu",
      "case",
      "psu",
      "cpu-cooler",
    ])
    expect(view.slots.every((entry) => entry.rows.length === 1)).toBe(true)
    expect(formatPeso(view.total)).toBe("₱69,060.00")
    expect(view.power).toMatchObject({
      watts: 264,
      psuWatts: 550,
      loadPercent: 48,
    })
    expect(view.status).toBe("ok")
    expect(view.issues).toEqual([])
    expect(view.checked).toBe(true)
    expect(view.availability).toBeNull()
    expect(view.retiredCount).toBe(0)
    expect(view.banner).toBeNull()
  })

  test("leaves the slots of a one-part build empty (E25)", () => {
    const view = sharedBuildView(snapshot([seed.ryzen5_7600]))
    expect(rowsOf(view, "cpu")).toHaveLength(1)
    for (const slot of ["motherboard", "memory", "gpu", "psu"] as Slot[]) {
      expect(rowsOf(view, slot)).toEqual([])
    }
    expect(view.status).toBe("ok")
  })

  test("marks the parts an error names (E25)", () => {
    const view = sharedBuildView(
      snapshot([seed.ryzen5_7600, seed.proB760mDdr4])
    )
    expect(view.status).toBe("errors")
    expect(view.issues[0].message).toBe(
      "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
    )
    expect(rowsOf(view, "cpu")[0]).toMatchObject({ severity: "error" })
    expect(rowsOf(view, "motherboard")[0]).toMatchObject({ severity: "error" })
  })

  test("counts a part that can't be bought now, and names it (E26)", () => {
    const view = sharedBuildView(
      snapshot([seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm850e], {
        status: {
          [seed.ryzen7_9800x3d.id]: "low-stock",
          [seed.rtx5090Astral.id]: "out-of-stock",
        },
      })
    )
    expect(formatPeso(view.total)).toBe("₱217,485.00")
    expect(view.status).toBe("errors")
    expect(view.availability).toBe(
      "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB isn't available to buy right now."
    )
    expect(view.retiredCount).toBe(0)
  })

  test("names a pre-order too, and the build can still be OK (E27)", () => {
    const view = sharedBuildView(
      snapshot([seed.ultra7_265k], {
        status: { [seed.ultra7_265k.id]: "pre-order" },
      })
    )
    expect(formatPeso(view.total)).toBe("₱20,995.00")
    expect(view.status).toBe("ok")
    expect(view.availability).toBe(
      `The ${seed.ultra7_265k.name} isn't available to buy right now.`
    )
  })

  describe("parts that are no longer sold", () => {
    test("are listed, left out of the figures, and make the build incomplete (E28)", () => {
      const view = sharedBuildView(snapshot(A, { retired: [seed.rtx4060] }))
      expect(rowsOf(view, "gpu")).toEqual([
        {
          kind: "retired",
          id: seed.rtx4060.id,
          name: seed.rtx4060.name,
          brand: "Brand",
        },
      ])
      expect(formatPeso(view.total)).toBe("₱51,065.00")
      expect(view.power).toMatchObject({
        watts: 114,
        psuWatts: 550,
        loadPercent: 21,
      })
      expect(view.status).toBe("incomplete")
      expect(view.checked).toBe(true)
      expect(view.issues).toEqual([])
      expect(view.retiredCount).toBe(1)
      expect(view.banner).toBe(
        "1 part is no longer sold, so the total and checks leave it out."
      )
    })

    test("treat a part found in the wrong slot like one that is gone (E29)", () => {
      const items = snapshot(A)
      const gpu = items.find((item) => item.slot === "gpu")!
      // The product now sits in another category
      const wrong: SharedItem = { ...gpu, slot: "storage" }
      const view = sharedBuildView([
        ...items.filter((item) => item !== gpu),
        wrong,
      ])
      expect(view.retiredCount).toBe(1)
      expect(
        rowsOf(view, "storage")
          .map((row) => row.kind)
          .sort()
      ).toEqual(["part", "retired"])
    })

    test("leave nothing checked when every part is gone (E30)", () => {
      const view = sharedBuildView(
        snapshot([seed.ryzen5_7600], { retired: [seed.ryzen5_7600] })
      )
      expect(view.total).toBe(0)
      expect(view.power.watts).toBe(0)
      expect(view.status).toBe("incomplete")
      expect(view.checked).toBe(false)
      expect(view.issues).toEqual([])
    })

    test("show incomplete, never OK, when the rest raises nothing (E30a)", () => {
      const view = sharedBuildView(
        snapshot([seed.ryzen5_7600, seed.proB760mDdr4], {
          retired: [seed.proB760mDdr4],
        })
      )
      expect(view.issues).toEqual([])
      expect(view.status).toBe("incomplete")
    })

    test("keep warnings and errors that the rest raises (D18)", () => {
      // No iGPU on the i5-14400F and no graphics card: a warning
      const view = sharedBuildView(
        snapshot([seed.i5_14400f, seed.rtx4060], { retired: [seed.rtx4060] })
      )
      expect(view.status).toBe("warnings")
      expect(view.retiredCount).toBe(1)
      expect(view.banner).not.toBeNull()
    })

    test("are counted, in the banner, one by one (E30b)", () => {
      const view = sharedBuildView(
        snapshot(A, { retired: [seed.rtx4060, seed.pro990] })
      )
      expect(view.retiredCount).toBe(2)
      expect(view.banner).toBe(
        "2 parts are no longer sold, so the total and checks leave them out."
      )
    })
  })

  test("shows a quantity and counts it in the total (E32)", () => {
    const view = sharedBuildView(
      snapshot(A, { quantity: { [seed.vengeanceDdr5.id]: 2 } })
    )
    expect(rowsOf(view, "memory")[0]).toMatchObject({ quantity: 2 })
    expect(formatPeso(view.total)).toBe("₱75,555.00")
  })

  test("lists drives by name, A to Z, whatever order they came in (E33)", () => {
    const names = [seed.pro990.name, seed.mx500.name].sort((a, b) =>
      a.localeCompare(b, "en")
    )
    for (const order of [
      [seed.pro990, seed.mx500],
      [seed.mx500, seed.pro990],
    ]) {
      const view = sharedBuildView(snapshot(order))
      expect(
        rowsOf(view, "storage").map((row) =>
          row.kind === "part" ? row.data.part.name : row.name
        )
      ).toEqual(names)
    }
  })

  test("puts a drive that is gone among the others, by name", () => {
    const view = sharedBuildView(
      snapshot([seed.pro990, seed.mx500], { retired: [seed.mx500] })
    )
    expect(
      rowsOf(view, "storage").map((row) =>
        row.kind === "part" ? row.data.part.name : row.name
      )
    ).toEqual(
      [seed.mx500.name, seed.pro990.name].sort((a, b) =>
        a.localeCompare(b, "en")
      )
    )
  })
})

describe("openPlan", () => {
  test("holds build A as it is when nothing is gone (E49)", () => {
    const view = sharedBuildView(snapshot(A))
    expect(view.openPlan.items).toEqual(toBuildItems(buildA()))
    expect(view.openPlan.snapshotItems).toEqual(toBuildItems(buildA()))
    expect(view.openPlan.changes).toEqual([])
  })

  test("leaves a part that is gone out, and reports it (E52)", () => {
    const view = sharedBuildView(snapshot(A, { retired: [seed.rtx4060] }))
    expect(view.openPlan.items).toHaveLength(7)
    expect(view.openPlan.items.some((item) => item.slot === "gpu")).toBe(false)
    expect(view.openPlan.snapshotItems).toHaveLength(8)
    expect(view.openPlan.changes).toEqual([
      expect.objectContaining({
        kind: "not-found",
        slot: "gpu",
        productId: seed.rtx4060.id,
      }),
    ])
  })

  test("reports every part that is gone (E53)", () => {
    const view = sharedBuildView(
      snapshot(A, { retired: [seed.rtx4060, seed.pro990] })
    )
    expect(view.openPlan.changes.map((change) => change.slot)).toEqual([
      "storage",
      "gpu",
    ])
  })

  test("keeps a part that can't be bought now (E54)", () => {
    const view = sharedBuildView(
      snapshot(A, { status: { [seed.rtx4060.id]: "out-of-stock" } })
    )
    expect(view.openPlan.items).toHaveLength(8)
    expect(view.openPlan.changes).toEqual([])
  })

  test("keeps quantities (E55)", () => {
    const view = sharedBuildView(
      snapshot(A, { quantity: { [seed.vengeanceDdr5.id]: 2 } })
    )
    expect(view.openPlan.items.find((item) => item.slot === "memory")).toEqual({
      slot: "memory",
      productId: seed.vengeanceDdr5.id,
      quantity: 2,
    })
  })

  test("orders drives by name in the items it opens (D7)", () => {
    const view = sharedBuildView(snapshot([seed.pro990, seed.mx500]))
    const ids = view.openPlan.items.map((item: BuildItem) => item.productId)
    const byName = [seed.pro990, seed.mx500]
      .sort((a, b) => a.name.localeCompare(b.name, "en"))
      .map((part) => part.id)
    expect(ids).toEqual(byName)
  })
})

describe("sharedAvailabilityMessage", () => {
  test("says nothing when every part is buyable", () => {
    expect(sharedAvailabilityMessage([])).toBeNull()
  })

  test("names one part (E26)", () => {
    expect(sharedAvailabilityMessage(["Foo X1"])).toBe(
      "The Foo X1 isn't available to buy right now."
    )
  })

  test("counts several", () => {
    expect(sharedAvailabilityMessage(["A", "B"])).toBe(
      "2 parts in this build aren't available to buy right now."
    )
  })
})

describe("retiredBanner", () => {
  test("is null when nothing is gone", () => {
    expect(retiredBanner(0)).toBeNull()
  })

  test("is singular for one and plural for more (E28, E30b)", () => {
    expect(retiredBanner(1)).toBe(
      "1 part is no longer sold, so the total and checks leave it out."
    )
    expect(retiredBanner(3)).toBe(
      "3 parts are no longer sold, so the total and checks leave them out."
    )
  })
})
