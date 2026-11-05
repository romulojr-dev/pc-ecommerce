import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { orderEntries } from "@/lib/orders/view"
import { insertParts, partsOfBuild } from "@/test-support/build-fixtures"
import { resetCatalog } from "@/test-support/db"
import {
  expectNoRawValues,
  FIXTURE_CUSTOMER,
  FIXTURE_RAW_VALUES,
} from "@/test-support/no-raw-values"
import { orderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"
import { buildA } from "@/test-support/seed-parts"

import { QueryDeniedError } from "./guard"
import { getOrderDetail } from "./orders"
import type { AdminRole } from "../permissions"

// docs/specs/041-admin-orders-list-detail: E18–E23, E28 and R11, through the
// real query layer

const NOW = new Date("2026-11-02T08:00:00Z")
const NUMBER = "PCS-7K3M9Q2X"
// Forbidden by the issue: none of these may reach a DTO
const TOKEN_HASH = "tokenhash-should-never-be-shown-0123456789abcdef"
const IDEM_KEY = "idempotency-key-should-never-be-shown-AAAA"
const CART_HASH = "carthash-should-never-be-shown-0123456789abcdef"
const PAYLOAD_MARK = "webhook-payload-should-never-be-shown"
const RECIPIENT_HASH = "deadbeef".repeat(8)
const FORBIDDEN = [
  TOKEN_HASH,
  IDEM_KEY,
  CART_HASH,
  PAYLOAD_MARK,
  RECIPIENT_HASH,
]

async function fixtureOrder(over: Parameters<typeof orderData>[0] = {}) {
  return db.order.create({
    data: orderData({
      orderNumber: NUMBER,
      accessTokenHash: TOKEN_HASH,
      idempotencyKey: IDEM_KEY,
      cartIdHash: CART_HASH,
      guestEmail: FIXTURE_CUSTOMER.email,
      contactName: FIXTURE_CUSTOMER.name,
      contactMobile: FIXTURE_CUSTOMER.mobile,
      street: FIXTURE_CUSTOMER.street,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      ...over,
    }),
  })
}

async function detail(role: AdminRole = "owner") {
  const found = await getOrderDetail(role, NUMBER, NOW)
  if (!found) throw new Error("order not found")
  return found
}

beforeEach(async () => {
  vi.restoreAllMocks()
  await resetCatalog()
})
afterAll(() => db.$disconnect())

describe("items, totals and voucher", () => {
  test("E18: a build group and a single line, in order, adding up", async () => {
    const parts = partsOfBuild(buildA())
    const ids = await insertParts(parts)
    const order = await fixtureOrder({
      subtotal: 4 * 100_000 + 100_000,
      total: 4 * 100_000 + 100_000,
      shippingFee: 0,
    })
    const build = await db.build.create({
      data: { shareSlug: "detailbld1", contentHash: "detail-hash" },
    })
    const grouped = parts.slice(0, 4)
    const single = parts[4]
    let position = 0
    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: ids.get(single.id)!,
        nameSnapshot: single.name,
        priceSnapshot: 100_000,
        quantity: 1,
        position: position++,
      },
    })
    for (const part of grouped) {
      await db.orderItem.create({
        data: {
          orderId: order.id,
          productId: ids.get(part.id)!,
          nameSnapshot: part.name,
          priceSnapshot: 100_000,
          quantity: 1,
          buildId: build.id,
          slot: part.category,
          position: position++,
        },
      })
    }

    const found = await detail()
    expect(found.items).toHaveLength(5)
    const entries = orderEntries(found.items)
    expect(entries.map((e) => e.kind)).toEqual(["single", "build"])
    const group = entries[1]
    expect(group.kind === "build" && group.parts).toHaveLength(4)
    expect(group.kind === "build" && group.total).toBe(400_000)
    expect(found.subtotal + found.shippingFee - found.discount).toBe(
      found.total
    )
  })

  test("E19: the voucher code and discount", async () => {
    const voucher = await db.voucher.create({
      data: {
        code: "WELCOME10",
        type: "PERCENT",
        value: 10,
        minSpend: 0,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      },
    })
    await fixtureOrder({
      voucherId: voucher.id,
      voucherCode: "WELCOME10",
      subtotal: 1_000_000,
      discount: 100_000,
      shippingFee: 0,
      total: 900_000,
    })
    expect(await detail()).toMatchObject({
      voucherCode: "WELCOME10",
      discount: 100_000,
      total: 900_000,
    })
  })
})

