import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"

import {
  type CustomerParams,
  DEFAULT_CUSTOMER_PARAMS,
} from "../customers-params"
import type { AdminRole } from "../permissions"
import { customerLinkKey, findBuyerOrders, listCustomers } from "./customers"
import { QueryDeniedError } from "./guard"

// docs/specs/042-admin-customers: E1–E11, E15–E19, E21, E23, E24, E26, E33,
// E34 through the real query layer

afterAll(() => db.$disconnect())
beforeEach(async () => {
  await resetCatalog()
})

const T0 = new Date("2026-11-01T00:00:00Z").getTime()
const at = (minutes: number) => new Date(T0 + minutes * 60_000)

const ANA = "ana.reyes@example.com"
const BEN = "ben.cruz@example.com"

let seq = 0

type Over = Parameters<typeof orderData>[0]

// An order from `email`, `minutes` after T0. Pending by default
function order(email: string, minutes: number, over: Over = {}) {
  seq += 1
  return db.order.create({
    data: orderData({
      orderNumber: `PCS-C${String(seq).padStart(7, "0")}`,
      guestEmail: email,
      contactName: email.split("@")[0],
      createdAt: at(minutes),
      expiresAt: at(minutes + 1_000_000),
      ...over,
    }),
  })
}

// total = subtotal + shippingFee - discount (a CHECK), so a bare total is a
// subtotal with free shipping
const money = (total: number): Over => ({
  subtotal: total,
  shippingFee: 0,
  discount: 0,
  total,
})
const paid = (minutes: number, total: number): Over => ({
  status: "PAID",
  paidAt: at(minutes + 1),
  paymentMethod: "FAKE",
  ...money(total),
})
const delivered = (minutes: number, total: number): Over => ({
  status: "DELIVERED",
  paidAt: at(minutes + 1),
  paymentMethod: "FAKE",
  ...money(total),
})
const cancelled = (minutes: number): Over => ({
  status: "CANCELLED",
  cancelledAt: at(minutes + 1),
  cancelReason: "EXPIRED",
})
const refunded = (minutes: number, total: number): Over => ({
  status: "REFUNDED",
  paidAt: at(minutes + 1),
  paymentMethod: "FAKE",
  ...money(total),
})

const params = (over: Partial<CustomerParams> = {}): CustomerParams => ({
  ...DEFAULT_CUSTOMER_PARAMS,
  ...over,
})

async function list(role: AdminRole, over: Partial<CustomerParams> = {}) {
  const result = await listCustomers(role, params(over))
  if (!result.ok) throw new Error(`refused: ${result.message}`)
  return result
}

