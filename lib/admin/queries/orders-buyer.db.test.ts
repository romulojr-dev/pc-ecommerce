import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"
import { expectNoRawValues } from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"

import { DEFAULT_ORDER_PARAMS, type OrderParams } from "../orders-params"
import type { AdminRole } from "../permissions"
import { listOrders } from "./orders"

// docs/specs/042-admin-customers: E12–E14, E22–E24 through the real order list

const NOW = new Date("2026-11-02T08:00:00Z")
const at = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

afterAll(() => db.$disconnect())
beforeEach(async () => {
  vi.restoreAllMocks()
  await resetCatalog()
})

let seq = 0
function order(email: string, minutesAgo: number, name = "Ana Reyes") {
  seq += 1
  const orderNumber = `PCS-B${String(seq).padStart(7, "0")}`
  return db.order
    .create({
      data: orderData({
        orderNumber,
        guestEmail: email,
        contactName: name,
        createdAt: at(minutesAgo),
        expiresAt: new Date(NOW.getTime() + 3_600_000),
      }),
    })
    .then(() => orderNumber)
}

const params = (over: Partial<OrderParams> = {}): OrderParams => ({
  ...DEFAULT_ORDER_PARAMS,
  ...over,
})

async function list(role: AdminRole, over: Partial<OrderParams> = {}) {
  const result = await listOrders(role, params(over), NOW)
  if (!result.ok) throw new Error(`refused: ${result.message}`)
  return result
}

const numbers = (r: { rows: { orderNumber: string }[] }) =>
  r.rows.map((row) => row.orderNumber)

describe("the buyer filter", () => {
  test("E12: only that customer's orders, newest first, with their name", async () => {
    const a = await order("ana.reyes@example.com", 30)
    await order("ben.cruz@example.com", 20, "Ben Cruz")
    const b = await order("ana.reyes@example.com", 10)
    const result = await list("owner", { buyer: "ana.reyes@example.com" })
    expect(numbers(result)).toEqual([b, a])
    expect(result.total).toBe(2)
    expect(result.buyer).toEqual({ masked: false, name: "Ana Reyes" })
  })

  test("E13: exact, never contains: joana is not ana", async () => {
    const a = await order("ana@example.com", 30)
    await order("joana@example.com", 20, "Joana")
    await order("ana@example.com.ph", 10)
    const result = await list("staff", { buyer: "ana@example.com" })
    expect(numbers(result)).toEqual([a])
  })

  test("E14: every spelling of the customer is in the history", async () => {
    const a = await order("ana@example.com", 30)
    const b = await order("Ana@Example.com ", 20)
    const c = await order("ana+promo@example.com", 10)
    const result = await list("owner", { buyer: "ANA@example.com" })
    expect(numbers(result)).toEqual([c, b, a])
  })

  test("it combines with the other filters and with paging", async () => {
    for (let i = 0; i < 30; i++) await order("ana@example.com", 100 + i)
    await order("ben@example.com", 5, "Ben")
    const first = await list("owner", { buyer: "ana@example.com" })
    expect(first).toMatchObject({ total: 30, pageCount: 2 })
    expect(first.rows).toHaveLength(25)
    const none = await list("owner", {
      buyer: "ana@example.com",
      status: "SHIPPED",
    })
    expect(none.total).toBe(0)
    expect(none.buyer).toEqual({ masked: false, name: "Ana Reyes" })
  })

  test("a key that names nobody: no orders, unknown, no error", async () => {
    await order("ana@example.com", 10)
    const result = await list("owner", { buyer: "nobody@example.com" })
    expect(result).toMatchObject({ total: 0, rows: [], buyer: "unknown" })
  })

  test("no buyer filter: buyer is null and nothing extra runs", async () => {
    await order("ana@example.com", 10)
    const spy = vi.spyOn(db, "$queryRaw")
    const result = await list("owner")
    expect(result.buyer).toBeNull()
    // Only the due-badge query is raw
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe("Demo", () => {
  test("E22: a rank key follows the customer, with masked names", async () => {
    await order("ana.reyes@example.com", 30)
    const ben = await order("ben.cruz@example.com", 5, "Ben Cruz")
    const result = await list("demo", { buyer: "c1" })
    expect(numbers(result)).toEqual([ben])
    expect(result.buyer).toEqual({ masked: true, name: "B••• C•••" })
    expectNoRawValues(result, [
      "ben.cruz@example.com",
      "Ben Cruz",
      "Cruz",
      "example.com",
    ])
  })

  test("E23: an email as Demo's buyer finds nothing and runs no lookup", async () => {
    await order("ana.reyes@example.com", 30)
    const spy = vi.spyOn(db, "$queryRaw")
    const result = await list("demo", { buyer: "ana.reyes@example.com" })
    expect(result).toMatchObject({ total: 0, rows: [], buyer: "unknown" })
    // The only raw query allowed is the due badge for an empty page: none
    expect(spy).not.toHaveBeenCalled()
  })

  test("E24: a rank past the last is unknown", async () => {
    await order("ana@example.com", 30)
    const result = await list("demo", { buyer: "c999" })
    expect(result).toMatchObject({ total: 0, buyer: "unknown" })
  })

  test("a customer term is still refused as before", async () => {
    await order("ana@example.com", 30)
    const result = await listOrders(
      "demo",
      params({ customer: "reyes", buyer: "c1" }),
      NOW
    )
    expect(result.ok).toBe(false)
  })
})
