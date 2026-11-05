import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { dueOrderCondition } from "@/lib/orders/due-sql"
import { isDue } from "@/lib/orders/release-rules"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"

import { DEFAULT_ORDER_PARAMS, type OrderParams } from "../orders-params"
import type { AdminRole } from "../permissions"
import { QueryDeniedError } from "./guard"
import { listOrders } from "./orders"

// docs/specs/041-admin-orders-list-detail: E1, E3, E3a, E4, E6–E11, E12–E17,
// E31 (the badge), through the real query layer

const NOW = new Date("2026-11-02T08:00:00Z")
const DEADLINE = new Date("2026-11-02T07:00:00Z")
const minutes = (n: number) => new Date(NOW.getTime() - n * 60_000)

const params = (over: Partial<OrderParams> = {}): OrderParams => ({
  ...DEFAULT_ORDER_PARAMS,
  ...over,
})

async function list(role: AdminRole, over: Partial<OrderParams> = {}) {
  const result = await listOrders(role, params(over), NOW)
  if (!result.ok) throw new Error(`refused: ${result.message}`)
  return result
}

const numbersOf = (result: { rows: { orderNumber: string }[] }) =>
  result.rows.map((row) => row.orderNumber)

// n orders, the first the oldest
async function makeOrders(n: number) {
  const numbers: string[] = []
  for (let i = 0; i < n; i++) {
    const orderNumber = `PCS-L${String(i).padStart(7, "0")}`
    numbers.push(orderNumber)
    await db.order.create({
      data: orderData({
        orderNumber,
        createdAt: minutes(n - i + 10),
        expiresAt: new Date(NOW.getTime() + 3_600_000),
      }),
    })
  }
  return numbers
}

const cancelled = {
  status: "CANCELLED" as const,
  cancelledAt: DEADLINE,
  cancelReason: "EXPIRED" as const,
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await resetCatalog()
})
afterAll(() => db.$disconnect())

describe("paging and order", () => {
  test("E1: 25 per page, newest first, with the total", async () => {
    const numbers = await makeOrders(30)
    const first = await list("owner")
    expect(first).toMatchObject({ total: 30, page: 1, pageCount: 2 })
    expect(numbersOf(first)).toEqual(numbers.slice(5).reverse())

    const second = await list("owner", { page: 2 })
    expect(numbersOf(second)).toEqual(numbers.slice(0, 5).reverse())
  })

  test("orders made at the same instant keep a stable order (id)", async () => {
    const at = minutes(5)
    for (const orderNumber of ["PCS-SAME0001", "PCS-SAME0002"]) {
      await db.order.create({
        data: orderData({ orderNumber, createdAt: at, expiresAt: NOW }),
      })
    }
    const a = numbersOf(await list("owner"))
    const b = numbersOf(await list("owner"))
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
  })

  test("E3: a page past the last lands on the last", async () => {
    await makeOrders(30)
    const result = await list("owner", { page: 9 })
    expect(result.page).toBe(2)
    expect(result.rows).toHaveLength(5)
  })

  test("E3a: no match is page 1 with no rows, whatever page was asked", async () => {
    await makeOrders(3)
    const result = await list("owner", { status: "SHIPPED", page: 4 })
    expect(result).toMatchObject({ total: 0, page: 1, pageCount: 1, rows: [] })
  })

  test("no orders at all", async () => {
    expect(await list("owner")).toMatchObject({ total: 0, rows: [] })
  })
})

describe("filters", () => {
  test("E4, E6, E7: status and payment, alone and together", async () => {
    await db.order.create({
      data: orderData({ orderNumber: "PCS-ONLINE01", expiresAt: NOW }),
    })
    await db.order.create({
      data: orderData({
        orderNumber: "PCS-ONLINE02",
        status: "PAID",
        paidAt: minutes(5),
        paymentMethod: "GCASH",
        expiresAt: NOW,
      }),
    })
    await db.order.create({
      data: orderData({
        orderNumber: "PCS-CASH0001",
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
        expiresAt: NOW,
      }),
    })
    await db.order.create({
      data: orderData({
        orderNumber: "PCS-CASH0002",
        fulfillment: "PICKUP",
        paymentOption: "COD",
        status: "COD_CONFIRMED",
        confirmedAt: minutes(2),
        expiresAt: NOW,
        regionCode: null,
        regionName: null,
        provinceCode: null,
        provinceName: null,
        cityCode: null,
        cityName: null,
        barangayCode: null,
        barangayName: null,
        street: null,
        zip: null,
        psgcVersion: null,
        zone: null,
      }),
    })

    const sorted = async (over: Partial<OrderParams>) =>
      numbersOf(await list("owner", over)).sort()

    expect(await sorted({ status: "PAID" })).toEqual(["PCS-ONLINE02"])
    expect(await sorted({ payment: "cod" })).toEqual([
      "PCS-CASH0001",
      "PCS-CASH0002",
    ])
    expect(await sorted({ payment: "online" })).toEqual([
      "PCS-ONLINE01",
      "PCS-ONLINE02",
    ])
    expect(await sorted({ payment: "online", status: "PAID" })).toEqual([
      "PCS-ONLINE02",
    ])
    expect(await sorted({ payment: "cod", status: "PAID" })).toEqual([])
  })

  test("E8: order number matches a part, in any case", async () => {
    await db.order.create({
      data: orderData({ orderNumber: "PCS-7K3M9Q2X", expiresAt: NOW }),
    })
    await db.order.create({
      data: orderData({ orderNumber: "PCS-ABCD1234", expiresAt: NOW }),
    })
    expect(numbersOf(await list("owner", { number: "7k3m" }))).toEqual([
      "PCS-7K3M9Q2X",
    ])
    expect(numbersOf(await list("owner", { number: "ZZZZ" }))).toEqual([])
    expect(numbersOf(await list("demo", { number: "7k3m" }))).toEqual([
      "PCS-7K3M9Q2X",
    ])
  })
})

