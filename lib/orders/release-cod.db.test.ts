import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { addToCart } from "@/lib/cart/cart"
import { sendPending } from "@/lib/email/send"
import { fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { shippingSeed } from "@/prisma/seed/data/shipping"
import { voucherSeed } from "@/prisma/seed/data/vouchers"
import { writeSeed } from "@/prisma/seed/write"
import { insertParts } from "@/test-support/build-fixtures"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { ago, countedRows, HOUR, outboxRow } from "@/test-support/email"
import {
  EXPIRES,
  heldOrder,
  openSession,
  PLACED,
  releaseTokenHash,
  stockOf,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { runReleaseCron } from "./release-cron"
import { sweepExpiredOrders } from "./release"

// docs/specs/038-cash-on-delivery: R1–R10 and C9, the release of cash orders
// that were not confirmed in time. Orders come from the release tests'
// `heldOrder` (as placement leaves them); each holds Ryzen 5 7600s and is due
// at NOW.

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  await resetCatalog()
  await writeSeed(db, [], {
    reset: false,
    shipping: shippingSeed,
    vouchers: voucherSeed,
  })
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const NOW = EXPIRES
const SITE = "https://pcsilicon.tech"

// A gateway whose calls are counted: a cash order must cause none
function spyGateway(): PaymentGateway & { calls: () => number } {
  const base = fakeGateway({ now: () => PLACED })
  let calls = 0
  const counted =
    <A extends unknown[], R>(call: (...args: A) => R) =>
    (...args: A): R => {
      calls++
      return call(...args)
    }
  return {
    ...base,
    createSession: counted(base.createSession.bind(base)),
    closeSession: counted(base.closeSession.bind(base)),
    getSession: counted(base.getSession.bind(base)),
    getPayment: counted(base.getPayment.bind(base)),
    calls: () => calls,
  }
}
const sweep = (gateway: PaymentGateway = spyGateway(), now = NOW) =>
  sweepExpiredOrders(now, { gateway, environment: "development" })

async function ryzen(stock = 40) {
  const ids = await insertParts([seed.ryzen5_7600], {
    [seed.ryzen5_7600.id]: { stock, price: 1_149_500 },
  })
  return ids.get(seed.ryzen5_7600.id)!
}

let tokens = 0
// A cash order holding `quantity` Ryzens, as placement leaves it
async function cashOrder(
  productId: string,
  quantity = 2,
  overrides: Parameters<typeof heldOrder>[1] = {}
) {
  return heldOrder([{ productId, quantity }], {
    accessTokenHash: releaseTokenHash(`cash-token-${++tokens}`),
    paymentOption: "COD",
    status: "PENDING_CONFIRMATION",
    ...overrides,
  } as Parameters<typeof heldOrder>[1])
}

const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })

