import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { hashToken } from "@/lib/orders/secrets"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import { sessionId } from "@/test-support/payments"

import { completeFakeSession, expireFakeSession, fakeGateway } from "./fake"
import type { PaymentGateway } from "./gateway-types"
import {
  reconcileSession,
  type ReconcileOptions,
  type ReconcileStep,
} from "./reconcile"
import { startPayment } from "./start-payment"

// reconcileSession (docs/specs/032-payment-webhooks, behavior 7–17): H1–H15,
// H17 and C1–C6, against the fake gateway in the test database. H16 (the
// token) is the route's, in app/api/webhooks/xendit/route.db.test.ts.

beforeEach(async () => {
  await resetCatalog()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = "T".repeat(43)
const PLACED = new Date("2026-11-01T07:00:00Z")
const NOW = new Date("2026-11-01T07:05:00Z")
const EXPIRES = new Date("2026-11-02T07:00:00Z")
const gw = fakeGateway({ now: () => NOW })

const options = (extra: ReconcileOptions = {}): ReconcileOptions => ({
  gateway: gw,
  environment: "development",
  now: NOW,
  ...extra,
})

// A webhook event as the route builds it from a Xendit body
const eventOf = (type: "completed" | "expired", id: string) => ({
  eventId: `payment_session.${type}:${id}`,
  type: `payment_session.${type}`,
  payload: {
    event: `payment_session.${type}`,
    data: { payment_session_id: id },
  },
})

const newOrder = (overrides: Parameters<typeof orderData>[0] = {}) =>
  db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      expiresAt: EXPIRES,
      ...overrides,
    }),
  })

// Opens a session through Pay now, as the app does; returns its id
async function started(orderId: string): Promise<string> {
  const result = await startPayment(orderId, TOKEN, {
    now: PLACED,
    gateway: fakeGateway({ now: () => PLACED }),
    siteUrl: "http://localhost:3000",
    environment: "development",
  })
  if (!result.ok) throw new Error(result.reason)
  return /\/test-payment\/(ps-[0-9a-f]{24})/.exec(result.url)![1]
}

// A fake session forced to Completed whatever its state, as a payment that
// raced a cancel would leave it
const forceCompleted = (id: string) =>
  db.fakeGatewaySession.update({
    where: { id },
    data: { status: "COMPLETED", paymentId: `py-${id.slice(3)}` },
  })

const paymentOf = (providerRef: string) =>
  db.payment.findUniqueOrThrow({
    where: { provider_providerRef: { provider: "FAKE", providerRef } },
  })
const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })
const events = () => db.paymentEvent.findMany()

// A paid P1: placed, a session opened and paid on the fake page
async function paidSession() {
  const order = await newOrder()
  const id = await started(order.id)
  await completeFakeSession(id, NOW)
  return { order, id }
}

