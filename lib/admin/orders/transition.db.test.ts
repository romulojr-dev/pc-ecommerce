import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { transitionOrder } from "@/lib/admin/orders/transition"
import * as outbox from "@/lib/email/outbox"
import type { TransitionInput } from "@/lib/orders/transition-input"
import { makeStaffUser } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { orderData, pickupOrderData } from "@/test-support/orders"

vi.mock("@/lib/email/outbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/outbox")>()
  return { ...actual, enqueueEmail: vi.fn(actual.enqueueEmail) }
})

// docs/specs/043-order-fulfillment-transitions: the moves on real rows (E2 to
// E16, E22, E23, E31, E32)

const T = new Date("2026-11-03T03:00:00Z")
const NOW = new Date("2026-11-06T05:00:00Z")
const PARCEL = { courier: "LBC", trackingNumber: "123456784821" }

let actor: { id: string; name: string; role: "staff" }

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("staff@example.com", "STAFF")
  actor = { id: user.id, name: user.name, role: "staff" }
  vi.mocked(outbox.enqueueEmail).mockClear()
})
afterAll(() => db.$disconnect())

type Data = Parameters<typeof orderData>[0]
const online = (data: Data) => db.order.create({ data: orderData(data) })
const cash = (data: Data) =>
  db.order.create({
    data: orderData({ paymentOption: "COD", confirmedAt: T, ...data }),
  })
const pickup = (data: Data) =>
  db.order.create({ data: pickupOrderData({ paidAt: T, ...data }) })
const cashPickup = (data: Data) =>
  db.order.create({
    data: pickupOrderData({ paymentOption: "COD", confirmedAt: T, ...data }),
  })

const move = (
  order: { orderNumber: string },
  expectedStatus: TransitionInput["expectedStatus"],
  to: string,
  extra: { courier?: string; trackingNumber?: string } = {}
) =>
  transitionOrder(
    actor,
    { orderNumber: order.orderNumber, expectedStatus, to, ...extra },
    NOW
  )

const reload = (id: string) => db.order.findUniqueOrThrow({ where: { id } })
const emails = (orderId: string) =>
  db.emailOutbox.findMany({ where: { orderId }, select: { type: true } })
const audits = (entityId: string) =>
  db.auditLog.findMany({ where: { entityId, entity: "order" } })

