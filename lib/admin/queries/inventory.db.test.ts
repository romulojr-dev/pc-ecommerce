import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { Prisma } from "@/generated/prisma/client"
import {
  DEFAULT_INVENTORY_PARAMS,
  type InventoryParams,
} from "../inventory-params"
import { stockLevel } from "../inventory-view"
import { lowStockCondition } from "../low-stock-sql"
import type { AdminRole } from "../permissions"
import { makeStaffUser } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { getInventoryProduct, listInventory, listMovements } from "./inventory"

// docs/specs/046-admin-inventory-adjustments: the list and its filters (E1–E6,
// E34), the product (E35) and the history (E26–E30, E43), plus the SQL
// definition of the stock levels against the pure one (R17).

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
})
afterAll(() => db.$disconnect())

let counter = 0
async function product(
  over: {
    name?: string
    sku?: string
    stock?: number
    lowStockAt?: number
    status?: "DRAFT" | "ACTIVE"
    category?: string
    brand?: string
  } = {}
) {
  const n = ++counter
  const category = await db.category.upsert({
    where: { slug: over.category ?? "cpu" },
    create: {
      slug: over.category ?? "cpu",
      name: (over.category ?? "cpu").toUpperCase(),
    },
    update: {},
  })
  const brandSlug = (over.brand ?? "Alpha").toLowerCase()
  const brand = await db.brand.upsert({
    where: { slug: brandSlug },
    create: { slug: brandSlug, name: over.brand ?? "Alpha" },
    update: {},
  })
  return db.product.create({
    data: {
      name: over.name ?? `Part ${String(n).padStart(3, "0")}`,
      slug: `part-${n}`,
      sku: over.sku ?? `SKU-${n}`,
      price: 100_000,
      stock: over.stock ?? 10,
      lowStockAt: over.lowStockAt ?? 5,
      status: over.status ?? "ACTIVE",
      specs: {},
      weightGrams: 100,
      categoryId: category.id,
      brandId: brand.id,
    },
  })
}

const list = (over: Partial<InventoryParams> = {}, role: AdminRole = "owner") =>
  listInventory(role, { ...DEFAULT_INVENTORY_PARAMS, ...over })
const names = async (over: Partial<InventoryParams> = {}) =>
  (await list(over)).rows.map((r) => r.name)

