import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { completeFakeSession, fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { reconcileSession } from "@/lib/payments/reconcile"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { paymentData } from "@/test-support/payments"
import {
  EXPIRES,
  forceCompleted,
  guardTransactions,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
  stockOf,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import {
  checkExpiredOrders,
  releaseExpiredOrders,
  sweepExpiredOrders,
} from "./release"

// docs/specs/033-release-unpaid-orders: R1–R14 and G1–G5, against the test
// database with the fake gateway. P1 holds 2 Ryzen 5 7600s (stock 12 → 10),
// P2 one Kingston FURY Beast DDR5-5600 (16 → 15).

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

let info: { mock: { calls: unknown[][] } }
beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const NOW = EXPIRES
// The gateway as Xendit sees it: lagging (its clock before the session's
// expiry, so the session still reads active) or caught up
const lagging = () => fakeGateway({ now: () => PLACED })
const caughtUp = () => fakeGateway({ now: () => NOW })

const sweep = (
  gateway: PaymentGateway = lagging(),
  extra: Parameters<typeof sweepExpiredOrders>[1] = {}
) => sweepExpiredOrders(NOW, { gateway, environment: "development", ...extra })

async function parts() {
  const ids = await insertParts([seed.ryzen5_7600, seed.furyDdr5_1x16], {
    [seed.ryzen5_7600.id]: { stock: 12 },
    [seed.furyDdr5_1x16.id]: { stock: 16 },
  })
  return {
    ryzen: ids.get(seed.ryzen5_7600.id)!,
    kingston: ids.get(seed.furyDdr5_1x16.id)!,
  }
}

// P1: two Ryzens, a session opened at placement
async function p1(withSession = true) {
  const { ryzen, kingston } = await parts()
  const order = await heldOrder([{ productId: ryzen, quantity: 2 }], {
    orderNumber: "PCS-7KQ2M9XD",
    accessTokenHash: releaseTokenHash(),
  })
  const session = withSession ? await openSession(order.id) : null
  return { order, session, ryzen, kingston }
}

const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })
const paymentOf = (providerRef: string) =>
  db.payment.findFirstOrThrow({ where: { providerRef } })
const fakeStatus = async (id: string) =>
  (await db.fakeGatewaySession.findUniqueOrThrow({ where: { id } })).status
const released = (orderId: string) =>
  db.stockMovement.findMany({ where: { orderId, reason: "ORDER_RELEASED" } })
const logLines = () =>
  info.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.includes('"order.release"'))
    .map((line) => JSON.parse(line))