describe("customer search", () => {
  beforeEach(async () => {
    await db.order.create({
      data: orderData({
        orderNumber: "PCS-ANA00001",
        guestEmail: FIXTURE_CUSTOMER.email,
        contactName: FIXTURE_CUSTOMER.name,
        contactMobile: FIXTURE_CUSTOMER.mobile,
        street: FIXTURE_CUSTOMER.street,
        expiresAt: NOW,
      }),
    })
    await db.order.create({
      data: orderData({
        orderNumber: "PCS-BEN00001",
        guestEmail: "ben.cruz@example.com",
        contactName: "Ben Cruz",
        contactMobile: "+639281112222",
        expiresAt: NOW,
      }),
    })
  })

  test("E9: Owner and Staff find a customer by name and email, any case", async () => {
    for (const role of ["owner", "staff"] as const) {
      for (const customer of [
        "reyes",
        "REYES",
        "ana reyes",
        "ana.reyes@example",
      ]) {
        expect(
          numbersOf(await list(role, { customer })),
          `${role} ${customer}`
        ).toEqual(["PCS-ANA00001"])
      }
    }
  })

  test("E9a: a term under 3 characters is ignored", async () => {
    expect(numbersOf(await list("owner", { customer: "ab" })).sort()).toEqual([
      "PCS-ANA00001",
      "PCS-BEN00001",
    ])
  })

  test("E9b: every spelling of the mobile finds the same order", async () => {
    for (const customer of [
      "0917 123 4567",
      "+63 917 123 4567",
      "9171234567",
      "917123",
      "0917123",
      "63 917 123 4567",
    ]) {
      expect(numbersOf(await list("owner", { customer })), customer).toEqual([
        "PCS-ANA00001",
      ])
    }
    // 0 and 63 alone add no mobile condition, and are under 3 characters
    expect(numbersOf(await list("owner", { customer: "63" }))).toHaveLength(2)
  })

  test("a name search and a filter combine", async () => {
    expect(
      numbersOf(await list("owner", { customer: "cruz", status: "PAID" }))
    ).toEqual([])
    expect(
      numbersOf(
        await list("owner", { customer: "cruz", status: "PENDING_PAYMENT" })
      )
    ).toEqual(["PCS-BEN00001"])
  })

  test("E10: Demo is refused before any query, whatever the term", async () => {
    const count = vi.spyOn(db.order, "count")
    const findMany = vi.spyOn(db.order, "findMany")
    const raw = vi.spyOn(db, "$queryRaw")
    // The control: the spies do see an allowed call
    await listOrders("owner", params({ customer: "ana" }), NOW)
    expect(count).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledTimes(1)
    count.mockClear()
    findMany.mockClear()
    raw.mockClear()
    for (const customer of ["ana.reyes@example.com", "Reyes", "+63917", "a"]) {
      expect(await listOrders("demo", params({ customer }), NOW)).toEqual({
        ok: false,
        error: "forbidden",
        message: "This account is read-only",
      })
    }
    // Also with an order-number term beside it
    expect(
      await listOrders("demo", params({ customer: "ana", number: "ANA" }), NOW)
    ).toMatchObject({ ok: false })
    expect(count).not.toHaveBeenCalled()
    expect(findMany).not.toHaveBeenCalled()
    expect(raw).not.toHaveBeenCalled()
  })

  test("E11: Demo's results are masked", async () => {
    const result = await list("demo", { number: "ANA0" })
    expect(numbersOf(result)).toEqual(["PCS-ANA00001"])
    expect(result.rows[0].customer).toEqual({ masked: true, name: "A••• R•••" })
    expectNoRawValues(result, FIXTURE_RAW_VALUES)
  })

  test("Owner and Staff see the real name", async () => {
    const result = await list("staff", { number: "ANA0" })
    expect(result.rows[0].customer).toEqual({
      masked: false,
      name: "Ana Reyes",
    })
  })
})