describe("listInventory", () => {
  it("E1: lists every status, lowest stock first, then name", async () => {
    await product({ name: "B", stock: 7 })
    await product({ name: "A", stock: 7 })
    await product({ name: "Z", stock: 0 })
    await product({ name: "Draft", stock: 2, status: "DRAFT" })
    const result = await list()
    expect(result.rows.map((r) => r.name)).toEqual(["Z", "Draft", "A", "B"])
    expect(result.rows[1]).toMatchObject({
      status: "DRAFT",
      stock: 2,
      lowStockAt: 5,
    })
    expect(result.total).toBe(4)
  })

  it("E2: Low stock is 1..lowStockAt, Active only", async () => {
    await product({ name: "low", stock: 5, lowStockAt: 5 })
    await product({ name: "ok", stock: 6, lowStockAt: 5 })
    await product({ name: "out", stock: 0 })
    await product({ name: "draft-low", stock: 2, status: "DRAFT" })
    await product({ name: "off", stock: 1, lowStockAt: 0 })
    expect(await names({ level: "low" })).toEqual(["low"])
  })

  it("E3: Out of stock is stock 0, Active only", async () => {
    await product({ name: "out", stock: 0 })
    await product({ name: "draft-out", stock: 0, status: "DRAFT" })
    await product({ name: "ok", stock: 3 })
    expect(await names({ level: "out" })).toEqual(["out"])
  })

  it("E4: Needs restocking is both, and lowStockAt 0 keeps only the out of stock", async () => {
    await product({ name: "low", stock: 2 })
    await product({ name: "out", stock: 0 })
    await product({ name: "ok", stock: 50 })
    await product({ name: "off-low", stock: 1, lowStockAt: 0 })
    await product({ name: "off-out", stock: 0, lowStockAt: 0 })
    expect((await names({ level: "restock" })).sort()).toEqual(
      ["low", "off-out", "out"].sort()
    )
  })

  it("E6: searches name, SKU and brand, case-insensitively, with a category filter", async () => {
    await product({
      name: "Gigabyte GeForce RTX 5070",
      sku: "GV-N5070",
      category: "gpu",
      brand: "Gigabyte",
    })
    await product({
      name: "Palit RTX 5070 Ti",
      sku: "PA-5070TI",
      category: "gpu",
      brand: "Palit",
    })
    await product({
      name: "Ryzen 5 7600",
      sku: "100-1",
      category: "cpu",
      brand: "AMD",
    })
    expect((await names({ q: "rtx 5070" })).length).toBe(2)
    expect(await names({ q: "gv-n" })).toEqual(["Gigabyte GeForce RTX 5070"])
    expect(await names({ q: "amd" })).toEqual(["Ryzen 5 7600"])
    expect(await names({ q: "rtx", category: "cpu" })).toEqual([])
    expect(await names({ q: "rtx", category: "gpu" })).toHaveLength(2)
  })

  it("treats % _ and \\ in a search as text", async () => {
    await product({ name: "100% Cotton Pad" })
    await product({ name: "Plain" })
    expect(await names({ q: "0% C" })).toEqual(["100% Cotton Pad"])
    expect(await names({ q: "%%" })).toEqual([])
    expect(await names({ q: "P_ain" })).toEqual([])
  })

  it("E28: pages of 25, a page past the last lands on the last", async () => {
    for (let i = 0; i < 30; i++) await product({ stock: i + 1 })
    const first = await list()
    expect(first.rows).toHaveLength(25)
    expect(first.pageCount).toBe(2)
    const last = await list({ page: 9 })
    expect(last.page).toBe(2)
    expect(last.rows).toHaveLength(5)
  })

  it("no match is page 1 with no rows", async () => {
    await product()
    expect(await list({ q: "nothing-like-this" })).toMatchObject({
      rows: [],
      total: 0,
      page: 1,
      pageCount: 1,
    })
  })

  it("every role may read it", async () => {
    await product()
    for (const role of ["owner", "staff", "demo"] as const) {
      expect((await list({}, role)).total).toBe(1)
    }
  })
})

describe("the SQL levels and the pure one agree (R17)", () => {
  it("for every stock / threshold pair", async () => {
    const cases: [number, number][] = []
    for (const stock of [0, 1, 2, 4, 5, 6]) {
      for (const lowStockAt of [0, 1, 5]) cases.push([stock, lowStockAt])
    }
    for (const [stock, lowStockAt] of cases) {
      await product({ name: `${stock}/${lowStockAt}`, stock, lowStockAt })
    }
    for (const level of ["low", "out", "restock"] as const) {
      const rows = await db.$queryRaw<{ name: string }[]>`
        SELECT p."name" FROM "Product" p WHERE ${lowStockCondition(level)}`
      const expected = cases
        .filter(([stock, lowStockAt]) => {
          const state = stockLevel({ stock, lowStockAt })
          return level === "restock" ? state !== "ok" : state === level
        })
        .map(([stock, lowStockAt]) => `${stock}/${lowStockAt}`)
      expect(rows.map((r) => r.name).sort()).toEqual(expected.sort())
    }
  })

  it("never matches a draft", async () => {
    await product({ stock: 0, status: "DRAFT" })
    const rows = await db.$queryRaw<unknown[]>(
      Prisma.sql`SELECT 1 FROM "Product" p WHERE ${lowStockCondition("restock")}`
    )
    expect(rows).toHaveLength(0)
  })
})

describe("getInventoryProduct", () => {
  it("returns the product with its category", async () => {
    const p = await product({
      name: "Ryzen",
      category: "cpu",
      stock: 3,
      lowStockAt: 8,
    })
    expect(await getInventoryProduct("staff", p.id)).toMatchObject({
      id: p.id,
      name: "Ryzen",
      categorySlug: "cpu",
      stock: 3,
      lowStockAt: 8,
    })
  })

  it("E35: unknown or malformed ids are null", async () => {
    expect(await getInventoryProduct("owner", "missing")).toBeNull()
    expect(await getInventoryProduct("owner", "../../etc")).toBeNull()
    expect(await getInventoryProduct("owner", "")).toBeNull()
  })
})

