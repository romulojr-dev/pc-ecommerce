import { afterAll, beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { makeStaffUser, resetSignInIps } from "@/test-support/admin-session"
import { createCategoryAndBrand, resetCatalog } from "@/test-support/db"

import { adminTransaction, recordAudit } from "./audit"

// docs/specs/040-admin-permissions-audit-masking, T6 to T8: E4, E9, E10, E16,
// E19, and the foreign keys

let actorId = ""

async function makeProduct() {
  const { categoryId, brandId } = await createCategoryAndBrand()
  return db.product.create({
    data: {
      name: "Ryzen 5 7600X",
      slug: "ryzen-5-7600x",
      sku: "CPU-AMD-7600X",
      price: 129_900,
      stock: 12,
      weightGrams: 500,
      status: "ACTIVE",
      categoryId,
      brandId,
      specs: {},
    },
  })
}

beforeEach(async () => {
  resetSignInIps()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  actorId = (await makeStaffUser("staff@example.com", "STAFF")).id
})
afterAll(() => db.$disconnect())

describe("recordAudit", () => {
  test("the change, its stock movement and its audit row commit together (E4)", async () => {
    const product = await makeProduct()
    await adminTransaction(async (tx) => {
      await tx.product.update({
        where: { id: product.id },
        data: { stock: { increment: 5 } },
      })
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          change: 5,
          reason: "ORDER_RELEASED",
          actorId,
        },
      })
      await recordAudit(tx, {
        actorId,
        entity: "product",
        entityId: product.id,
        action: "stock-adjusted",
        before: { stock: 12 },
        after: { stock: 17 },
      })
    })
    const rows = await db.auditLog.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorId,
      entity: "product",
      entityId: product.id,
      action: "stock-adjusted",
      before: { stock: 12 },
      after: { stock: 17 },
    })
    expect(Math.abs(rows[0].createdAt.getTime() - Date.now())).toBeLessThan(
      60_000
    )
    expect((await db.stockMovement.findFirstOrThrow()).actorId).toBe(actorId)
  })

  test("a change that throws after recordAudit leaves no row (E9)", async () => {
    const product = await makeProduct()
    await expect(
      adminTransaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: 99 },
        })
        await recordAudit(tx, {
          actorId,
          entity: "product",
          entityId: product.id,
          action: "updated",
          after: { stock: 99 },
        })
        throw new Error("boom")
      })
    ).rejects.toThrow("boom")
    expect(await db.auditLog.count()).toBe(0)
    const after = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(after.stock).toBe(12)
  })

  test("a value that cannot be stored rolls the change back", async () => {
    const product = await makeProduct()
    await expect(
      adminTransaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { stock: 1 },
        })
        await recordAudit(tx, {
          actorId,
          entity: "product",
          entityId: product.id,
          action: "updated",
          after: { note: "x".repeat(20_000) },
        })
      })
    ).rejects.toThrow("too large")
    const after = await db.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(after.stock).toBe(12)
  })

  test("a secret-looking key is stored redacted (E16)", async () => {
    await adminTransaction((tx) =>
      recordAudit(tx, {
        actorId,
        entity: "order",
        entityId: "o1",
        action: "status-changed",
        after: { status: "PAID", sessionToken: "abc" },
      })
    )
    expect((await db.auditLog.findFirstOrThrow()).after).toEqual({
      status: "PAID",
      sessionToken: "[redacted]",
    })
  })

  test("a create has no before and a delete no after", async () => {
    await adminTransaction(async (tx) => {
      await recordAudit(tx, {
        actorId,
        entity: "voucher",
        entityId: "v1",
        action: "created",
        after: { code: "WELCOME10" },
      })
      await recordAudit(tx, {
        actorId,
        entity: "voucher",
        entityId: "v1",
        action: "deleted",
        before: { code: "WELCOME10" },
      })
    })
    const rows = await db.auditLog.findMany()
    expect(rows.find((r) => r.action === "created")?.before).toBeNull()
    expect(rows.find((r) => r.action === "deleted")?.after).toBeNull()
  })

  test("outside a transaction it does not compile", () => {
    const entry = {
      actorId,
      entity: "order",
      entityId: "o1",
      action: "cancelled",
    } as const
    // @ts-expect-error the plain client is not a transaction client
    const call = () => recordAudit(db, entry)
    expect(call).toBeTypeOf("function")
  })
})

describe("the AuditLog trigger and keys", () => {
  async function oneRow() {
    await adminTransaction((tx) =>
      recordAudit(tx, {
        actorId,
        entity: "order",
        entityId: "o1",
        action: "cancelled",
        after: { status: "CANCELLED" },
      })
    )
    return db.auditLog.findFirstOrThrow()
  }

  test("UPDATE and DELETE are refused, from the client and in SQL (E10)", async () => {
    const row = await oneRow()
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { action: "updated" } })
    ).rejects.toThrow(/cannot be updated or deleted/)
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
      /cannot be updated or deleted/
    )
    await expect(
      db.$executeRaw`UPDATE "AuditLog" SET "entityId" = 'x'`
    ).rejects.toThrow(/cannot be updated or deleted/)
    await expect(db.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow(
      /cannot be updated or deleted/
    )
    expect(await db.auditLog.count()).toBe(1)
  })

  test("TRUNCATE still works, as resetCatalog() runs it (E10, E19)", async () => {
    await oneRow()
    await resetCatalog()
    expect(await db.auditLog.count()).toBe(0)
    // Staff survive a reset
    expect(await db.user.count()).toBe(1)
  })

  test("the actor must be a real user, and a user with audit rows cannot be deleted", async () => {
    await expect(
      adminTransaction((tx) =>
        recordAudit(tx, {
          actorId: "nobody",
          entity: "order",
          entityId: "o1",
          action: "cancelled",
        })
      )
    ).rejects.toThrow()
    await oneRow()
    await expect(db.user.delete({ where: { id: actorId } })).rejects.toThrow()
  })

  test("StockMovement.actorId is a foreign key too", async () => {
    const product = await makeProduct()
    await expect(
      db.stockMovement.create({
        data: {
          productId: product.id,
          change: 1,
          reason: "ORDER_RELEASED",
          actorId: "nobody",
        },
      })
    ).rejects.toThrow()
    await db.stockMovement.create({
      data: {
        productId: product.id,
        change: 1,
        reason: "ORDER_RELEASED",
        actorId,
      },
    })
    await expect(db.user.delete({ where: { id: actorId } })).rejects.toThrow()
    // System movements have no actor
    await db.stockMovement.create({
      data: { productId: product.id, change: -1, reason: "ORDER_RESERVED" },
    })
  })
})