describe("payment_session.completed", () => {
  it("marks a pending order Paid (H1)", async () => {
    const { order, id } = await paidSession()
    const stock = await db.product.count()

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toEqual({ outcome: "paid", orderNumber: order.orderNumber })

    expect(await orderOf(order.id)).toMatchObject({
      status: "PAID",
      paidAt: NOW,
      paymentMethod: "FAKE",
      refundRequired: false,
    })
    const payment = await paymentOf(id)
    expect(payment).toMatchObject({
      status: "PAID",
      paidAt: NOW,
      method: "FAKE",
      receivedAmount: 2_311_000,
      receivedCurrency: "PHP",
      problem: null,
    })
    expect(payment.gatewayPaymentId).toMatch(/^py-[0-9a-f]{24}$/)
    expect(await events()).toEqual([
      expect.objectContaining({
        eventId: `payment_session.completed:${id}`,
        type: "payment_session.completed",
        paymentId: payment.id,
        payload: eventOf("completed", id).payload,
      }),
    ])
    expect(await db.product.count()).toBe(stock)
    expect(await db.stockMovement.count()).toBe(0)
  })

  it("changes nothing on a repeat (H2)", async () => {
    const { order, id } = await paidSession()
    const event = eventOf("completed", id)
    await reconcileSession(id, options({ event }))
    const before = [await orderOf(order.id), await paymentOf(id)]

    expect(await reconcileSession(id, options({ event }))).toMatchObject({
      outcome: "duplicate",
    })
    expect(await events()).toHaveLength(1)
    expect([await orderOf(order.id), await paymentOf(id)]).toEqual(before)
  })

  it("processes two deliveries at once exactly once (H2a)", async () => {
    const { id } = await paidSession()
    const event = eventOf("completed", id)
    const results = await Promise.all([
      reconcileSession(id, options({ event })),
      reconcileSession(id, options({ event })),
    ])
    expect(results.map(({ outcome }) => outcome).sort()).toEqual([
      "duplicate",
      "paid",
    ])
    expect(await events()).toHaveLength(1)
  })

  it.each([
    ["amount", { amount: 2_310_000 }, 2_310_000, "PHP"], // H3
    ["currency", { currency: "USD" }, 2_311_000, "USD"], // H3a
  ])(
    "records a %s mismatch and leaves the order pending (H3, H3a)",
    async (_, change, receivedAmount, receivedCurrency) => {
      const { order, id } = await paidSession()
      await db.fakeGatewaySession.update({ where: { id }, data: change })

      expect(
        await reconcileSession(id, options({ event: eventOf("completed", id) }))
      ).toMatchObject({ outcome: "mismatch" })
      expect(await orderOf(order.id)).toMatchObject({
        status: "PENDING_PAYMENT",
        paidAt: null,
        refundRequired: false,
      })
      expect(await paymentOf(id)).toMatchObject({
        status: "PAID",
        problem: "AMOUNT_MISMATCH",
        receivedAmount,
        receivedCurrency,
      })
      expect(await events()).toHaveLength(1)
    }
  )

  it("flags a late payment for a refund (H4)", async () => {
    const { order, id } = await paidSession()
    await db.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    })
    await db.payment.updateMany({ data: { status: "EXPIRED" } })

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "late" })
    expect(await orderOf(order.id)).toMatchObject({
      status: "CANCELLED",
      refundRequired: true,
      paidAt: null,
    })
    expect(await paymentOf(id)).toMatchObject({
      status: "PAID",
      problem: "LATE",
    })
    expect(await db.stockMovement.count()).toBe(0)
  })

  it("pays on an older session and expires the newer one (H6), then flags the newer one's payment (H5)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const second = await started(order.id)
    // The shopper had paid the first just before Retry closed it
    await forceCompleted(first)

    expect(
      await reconcileSession(
        first,
        options({ event: eventOf("completed", first) })
      )
    ).toMatchObject({ outcome: "paid" })
    expect(await paymentOf(first)).toMatchObject({ status: "PAID" })
    expect(await paymentOf(second)).toMatchObject({ status: "EXPIRED" })
    expect(
      await db.fakeGatewaySession.findUnique({ where: { id: second } })
    ).toMatchObject({ status: "CANCELED" })

    // H5: the second was paid too, before it closed
    await forceCompleted(second)
    expect(
      await reconcileSession(
        second,
        options({ event: eventOf("completed", second) })
      )
    ).toMatchObject({ outcome: "second" })
    expect(await orderOf(order.id)).toMatchObject({
      status: "PAID",
      paidAt: NOW,
      paymentMethod: "FAKE",
      refundRequired: true,
    })
    expect(await paymentOf(second)).toMatchObject({
      status: "PAID",
      problem: "SECOND_PAYMENT",
    })
  })

  it("marks Paid after expiresAt when the session was paid in time (H15)", async () => {
    const { order, id } = await paidSession()
    const late = new Date("2026-11-02T08:00:00Z")
    expect(
      await reconcileSession(
        id,
        options({
          now: late,
          gateway: fakeGateway({ now: () => late }),
          event: eventOf("completed", id),
        })
      )
    ).toMatchObject({ outcome: "paid" })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
  })
})

describe("orphan sessions (spec 031 A11)", () => {
  // A session the gateway made with no Payment row
  async function orphan(order: { id: string; orderNumber: string }) {
    const made = await gw.createSession({
      referenceId: `${order.orderNumber}-1`,
      amountCentavos: 2_311_000,
      currency: "PHP",
      description: "PC Silicon order",
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber,
        environment: "development",
      },
      successUrl: `http://localhost:3000/orders/${order.orderNumber}?key=${TOKEN}&payment=return`,
      cancelUrl: `http://localhost:3000/orders/${order.orderNumber}?key=${TOKEN}&payment=cancelled`,
      expiresAt: EXPIRES,
    })
    if (!made.ok) throw new Error(made.code)
    await completeFakeSession(made.session.id, NOW)
    return made.session.id
  }

  it("inserts the payment from the gateway and marks Paid (H10)", async () => {
    const order = await newOrder()
    const id = await orphan(order)

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "paid" })
    expect(await paymentOf(id)).toMatchObject({
      orderId: order.id,
      provider: "FAKE",
      referenceId: `${order.orderNumber}-1`,
      amount: 2_311_000,
      expiresAt: EXPIRES,
      status: "PAID",
    })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
  })

  it("inserts it beside an open payment, which then expires (H10a)", async () => {
    const order = await newOrder()
    const open = await started(order.id)
    const id = await orphan(order)

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "paid" })
    expect(await paymentOf(open)).toMatchObject({ status: "EXPIRED" })
    expect(
      await db.fakeGatewaySession.findUnique({ where: { id: open } })
    ).toMatchObject({ status: "CANCELED" })
  })
})

