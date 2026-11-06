import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { makeStaffUser } from "@/test-support/admin-session"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { seed } from "@/test-support/seed-parts"

// What the database itself guarantees for stock movements (docs/specs/046-
// admin-inventory-adjustments, R2, R6, §6; E45, E46). Whatever the app does,
// these hold.

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
})
afterAll(() => db.$disconnect())

async function setup() {
  const productId = (await insertParts([seed.ryzen5_7600])).get(
    seed.ryzen5_7600.id
  )!
  const user = await makeStaffUser("staff@example.com", "STAFF")
  const order = await db.order.create({ data: orderData() })
  return { productId, actorId: user.id, orderId: order.id }
}

type Movement = Parameters<typeof db.stockMovement.create>[0]["data"]

const insert = (data: Movement) => db.stockMovement.create({ data })

describe("E45: the CHECKs", () => {
  it("accepts the rows the app writes", async () => {
    const { productId, actorId, orderId } = await setup()
    await insert({ productId, change: 20, reason: "RECEIVED", actorId })
    await insert({
      productId,
      change: -3,
      reason: "DAMAGED",
      actorId,
      note: "x",
    })
    await insert({
      productId,
      change: 2,
      reason: "CORRECTION",
      actorId,
      note: "recount",
    })
    await insert({
      productId,
      change: -2,
      reason: "CORRECTION",
      actorId,
      note: "x".repeat(500),
    })
    await insert({ productId, change: -1, reason: "ORDER_RESERVED", orderId })
    await insert({ productId, change: 1, reason: "ORDER_RELEASED", orderId })
    await insert({
      productId,
      change: 1,
      reason: "ORDER_RELEASED",
      orderId,
      actorId,
    })
    expect(await db.stockMovement.count()).toBe(7)
  })

  it("refuses a change of 0", async () => {
    const { productId, actorId } = await setup()
    await expect(
      insert({ productId, change: 0, reason: "CORRECTION", actorId, note: "n" })
    ).rejects.toThrow(/StockMovement_change_check/)
  })

  it("refuses the wrong sign for each reason", async () => {
    const { productId, actorId, orderId } = await setup()
    await expect(
      insert({ productId, change: -1, reason: "RECEIVED", actorId })
    ).rejects.toThrow(/StockMovement_received_positive/)
    await expect(
      insert({ productId, change: 1, reason: "DAMAGED", actorId })
    ).rejects.toThrow(/StockMovement_damaged_negative/)
    await expect(
      insert({ productId, change: 1, reason: "ORDER_RESERVED", orderId })
    ).rejects.toThrow(/StockMovement_reserved_negative/)
    await expect(
      insert({ productId, change: -1, reason: "ORDER_RELEASED", orderId })
    ).rejects.toThrow(/StockMovement_released_positive/)
  })

  it("requires an actor, and no order, on a staff reason", async () => {
    const { productId, actorId, orderId } = await setup()
    for (const [reason, change] of [
      ["RECEIVED", 1],
      ["DAMAGED", -1],
      ["CORRECTION", 1],
    ] as const) {
      await expect(
        insert({ productId, change, reason, note: "n" })
      ).rejects.toThrow(/StockMovement_staff_actor/)
      await expect(
        insert({ productId, change, reason, actorId, orderId, note: "n" })
      ).rejects.toThrow(/StockMovement_staff_no_order/)
    }
  })

  it("keeps notes to 1..500 characters, requires one on a Correction, forbids one on order movements", async () => {
    const { productId, actorId, orderId } = await setup()
    await expect(
      insert({ productId, change: 1, reason: "RECEIVED", actorId, note: "" })
    ).rejects.toThrow(/StockMovement_note_length/)
    await expect(
      insert({
        productId,
        change: 1,
        reason: "RECEIVED",
        actorId,
        note: "x".repeat(501),
      })
    ).rejects.toThrow(/StockMovement_note_length/)
    await expect(
      insert({ productId, change: 1, reason: "CORRECTION", actorId })
    ).rejects.toThrow(/StockMovement_correction_note/)
    await expect(
      insert({
        productId,
        change: -1,
        reason: "ORDER_RESERVED",
        orderId,
        note: "no",
      })
    ).rejects.toThrow(/StockMovement_order_no_note/)
    await expect(
      insert({
        productId,
        change: 1,
        reason: "ORDER_RELEASED",
        orderId,
        note: "no",
      })
    ).rejects.toThrow(/StockMovement_order_no_note/)
  })
})

describe("E46: the migration fails loudly on data that breaks a sign rule", () => {
  // The migration's own pre-check, read from the file, run against rows that
  // the CHECKs would normally keep out: inside a transaction that drops the
  // constraint, inserts the bad row and is rolled back
  const sql = readFileSync(
    join(
      process.cwd(),
      "prisma",
      "migrations",
      "20261108090100_stock_movement_note_and_checks",
      "migration.sql"
    ),
    "utf8"
  )
  const preCheck = /DO \$\$[\s\S]*?END \$\$;/.exec(sql)![0]

  class Rollback extends Error {}

  async function preCheckAgainst(
    constraint: string,
    row: { reason: "ORDER_RESERVED" | "ORDER_RELEASED"; change: number }
  ) {
    const { productId } = await setup()
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `ALTER TABLE "StockMovement" DROP CONSTRAINT "${constraint}"`
        )
        await tx.stockMovement.createMany({
          data: [
            { productId, ...row },
            { productId, ...row },
          ],
        })
        await tx.$executeRawUnsafe(preCheck)
        throw new Rollback("the pre-check should have raised")
      })
    } catch (error) {
      return String((error as Error).message)
    }
    return ""
  }

  it("names the rule and the number of rows for ORDER_RESERVED >= 0", async () => {
    const message = await preCheckAgainst("StockMovement_reserved_negative", {
      reason: "ORDER_RESERVED",
      change: 3,
    })
    expect(message).toContain("StockMovement_reserved_negative")
    expect(message).toContain("2 existing ORDER_RESERVED row(s)")
  })

  it("names the rule and the number of rows for ORDER_RELEASED <= 0", async () => {
    const message = await preCheckAgainst("StockMovement_released_positive", {
      reason: "ORDER_RELEASED",
      change: -3,
    })
    expect(message).toContain("StockMovement_released_positive")
    expect(message).toContain("2 existing ORDER_RELEASED row(s)")
  })

  it("passes on clean data", async () => {
    await setup()
    await expect(db.$executeRawUnsafe(preCheck)).resolves.not.toThrow()
  })

  it("leaves the constraints in place after the rolled-back attempts", async () => {
    const rows = await db.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint
      WHERE conrelid = '"StockMovement"'::regclass AND contype = 'c'`
    expect(rows.map((r) => r.conname).sort()).toEqual(
      [
        "StockMovement_change_check",
        "StockMovement_correction_note",
        "StockMovement_damaged_negative",
        "StockMovement_note_length",
        "StockMovement_order_no_note",
        "StockMovement_received_positive",
        "StockMovement_released_positive",
        "StockMovement_reserved_negative",
        "StockMovement_staff_actor",
        "StockMovement_staff_no_order",
      ].sort()
    )
  })
})
