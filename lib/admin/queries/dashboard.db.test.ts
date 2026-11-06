import { readFileSync } from "node:fs"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"
import { saleOrderCondition } from "@/lib/orders/sale-sql"

import { dashboardWindows } from "../dashboard-sales"
import { FIXTURE_CUSTOMER } from "@/test-support/no-raw-values"
import { getDashboard, loadSaleRows } from "./dashboard"
import { QueryDeniedError } from "./guard"

// docs/specs/048-admin-dashboard: the data behind the page (B5 to B8, E1 to
// E26, R4, R5, R7, R9, E30)

// Now = 2026-11-06 15:00 Manila
const NOW = new Date("2026-11-06T07:00:00Z")
const TODAY = new Date("2026-11-06T03:00:00Z")

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

type Status =
  "PAID" | "DELIVERED" | "PENDING_PAYMENT" | "CANCELLED" | "REFUNDED"

async function order(
  over: {
    status?: Status
    total?: number
    createdAt?: Date
    paidAt?: Date | null
    refundRequired?: boolean
    contactName?: string
  } = {}
) {
  const status = over.status ?? "PAID"
  const paid = status !== "PENDING_PAYMENT"
  return db.order.create({
    data: orderData({
      status,
      total: over.total ?? 1_000_000,
      subtotal: over.total ?? 1_000_000,
      shippingFee: 0,
      createdAt: over.createdAt ?? TODAY,
      paidAt: over.paidAt === undefined ? (paid ? TODAY : null) : over.paidAt,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      refundRequired: over.refundRequired ?? false,
      ...(status === "CANCELLED"
        ? { cancelledAt: TODAY, cancelReason: "OUT_OF_STOCK" as const }
        : {}),
      ...(over.contactName ? { contactName: over.contactName } : {}),
    }),
  })
}

let counter = 0
async function product(
  stock: number,
  over: { lowStockAt?: number; status?: "DRAFT" | "ACTIVE"; name?: string } = {}
) {
  const n = ++counter
  const category = await db.category.upsert({
    where: { slug: "cpu" },
    create: { slug: "cpu", name: "CPU" },
    update: {},
  })
  const brand = await db.brand.upsert({
    where: { slug: "alpha" },
    create: { slug: "alpha", name: "Alpha" },
    update: {},
  })
  return db.product.create({
    data: {
      name: over.name ?? `Part ${String(n).padStart(3, "0")}`,
      slug: `part-${n}`,
      sku: `SKU-${n}`,
      price: 100_000,
      stock,
      lowStockAt: over.lowStockAt ?? 5,
      status: over.status ?? "ACTIVE",
      specs: {},
      weightGrams: 100,
      categoryId: category.id,
      brandId: brand.id,
    },
  })
}

describe("sales", () => {
  it("sums paid sales, counts placed and averages (E1, E12)", async () => {
    await order({ total: 1_000_000 })
    await order({ total: 2_000_000 })
    await order({ status: "PENDING_PAYMENT" })
    const { sales } = await getDashboard("owner", NOW)
    expect(sales.today).toEqual({
      paidSales: 3_000_000,
      placed: 3,
      saleOrders: 2,
      averageOrder: 1_500_000,
    })
    expect(sales.last30.paidSales).toBe(3_000_000)
  })

  it("counts by paidAt and leaves out cancelled and refunded (E2, E6, E8, E9)", async () => {
    await order({
      status: "DELIVERED",
      createdAt: new Date("2026-10-20T02:00:00Z"),
    })
    await order({
      createdAt: new Date("2026-11-05T14:00:00Z"),
      paidAt: new Date("2026-11-05T17:00:00Z"),
    })
    await order({ status: "CANCELLED", refundRequired: true })
    await order({ status: "REFUNDED" })
    const { sales } = await getDashboard("owner", NOW)
    expect(sales.today.paidSales).toBe(2_000_000)
    expect(sales.today.placed).toBe(2)
    expect(sales.last30.placed).toBe(4)
  })

  it("uses Manila boundaries at 00:00 (E3, E5)", async () => {
    await order({ paidAt: new Date("2026-11-05T15:59:59.999Z") })
    await order({ paidAt: new Date("2026-11-05T16:00:00Z") })
    await order({
      createdAt: new Date("2026-10-01T00:00:00Z"),
      paidAt: new Date("2026-10-07T15:59:59Z"),
    })
    const { sales } = await getDashboard("owner", NOW)
    expect(sales.today.saleOrders).toBe(1)
    expect(sales.last30.saleOrders).toBe(2)
  })

  it("matches a SQL aggregate over the shared sale rule (R4)", async () => {
    await order({ total: 1_234_500 })
    await order({ status: "CANCELLED" })
    await order({ status: "REFUNDED" })
    await order({ status: "PENDING_PAYMENT" })
    await order({ status: "DELIVERED", total: 700_000 })
    const w = dashboardWindows(NOW)
    const [sql] = await db.$queryRaw<{ s: bigint | null; n: bigint }[]>`
      SELECT sum(o."total") AS s, count(*) AS n FROM "Order" o
      WHERE ${saleOrderCondition()}
        AND o."paidAt" >= ${w.last30Start} AND o."paidAt" < ${w.tomorrowStart}`
    const { sales } = await getDashboard("owner", NOW)
    expect(sales.last30.paidSales).toBe(Number(sql.s))
    expect(sales.last30.saleOrders).toBe(Number(sql.n))
  })

  it("reads only the four fields (R4)", async () => {
    await order()
    const rows = await loadSaleRows(dashboardWindows(NOW))
    expect(Object.keys(rows[0]).sort()).toEqual([
      "createdAt",
      "paidAt",
      "status",
      "total",
    ])
  })

  it("is all zero with no orders (E13)", async () => {
    const d = await getDashboard("owner", NOW)
    expect(d.sales.today.paidSales).toBe(0)
    expect(d.sales.last30.averageOrder).toBeNull()
    expect(d.recent).toEqual([])
    expect(d.needsReview).toBe(0)
  })

  it("Demo sees the same figures (E19)", async () => {
    await order({ total: 4_000_000 })
    const o = await getDashboard("owner", NOW)
    const d = await getDashboard("demo", NOW)
    expect(d.sales).toEqual(o.sales)
    expect(d.restock).toEqual(o.restock)
    expect(d.needsReview).toBe(o.needsReview)
  })
})