describe("listMovements", () => {
  async function history() {
    const p = await product({ stock: 10 })
    const staff = await makeStaffUser("staff@example.com", "STAFF")
    const order = await db.order.create({ data: orderData() })
    const at = (iso: string) => new Date(iso)
    await db.stockMovement.createMany({
      data: [
        {
          productId: p.id,
          change: -2,
          reason: "ORDER_RESERVED",
          orderId: order.id,
          createdAt: at("2026-11-01T01:00:00Z"),
        },
        {
          productId: p.id,
          change: 2,
          reason: "ORDER_RELEASED",
          orderId: order.id,
          createdAt: at("2026-11-02T01:00:00Z"),
        },
        {
          productId: p.id,
          change: 20,
          reason: "RECEIVED",
          actorId: staff.id,
          createdAt: at("2026-11-03T01:00:00Z"),
        },
        {
          productId: p.id,
          change: -1,
          reason: "CORRECTION",
          actorId: staff.id,
          note: "Shelf count was 25",
          createdAt: at("2026-11-04T01:00:00Z"),
        },
      ],
    })
    return { p, staff, order }
  }

  it("E26: newest first, with the order number, staff name and system", async () => {
    const { p, order } = await history()
    const result = await listMovements("owner", p.id, 1)
    expect(result.rows.map((r) => r.reason)).toEqual([
      "CORRECTION",
      "RECEIVED",
      "ORDER_RELEASED",
      "ORDER_RESERVED",
    ])
    expect(result.rows[0]).toMatchObject({
      change: -1,
      actorName: "staff@example.com",
      orderNumber: null,
      note: "Shelf count was 25",
    })
    expect(result.rows[2]).toMatchObject({
      orderNumber: order.orderNumber,
      actorName: null,
      note: null,
    })
    expect(result.total).toBe(4)
  })

  it("E43: reports the product's oldest movement", async () => {
    const { p } = await history()
    expect((await listMovements("owner", p.id, 1)).firstAt).toEqual(
      new Date("2026-11-01T01:00:00Z")
    )
  })

  it("E29: no movements, no first date", async () => {
    const p = await product()
    expect(await listMovements("owner", p.id, 1)).toMatchObject({
      rows: [],
      total: 0,
      firstAt: null,
    })
  })

  it("E30: Demo sees notes hidden, everything else the same", async () => {
    const { p } = await history()
    const result = await listMovements("demo", p.id, 1)
    expect(result.rows[0].note).toBe("Hidden in demo")
    expect(result.rows[1].note).toBeNull()
    expect(JSON.stringify(result)).not.toContain("Shelf count")
  })

  it("selects named fields only: no order id, token hash or customer data", async () => {
    const { p } = await history()
    const result = await listMovements("owner", p.id, 1)
    const keys = new Set(result.rows.flatMap((r) => Object.keys(r)))
    expect([...keys].sort()).toEqual(
      [
        "actorName",
        "change",
        "createdAt",
        "id",
        "note",
        "orderNumber",
        "reason",
      ].sort()
    )
  })

  it("E28: 25 per page, a page past the last lands on the last", async () => {
    const p = await product()
    const staff = await makeStaffUser("staff@example.com", "STAFF")
    await db.stockMovement.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        productId: p.id,
        change: 1,
        reason: "RECEIVED" as const,
        actorId: staff.id,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
      })),
    })
    expect((await listMovements("owner", p.id, 1)).rows).toHaveLength(25)
    const last = await listMovements("owner", p.id, 9)
    expect(last.page).toBe(2)
    expect(last.rows).toHaveLength(5)
    expect(last.pageCount).toBe(2)
  })

  it("a malformed id reads nothing", async () => {
    expect(await listMovements("owner", "../x", 1)).toMatchObject({
      total: 0,
      rows: [],
    })
  })
})