describe("the numbers on a row", () => {
  test("E1: orders placed, total spent and last order", async () => {
    await order(ANA, 0, paid(0, 4_199_000))
    await order(ANA, 10, delivered(10, 850_000))
    await order(ANA, 20, money(120_000))
    const { rows, total } = await list("owner")
    expect(total).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: ANA,
      orderCount: 3,
      totalSpent: 5_049_000,
      lastOrderAt: at(20),
    })
  })

  test("E2: a cancelled order is still an order placed, but adds nothing", async () => {
    await order(ANA, 0, paid(0, 100_000))
    await order(ANA, 5, cancelled(5))
    const [row] = (await list("owner")).rows
    expect(row.orderCount).toBe(2)
    expect(row.totalSpent).toBe(100_000)
    expect(row.lastOrderAt).toEqual(at(5))
  })

  test("E3: a refunded order has paidAt but does not count", async () => {
    await order(ANA, 0, paid(0, 1_000_000))
    await order(ANA, 5, refunded(5, 500_000))
    const [row] = (await list("owner")).rows
    expect(row.orderCount).toBe(2)
    expect(row.totalSpent).toBe(1_000_000)
  })

  test("E4: only unpaid and cancelled orders: ₱0.00", async () => {
    await order(BEN, 0)
    await order(BEN, 5, cancelled(5))
    const [row] = (await list("owner")).rows
    expect(row.orderCount).toBe(2)
    expect(row.totalSpent).toBe(0)
  })

  test("E5: a cash order counts once Admin has set paidAt", async () => {
    const cod = { paymentOption: "COD" as const }
    await order(ANA, 0, {
      ...cod,
      ...money(300_000),
      status: "DELIVERED",
      paidAt: at(2),
      confirmedAt: at(1),
      paymentMethod: null,
    })
    await order(ANA, 10, {
      ...cod,
      ...money(700_000),
      status: "COD_CONFIRMED",
      confirmedAt: at(11),
      paymentMethod: null,
    })
    const [row] = (await list("owner")).rows
    expect(row.orderCount).toBe(2)
    expect(row.totalSpent).toBe(300_000)
  })

  test("E34: the grand total counts: items plus shipping minus the voucher", async () => {
    const voucher = await db.voucher.create({
      data: {
        code: "WELCOME10",
        type: "PERCENT",
        value: 10,
        startsAt: at(-1000),
      } as Parameters<typeof db.voucher.create>[0]["data"],
    })
    await order(ANA, 0, {
      ...paid(0, 915_000),
      subtotal: 1_000_000,
      shippingFee: 15_000,
      discount: 100_000,
      voucherId: voucher.id,
      voucherCode: voucher.code,
    } as unknown as Over)
    const [row] = (await list("owner")).rows
    expect(row.totalSpent).toBe(915_000)
  })

  test("E33: the row's name and email are the newest order's", async () => {
    await order(ANA, 0, { contactName: "Ana Reyes" })
    await order(ANA, 10, { contactName: "Ana R. Reyes" })
    const [row] = (await list("owner")).rows
    expect(row.contact).toEqual({
      masked: false,
      name: "Ana R. Reyes",
      email: ANA,
    })
  })
})

describe("who is one customer", () => {
  test("E6: case, spaces and a +tag are one customer", async () => {
    await order("ana@example.com", 0)
    await order("Ana@Example.com ", 5)
    await order("ana+promo@example.com", 10)
    const { rows } = await list("owner")
    expect(rows).toHaveLength(1)
    expect(rows[0].orderCount).toBe(3)
    expect(rows[0].id).toBe("ana@example.com")
    // The newest order's email, as stored
    expect(rows[0].contact).toMatchObject({ email: "ana+promo@example.com" })
  })

  test("E7: dots make another customer", async () => {
    await order("a.na@example.com", 0)
    await order("ana@example.com", 5)
    expect((await list("owner")).total).toBe(2)
  })

  test("E8: odd addresses are their own customers, with no error", async () => {
    await order("+x@example.com", 0)
    await order("no-at-sign", 5)
    expect((await list("owner")).rows.map((r) => r.id).sort()).toEqual([
      "+x@example.com",
      "no-at-sign",
    ])
  })
})