describe("ignored sessions write nothing", () => {
  async function fakeSessionFor(metadata: Record<string, string>) {
    const id = sessionId()
    await db.fakeGatewaySession.create({
      data: {
        id,
        status: "COMPLETED",
        amount: 2_311_000,
        currency: "PHP",
        referenceId: "PCS-7KQ2M9XD-1",
        metadata,
        expiresAt: EXPIRES,
        paymentId: `py-${id.slice(3)}`,
      },
    })
    return id
  }

  const nothingWritten = async (orderId?: string) => {
    expect(await events()).toEqual([])
    if (orderId) {
      expect(await orderOf(orderId)).toMatchObject({
        status: "PENDING_PAYMENT",
      })
    }
  }

  it("ignores an unknown session (H7)", async () => {
    const id = "ps-ffffffffffffffffffffffff"
    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toEqual({ outcome: "ignored-unknown" })
    await nothingWritten()
  })

  it("ignores a session naming no known order (H7a)", async () => {
    const id = await fakeSessionFor({
      order_id: "nope",
      order_number: "PCS-7KQ2M9XD",
      environment: "development",
    })
    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toEqual({ outcome: "ignored-unknown", code: "unknown-order" })
    await nothingWritten()
  })

  it("ignores a session whose order number disagrees (H7b)", async () => {
    const order = await newOrder()
    const id = await fakeSessionFor({
      order_id: order.id,
      order_number: "PCS-00000000",
      environment: "development",
    })
    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toEqual({ outcome: "ignored-unknown", code: "unknown-order" })
    await nothingWritten(order.id)
    expect(await db.payment.count()).toBe(0)
  })

  it("ignores another environment's session (H8)", async () => {
    const { order, id } = await paidSession()
    expect(
      await reconcileSession(
        id,
        options({
          environment: "production",
          event: eventOf("completed", id),
        })
      )
    ).toEqual({ outcome: "ignored-environment", code: "development" })
    await nothingWritten(order.id)
    expect(await paymentOf(id)).toMatchObject({ status: "PENDING" })
  })

  it("processes this environment's session (H9)", async () => {
    const { id } = await paidSession()
    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "paid" })
  })
})

describe("payment_session.expired", () => {
  it("expires the open payment and leaves the order (H11)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await expireFakeSession(id, NOW)

    expect(
      await reconcileSession(id, options({ event: eventOf("expired", id) }))
    ).toMatchObject({ outcome: "expired" })
    expect(await paymentOf(id)).toMatchObject({ status: "EXPIRED" })
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })
    expect(await events()).toEqual([
      expect.objectContaining({ eventId: `payment_session.expired:${id}` }),
    ])
  })

  it("records the event and changes nothing when already expired (H11a)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await started(order.id) // a retry closed the first

    expect(
      await reconcileSession(id, options({ event: eventOf("expired", id) }))
    ).toMatchObject({ outcome: "already-applied" })
    expect(await events()).toHaveLength(1)
  })
})

describe("Xendit's state decides, not the body", () => {
  it("applies expired for a body that says completed (H12)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await expireFakeSession(id, NOW)

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "expired" })
    expect(await paymentOf(id)).toMatchObject({ status: "EXPIRED" })
    expect(await events()).toEqual([
      expect.objectContaining({ eventId: `payment_session.completed:${id}` }),
    ])
  })

  it("writes nothing while the session is still active (H12a)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "active" })
    expect(await events()).toEqual([])
  })

  it("applies paid for a body that says expired (H12b)", async () => {
    const { order, id } = await paidSession()
    expect(
      await reconcileSession(id, options({ event: eventOf("expired", id) }))
    ).toMatchObject({ outcome: "paid" })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
  })

  it("writes nothing when the payment failed (H12c)", async () => {
    const { order, id } = await paidSession()
    expect(
      await reconcileSession(
        id,
        options({
          gateway: fakeGateway({ now: () => NOW, paymentStatus: "failed" }),
          event: eventOf("completed", id),
        })
      )
    ).toMatchObject({ outcome: "unconfirmed" })
    expect(await events()).toEqual([])
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })
  })

  it("waits for a payment that is still pending", async () => {
    const { id } = await paidSession()
    expect(
      await reconcileSession(
        id,
        options({
          gateway: fakeGateway({ now: () => NOW, paymentStatus: "pending" }),
        })
      )
    ).toMatchObject({ outcome: "not-yet" })
  })
})