describe("needs restocking", () => {
  it("lists active products out or low, lowest first, capped at 10 (E15 to E17)", async () => {
    for (let i = 0; i < 12; i++) await product(i % 6, { lowStockAt: 5 })
    await product(0, { status: "DRAFT" })
    await product(3, { lowStockAt: 0 })
    await product(0, { lowStockAt: 0, name: "Zero threshold out" })
    const { restock } = await getDashboard("owner", NOW)
    // stock 0..5 twice = 12 qualify, plus the zero-threshold one out of stock
    expect(restock.total).toBe(13)
    expect(restock.items).toHaveLength(10)
    expect(restock.items[0].stock).toBe(0)
    const stocks = restock.items.map((i) => i.stock)
    expect(stocks).toEqual([...stocks].sort((a, b) => a - b))
  })
})

describe("recent orders", () => {
  it("shows the 5 newest, newest first (E18)", async () => {
    for (let i = 0; i < 7; i++) {
      await order({ createdAt: new Date(TODAY.getTime() + i * 60_000) })
    }
    const { recent } = await getDashboard("owner", NOW)
    expect(recent).toHaveLength(5)
    const times = recent.map((r) => r.createdAt.getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("masks the customer for Demo only (E19, E20)", async () => {
    await order({ contactName: FIXTURE_CUSTOMER.name })
    const owner = await getDashboard("owner", NOW)
    const demo = await getDashboard("demo", NOW)
    expect(owner.recent[0].customer).toEqual({
      masked: false,
      name: FIXTURE_CUSTOMER.name,
    })
    expect(demo.recent[0].customer.masked).toBe(true)
    expect(JSON.stringify(demo)).not.toContain(FIXTURE_CUSTOMER.name)
  })

  it("flags a pending order past its deadline as due (E26)", async () => {
    const o = await order({ status: "PENDING_PAYMENT" })
    await db.order.update({
      where: { id: o.id },
      data: { expiresAt: new Date("2026-11-06T00:00:00Z") },
    })
    const { recent } = await getDashboard("owner", NOW)
    expect(recent[0].status).toBe("PENDING_PAYMENT")
    expect(recent[0].dueForRelease).toBe(true)
  })
})

describe("needs review", () => {
  it("counts each flagged order once (E24)", async () => {
    const late = await order({ status: "CANCELLED" })
    await db.payment.create({
      data: paymentData(late.id, {
        status: "PAID",
        paidAt: TODAY,
        problem: "LATE",
      }),
    })
    const both = await order({ status: "CANCELLED", refundRequired: true })
    await db.payment.create({
      data: paymentData(both.id, {
        status: "PAID",
        paidAt: TODAY,
        problem: "SECOND_PAYMENT",
      }),
    })
    await order({ status: "PAID" })
    const { needsReview } = await getDashboard("owner", NOW)
    expect(needsReview).toBe(2)
  })
})

describe("who may read it", () => {
  it("refuses Staff before any query (E21)", async () => {
    await expect(getDashboard("staff", NOW)).rejects.toBeInstanceOf(
      QueryDeniedError
    )
  })
})

describe("source rules", () => {
  const query = readFileSync("lib/admin/queries/dashboard.ts", "utf8")
  const page = readFileSync("app/admin/(shell)/dashboard/page.tsx", "utf8")

  it("never converts a column's zone in SQL (E30)", () => {
    for (const source of [
      query,
      readFileSync("lib/admin/dashboard-sales.ts", "utf8"),
    ]) {
      expect(source).not.toMatch(/AT TIME ZONE|date_trunc/i)
    }
  })

  it("uses no cache API (R9)", () => {
    for (const source of [query, page]) {
      expect(source).not.toMatch(
        /unstable_cache|cacheTag|["']use cache["']|revalidate\s*=/
      )
    }
  })
})