describe("an unconfirmed cash order past its deadline", () => {
  it("R1: is cancelled as expired, its stock returns row for row, and no gateway is called", async () => {
    const p = await ryzen(40)
    const order = await cashOrder(p, 2)
    expect(await stockOf(p)).toBe(38)
    const gateway = spyGateway()

    expect(await sweep(gateway)).toMatchObject({ released: 1, skipped: 0 })

    expect(await orderOf(order.id)).toMatchObject({
      status: "CANCELLED",
      cancelReason: "EXPIRED",
      cancelledAt: NOW,
      paymentOption: "COD",
      confirmedAt: null,
    })
    expect(await stockOf(p)).toBe(40)
    expect(
      await db.stockMovement.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      })
    ).toMatchObject([
      { change: -2, reason: "ORDER_RESERVED" },
      { change: 2, reason: "ORDER_RELEASED" },
    ])
    expect(gateway.calls()).toBe(0)
  })

  it("R2: gives its voucher's use back", async () => {
    const p = await ryzen()
    const voucher = await db.voucher.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    })
    await db.voucher.update({
      where: { id: voucher.id },
      data: { usedCount: 1 },
    })
    const order = await cashOrder(p, 2, {
      voucherId: voucher.id,
      voucherCode: "WELCOME10",
      discount: 229_900,
      total: 2_081_100,
    })

    await sweep()

    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: voucher.id } }))
        .usedCount
    ).toBe(0)
    expect(await orderOf(order.id)).toMatchObject({
      voucherCode: "WELCOME10",
      discount: 229_900,
    })
  })

  it("R3: a second sweep, and two at once, release it once", async () => {
    const p = await ryzen()
    const order = await cashOrder(p, 2)

    await sweep()
    const [a, b] = await Promise.all([sweep(), sweep()])

    expect(a.released + b.released).toBe(0)
    expect(await stockOf(p)).toBe(40)
    expect(await db.stockMovement.count({ where: { orderId: order.id } })).toBe(
      2
    )
  })

  it("R4: sends the cancelled email, which says it wasn't confirmed in time", async () => {
    const p = await ryzen()
    const order = await cashOrder(p, 2)

    await sweep()

    expect(
      await db.emailOutbox.findMany({ where: { orderId: order.id } })
    ).toMatchObject([{ type: "ORDER_CANCELLED", status: "PENDING" }])
    await sendPending({ now: NOW, siteUrl: SITE })
    const email = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:ORDER_CANCELLED` },
    })
    expect(email.text).toContain("wasn't confirmed in time")
    expect(email.text).not.toContain("wasn't paid in time")
  })

  it("R5: is released alongside a due online order, whose session is still closed", async () => {
    const p = await ryzen()
    const online = await heldOrder([{ productId: p, quantity: 1 }], {
      accessTokenHash: releaseTokenHash(),
    })
    const session = await openSession(online.id)
    const cash = await cashOrder(p, 1)
    const gateway = spyGateway()

    expect(await sweep(gateway)).toMatchObject({ released: 2 })

    expect(await orderOf(online.id)).toMatchObject({ status: "CANCELLED" })
    expect(await orderOf(cash.id)).toMatchObject({ status: "CANCELLED" })
    expect(
      (
        await db.fakeGatewaySession.findUniqueOrThrow({
          where: { id: session },
        })
      ).status
    ).toBe("CANCELED")
    // the one close was the online order's
    expect(gateway.calls()).toBe(1)
    expect(await stockOf(p)).toBe(40)
  })

  it("R6: a purchase of the part it holds releases it inside the purchase", async () => {
    const p = await ryzen(2)
    const order = await cashOrder(p, 2)
    expect(await stockOf(p)).toBe(0)
    const gateway = spyGateway()

    const { result } = await addToCart(
      { productId: p, quantity: 1 },
      { cartId: null, today: FIXTURE_TODAY, now: NOW, gateway }
    )

    expect(result).toMatchObject({ ok: true, added: 1 })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(p)).toBe(2)
    expect(gateway.calls()).toBe(0)
  })

  it("R7: the cron releases it too", async () => {
    const p = await ryzen()
    const order = await cashOrder(p, 2)

    const answer = await runReleaseCron(`Bearer ${"c".repeat(32)}`, {
      secret: "c".repeat(32),
      now: NOW,
      gateway: spyGateway(),
      environment: "development",
    })

    expect(answer).toMatchObject({
      status: 200,
      body: { released: 1, skipped: 0 },
    })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
  })

  it("R8: before its deadline it is left alone", async () => {
    const p = await ryzen()
    const order = await cashOrder(p, 2)
    const early = new Date(NOW.getTime() - 1)

    expect(await sweep(spyGateway(), early)).toMatchObject({ released: 0 })

    expect(await orderOf(order.id)).toMatchObject({
      status: "PENDING_CONFIRMATION",
    })
    expect(await stockOf(p)).toBe(38)
  })

  it("R10: with its confirmation email skipped by the cap it is released like any other", async () => {
    const p = await ryzen()
    const order = await cashOrder(p, 2)
    await outboxRow(order.id, "ana@example.com", {
      type: "COD_CONFIRM",
      status: "SKIPPED",
      lastErrorCode: "recipient-cap",
    })

    expect(await sweep()).toMatchObject({ released: 1 })

    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await stockOf(p)).toBe(40)
    // The cancelled email is capped as well and skipped without an error
    await countedRows("ana@example.com", 5, ago(NOW, HOUR))
    const summary = await sendPending({ now: NOW, siteUrl: SITE })
    expect(summary).toMatchObject({ skipped: 1 })
    expect(
      (
        await db.emailOutbox.findFirstOrThrow({
          where: { orderId: order.id, type: "ORDER_CANCELLED" },
        })
      ).status
    ).toBe("SKIPPED")
  })
})

describe("a confirmed cash order never expires", () => {
  async function confirmed(p: string) {
    return cashOrder(p, 2, {
      status: "COD_CONFIRMED",
      confirmedAt: new Date(NOW.getTime() - HOUR),
    })
  }

  it("C9: the sweep and the cron leave it holding its stock and voucher use", async () => {
    const p = await ryzen()
    const voucher = await db.voucher.findUniqueOrThrow({
      where: { code: "WELCOME10" },
    })
    await db.voucher.update({
      where: { id: voucher.id },
      data: { usedCount: 1 },
    })
    const order = await cashOrder(p, 2, {
      status: "COD_CONFIRMED",
      confirmedAt: new Date(NOW.getTime() - HOUR),
      voucherId: voucher.id,
      voucherCode: "WELCOME10",
      discount: 229_900,
      total: 2_081_100,
    })
    // a year past its deadline
    const later = new Date(NOW.getTime() + 365 * 24 * HOUR)

    expect(await sweep(spyGateway(), later)).toMatchObject({ released: 0 })
    const answer = await runReleaseCron(`Bearer ${"c".repeat(32)}`, {
      secret: "c".repeat(32),
      now: later,
      gateway: spyGateway(),
      environment: "development",
    })

    expect(answer).toMatchObject({
      status: 200,
      body: { released: 0, skipped: 0 },
    })
    expect(await orderOf(order.id)).toMatchObject({
      status: "COD_CONFIRMED",
      cancelledAt: null,
    })
    expect(await stockOf(p)).toBe(38)
    expect(
      (await db.voucher.findUniqueOrThrow({ where: { id: voucher.id } }))
        .usedCount
    ).toBe(1)
    expect(await db.emailOutbox.count()).toBe(0)
  })

  it("C9: a purchase of the part it holds is not helped by it", async () => {
    const p = await ryzen(2)
    await confirmed(p)

    const { result } = await addToCart(
      { productId: p, quantity: 1 },
      {
        cartId: null,
        today: FIXTURE_TODAY,
        now: new Date(NOW.getTime() + 365 * 24 * HOUR),
        gateway: spyGateway(),
      }
    )

    expect(result).toMatchObject({ ok: false })
    expect(await stockOf(p)).toBe(0)
  })
})

describe("the index the release's query uses", () => {
  it("R9: covers both pending statuses", async () => {
    const p = await ryzen()
    for (let i = 0; i < 40; i++) await cashOrder(p, 1)
    await db.$executeRawUnsafe('ANALYZE "Order"')

    // Thrown to roll the transaction back, carrying the plan out
    class Plan extends Error {
      constructor(readonly text: string) {
        super("plan")
      }
    }
    const plan = await db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off")
        // Admin's list indexes (docs/specs/041-admin-orders-list-detail, R10)
        // are also candidates for this query on a table this small. This test
        // is about the partial index, so the other one is dropped inside the
        // transaction, which is rolled back by throwing.
        await tx.$executeRawUnsafe('DROP INDEX "Order_status_createdAt_id_idx"')
        const rows = await tx.$queryRawUnsafe<{ "QUERY PLAN": string }[]>(
          `EXPLAIN SELECT o."id" FROM "Order" o
         WHERE o."status" IN ('PENDING_PAYMENT', 'PENDING_CONFIRMATION')
           AND o."expiresAt" <= now()
         ORDER BY o."expiresAt", o."id" LIMIT 10`
        )
        throw new Plan(rows.map((row) => row["QUERY PLAN"]).join("\n"))
      })
      .then(
        () => {
          throw new Error("the plan was not captured")
        },
        (error: unknown) => {
          if (error instanceof Plan) return error.text
          throw error
        }
      )

    expect(plan).toContain("Order_expiresAt_idx")
  })
})
