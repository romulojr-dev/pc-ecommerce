import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { transitionOrder } from "@/lib/admin/orders/transition"
import { makeStaffUser } from "@/test-support/admin-session"
import { db, resetCatalog } from "@/test-support/db"
import { orderData, pickupOrderData } from "@/test-support/orders"
import { guardEmailTransport } from "@/test-support/release"

import { fakeTransport } from "./fake"
import { sendPending } from "./send"

// docs/specs/043-order-fulfillment-transitions: the three emails through a
// real move and the real sender (E4, E6, E9, E21)

const T = new Date("2026-11-03T03:00:00Z")
const NOW = new Date("2026-11-06T05:00:00Z")
const PARCEL = { courier: "LBC", trackingNumber: "123456784821" }

let actor: { id: string; name: string; role: "staff" }

beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("staff@example.com", "STAFF")
  actor = { id: user.id, name: user.name, role: "staff" }
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterAll(() => db.$disconnect())

const send = (transport = guardEmailTransport(fakeTransport())) =>
  sendPending({ now: NOW, transport })
const fakeEmails = () =>
  db.fakeEmail.findMany({ orderBy: { createdAt: "asc" } })

describe("fulfillment emails through the sender", () => {
  it("E4: Shipped reaches the shopper with the courier and tracking number", async () => {
    const order = await db.order.create({
      data: orderData({ status: "PROCESSING", paidAt: T }),
    })
    await transitionOrder(
      actor,
      {
        orderNumber: order.orderNumber,
        expectedStatus: "PROCESSING",
        to: "SHIPPED",
        ...PARCEL,
      },
      NOW
    )
    // nothing has left the building yet: sending is a separate step
    expect(await fakeEmails()).toHaveLength(0)

    expect(await send()).toMatchObject({ claimed: 1, sent: 1 })
    const [email] = await fakeEmails()
    expect(email).toMatchObject({
      to: "ana@example.com",
      subject: `[Demo] Order ${order.orderNumber} has shipped`,
    })
    expect(email.text).toContain("Courier: LBC")
    expect(email.text).toContain("Tracking number: 123456784821")
    expect(email.text).toContain(`/orders/${order.orderNumber}?sig=`)
    expect(email.text).toContain("p=view")
  })

  it("E6: Ready for pickup shows the store's settings as they are at send time", async () => {
    await db.storeSettings.create({
      data: {
        storeAddress: "Unit 4, 88 Sample St, Makati",
        storeHours: "Mon-Sat 10:00 AM-7:00 PM",
        storeInfo: "x",
      },
    })
    const order = await db.order.create({
      data: pickupOrderData({ status: "PROCESSING", paidAt: T }),
    })
    await transitionOrder(
      actor,
      {
        orderNumber: order.orderNumber,
        expectedStatus: "PROCESSING",
        to: "READY_FOR_PICKUP",
      },
      NOW
    )
    // changed between the commit and the send
    await db.storeSettings.update({
      where: { id: 1 },
      data: { storeAddress: "New address, Pasig", storeHours: "Daily 9-5" },
    })
    await send()
    const [email] = await fakeEmails()
    expect(email.subject).toBe(
      `[Demo] Order ${order.orderNumber} is ready for pickup`
    )
    expect(email.text).toContain("New address, Pasig")
    expect(email.text).toContain("Daily 9-5")
    expect(email.text).not.toContain("Unit 4, 88 Sample St")
  })

  it("E9: Delivered reaches the shopper, and a cash order is paid by then", async () => {
    const order = await db.order.create({
      data: orderData({
        status: "SHIPPED",
        paymentOption: "COD",
        confirmedAt: T,
        shippedAt: T,
        ...PARCEL,
      }),
    })
    await transitionOrder(
      actor,
      {
        orderNumber: order.orderNumber,
        expectedStatus: "SHIPPED",
        to: "DELIVERED",
      },
      NOW
    )
    await send()
    const [email] = await fakeEmails()
    expect(email.subject).toBe(
      `[Demo] Order ${order.orderNumber} was delivered`
    )
    expect(email.text).toContain("Tracking number: 123456784821")
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).paidAt
    ).toEqual(NOW)
  })

  it("E21: a sender failure leaves the order Shipped and the row to retry", async () => {
    const order = await db.order.create({
      data: orderData({ status: "PROCESSING", paidAt: T }),
    })
    await transitionOrder(
      actor,
      {
        orderNumber: order.orderNumber,
        expectedStatus: "PROCESSING",
        to: "SHIPPED",
        ...PARCEL,
      },
      NOW
    )
    const summary = await send(
      guardEmailTransport(fakeTransport({ fail: "timeout" }))
    )
    expect(summary).toMatchObject({ claimed: 1, failed: 1, sent: 0 })
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status
    ).toBe("SHIPPED")
    const [row] = await db.emailOutbox.findMany()
    expect(row).toMatchObject({ status: "FAILED", lastErrorCode: "timeout" })
  })
})