describe("valid moves", () => {
  it("E2: Paid to Processing: status, time, audit; no email", async () => {
    const order = await online({ status: "PAID", paidAt: T })
    const result = await move(order, "PAID", "PROCESSING")
    expect(result).toMatchObject({ kind: "done", status: "PROCESSING" })
    expect(await reload(order.id)).toMatchObject({
      status: "PROCESSING",
      processingAt: NOW,
      paidAt: T,
    })
    expect(await emails(order.id)).toEqual([])
    const [row] = await audits(order.id)
    expect(row).toMatchObject({
      actorId: actor.id,
      entity: "order",
      action: "status-changed",
      before: { status: "PAID" },
      after: { status: "PROCESSING" },
    })
  })

  it("E3: COD confirmed to Processing leaves paidAt null and makes no Payment", async () => {
    const order = await cash({ status: "COD_CONFIRMED" })
    await move(order, "COD_CONFIRMED", "PROCESSING")
    const row = await reload(order.id)
    expect(row).toMatchObject({ status: "PROCESSING", paidAt: null })
    expect(await db.payment.count()).toBe(0)
  })

  it("E4/E32: Processing to Shipped stores the parcel, queues one email, audits it", async () => {
    const order = await online({ status: "PROCESSING", paidAt: T })
    const result = await move(order, "PROCESSING", "SHIPPED", PARCEL)
    expect(result).toMatchObject({ kind: "done", emails: true })
    expect(await reload(order.id)).toMatchObject({
      status: "SHIPPED",
      shippedAt: NOW,
      ...PARCEL,
    })
    expect(await emails(order.id)).toEqual([{ type: "ORDER_SHIPPED" }])
    const [row] = await audits(order.id)
    expect(row.before).toEqual({ status: "PROCESSING" })
    expect(row.after).toEqual({ status: "SHIPPED", ...PARCEL })
  })

  it("E6: pickup Processing to Ready for pickup queues the pickup email", async () => {
    const order = await pickup({ status: "PROCESSING" })
    await move(order, "PROCESSING", "READY_FOR_PICKUP")
    expect(await reload(order.id)).toMatchObject({
      status: "READY_FOR_PICKUP",
      readyAt: NOW,
    })
    expect(await emails(order.id)).toEqual([{ type: "READY_FOR_PICKUP" }])
  })

  it("E7: online pickup Ready to Picked up: completedAt, paidAt unchanged, no email", async () => {
    const order = await pickup({ status: "READY_FOR_PICKUP" })
    const result = await move(order, "READY_FOR_PICKUP", "PICKED_UP")
    expect(result).toMatchObject({ kind: "done", emails: false, emailId: null })
    expect(await reload(order.id)).toMatchObject({
      status: "PICKED_UP",
      completedAt: NOW,
      paidAt: T,
    })
    expect(await emails(order.id)).toEqual([])
  })

  it("E8: a cash pickup order is paid in the same statement, with no Payment and no email", async () => {
    const order = await cashPickup({ status: "READY_FOR_PICKUP" })
    await move(order, "READY_FOR_PICKUP", "PICKED_UP")
    expect(await reload(order.id)).toMatchObject({
      status: "PICKED_UP",
      completedAt: NOW,
      paidAt: NOW,
      paymentMethod: null,
    })
    expect(await db.payment.count()).toBe(0)
    expect(await emails(order.id)).toEqual([])
    const [row] = await audits(order.id)
    expect(row.after).toMatchObject({
      status: "PICKED_UP",
      paidAt: NOW.toISOString(),
    })
  })

  it("E9: a cash delivery order Shipped to Delivered is paid and queues the delivered email", async () => {
    const order = await cash({ status: "SHIPPED", shippedAt: T, ...PARCEL })
    await move(order, "SHIPPED", "DELIVERED")
    expect(await reload(order.id)).toMatchObject({
      status: "DELIVERED",
      completedAt: NOW,
      paidAt: NOW,
    })
    expect(await emails(order.id)).toEqual([{ type: "ORDER_DELIVERED" }])
    expect(await db.payment.count()).toBe(0)
  })

  it("E10: an online order's paidAt is left alone on Delivered", async () => {
    const order = await online({
      status: "SHIPPED",
      paidAt: T,
      shippedAt: T,
      ...PARCEL,
    })
    await move(order, "SHIPPED", "DELIVERED")
    expect(await reload(order.id)).toMatchObject({
      status: "DELIVERED",
      paidAt: T,
      courier: "LBC",
    })
    expect(await emails(order.id)).toEqual([{ type: "ORDER_DELIVERED" }])
  })

  it("E31: a Paid order with refundRequired can still be processed", async () => {
    const order = await online({
      status: "PAID",
      paidAt: T,
      refundRequired: true,
    })
    const result = await move(order, "PAID", "PROCESSING")
    expect(result.kind).toBe("done")
    expect((await reload(order.id)).refundRequired).toBe(true)
  })
})

