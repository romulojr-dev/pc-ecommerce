import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { makeStaffUser } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { insertParts } from "@/test-support/build-fixtures"
import { seed } from "@/test-support/seed-parts"

import type { AdjustStockInput } from "../inventory-input"
import { adjustStock, setLowStockAt } from "./adjust"

// docs/specs/046-admin-inventory-adjustments: the adjustment and the threshold
// on real rows (E7–E16, E21–E25, E33). The part is a Ryzen 5 7600 with stock
// 10 and lowStockAt 5.

let actor: { id: string; name: string; role: "staff" }
let productId: string

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("staff@example.com", "STAFF")
  actor = { id: user.id, name: user.name, role: "staff" }
  productId = (
    await insertParts([seed.ryzen5_7600], {
      [seed.ryzen5_7600.id]: { stock: 10 },
    })
  ).get(seed.ryzen5_7600.id)!
})
afterAll(() => db.$disconnect())

const adjust = (
  over: Partial<AdjustStockInput> = {},
  options?: Parameters<typeof adjustStock>[2]
) =>
  adjustStock(
    actor,
    {
      productId,
      reason: "RECEIVED",
      delta: 20,
      note: "",
      shownStock: 10,
      ...over,
    },
    options
  )

const product = () => db.product.findUniqueOrThrow({ where: { id: productId } })
const movements = () => db.stockMovement.findMany({ where: { productId } })
const audits = () => db.auditLog.findMany({ where: { entityId: productId } })
const setStock = (stock: number) =>
  db.product.update({ where: { id: productId }, data: { stock } })