describe("paging and order", () => {
  test("E9: 25 a page, most recent last order first", async () => {
    for (let i = 0; i < 30; i++) await order(`c${i}@example.com`, i)
    const first = await list("owner")
    expect(first.total).toBe(30)
    expect(first.pageCount).toBe(2)
    expect(first.rows).toHaveLength(25)
    expect(first.rows[0].id).toBe("c29@example.com")
    const second = await list("owner", { page: 2 })
    expect(second.rows).toHaveLength(5)
    expect(second.rows[4].id).toBe("c0@example.com")
  })

  test("a page past the last lands on the last", async () => {
    for (let i = 0; i < 30; i++) await order(`c${i}@example.com`, i)
    expect((await list("owner", { page: 9 })).page).toBe(2)
  })

  test("E10: customers with the same last order keep a stable order", async () => {
    await order("b@example.com", 5)
    await order("a@example.com", 5)
    await order("c@example.com", 5)
    for (let run = 0; run < 3; run++) {
      expect((await list("owner")).rows.map((r) => r.id)).toEqual([
        "a@example.com",
        "b@example.com",
        "c@example.com",
      ])
    }
  })

  test("E11: no silent cutoff past thousands of orders", async () => {
    await db.$executeRaw`
      INSERT INTO "Order" (
        "id", "orderNumber", "accessTokenHash", "idempotencyKey", "cartIdHash",
        "status", "fulfillment", "paymentOption", "guestEmail", "contactName",
        "contactMobile", "weightGrams", "subtotal", "shippingFee", "discount",
        "total", "expiresAt", "createdAt", "updatedAt")
      SELECT 'bulk' || g, 'PCS-B' || lpad(g::text, 7, '0'),
        'h' || g, 'k' || g, 'cart' || g,
        'PENDING_PAYMENT', 'PICKUP', 'ONLINE', 'bulk' || g || '@example.com',
        'Bulk ' || g, '+639170000000', 100, 1000, 0, 0,
        1000, now() + interval '1 day', now(), now()
      FROM generate_series(1, 6000) AS g`
    const result = await list("owner")
    expect(result.total).toBe(6000)
    expect(result.pageCount).toBe(240)
    const last = await list("owner", { page: 240 })
    expect(last.rows).toHaveLength(25)
  })
})

describe("search", () => {
  beforeEach(async () => {
    await order(ANA, 0, { contactName: "Ana Reyes", ...paid(0, 100_000) })
    await order(BEN, 5, {
      contactName: "Ben Cruz",
      contactMobile: "+639989998888",
    })
  })

  test("E15: by name and by email, in any case, with the whole count", async () => {
    for (const customer of ["reyes", "REYES", "ana.reyes@example"]) {
      const { rows } = await list("owner", { customer })
      expect(rows.map((r) => r.id)).toEqual([ANA])
    }
  })

  test("E16: by the mobile in any spelling", async () => {
    await db.order.updateMany({
      where: { guestEmail: ANA },
      data: { contactMobile: "+639171234567" },
    })
    for (const customer of [
      "0917 123 4567",
      "+63 917 123 4567",
      "9171234567",
    ]) {
      const { rows } = await list("owner", { customer })
      expect(
        rows.map((r) => r.id),
        customer
      ).toEqual([ANA])
    }
  })

  test("E17: any order may match, the row still shows every order", async () => {
    await order(ANA, 10, { contactName: "Ana R. Santiago" })
    const { rows } = await list("owner", { customer: "reyes" })
    expect(rows).toHaveLength(1)
    expect(rows[0].orderCount).toBe(2)
    expect(rows[0].contact).toMatchObject({ name: "Ana R. Santiago" })
  })

  test("E18: a term under 3 characters is ignored", async () => {
    expect((await list("owner", { customer: "ab" })).total).toBe(2)
  })

  test("E19: no match is an empty page 1", async () => {
    const result = await list("owner", { customer: "zzzzzz", page: 4 })
    expect(result.total).toBe(0)
    expect(result.rows).toEqual([])
    expect(result.page).toBe(1)
  })

  test("a term with LIKE characters is text, not a pattern", async () => {
    await order("under_score@example.com", 20)
    await order("underXscore@example.com", 21)
    expect(
      (await list("owner", { customer: "under_score" })).rows.map((r) => r.id)
    ).toEqual(["under_score@example.com"])
    expect((await list("owner", { customer: "%%%" })).total).toBe(0)
    expect((await list("owner", { customer: "\\\\\\" })).total).toBe(0)
  })

  test("Staff searches like Owner (E29)", async () => {
    const rows = (await list("staff", { customer: "reyes" })).rows
    expect(rows.map((r) => r.id)).toEqual([ANA])
    expect(rows[0].contact.masked).toBe(false)
  })
})