describe("releasing an expired order", () => {
  it("cancels the session, the order and gives the stock back (R1)", async () => {
    const { order, session, ryzen } = await p1()
    expect(await stockOf(ryzen)).toBe(10)

    expect(await sweep()).toMatchObject({ released: 1, skipped: 0 })

    expect(await fakeStatus(session!)).toBe("CANCELED")
    expect(await orderOf(order.id)).toMatchObject({
      status: "CANCELLED",
      cancelledAt: NOW,
      cancelReason: "EXPIRED",
    })
    expect(await paymentOf(session!)).toMatchObject({ status: "EXPIRED" })
    expect(await stockOf(ryzen)).toBe(12)
    expect(await released(order.id)).toMatchObject([
      { productId: ryzen, change: 2, reason: "ORDER_RELEASED" },
    ])
    expect(revalidateTag).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledWith("products", "max")
    expect(logLines()).toEqual([
      {
        event: "order.release",
        outcome: "released",
        orderNumber: "PCS-7KQ2M9XD",
        via: "sweep",
      },
    ])
  })

  it("leaves an order that isn't due yet, with no gateway call (R2)", async () => {
    const { order, ryzen } = await p1()
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")
    const early = new Date(EXPIRES.getTime() - 1_000)

    expect(
      await sweepExpiredOrders(early, { gateway, environment: "development" })
    ).toMatchObject({ released: 0, skipped: 0, tried: [] })
    expect(close).not.toHaveBeenCalled()
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })
    expect(await stockOf(ryzen)).toBe(10)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it("releases once when run twice (R3)", async () => {
    const { order, ryzen } = await p1()
    await sweep()
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")

    expect(await sweep(gateway)).toMatchObject({ released: 0 })
    expect(close).not.toHaveBeenCalled()
    expect(await stockOf(ryzen)).toBe(12)
    expect(await released(order.id)).toHaveLength(1)
  })

  it("releases once when two runs race (R3a)", async () => {
    const { order, ryzen } = await p1()
    const results = await Promise.all([sweep(), sweep()])

    expect(results.map((r) => r.released).sort()).toEqual([0, 1])
    expect(results.every((r) => !r.failed)).toBe(true)
    expect(await stockOf(ryzen)).toBe(12)
    expect(await released(order.id)).toHaveLength(1)
  })

  it("never touches a Paid order (R4)", async () => {
    const { order, ryzen } = await p1()
    await db.order.update({
      where: { id: order.id },
      data: { status: "PAID", paidAt: PLACED },
    })
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")

    expect(await sweep(gateway)).toMatchObject({ released: 0, tried: [] })
    expect(close).not.toHaveBeenCalled()
    expect(await stockOf(ryzen)).toBe(10)
  })

  it("makes a paid order Paid when its webhook was missed (R5, G1)", async () => {
    const { order, session, ryzen } = await p1()
    await completeFakeSession(session!, PLACED)

    expect(await sweep()).toMatchObject({ released: 0, skipped: 1 })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
    expect(await paymentOf(session!)).toMatchObject({ status: "PAID" })
    expect(await stockOf(ryzen)).toBe(10)
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: "skipped", code: "paid" }),
    ])
  })

  it("reconciles a session that already expired, then releases (R6)", async () => {
    const { order, session, ryzen } = await p1()

    // Xendit has caught up: the session reads expired, and the cancel 422s
    expect(await sweep(caughtUp())).toMatchObject({ released: 1 })
    expect(await paymentOf(session!)).toMatchObject({ status: "EXPIRED" })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("skips the order when the gateway is down, and releases it later (R7)", async () => {
    const { order, session, ryzen } = await p1()
    const down = fakeGateway({ now: () => PLACED, fail: { close: true } })

    expect(await sweep(down)).toMatchObject({ released: 0, skipped: 1 })
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })
    expect(await paymentOf(session!)).toMatchObject({ status: "PENDING" })
    expect(await fakeStatus(session!)).toBe("ACTIVE")
    expect(await stockOf(ryzen)).toBe(10)
    expect(logLines()).toEqual([
      expect.objectContaining({ outcome: "skipped", code: "http-500" }),
    ])

    expect(await sweep()).toMatchObject({ released: 1 })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("leaves an order with a payment that needs checking alone (R8)", async () => {
    const { order, ryzen } = await p1(false)
    await db.payment.create({
      data: paymentData(order.id, {
        status: "PAID",
        paidAt: PLACED,
        problem: "AMOUNT_MISMATCH",
        receivedAmount: 2_310_000,
      }),
    })
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")

    expect(await sweep(gateway)).toMatchObject({ released: 0, tried: [] })
    expect(close).not.toHaveBeenCalled()
    expect(await stockOf(ryzen)).toBe(10)
  })

  it("releases an order with no open session without the gateway (R9, R9a)", async () => {
    const { order: none, ryzen } = await p1(false)
    const expired = await heldOrder([{ productId: ryzen, quantity: 1 }])
    await db.payment.create({
      data: paymentData(expired.id, { status: "EXPIRED" }),
    })
    const gateway = lagging()
    const close = vi.spyOn(gateway, "closeSession")

    expect(await sweep(gateway)).toMatchObject({ released: 2 })
    expect(close).not.toHaveBeenCalled()
    expect(await orderOf(none.id)).toMatchObject({ status: "CANCELLED" })
    expect(await orderOf(expired.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("releases after a rolled-back release left the session cancelled (R10)", async () => {
    const { order, session, ryzen } = await p1()
    await lagging().closeSession(session!)

    expect(await sweep()).toMatchObject({ released: 1 })
    expect(await paymentOf(session!)).toMatchObject({ status: "EXPIRED" })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("scoped to products, releases only the orders holding them (R11, R11a)", async () => {
    const { order, ryzen, kingston } = await p1()
    const p2 = await heldOrder([{ productId: kingston, quantity: 1 }], {
      expiresAt: new Date("2026-11-02T06:00:00Z"),
    })
    const later = new Date("2026-11-02T09:00:00Z")
    const gateway = lagging()

    const check = await checkExpiredOrders({
      now: later,
      productIds: [ryzen],
      limit: 10,
      gateway,
      environment: "development",
    })
    expect(check.cleared.map(({ id }) => id)).toEqual([order.id])
    await db.$transaction((tx) =>
      releaseExpiredOrders(tx, { now: later, orderIds: [order.id] })
    )
    expect(await stockOf(ryzen)).toBe(12)
    expect(await stockOf(kingston)).toBe(15)

    expect(
      await sweepExpiredOrders(later, { gateway, environment: "development" })
    ).toMatchObject({ released: 1 })
    expect(await orderOf(p2.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(kingston)).toBe(16)
  })

  it("gives a retired product its stock back (R12)", async () => {
    const { ryzen } = await p1()
    await db.product.update({
      where: { id: ryzen },
      data: { status: "DRAFT" },
    })
    expect(await sweep()).toMatchObject({ released: 1 })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("adds up several orders of one product (R13)", async () => {
    const { ryzen } = await parts()
    await db.product.update({ where: { id: ryzen }, data: { stock: 6 } })
    const orders = []
    for (const quantity of [2, 1, 3]) {
      orders.push(await heldOrder([{ productId: ryzen, quantity }]))
    }
    expect(await stockOf(ryzen)).toBe(0)

    expect(await sweep()).toMatchObject({ released: 3 })
    expect(await stockOf(ryzen)).toBe(6)
    const movements = await db.stockMovement.findMany({
      where: { reason: "ORDER_RELEASED" },
      orderBy: { change: "asc" },
    })
    expect(movements.map(({ change }) => change)).toEqual([1, 2, 3])
    expect(revalidateTag).toHaveBeenCalledTimes(1)
  })

  it("checks at most the limit, oldest first (R14)", async () => {
    const { ryzen } = await parts()
    const orders = []
    for (let i = 0; i < 12; i++) {
      orders.push(
        await heldOrder([{ productId: ryzen, quantity: 1 }], {
          expiresAt: new Date(EXPIRES.getTime() - (12 - i) * 60_000),
        })
      )
    }
    const first = await sweep(lagging(), { limit: 10 })
    expect(first.released).toBe(10)
    expect(first.tried).toEqual(orders.slice(0, 10).map(({ id }) => id))
    expect(await sweep(lagging(), { limit: 10 })).toMatchObject({ released: 2 })
  })
})

describe("between the check and the release", () => {
  const check = (gateway = lagging()) =>
    checkExpiredOrders({
      now: NOW,
      limit: 10,
      gateway,
      environment: "development",
    })
  const release = (orderIds: string[]) =>
    db.$transaction((tx) => releaseExpiredOrders(tx, { now: NOW, orderIds }))
  const reconcile = (id: string) =>
    reconcileSession(id, {
      gateway: lagging(),
      environment: "development",
      now: NOW,
    })

  it("a payment completed after the check, webhook first: stays Paid (G2)", async () => {
    const { order, session, ryzen } = await p1()
    expect((await check()).cleared).toHaveLength(1)

    await forceCompleted(session!)
    expect(await reconcile(session!)).toMatchObject({ outcome: "paid" })

    expect(await release([order.id])).toMatchObject({
      released: [],
      notLocked: [order.id],
    })
    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
    expect(await paymentOf(session!)).toMatchObject({ status: "PAID" })
    expect(await stockOf(ryzen)).toBe(10)
    expect(await released(order.id)).toEqual([])
  })

  it("a payment completed after the check, webhook after: late (G3)", async () => {
    const { order, session, ryzen } = await p1()
    expect((await check()).cleared).toHaveLength(1)
    await forceCompleted(session!)

    expect((await release([order.id])).released).toHaveLength(1)
    expect(await reconcile(session!)).toMatchObject({ outcome: "late" })

    expect(await orderOf(order.id)).toMatchObject({
      status: "CANCELLED",
      refundRequired: true,
    })
    expect(await paymentOf(session!)).toMatchObject({
      status: "PAID",
      problem: "LATE",
    })
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("an expired webhook between the steps changes nothing twice (G4)", async () => {
    const { order, session, ryzen } = await p1()
    expect((await check()).cleared).toHaveLength(1)
    expect(await reconcile(session!)).toMatchObject({ outcome: "expired" })

    expect((await release([order.id])).released).toHaveLength(1)
    expect(await paymentOf(session!)).toMatchObject({ status: "EXPIRED" })
    expect(await released(order.id)).toHaveLength(1)
    expect(await stockOf(ryzen)).toBe(12)
  })

  it("skips an order another transaction holds (G5)", async () => {
    const { order, ryzen } = await p1()
    const { cleared } = await check()

    const result = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`
        return release(cleared.map(({ id }) => id))
      },
      { timeout: 10_000 }
    )
    expect(result).toMatchObject({ released: [], notLocked: [order.id] })
    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_PAYMENT",
    })
    expect(await stockOf(ryzen)).toBe(10)

    // Its session is cancelled already, so the next run only reconciles
    expect(await sweep()).toMatchObject({ released: 1 })
  })
})

describe("no gateway call inside a transaction (S8)", () => {
  it.each([
    ["an active session (R1)", async () => undefined, lagging],
    [
      "a paid session (R5)",
      (session: string) => completeFakeSession(session, PLACED),
      lagging,
    ],
    ["an expired session (R6)", async () => undefined, caughtUp],
  ])("for %s", async (_, prepare, gatewayOf) => {
    const { session } = await p1()
    await prepare(session!)
    const gateway = guardTransactions(gatewayOf())

    expect(await sweep(gateway)).toMatchObject({ failed: false })
  })
})