describe("adjustStock", () => {
  it("E7: Received adds, records the movement and the audit row", async () => {
    const result = await adjust()
    expect(result).toMatchObject({ kind: "adjusted", stock: 30, delta: 20 })
    expect((await product()).stock).toBe(30)
    expect(await movements()).toEqual([
      expect.objectContaining({
        change: 20,
        reason: "RECEIVED",
        actorId: actor.id,
        orderId: null,
        note: null,
      }),
    ])
    const [audit] = await audits()
    expect(audit).toMatchObject({
      actorId: actor.id,
      entity: "product",
      action: "stock-adjusted",
      before: { stock: 10 },
      after: { stock: 30, reason: "RECEIVED" },
    })
  })

  it("E8: Damaged removes", async () => {
    await adjust({ reason: "DAMAGED", delta: -3 })
    expect((await product()).stock).toBe(7)
    expect((await movements())[0]).toMatchObject({
      change: -3,
      reason: "DAMAGED",
    })
  })

  it("E9: a Correction keeps its note on the movement and in the audit row", async () => {
    await adjust({
      reason: "CORRECTION",
      delta: -2,
      note: "  Shelf count was 8 ",
    })
    expect((await product()).stock).toBe(8)
    expect((await movements())[0]).toMatchObject({
      reason: "CORRECTION",
      note: "Shelf count was 8",
    })
    expect((await audits())[0].after).toMatchObject({
      note: "Shelf count was 8",
    })
  })

  it("E10, E11: a Correction without a usable note writes nothing", async () => {
    for (const note of ["", "   ", "ab"]) {
      expect(
        await adjust({ reason: "CORRECTION", delta: 1, note })
      ).toMatchObject({ kind: "invalid", errors: { note: expect.any(String) } })
    }
    expect((await product()).stock).toBe(10)
    expect(await movements()).toHaveLength(0)
    expect(await audits()).toHaveLength(0)
  })

  it("E14: zero, a wrong sign and an unknown reason write nothing", async () => {
    for (const over of [
      { delta: 0 },
      { reason: "RECEIVED", delta: -5 },
      { reason: "DAMAGED", delta: 5 },
      { reason: "ORDER_RESERVED", delta: -1 },
    ]) {
      expect((await adjust(over)).kind).toBe("invalid")
    }
    expect(await movements()).toHaveLength(0)
    expect((await product()).stock).toBe(10)
  })

  it("E12: a delta that would go below 0 is refused with the current stock", async () => {
    await setStock(4)
    expect(await adjust({ reason: "DAMAGED", delta: -5 })).toEqual({
      kind: "refused",
      refusal: { kind: "too-low", stock: 4 },
    })
    expect((await product()).stock).toBe(4)
    expect(await movements()).toHaveLength(0)
    expect(await audits()).toHaveLength(0)
  })

  it("removing exactly what is there is allowed", async () => {
    await setStock(4)
    expect(await adjust({ reason: "DAMAGED", delta: -4 })).toMatchObject({
      kind: "adjusted",
      stock: 0,
    })
  })

  it("E16: the ceiling is 1,000,000, inclusive", async () => {
    await setStock(999_995)
    expect(await adjust({ delta: 10 })).toEqual({
      kind: "refused",
      refusal: { kind: "too-high", stock: 999_995 },
    })
    expect(await movements()).toHaveLength(0)
    expect(await adjust({ delta: 5 })).toMatchObject({
      kind: "adjusted",
      stock: 1_000_000,
    })
    expect(await adjust({ delta: 1 })).toMatchObject({
      kind: "refused",
      refusal: { kind: "too-high", stock: 1_000_000 },
    })
  })

  it("E25: applies on top of the real stock, not the figure the page showed", async () => {
    await setStock(6) // an order took 4 after the page loaded
    const result = await adjust({ delta: 5, shownStock: 10 })
    expect(result).toMatchObject({ kind: "adjusted", stock: 11 })
    expect((await audits())[0].before).toEqual({ stock: 6 })
  })

  it("an unknown product is not found, and nothing is written", async () => {
    expect(await adjust({ productId: "no-such-product" })).toEqual({
      kind: "not-found",
    })
    expect(await movements()).toHaveLength(0)
  })

  it("leaves Product.editVersion alone but moves updatedAt", async () => {
    const before = await product()
    await adjust()
    const after = await product()
    expect(after.editVersion).toBe(before.editVersion)
    expect(after.updatedAt.getTime()).toBeGreaterThan(
      before.updatedAt.getTime()
    )
  })

  it("E33: a failure after the movement rolls back the stock, the movement and the audit row", async () => {
    await expect(
      adjust(
        {},
        {
          afterStep: (step) => {
            if (step === "movement") throw new Error("boom")
          },
        }
      )
    ).rejects.toThrow("boom")
    expect((await product()).stock).toBe(10)
    expect(await movements()).toHaveLength(0)
    expect(await audits()).toHaveLength(0)
  })

  it("E33: a failure right after the stock update rolls back too", async () => {
    await expect(
      adjust(
        {},
        {
          afterStep: (step) => {
            if (step === "stock") throw new Error("boom")
          },
        }
      )
    ).rejects.toThrow("boom")
    expect((await product()).stock).toBe(10)
    expect(await movements()).toHaveLength(0)
  })

  it("keeps the stock equal to the start plus the movements", async () => {
    await adjust({ delta: 20 })
    await adjust({ reason: "DAMAGED", delta: -7 })
    await adjust({ reason: "CORRECTION", delta: 3, note: "recount" })
    const total = (await movements()).reduce((sum, m) => sum + m.change, 0)
    expect((await product()).stock).toBe(10 + total)
  })
})

describe("setLowStockAt", () => {
  const set = (lowStockAt: number, id = productId) =>
    setLowStockAt(actor, { productId: id, lowStockAt })

  it("E21: saves, audits before and after, writes no movement, keeps editVersion", async () => {
    const before = await product()
    expect(await set(8)).toEqual({ kind: "saved", lowStockAt: 8 })
    const after = await product()
    expect(after.lowStockAt).toBe(8)
    expect(after.editVersion).toBe(before.editVersion)
    expect(await movements()).toHaveLength(0)
    expect((await audits())[0]).toMatchObject({
      action: "updated",
      before: { lowStockAt: 5 },
      after: { lowStockAt: 8 },
    })
  })

  it("E22: 0 is allowed", async () => {
    expect(await set(0)).toEqual({ kind: "saved", lowStockAt: 0 })
  })

  it("E23: values outside 0..1000 write nothing", async () => {
    for (const value of [-1, 1001, 2.5]) {
      expect((await set(value)).kind).toBe("invalid")
    }
    expect((await product()).lowStockAt).toBe(5)
    expect(await audits()).toHaveLength(0)
  })

  it("E24: the same value is unchanged and writes no audit row", async () => {
    expect(await set(5)).toEqual({ kind: "unchanged", lowStockAt: 5 })
    expect(await audits()).toHaveLength(0)
  })

  it("an unknown product is not found", async () => {
    expect(await set(3, "nope")).toEqual({ kind: "not-found" })
  })
})
