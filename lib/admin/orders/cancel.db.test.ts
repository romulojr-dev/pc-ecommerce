import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { cancelOrder, finishCancel } from "@/lib/admin/orders/cancel"
import * as outbox from "@/lib/email/outbox"
import { fakeTransport } from "@/lib/email/fake"
import { sendPending } from "@/lib/email/send"
import type { CancelInput } from "@/lib/orders/cancel"
import { confirmCodOrder } from "@/lib/orders/confirm-cod"
import { mintCodConfirmLink } from "@/lib/orders/order-links"
import { sweepExpiredOrders } from "@/lib/orders/release"
import { startPayment } from "@/lib/payments/start-payment"
import { fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { reconcileSession } from "@/lib/payments/reconcile"
import { makeStaffUser } from "@/test-support/admin-session"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { orderData, pickupOrderData } from "@/test-support/orders"
import { paymentData } from "@/test-support/payments"
import {
  EXPIRES,
  forceCompleted,
  guardEmailTransport,
  guardTransactions,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
  stockOf,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

// docs/specs/044-admin-cancel-order: the cancel on real rows, against the test
// database with the fake gateway (E2 to E12, E14 to E22, E27 to E29, E33 to
// E35, E23 through the sender). The parts are Ryzen 5 7600s (stock 40).

vi.mock("@/lib/email/outbox", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/outbox")>()
  return { ...actual, enqueueEmail: vi.fn(actual.enqueueEmail) }
})
const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

const NOW = new Date("2026-11-01T08:00:00Z")
const PAID_AT = new Date("2026-11-01T07:30:00Z")

let actor: { id: string; name: string; role: "staff" }
let ryzen: string

beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const user = await makeStaffUser("staff@example.com", "STAFF")
  actor = { id: user.id, name: user.name, role: "staff" }
  ryzen = (
    await insertParts([seed.ryzen5_7600], {
      [seed.ryzen5_7600.id]: { stock: 40, price: 1_149_500 },
    })
  ).get(seed.ryzen5_7600.id)!
  vi.mocked(outbox.enqueueEmail).mockClear()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const lagging = () => fakeGateway({ now: () => PLACED })
const options = (gateway: PaymentGateway = lagging()) => ({
  now: NOW,
  gateway,
  environment: "development" as const,
})

type Data = Parameters<typeof orderData>[0]
let counter = 0
const held = (overrides: Data = {}, quantity = 2) =>
  heldOrder([{ productId: ryzen, quantity }], {
    accessTokenHash: releaseTokenHash(`cancel-${++counter}`),
    ...overrides,
  })
const paidOrder = (overrides: Data = {}) =>
  held({ status: "PAID", paidAt: PAID_AT, ...overrides })

const cancel = (
  order: { orderNumber: string },
  expectedStatus: CancelInput["expectedStatus"],
  reason: CancelInput["reason"] = "OUT_OF_STOCK",
  extra: { note?: string } = {},
  opts = options()
) =>
  cancelOrder(
    actor,
    { orderNumber: order.orderNumber, expectedStatus, reason, ...extra },
    opts
  )

const reload = (id: string) => db.order.findUniqueOrThrow({ where: { id } })
const audits = (orderId: string) =>
  db.auditLog.findMany({ where: { entityId: orderId } })
const outboxOf = (orderId: string) =>
  db.emailOutbox.findMany({ where: { orderId }, select: { type: true } })
const movements = (orderId: string) =>
  db.stockMovement.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  })

// Nothing but the order's original state changed
async function expectUntouched(
  id: string,
  status: string,
  stock: number
): Promise<void> {
  expect((await reload(id)).status).toBe(status)
  expect(await stockOf(ryzen)).toBe(stock)
  expect(await audits(id)).toHaveLength(0)
  expect(await outboxOf(id)).toHaveLength(0)
}

