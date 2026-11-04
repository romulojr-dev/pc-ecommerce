import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { shippingSeed } from "@/prisma/seed/data/shipping"
import { toDbZone } from "@/lib/shipping/zone-enum"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

// What the database itself guarantees for cash orders (docs/specs/038-cash-on-
// delivery): D1, D3–D6, D10. CHECKs are migration-only, so only these tests
// cover them (db:drift doesn't compare them).

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const NOW = new Date("2026-11-04T04:30:00Z")
type Data = Parameters<typeof orderData>[0]

// An order in a given state; every field the CHECKs look at is overridable
const cash = (overrides: Data = {}) =>
  orderData({ paymentOption: "COD", ...overrides })
const create = (data: Data) => db.order.create({ data: orderData(data) })

describe("StoreSettings COD columns", () => {
  const required = { storeAddress: "a", storeHours: "b", storeInfo: "c" }

  it("D1: a row made without them gets the demo values (as the existing row did)", async () => {
    const row = await db.storeSettings.create({ data: required })
    expect(row).toMatchObject({
      codEnabled: true,
      codMaxTotal: 5_000_000,
      codZones: ["METRO_MANILA", "LUZON"],
      codPickupEnabled: true,
      codConfirmHours: 24,
    })
  })

  it("D1: the defaults are the seed's values", async () => {
    const row = await db.storeSettings.create({ data: required })
    const { store } = shippingSeed
    expect(row).toMatchObject({
      codEnabled: store.codEnabled,
      codMaxTotal: store.codMaxTotal,
      codZones: store.codZones.map((zone) => toDbZone[zone]),
      codPickupEnabled: store.codPickupEnabled,
      codConfirmHours: store.codConfirmHours,
    })
  })

  it.each([
    ["a limit of 0", { codMaxTotal: 0 }],
    ["a negative limit", { codMaxTotal: -1 }],
    ["0 hours to confirm", { codConfirmHours: 0 }],
    ["a negative confirmation time", { codConfirmHours: -5 }],
  ])("D3: refuses %s", async (_name, patch) => {
    await expect(
      db.storeSettings.create({ data: { ...required, ...patch } })
    ).rejects.toThrow()
  })

  it("D3: accepts no limit, no zones and the boundaries", async () => {
    const row = await db.storeSettings.create({
      data: {
        ...required,
        codMaxTotal: null,
        codZones: [],
        codConfirmHours: 1,
      },
    })
    expect(row).toMatchObject({
      codMaxTotal: null,
      codZones: [],
      codConfirmHours: 1,
    })
    await db.storeSettings.update({
      where: { id: 1 },
      data: { codMaxTotal: 1 },
    })
  })
})

describe("an order's payment option and status", () => {
  it("D4: a cash order may be Pending confirmation or COD confirmed", async () => {
    await create({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
    })
    await create({
      paymentOption: "COD",
      status: "COD_CONFIRMED",
      confirmedAt: NOW,
    })
  })

  it("D4: an online order is Pending payment by default and may be Paid", async () => {
    const order = await create({})
    expect(order).toMatchObject({
      paymentOption: "ONLINE",
      status: "PENDING_PAYMENT",
      confirmedAt: null,
    })
    await create({ status: "PAID", paidAt: NOW })
  })

  it.each([
    ["Pending confirmation", { status: "PENDING_CONFIRMATION" }],
    ["COD confirmed", { status: "COD_CONFIRMED", confirmedAt: NOW }],
  ] as const)("D4: refuses an online order that is %s", async (_n, data) => {
    await expect(create({ paymentOption: "ONLINE", ...data })).rejects.toThrow()
  })

  it.each([
    ["Pending payment", { status: "PENDING_PAYMENT" }],
    ["Paid", { status: "PAID", paidAt: NOW }],
  ] as const)("D4: refuses a cash order that is %s", async (_n, data) => {
    await expect(create({ paymentOption: "COD", ...data })).rejects.toThrow()
  })
})

describe("a cash order's paidAt", () => {
  it.each([
    ["Pending confirmation", "PENDING_CONFIRMATION"],
    ["COD confirmed", "COD_CONFIRMED"],
    ["Processing", "PROCESSING"],
    ["Shipped", "SHIPPED"],
    ["Ready for pickup", "READY_FOR_PICKUP"],
  ] as const)("D5: refused while %s", async (_n, status) => {
    await expect(
      create({
        paymentOption: "COD",
        status,
        paidAt: NOW,
        confirmedAt: status === "PENDING_CONFIRMATION" ? null : NOW,
      })
    ).rejects.toThrow()
  })

  it.each(["DELIVERED", "PICKED_UP"] as const)(
    "D5: allowed once %s",
    async (status) => {
      await create({
        paymentOption: "COD",
        status,
        paidAt: NOW,
        confirmedAt: NOW,
      })
    }
  )

  it("D5: an online order can still be Paid with a time", async () => {
    await create({ status: "PAID", paidAt: NOW })
  })
})

describe("pending orders and the existing checks", () => {
  it("D6: a Pending confirmation order can't have been cancelled or paid", async () => {
    await expect(
      create({
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
        cancelledAt: NOW,
      })
    ).rejects.toThrow()
    await expect(
      create({
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
        paidAt: NOW,
      })
    ).rejects.toThrow()
  })

  it("D6: a cancelled cash order needs its time and reason, like any other", async () => {
    await expect(
      create({ paymentOption: "COD", status: "CANCELLED" })
    ).rejects.toThrow()
    await create({
      paymentOption: "COD",
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelReason: "EXPIRED",
    })
  })

  it("D6: the online checks still hold", async () => {
    await expect(
      create({ status: "PENDING_PAYMENT", cancelledAt: NOW })
    ).rejects.toThrow()
    await expect(
      create({ status: "PENDING_PAYMENT", paidAt: NOW })
    ).rejects.toThrow()
  })
})

describe("confirmedAt", () => {
  it("D10: refused on an online order", async () => {
    await expect(create({ confirmedAt: NOW })).rejects.toThrow()
    await expect(
      create({ status: "PAID", paidAt: NOW, confirmedAt: NOW })
    ).rejects.toThrow()
  })

  it("D10: refused on a cash order that is still Pending confirmation", async () => {
    await expect(
      create({
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
        confirmedAt: NOW,
      })
    ).rejects.toThrow()
  })

  it.each([
    "COD_CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "READY_FOR_PICKUP",
    "DELIVERED",
    "PICKED_UP",
  ] as const)(
    "D10: refused missing on a cash order that is %s",
    async (status) => {
      await expect(
        create({ paymentOption: "COD", status, confirmedAt: null })
      ).rejects.toThrow()
    }
  )

  it("D10: allowed on a confirmed order that Admin cancelled, and null on one never confirmed", async () => {
    await create({
      paymentOption: "COD",
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelReason: "EXPIRED",
      confirmedAt: NOW,
    })
    await create({
      paymentOption: "COD",
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelReason: "EXPIRED",
      confirmedAt: null,
    })
  })

  it("moving a pending cash order to COD confirmed needs the time in the same write", async () => {
    const order = await db.order.create({
      data: cash({ status: "PENDING_CONFIRMATION" }),
    })
    await expect(
      db.order.update({
        where: { id: order.id },
        data: { status: "COD_CONFIRMED" },
      })
    ).rejects.toThrow()
    const updated = await db.order.update({
      where: { id: order.id },
      data: { status: "COD_CONFIRMED", confirmedAt: NOW },
    })
    expect(updated.confirmedAt).toEqual(NOW)
  })
})