describe("transient failures", () => {
  it("asks for a retry when the gateway can't be read, then processes (H13)", async () => {
    const { order, id } = await paidSession()
    const event = eventOf("completed", id)
    expect(
      await reconcileSession(
        id,
        options({
          gateway: fakeGateway({ now: () => NOW, fail: { get: true } }),
          event,
        })
      )
    ).toEqual({ outcome: "retry", code: "http-500" })
    expect(await events()).toEqual([])

    expect(await reconcileSession(id, options({ event }))).toMatchObject({
      outcome: "paid",
    })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
  })

  it("rolls back the event with the change (H14)", async () => {
    const { order, id } = await paidSession()
    const event = eventOf("completed", id)
    expect(
      await reconcileSession(
        id,
        options({
          event,
          afterStep: (step) => {
            if (step === "event") throw new Error("forced")
          },
        })
      )
    ).toMatchObject({ outcome: "error" })
    expect(await events()).toEqual([])
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })

    expect(await reconcileSession(id, options({ event }))).toMatchObject({
      outcome: "paid",
    })
  })
})

describe("no gateway call inside a transaction (H17)", () => {
  // Fails the test if any gateway method runs between "tx-open" and
  // "tx-closed"
  function guarded() {
    let open = false
    const calls: string[] = []
    const base = fakeGateway({ now: () => NOW })
    const wrap =
      <K extends "getSession" | "getPayment" | "closeSession">(name: K) =>
      (...args: Parameters<PaymentGateway[K]>) => {
        calls.push(name)
        if (open) throw new Error(`${name} called inside a transaction`)
        return (base[name] as (...a: typeof args) => unknown)(...args)
      }
    const gateway = {
      ...base,
      getSession: wrap("getSession"),
      getPayment: wrap("getPayment"),
      closeSession: wrap("closeSession"),
    } as PaymentGateway
    const afterStep = (step: ReconcileStep) => {
      if (step === "tx-open") open = true
      if (step === "tx-closed") open = false
    }
    return { gateway, afterStep, calls }
  }

  it("for a paid session that closes another (H1, H6)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    await started(order.id)
    await forceCompleted(first)
    const { gateway, afterStep, calls } = guarded()

    expect(
      await reconcileSession(
        first,
        options({ gateway, afterStep, event: eventOf("completed", first) })
      )
    ).toMatchObject({ outcome: "paid" })
    expect(calls).toEqual(["getSession", "getPayment", "closeSession"])
  })

  it("for an expired session (H11)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await expireFakeSession(id, NOW)
    const { gateway, afterStep } = guarded()
    expect(
      await reconcileSession(
        id,
        options({ gateway, afterStep, event: eventOf("expired", id) })
      )
    ).toMatchObject({ outcome: "expired" })
  })
})

describe("without an event: how #81 calls it", () => {
  it("recovers a missed webhook (C1) and is then already applied (C4)", async () => {
    const { order, id } = await paidSession()
    const late = new Date("2026-11-02T08:00:00Z")
    const at = options({ now: late, gateway: fakeGateway({ now: () => late }) })

    expect(await reconcileSession(id, at)).toMatchObject({ outcome: "paid" })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
    expect(await events()).toEqual([])

    expect(await reconcileSession(id, at)).toMatchObject({
      outcome: "already-applied",
    })
  })

  it("leaves an active session alone (C2)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    expect(await reconcileSession(id, options())).toMatchObject({
      outcome: "active",
    })
    expect(await paymentOf(id)).toMatchObject({ status: "PENDING" })
  })

  it("expires an expired session's payment (C3)", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await expireFakeSession(id, NOW)
    expect(await reconcileSession(id, options())).toMatchObject({
      outcome: "expired",
    })
    expect(await paymentOf(id)).toMatchObject({ status: "EXPIRED" })
  })

  it("records a late webhook after a reconcile and changes nothing (C5)", async () => {
    const { order, id } = await paidSession()
    await reconcileSession(id, options())
    const before = await orderOf(order.id)

    expect(
      await reconcileSession(id, options({ event: eventOf("completed", id) }))
    ).toMatchObject({ outcome: "already-applied" })
    expect(await events()).toHaveLength(1)
    expect(await orderOf(order.id)).toEqual(before)
  })

  it("asks for a retry when the gateway is down (C6)", async () => {
    const { id } = await paidSession()
    expect(
      await reconcileSession(
        id,
        options({ gateway: fakeGateway({ fail: { get: true } }) })
      )
    ).toMatchObject({ outcome: "retry" })
  })

  it("logs one payment.reconcile line, and none with an event", async () => {
    const { order, id } = await paidSession()
    const info = vi.mocked(console.info)
    info.mockClear()
    await reconcileSession(id, options())
    expect(info).toHaveBeenCalledTimes(1)
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "payment.reconcile",
      outcome: "paid",
      sessionId: id,
      orderNumber: order.orderNumber,
    })

    info.mockClear()
    await reconcileSession(id, options({ event: eventOf("completed", id) }))
    expect(info).not.toHaveBeenCalled()
  })
})