describe("cancelling an unpaid online order", () => {
  it("E2: closes the session, then cancels, returns stock and queues the email", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    expect(await stockOf(ryzen)).toBe(38)

    const result = await cancel(order, "PENDING_PAYMENT", "OUT_OF_STOCK")

    expect(result).toMatchObject({
      kind: "done",
      refundRequired: false,
      stockReturned: true,
    })
    expect(await reload(order.id)).toMatchObject({
      status: "CANCELLED",
      cancelReason: "OUT_OF_STOCK",
      cancelledAt: NOW,
      refundRequired: false,
    })
    const [payment] = await db.payment.findMany({
      where: { orderId: order.id },
    })
    expect(payment.status).toBe("EXPIRED")
    expect(
      (
        await db.fakeGatewaySession.findUniqueOrThrow({
          where: { id: session },
        })
      ).status
    ).toBe("CANCELED")
    expect(await stockOf(ryzen)).toBe(40)
    const released = (await movements(order.id)).filter(
      (m) => m.reason === "ORDER_RELEASED"
    )
    expect(released).toMatchObject([{ change: 2, actorId: actor.id }])
    expect(await outboxOf(order.id)).toEqual([
      { type: "ORDER_CANCELLED_BY_STORE" },
    ])
    const [audit] = await audits(order.id)
    expect(audit).toMatchObject({
      actorId: actor.id,
      entity: "order",
      action: "cancelled",
      before: { status: "PENDING_PAYMENT" },
      after: {
        status: "CANCELLED",
        cancelReason: "OUT_OF_STOCK",
        refundRequired: false,
      },
    })
  })

  it("E3: a session that already ended unpaid is settled, then the cancel goes through", async () => {
    const order = await held({ expiresAt: EXPIRES })
    await openSession(order.id, `cancel-${counter}`)
    // the gateway's clock is past the session's expiry
    const caughtUp = fakeGateway({ now: () => EXPIRES })

    const result = await cancel(
      order,
      "PENDING_PAYMENT",
      "OUT_OF_STOCK",
      {},
      options(caughtUp)
    )

    expect(result.kind).toBe("done")
    expect((await reload(order.id)).status).toBe("CANCELLED")
    expect(await stockOf(ryzen)).toBe(40)
  })

  it("E4: a session that turns out paid makes the order Paid and refuses the cancel", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    await forceCompleted(session)

    const result = await cancel(order, "PENDING_PAYMENT")

    expect(result).toEqual({ kind: "paid-meanwhile" })
    expect((await reload(order.id)).status).toBe("PAID")
    expect(await stockOf(ryzen)).toBe(38)
    expect(await audits(order.id)).toHaveLength(0)
    // the only email is the payment's own
    expect(await outboxOf(order.id)).toEqual([{ type: "PAYMENT_RECEIVED" }])
    // after the reload it can be cancelled as a paid order (E6)
    const again = await cancel(order, "PAID", "CUSTOMER_REQUEST")
    expect(again).toMatchObject({ kind: "done", refundRequired: true })
  })

  it("E29: when the provider can't be reached, nothing changes", async () => {
    const order = await held({ expiresAt: EXPIRES })
    await openSession(order.id, `cancel-${counter}`)
    const down = {
      ...lagging(),
      closeSession: async () => ({ ok: false as const, code: "timeout" }),
    } as unknown as PaymentGateway

    const result = await cancel(
      order,
      "PENDING_PAYMENT",
      "OUT_OF_STOCK",
      {},
      options(down)
    )

    expect(result).toEqual({ kind: "gateway-failed" })
    await expectUntouched(order.id, "PENDING_PAYMENT", 38)
  })

  it("E33: a database failure after the session was closed leaves it closed, and the order can start a new payment", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    vi.mocked(outbox.enqueueEmail).mockRejectedValueOnce(new Error("boom"))

    await expect(cancel(order, "PENDING_PAYMENT")).rejects.toThrow("boom")

    // the whole transaction rolled back
    await expectUntouched(order.id, "PENDING_PAYMENT", 38)
    expect(
      (await db.payment.findMany({ where: { orderId: order.id } }))[0].status
    ).toBe("PENDING")
    // the gateway call cannot be undone
    expect(
      (
        await db.fakeGatewaySession.findUniqueOrThrow({
          where: { id: session },
        })
      ).status
    ).toBe("CANCELED")
    // the order is still Pending payment: Pay now opens a new session
    const started = await startPayment(order.id, `cancel-${counter}`, {
      now: PLACED,
      gateway: lagging(),
      siteUrl: "http://localhost:3000",
      environment: "development",
    })
    expect(started.ok).toBe(true)
  })
})