describe("the true status and the badges", () => {
  const one = async (
    data: Parameters<typeof orderData>[0],
    problem?: "AMOUNT_MISMATCH" | "LATE",
    now = NOW
  ) => {
    const order = await db.order.create({
      data: orderData({ orderNumber: "PCS-ONE00001", ...data }),
    })
    if (problem) {
      await db.payment.create({
        data: paymentData(order.id, {
          status: problem === "LATE" ? "PAID" : "PENDING",
          ...(problem === "LATE" ? { paidAt: now } : {}),
          problem,
        }),
      })
    }
    const result = await listOrders("owner", params(), now)
    if (!result.ok) throw new Error("refused")
    return result.rows[0]
  }

  test("E12: past the deadline reads Pending payment, not Cancelled, and is due", async () => {
    const row = await one({ expiresAt: new Date(NOW.getTime() - 1000) })
    expect(row).toMatchObject({
      status: "PENDING_PAYMENT",
      dueForRelease: true,
    })
  })

  test("E13, E14: the deadline itself is due, a second before is not", async () => {
    expect((await one({ expiresAt: NOW })).dueForRelease).toBe(true)
    await resetCatalog()
    expect(
      (await one({ expiresAt: new Date(NOW.getTime() + 1000) })).dueForRelease
    ).toBe(false)
  })

  test("E15: a payment that needs checking is flagged and never due", async () => {
    const row = await one({ expiresAt: DEADLINE }, "AMOUNT_MISMATCH")
    expect(row).toMatchObject({
      status: "PENDING_PAYMENT",
      dueForRelease: false,
      flags: { needsCheck: true, refundRequired: false },
    })
  })

  test("E16: a late payment on a cancelled order flags a refund", async () => {
    const row = await one(
      { ...cancelled, refundRequired: true, expiresAt: DEADLINE },
      "LATE"
    )
    expect(row).toMatchObject({
      status: "CANCELLED",
      dueForRelease: false,
      flags: { refundRequired: true, needsCheck: false },
    })
  })

  test("E17: COD confirmed never reads as due", async () => {
    const row = await one({
      paymentOption: "COD",
      status: "COD_CONFIRMED",
      confirmedAt: DEADLINE,
      expiresAt: DEADLINE,
    })
    expect(row).toMatchObject({ status: "COD_CONFIRMED", dueForRelease: false })
  })

  test("E31: the badge agrees with the pure rule on a page of orders", async () => {
    const fixtures: [string, Parameters<typeof orderData>[0], boolean][] = [
      ["PCS-F0000001", { expiresAt: new Date(NOW.getTime() - 1) }, false],
      ["PCS-F0000002", { expiresAt: NOW }, false],
      ["PCS-F0000003", { expiresAt: new Date(NOW.getTime() + 1) }, false],
      [
        "PCS-F0000004",
        {
          paymentOption: "COD",
          status: "PENDING_CONFIRMATION",
          expiresAt: NOW,
        },
        false,
      ],
      ["PCS-F0000005", { ...cancelled, expiresAt: DEADLINE }, false],
      ["PCS-F0000006", { expiresAt: DEADLINE }, true],
    ]
    for (const [orderNumber, data, flagged] of fixtures) {
      const order = await db.order.create({
        data: orderData({ orderNumber, ...data }),
      })
      if (flagged) {
        await db.payment.create({
          data: paymentData(order.id, { problem: "AMOUNT_MISMATCH" }),
        })
      }
    }
    const result = await list("owner")
    const stored = await db.order.findMany({
      select: { orderNumber: true, status: true, expiresAt: true },
    })
    const viaSql = await db.$queryRaw<{ orderNumber: string }[]>`
      SELECT o."orderNumber" FROM "Order" o WHERE ${dueOrderCondition(NOW)}`
    for (const row of result.rows) {
      const o = stored.find((s) => s.orderNumber === row.orderNumber)!
      const flagged = row.flags.needsCheck
      expect(row.dueForRelease, row.orderNumber).toBe(
        isDue({ status: o.status, expiresAt: o.expiresAt, flagged }, NOW)
      )
      expect(row.dueForRelease, row.orderNumber).toBe(
        viaSql.some((v) => v.orderNumber === row.orderNumber)
      )
    }
    expect(result.rows.filter((r) => r.dueForRelease)).not.toHaveLength(0)
  })
})

describe("who may list", () => {
  test("an unknown role is refused", async () => {
    await expect(
      listOrders("nobody" as AdminRole, params(), NOW)
    ).rejects.toBeInstanceOf(QueryDeniedError)
  })

  test("the rows carry only the named fields", async () => {
    await makeOrders(1)
    const result = await list("owner")
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "createdAt",
      "customer",
      "dueForRelease",
      "flags",
      "fulfillment",
      "orderNumber",
      "paymentMethod",
      "paymentOption",
      "status",
      "total",
    ])
  })
})