describe("Demo", () => {
  beforeEach(async () => {
    await order(ANA, 0, {
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
    })
    await order(BEN, 10)
  })

  test("E20: rows are masked and keyed by rank across the whole list", async () => {
    const { rows } = await list("demo")
    expect(rows.map((r) => r.id)).toEqual(["c1", "c2"])
    expect(rows.every((r) => r.contact.masked)).toBe(true)
    expectNoRawValues(rows, [...FIXTURE_RAW_VALUES, ANA, BEN, "ben.cruz"])
  })

  test("a row on page 2 is ranked across the list, not within its page", async () => {
    for (let i = 0; i < 30; i++) await order(`c${i}@example.com`, 100 + i)
    const second = await list("demo", { page: 2 })
    expect(second.rows[0].id).toBe("c26")
    expect(second.rows).toHaveLength(7)
  })

  test("E21: a customer term is refused before any query, whatever its length", async () => {
    const spy = vi.spyOn(db, "$queryRaw")
    for (const customer of ["reyes", "ab", "a"]) {
      const result = await listCustomers("demo", params({ customer }))
      expect(result.ok).toBe(false)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("following a customer into the orders", () => {
  test("E12–E14: Owner reaches every order of the customer, and only theirs", async () => {
    const a = await order("ana@example.com", 0)
    const b = await order("Ana@Example.com ", 5)
    const c = await order("ana+promo@example.com", 10)
    await order("joana@example.com", 20)
    const found = await findBuyerOrders("owner", "ana@example.com")
    expect(new Set(found.orderIds)).toEqual(new Set([a.id, b.id, c.id]))
    expect(found.orderIds[0]).toBe(c.id)
    expect(found.name).toEqual({ masked: false, name: "ana+promo" })
    // The key may be typed in another spelling
    expect(
      (await findBuyerOrders("staff", " ANA+x@Example.com ")).orderIds
    ).toHaveLength(3)
  })

  test("an unknown customer has no orders and no name", async () => {
    await order(ANA, 0)
    expect(await findBuyerOrders("owner", "nobody@example.com")).toEqual({
      orderIds: [],
      name: null,
    })
    expect(await findBuyerOrders("owner", "   ")).toEqual({
      orderIds: [],
      name: null,
    })
  })

  test("E22: Demo follows a rank key and sees a masked name", async () => {
    const ana = await order(ANA, 0, { contactName: "Ana Reyes" })
    await order(BEN, 10)
    const found = await findBuyerOrders("demo", "c2")
    expect(found.orderIds).toEqual([ana.id])
    expect(found.name).toEqual({ masked: true, name: "A••• R•••" })
  })

  test("E23: a Demo email key names nobody and runs no query", async () => {
    await order(ANA, 0)
    const spy = vi.spyOn(db, "$queryRaw")
    expect(await findBuyerOrders("demo", ANA)).toEqual({
      orderIds: [],
      name: null,
    })
    expect(await findBuyerOrders("demo", "C1")).toEqual({
      orderIds: [],
      name: null,
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  test("E24: a Demo rank past the last names nobody", async () => {
    await order(ANA, 0)
    expect((await findBuyerOrders("demo", "c999")).name).toBeNull()
  })

  test("the link key: email for Owner and Staff, rank for Demo", async () => {
    await order(ANA, 0)
    await order(BEN, 10)
    expect(await customerLinkKey("owner", "Ana.Reyes@Example.com")).toBe(ANA)
    expect(await customerLinkKey("staff", ANA)).toBe(ANA)
    expect(await customerLinkKey("demo", ANA)).toBe("c2")
    expect(await customerLinkKey("demo", BEN)).toBe("c1")
    expect(await customerLinkKey("demo", "nobody@example.com")).toBeNull()
  })
})

describe("E26: role gating", () => {
  test("a role without customers.view is refused by every query", async () => {
    const nobody = "visitor" as AdminRole
    await expect(listCustomers(nobody, params())).rejects.toThrow(
      QueryDeniedError
    )
    await expect(findBuyerOrders(nobody, ANA)).rejects.toThrow(QueryDeniedError)
    expect(await customerLinkKey(nobody, ANA)).toBeNull()
  })
})