describe("cancelling a paid or cash order", () => {
  async function voucher(overrides: Record<string, unknown> = {}) {
    return db.voucher.create({
      data: {
        code: "SAVE500",
        type: "FIXED",
        value: 50_000,
        startsAt: new Date("2026-01-01T00:00:00+08:00"),
        usedCount: 3,
        ...overrides,
      } as Parameters<typeof db.voucher.create>[0]["data"],
    })
  }

  it("E6: a paid order is flagged for a refund, the payment stays Paid and the voucher use goes back", async () => {
    const v = await voucher()
    const order = await paidOrder({ voucherId: v.id, voucherCode: v.code })
    const payment = await db.payment.create({
      data: paymentData(order.id, { status: "PAID", paidAt: PAID_AT }),
    })

    const result = await cancel(order, "PAID", "CUSTOMER_REQUEST")

    expect(result).toMatchObject({ kind: "done", refundRequired: true })
    expect(await reload(order.id)).toMatchObject({
      status: "CANCELLED",
      refundRequired: true,
      cancelReason: "CUSTOMER_REQUEST",
    })
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status
    ).toBe("PAID")
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount
    ).toBe(2)
    expect(await stockOf(ryzen)).toBe(40)
    const [audit] = await audits(order.id)
    expect(audit.after).toMatchObject({ refundRequired: true })
  })

  it("E7: a Processing order is cancelled the same way", async () => {
    const order = await paidOrder({
      status: "PROCESSING",
      processingAt: new Date("2026-11-01T07:45:00Z"),
    })
    const result = await cancel(order, "PROCESSING", "OUT_OF_STOCK")
    expect(result).toMatchObject({ kind: "done", refundRequired: true })
    expect(await stockOf(ryzen)).toBe(40)
  })

  it("E8: a cash pickup order Ready for pickup cancels with a note, owes no refund and keeps the note out of the email", async () => {
    const v = await voucher({ code: "WELCOME10", usedCount: 1 })
    const order = await held({
      ...pickupOrderData({
        paymentOption: "COD",
        status: "READY_FOR_PICKUP",
        confirmedAt: PAID_AT,
        readyAt: PAID_AT,
        voucherId: v.id,
        voucherCode: v.code,
        accessTokenHash: releaseTokenHash("e8"),
      }),
    })

    const result = await cancel(order, "READY_FOR_PICKUP", "OTHER", {
      note: "Customer called, wrong address",
    })

    expect(result).toMatchObject({ kind: "done", refundRequired: false })
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(0)
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount
    ).toBe(0)
    const [audit] = await audits(order.id)
    expect(audit.after).toMatchObject({
      cancelReason: "OTHER",
      note: "Customer called, wrong address",
    })
    // the sender: the note appears in no email
    const transport = guardEmailTransport(fakeTransport())
    await sendPending({ now: NOW, transport })
    const [email] = await db.fakeEmail.findMany()
    expect(email.text).toContain("You haven't been charged.")
    expect(email.text).not.toContain("wrong address")
    expect(email.html).not.toContain("wrong address")
  })

  it("E9: a cash order Pending confirmation cancels with no gateway step", async () => {
    const order = await held({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
    })
    const never = {
      ...lagging(),
      closeSession: async () => {
        throw new Error("no session to close")
      },
    } as unknown as PaymentGateway
    const result = await cancel(
      order,
      "PENDING_CONFIRMATION",
      "CUSTOMER_REQUEST",
      {},
      options(never)
    )
    expect(result.kind).toBe("done")
    expect(await stockOf(ryzen)).toBe(40)
  })

  it("E34: a stray open session on a Paid order is closed first", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    await db.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: PAID_AT },
    })

    const result = await cancel(order, "PAID", "OUT_OF_STOCK")

    expect(result).toMatchObject({ kind: "done", refundRequired: true })
    expect(
      (
        await db.fakeGatewaySession.findUniqueOrThrow({
          where: { id: session },
        })
      ).status
    ).toBe("CANCELED")
  })

  it("E34: a stray session that turns out paid is a second payment and refuses the cancel", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    await db.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: PAID_AT },
    })
    await forceCompleted(session)

    const result = await cancel(order, "PAID", "OUT_OF_STOCK")

    expect(result).toEqual({ kind: "needs-review" })
    expect((await reload(order.id)).status).toBe("PAID")
    expect(await audits(order.id)).toHaveLength(0)
    expect(await stockOf(ryzen)).toBe(38)
  })
})

