import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { hashToken, newAccessToken } from "@/lib/orders/secrets"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { fakeGateway, readFakeSession } from "./fake"
import {
  chooseOnFakePage,
  type FakePageContext,
  openFakePage,
} from "./fake-page"
import { startPayment } from "./start-payment"

// The fake payment page (docs/specs/031-pay-with-xendit, Behavior 15–16):
// F1–F5 and Let it expire; since docs/specs/032-payment-webhooks its events
// run the webhook handler

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()
const NOW = new Date("2026-11-01T07:00:00Z")
const context: FakePageContext = {
  gatewayIsFake: true,
  environment: "development",
  now: NOW,
  gateway: fakeGateway({ now: () => NOW }),
}

async function opened() {
  const order = await db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      expiresAt: new Date("2026-11-02T07:00:00Z"),
    }),
  })
  const result = await startPayment(order.id, TOKEN, {
    now: NOW,
    gateway: fakeGateway({ now: () => NOW }),
    siteUrl: "http://localhost:3000",
    environment: "development",
  })
  if (!result.ok) throw new Error(result.reason)
  const id = /\/test-payment\/(ps-[0-9a-f]{24})/.exec(result.url)![1]
  return { order, id }
}

describe("openFakePage", () => {
  it("F1: shows the order and the amount of an active session", async () => {
    const { order, id } = await opened()
    expect(await openFakePage(id, TOKEN, context)).toMatchObject({
      orderNumber: order.orderNumber,
      orderHref: `/orders/${order.orderNumber}?key=${TOKEN}`,
      session: { id, status: "active", amountCentavos: 2_311_000 },
    })
  })

  const misses: [
    string,
    (id: string) => [unknown, unknown, FakePageContext],
  ][] = [
    ["a wrong key", (id) => [id, newAccessToken(), context]],
    ["no key", (id) => [id, null, context]],
    ["an unknown id", () => ["ps-000000000000000000000000", TOKEN, context]],
    ["a malformed id", () => ["../orders", TOKEN, context]],
    [
      "another environment",
      (id) => [id, TOKEN, { ...context, environment: "production" }],
    ],
    [
      "the xendit gateway",
      (id) => [id, TOKEN, { ...context, gatewayIsFake: false }],
    ],
  ]

  it.each(misses)("F4: is a miss for %s", async (_, args) => {
    const { id } = await opened()
    const [sessionId, key, ctx] = args(id)
    expect(await openFakePage(sessionId, key, ctx)).toBeNull()
  })
})

describe("chooseOnFakePage", () => {
  it("F2: Pay completes the session, sends the event and returns", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { order, id } = await opened()

    const url = await chooseOnFakePage("pay", id, TOKEN, context)

    expect(url).toBe(`/orders/${order.orderNumber}?key=${TOKEN}&payment=return`)
    expect((await readFakeSession(id, NOW))?.status).toBe("completed")
    // The webhook handler ran in process with the right token
    // (vitest.db.config.ts sets it) and marked the order Paid before the
    // redirect (docs/specs/032-payment-webhooks, behavior 25, D10)
    expect(JSON.parse(String(info.mock.calls.at(-1)?.[0]))).toMatchObject({
      event: "payment.webhook",
      outcome: "paid",
      sessionId: id,
    })
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(after).toMatchObject({ status: "PAID", paymentMethod: "FAKE" })
    expect(JSON.stringify(info.mock.calls)).not.toContain(TOKEN)
  })

  it("F3: Cancel goes back and leaves the session active", async () => {
    const { order, id } = await opened()
    expect(await chooseOnFakePage("cancel", id, TOKEN, context)).toBe(
      `/orders/${order.orderNumber}?key=${TOKEN}&payment=cancelled`
    )
    expect((await readFakeSession(id, NOW))?.status).toBe("active")
  })

  it("Let it expire expires the session and sends the event", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { order, id } = await opened()
    expect(await chooseOnFakePage("expire", id, TOKEN, context)).toBe(
      `/orders/${order.orderNumber}?key=${TOKEN}&payment=cancelled`
    )
    expect((await readFakeSession(id, NOW))?.status).toBe("expired")
    expect(JSON.parse(String(info.mock.calls.at(-1)?.[0]))).toMatchObject({
      outcome: "expired",
      sessionId: id,
    })
    expect(
      await db.payment.findFirstOrThrow({ where: { orderId: order.id } })
    ).toMatchObject({ status: "EXPIRED" })
  })

  it("F5: a closed session goes back to the order, with no event", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { order, id } = await opened()
    await chooseOnFakePage("pay", id, TOKEN, context)
    info.mockClear()

    expect((await openFakePage(id, TOKEN, context))?.session.status).toBe(
      "completed"
    )
    expect(await chooseOnFakePage("pay", id, TOKEN, context)).toBe(
      `/orders/${order.orderNumber}?key=${TOKEN}`
    )
    expect(info).not.toHaveBeenCalled()
  })

  it("does nothing for a miss", async () => {
    const { id } = await opened()
    expect(
      await chooseOnFakePage("pay", id, newAccessToken(), context)
    ).toBeNull()
    expect((await readFakeSession(id, NOW))?.status).toBe("active")
  })
})