describe("payments and emails", () => {
  test("E20: every attempt, newest first, including one without a session", async () => {
    const order = await fixtureOrder({ status: "PAID", paidAt: NOW })
    await db.payment.create({
      data: paymentData(order.id, {
        referenceId: `${NUMBER}-1`,
        status: "EXPIRED",
        createdAt: new Date("2026-11-02T06:00:00Z"),
      }),
    })
    await db.payment.create({
      data: paymentData(order.id, {
        referenceId: `${NUMBER}-2`,
        status: "FAILED",
        providerRef: null,
        createdAt: new Date("2026-11-02T06:30:00Z"),
      }),
    })
    await db.payment.create({
      data: paymentData(order.id, {
        referenceId: `${NUMBER}-3`,
        status: "PAID",
        method: "GCASH",
        paidAt: NOW,
        gatewayPaymentId: "py-abc",
        createdAt: new Date("2026-11-02T07:00:00Z"),
      }),
    })
    const { payments } = await detail()
    expect(payments.map((p) => p.referenceId)).toEqual([
      `${NUMBER}-3`,
      `${NUMBER}-2`,
      `${NUMBER}-1`,
    ])
    expect(payments[0]).toMatchObject({
      status: "PAID",
      method: "GCASH",
      gatewayPaymentId: "py-abc",
    })
    expect(payments[1]).toMatchObject({ status: "FAILED", sessionId: null })
    expect(payments[2].sessionId).toMatch(/^ps-/)
  })

  test("E16: a late payment shows its problem and the refund flag", async () => {
    const order = await fixtureOrder({
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelReason: "EXPIRED",
      refundRequired: true,
    })
    await db.payment.create({
      data: paymentData(order.id, {
        status: "PAID",
        paidAt: NOW,
        problem: "LATE",
      }),
    })
    const found = await detail()
    expect(found.flags).toEqual({ refundRequired: true, needsCheck: false })
    expect(found.payments[0].problem).toBe("LATE")
    expect(found.cancelReason).toBe("EXPIRED")
  })

  test("a mismatch is needs-checking and keeps what was received", async () => {
    const order = await fixtureOrder({ expiresAt: NOW })
    await db.payment.create({
      data: paymentData(order.id, {
        problem: "AMOUNT_MISMATCH",
        receivedAmount: 1_000,
      }),
    })
    const found = await detail()
    expect(found.flags.needsCheck).toBe(true)
    expect(found.dueForRelease).toBe(false)
    expect(found.payments[0]).toMatchObject({
      problem: "AMOUNT_MISMATCH",
      receivedAmount: 1_000,
    })
  })

  test("E21: emails with their status and code, oldest first, no address or hash", async () => {
    const order = await fixtureOrder()
    await db.emailOutbox.create({
      data: {
        orderId: order.id,
        type: "ORDER_PLACED",
        status: "SENT",
        recipientHash: RECIPIENT_HASH,
        attempts: 1,
        sentAt: NOW,
        providerMessageId: "msg-1",
        createdAt: new Date("2026-11-02T06:00:00Z"),
      },
    })
    await db.emailOutbox.create({
      data: {
        orderId: order.id,
        type: "PAYMENT_RECEIVED",
        status: "FAILED",
        recipientHash: RECIPIENT_HASH,
        attempts: 2,
        lastErrorCode: "timeout",
        createdAt: new Date("2026-11-02T07:00:00Z"),
      },
    })
    const { emails } = await detail()
    expect(emails.map((e) => [e.type, e.status, e.lastErrorCode])).toEqual([
      ["ORDER_PLACED", "SENT", null],
      ["PAYMENT_RECEIVED", "FAILED", "timeout"],
    ])
    expect(JSON.stringify(emails)).not.toContain(RECIPIENT_HASH)
    expect(JSON.stringify(emails)).not.toContain("msg-1")
  })

  test("a fresh order has no payments and no emails", async () => {
    await fixtureOrder()
    const found = await detail()
    expect(found.payments).toEqual([])
    expect(found.emails).toEqual([])
  })
})