describe("refusals", () => {
  it.each([
    "SHIPPED",
    "DELIVERED",
    "PICKED_UP",
    "CANCELLED",
    "REFUNDED",
  ] as const)("E10: %s can't be cancelled", async (status) => {
    const order = await held({
      status,
      ...(status === "CANCELLED"
        ? { cancelledAt: PAID_AT, cancelReason: "OTHER" as const }
        : { paidAt: PAID_AT }),
    })
    const result = await cancel(order, status)
    expect(result).toEqual({ kind: "not-allowed" })
    expect((await reload(order.id)).status).toBe(status)
    expect(await audits(order.id)).toHaveLength(0)
  })

  it("an unknown order and a stale screen", async () => {
    expect(await cancel({ orderNumber: "PCS-ZZZZZZZZ" }, "PAID")).toEqual({
      kind: "not-found",
    })
    const order = await paidOrder()
    expect(await cancel(order, "PENDING_PAYMENT")).toEqual({ kind: "stale" })
    await expectUntouched(order.id, "PAID", 38)
  })

  it("E11: an order with a flagged payment is refused before any gateway call", async () => {
    const order = await paidOrder()
    await db.payment.create({
      data: paymentData(order.id, {
        status: "PAID",
        problem: "SECOND_PAYMENT",
        paidAt: PAID_AT,
      }),
    })
    const never = {
      ...lagging(),
      closeSession: async () => {
        throw new Error("gateway called")
      },
    } as unknown as PaymentGateway

    const result = await cancel(
      order,
      "PAID",
      "OUT_OF_STOCK",
      {},
      options(never)
    )

    expect(result).toEqual({ kind: "needs-review" })
    await expectUntouched(order.id, "PAID", 38)
  })

  it("E12: a payment flagged after the read is caught under the lock, and everything rolls back", async () => {
    const order = await paidOrder()
    let waiting: ReturnType<typeof cancel> | undefined

    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
      waiting = cancel(order, "PAID", "OUT_OF_STOCK")
      await new Promise((resolve) => setTimeout(resolve, 400))
      await tx.payment.create({
        data: paymentData(order.id, {
          status: "PAID",
          problem: "AMOUNT_MISMATCH",
          paidAt: PAID_AT,
        }),
      })
    })

    expect(await waiting).toEqual({ kind: "needs-review" })
    await expectUntouched(order.id, "PAID", 38)
  })

  it("E28: no gateway call runs inside a transaction", async () => {
    const order = await held({ expiresAt: EXPIRES })
    await openSession(order.id, `cancel-${counter}`)
    const result = await cancel(
      order,
      "PENDING_PAYMENT",
      "OUT_OF_STOCK",
      {},
      options(guardTransactions(lagging()))
    )
    expect(result.kind).toBe("done")
  })

  it("E20: a retired product's stock goes back too", async () => {
    const order = await paidOrder()
    await db.product.update({ where: { id: ryzen }, data: { status: "DRAFT" } })
    await cancel(order, "PAID")
    expect(await stockOf(ryzen)).toBe(40)
  })

  it("E22: the voucher use goes back whatever its dates are now", async () => {
    const v = await db.voucher.create({
      data: {
        code: "OLD",
        type: "FIXED",
        value: 50_000,
        startsAt: new Date("2026-01-01T00:00:00+08:00"),
        endsAt: new Date("2026-10-01T00:00:00+08:00"),
        usedCount: 1,
      },
    })
    const order = await paidOrder({ voucherId: v.id, voucherCode: v.code })
    await cancel(order, "PAID")
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: v.id } })).usedCount
    ).toBe(0)
  })
})