describe("races and repeats", () => {
  it("E11: two staff moving the same order: one wins, one is stale, one audit row", async () => {
    const order = await online({ status: "PAID", paidAt: T })
    const results = await Promise.all([
      move(order, "PAID", "PROCESSING"),
      move(order, "PAID", "PROCESSING"),
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(["done", "stale"])
    expect(await audits(order.id)).toHaveLength(1)
    expect((await reload(order.id)).processingAt).toEqual(NOW)
  })

  it("E12/E12a: a repeated Shipped enqueues nothing, and a second enqueue returns null", async () => {
    const order = await online({ status: "PROCESSING", paidAt: T })
    await move(order, "PROCESSING", "SHIPPED", PARCEL)
    vi.mocked(outbox.enqueueEmail).mockClear()
    const again = await move(order, "PROCESSING", "SHIPPED", PARCEL)
    expect(again).toEqual({ kind: "stale" })
    expect(outbox.enqueueEmail).not.toHaveBeenCalled()
    expect(await emails(order.id)).toHaveLength(1)
    expect(await audits(order.id)).toHaveLength(1)

    // the unique (orderId, type) is the second line of defense
    const second = await db.$transaction((tx) =>
      outbox.enqueueEmail(tx, order.id, "ORDER_SHIPPED")
    )
    expect(second).toBeNull()
    expect(await emails(order.id)).toHaveLength(1)
  })

  it("a stale screen changes nothing: no audit, no email, no cash paidAt", async () => {
    const order = await cash({ status: "COD_CONFIRMED" })
    await move(order, "COD_CONFIRMED", "PROCESSING")
    const result = await move(order, "COD_CONFIRMED", "PROCESSING")
    expect(result).toEqual({ kind: "stale" })
    expect(await audits(order.id)).toHaveLength(1)
  })
})

describe("refusals", () => {
  it("E13: an expected status the table does not move from is refused", async () => {
    const order = await online({ status: "PROCESSING", paidAt: T })
    expect(await move(order, "PAID", "SHIPPED")).toEqual({
      kind: "not-allowed",
    })
    expect((await reload(order.id)).status).toBe("PROCESSING")
    expect(await audits(order.id)).toHaveLength(0)
  })

  it("E14: forged targets change nothing", async () => {
    const order = await online({ status: "PROCESSING", paidAt: T })
    for (const to of ["PAID", "CANCELLED", "DELIVERED", "READY_FOR_PICKUP"]) {
      expect(await move(order, "PROCESSING", to)).toEqual({
        kind: "not-allowed",
      })
    }
    const pickupOrder = await pickup({ status: "PROCESSING" })
    expect(await move(pickupOrder, "PROCESSING", "SHIPPED", PARCEL)).toEqual({
      kind: "not-allowed",
    })
    expect(await audits(order.id)).toHaveLength(0)
    expect(await db.emailOutbox.count()).toBe(0)
  })

  it("E15/E16: pending, terminal, cancelled and refunded orders have no move", async () => {
    const orders = [
      await online({ status: "PENDING_PAYMENT" }),
      await cash({ status: "PENDING_CONFIRMATION", confirmedAt: null }),
      await online({
        status: "DELIVERED",
        paidAt: T,
        shippedAt: T,
        completedAt: T,
        ...PARCEL,
      }),
      await online({
        status: "CANCELLED",
        cancelledAt: T,
        cancelReason: "EXPIRED",
      }),
      await online({ status: "REFUNDED", paidAt: T }),
    ]
    for (const order of orders) {
      expect(await move(order, order.status, "PROCESSING")).toEqual({
        kind: "not-allowed",
      })
    }
  })

  it("an unknown order is not-found", async () => {
    expect(
      await move({ orderNumber: "PCS-ZZZZZZZZ" }, "PAID", "PROCESSING")
    ).toEqual({ kind: "not-found" })
  })
})

describe("one transaction, no network", () => {
  it("E23: a failed enqueue rolls back the status, time, paidAt and audit row", async () => {
    const order = await cash({ status: "SHIPPED", shippedAt: T, ...PARCEL })
    vi.mocked(outbox.enqueueEmail).mockRejectedValueOnce(new Error("boom"))
    await expect(move(order, "SHIPPED", "DELIVERED")).rejects.toThrow("boom")
    expect(await reload(order.id)).toMatchObject({
      status: "SHIPPED",
      completedAt: null,
      paidAt: null,
    })
    expect(await audits(order.id)).toHaveLength(0)
  })

  it("E22: the move sends nothing itself: no email leaves, no fetch runs", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const order = await online({ status: "PROCESSING", paidAt: T })
    await move(order, "PROCESSING", "SHIPPED", PARCEL)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(await db.fakeEmail.count()).toBe(0)
    fetchSpy.mockRestore()
  })
})