describe("what the DTO never holds", () => {
  test("E22: no hash, key, payload or recipient hash, by name or by value", async () => {
    const order = await fixtureOrder({ expiresAt: NOW })
    await db.payment.create({ data: paymentData(order.id) })
    const payment = await db.payment.findFirstOrThrow({
      where: { orderId: order.id },
    })
    await db.paymentEvent.create({
      data: {
        eventId: "payment_session.completed:ps-fixture",
        type: "payment_session.completed",
        payload: { secret: PAYLOAD_MARK },
        paymentId: payment.id,
      },
    })
    await db.emailOutbox.create({
      data: {
        orderId: order.id,
        type: "ORDER_PLACED",
        recipientHash: RECIPIENT_HASH,
      },
    })
    for (const role of ["owner", "staff", "demo"] as const) {
      const text = JSON.stringify(await detail(role))
      for (const value of FORBIDDEN) expect(text).not.toContain(value)
      for (const name of [
        "accessTokenHash",
        "idempotencyKey",
        "cartIdHash",
        "payload",
        "recipientHash",
      ]) {
        expect(text, name).not.toContain(name)
      }
    }
  })
})

describe("masking", () => {
  beforeEach(async () => {
    await fixtureOrder()
  })

  test("Owner and Staff see the real contact and address", async () => {
    for (const role of ["owner", "staff"] as const) {
      const found = await detail(role)
      expect(found.contact).toEqual({
        masked: false,
        name: "Ana Reyes",
        email: "ana.reyes@example.com",
        mobile: "+639171234567",
      })
      expect(found.address).toMatchObject({
        kind: "delivery",
        masked: false,
        street: "12 Mabini St",
      })
    }
  })

  test("E23: Demo gets masks and the region only, nothing real anywhere", async () => {
    const found = await detail("demo")
    expect(found.contact).toEqual({
      masked: true,
      name: "A••• R•••",
      email: "a•••@••••.•••",
      mobile: "+63•••••••••",
    })
    expect(found.address).toEqual({
      kind: "delivery",
      masked: true,
      regionName: "National Capital Region (NCR)",
      zone: "METRO_MANILA",
    })
    expectNoRawValues(found, FIXTURE_RAW_VALUES)
  })
})

describe("finding an order", () => {
  test("E28: a malformed number is null and reads nothing", async () => {
    const findUnique = vi.spyOn(db.order, "findUnique")
    for (const number of [
      "not-an-order",
      "pcs-7k3m9q2x",
      "PCS-7K3M9Q2",
      "PCS-7K3M9Q2XX",
      "PCS-ILOU0000",
      "",
    ]) {
      expect(await getOrderDetail("owner", number, NOW), number).toBeNull()
    }
    expect(findUnique).not.toHaveBeenCalled()
  })

  test("E28: an unknown number is null", async () => {
    expect(await getOrderDetail("owner", "PCS-AAAAAAAA", NOW)).toBeNull()
  })

  test("an unknown role is refused", async () => {
    await expect(
      getOrderDetail("nobody" as AdminRole, NUMBER, NOW)
    ).rejects.toBeInstanceOf(QueryDeniedError)
  })

  test("a past-deadline pending order reads Pending payment and is due", async () => {
    await fixtureOrder({ expiresAt: new Date(NOW.getTime() - 1000) })
    expect(await detail()).toMatchObject({
      status: "PENDING_PAYMENT",
      dueForRelease: true,
    })
  })
})