describe("exactly once", () => {
  it("E18: a double submit cancels once", async () => {
    const order = await paidOrder()
    const results = await Promise.all([
      cancel(order, "PAID"),
      cancel(order, "PAID"),
    ])
    expect(results.map((r) => r.kind).sort()).toEqual(["done", "stale"])
    expect(await stockOf(ryzen)).toBe(40)
    expect(await audits(order.id)).toHaveLength(1)
    expect(await outboxOf(order.id)).toHaveLength(1)
  })

  it("E19: the release after a cancel changes nothing, and a cancel after the release is stale", async () => {
    const first = await held({ expiresAt: EXPIRES })
    await cancel(first, "PENDING_PAYMENT")
    await sweepExpiredOrders(EXPIRES, {
      gateway: lagging(),
      environment: "development",
    })
    expect(await stockOf(ryzen)).toBe(40)
    expect(await outboxOf(first.id)).toHaveLength(1)

    const second = await held({ expiresAt: EXPIRES })
    await sweepExpiredOrders(EXPIRES, {
      gateway: lagging(),
      environment: "development",
    })
    expect(await cancel(second, "PENDING_PAYMENT")).toEqual({ kind: "stale" })
    expect(await stockOf(ryzen)).toBe(40)
    expect(await outboxOf(second.id)).toEqual([{ type: "ORDER_CANCELLED" }])
  })

  it("E35: the products tag is revalidated once when stock came back, and not otherwise", async () => {
    const withStock = await paidOrder()
    finishCancel(await cancel(withStock, "PAID"))
    expect(revalidateTag).toHaveBeenCalledTimes(1)

    revalidateTag.mockClear()
    const none = await db.order.create({
      data: orderData({
        status: "PAID",
        paidAt: PAID_AT,
        accessTokenHash: releaseTokenHash("none"),
      }),
    })
    const result = await cancel(none, "PAID")
    expect(result).toMatchObject({ kind: "done", stockReturned: false })
    finishCancel(result)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

// Each race has a fresh order. The interleavings are forced with the order
// row's lock: the competitor commits first, or the cancel does.
describe("races: exactly one wins and stock returns once", () => {
  const link = (o: { orderNumber: string; expiresAt: Date }) =>
    mintCodConfirmLink(o.orderNumber, o.expiresAt)

  async function holdingLock<T>(
    orderId: string,
    compete: (
      tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
    ) => Promise<void>,
    start: () => Promise<T>
  ): Promise<T> {
    let waiting: Promise<T> | undefined
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`
      waiting = start()
      await new Promise((resolve) => setTimeout(resolve, 400))
      await compete(tx)
    })
    return waiting!
  }

  it("E14: against the customer's COD confirmation, confirm first", async () => {
    const order = await held({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      expiresAt: new Date("2026-11-05T02:00:00Z"),
    })
    expect(await confirmCodOrder(order.orderNumber, link(order), NOW)).toEqual({
      ok: true,
      outcome: "confirmed",
    })
    expect(await cancel(order, "PENDING_CONFIRMATION")).toEqual({
      kind: "stale",
    })
    expect((await reload(order.id)).status).toBe("COD_CONFIRMED")
    expect(await stockOf(ryzen)).toBe(38)
  })

  it("E14: against the customer's COD confirmation, cancel first (and the cancel waiting on the confirmation's lock loses)", async () => {
    const order = await held({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      expiresAt: new Date("2026-11-05T02:00:00Z"),
    })
    const result = await cancel(order, "PENDING_CONFIRMATION")
    expect(result.kind).toBe("done")
    expect(await confirmCodOrder(order.orderNumber, link(order), NOW)).toEqual({
      ok: false,
      reason: "expired",
    })
    expect((await reload(order.id)).status).toBe("CANCELLED")
    expect(await stockOf(ryzen)).toBe(40)

    const second = await held({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      expiresAt: new Date("2026-11-05T02:00:00Z"),
    })
    const lost = await holdingLock(
      second.id,
      async (tx) => {
        await tx.order.update({
          where: { id: second.id },
          data: { status: "COD_CONFIRMED", confirmedAt: NOW },
        })
      },
      () => cancel(second, "PENDING_CONFIRMATION")
    )
    expect(lost).toEqual({ kind: "stale" })
    expect((await reload(second.id)).status).toBe("COD_CONFIRMED")
    expect(await stockOf(ryzen)).toBe(38)
  })

  it("E15: against a webhook that pays the order, webhook first", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    await forceCompleted(session)
    await reconcileSession(session, {
      gateway: lagging(),
      now: NOW,
      environment: "development",
    })
    expect((await reload(order.id)).status).toBe("PAID")
    expect(await cancel(order, "PENDING_PAYMENT")).toEqual({ kind: "stale" })
    expect(await stockOf(ryzen)).toBe(38)
  })

  it("E15: against a webhook that pays the order, cancel first: the late payment is flagged and stock isn't returned twice", async () => {
    const order = await held({ expiresAt: EXPIRES })
    const session = await openSession(order.id, `cancel-${counter}`)
    const done = await cancel(order, "PENDING_PAYMENT")
    expect(done.kind).toBe("done")
    // a payment that slipped past the closed session
    await forceCompleted(session)
    await reconcileSession(session, {
      gateway: lagging(),
      now: NOW,
      environment: "development",
    })
    expect(await reload(order.id)).toMatchObject({
      status: "CANCELLED",
      refundRequired: true,
    })
    expect(await stockOf(ryzen)).toBe(40)
    const released = (await movements(order.id)).filter(
      (m) => m.reason === "ORDER_RELEASED"
    )
    expect(released).toHaveLength(1)
  })

  it("E16: against the release, release first and cancel first", async () => {
    const a = await held({ expiresAt: EXPIRES })
    await sweepExpiredOrders(EXPIRES, {
      gateway: lagging(),
      environment: "development",
    })
    expect(await cancel(a, "PENDING_PAYMENT")).toEqual({ kind: "stale" })
    expect(await stockOf(ryzen)).toBe(40)

    const b = await held({ expiresAt: EXPIRES })
    expect((await cancel(b, "PENDING_PAYMENT")).kind).toBe("done")
    await sweepExpiredOrders(EXPIRES, {
      gateway: lagging(),
      environment: "development",
    })
    expect(await stockOf(ryzen)).toBe(40)
    expect(await outboxOf(b.id)).toEqual([{ type: "ORDER_CANCELLED_BY_STORE" }])
  })

  it("E17: against a Start processing move, each way", async () => {
    const { transitionOrder } = await import("@/lib/admin/orders/transition")
    const a = await paidOrder()
    const moved = await transitionOrder(
      actor,
      { orderNumber: a.orderNumber, expectedStatus: "PAID", to: "PROCESSING" },
      NOW
    )
    expect(moved.kind).toBe("done")
    expect(await cancel(a, "PAID")).toEqual({ kind: "stale" })

    const b = await paidOrder()
    expect((await cancel(b, "PAID")).kind).toBe("done")
    expect(
      await transitionOrder(
        actor,
        {
          orderNumber: b.orderNumber,
          expectedStatus: "PAID",
          to: "PROCESSING",
        },
        NOW
      )
    ).toEqual({ kind: "stale" })
    expect(await stockOf(ryzen)).toBe(36 + 2)
  })
})

describe("the emails through the sender", () => {
  it("E23: a paid cancel says a refund will follow; an unpaid one says no charge", async () => {
    const paid = await paidOrder({ guestEmail: "paid@example.com" })
    const unpaid = await held({
      status: "PENDING_CONFIRMATION",
      paymentOption: "COD",
      guestEmail: "unpaid@example.com",
    })
    await cancel(paid, "PAID", "CUSTOMER_REQUEST")
    await cancel(unpaid, "PENDING_CONFIRMATION", "OUT_OF_STOCK")

    await sendPending({
      now: NOW,
      transport: guardEmailTransport(fakeTransport()),
    })

    const emails = await db.fakeEmail.findMany()
    const to = (address: string) => emails.find((e) => e.to === address)!
    expect(to("paid@example.com").text).toContain(
      "because you asked us to cancel it. We'll refund your payment."
    )
    expect(to("paid@example.com").text).not.toContain("haven't been charged")
    expect(to("unpaid@example.com").text).toContain(
      "because one of the parts is out of stock. You haven't been charged."
    )
  })
})
