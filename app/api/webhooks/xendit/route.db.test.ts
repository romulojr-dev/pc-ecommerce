import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { db } from "@/lib/db"
import { hashToken } from "@/lib/orders/secrets"
import { completeFakeSession, fakeGateway } from "@/lib/payments/fake"
import { startPayment } from "@/lib/payments/start-payment"
import { resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { POST } from "./route"

// POST /api/webhooks/xendit through a real Request (docs/specs/032-payment-
// webhooks): H1, H16, and the log lines of ignored webhooks (H7, H8). The
// app's own fake gateway and environment, as vitest.db.config.ts sets them.

const WEBHOOK_TOKEN = "test-webhook-token"
const TOKEN = "T".repeat(43)

let info: { mock: { calls: unknown[][] } }
beforeEach(async () => {
  await resetCatalog()
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const post = (body: unknown, token: string | null = WEBHOOK_TOKEN) =>
  POST(
    new Request("http://localhost:3000/api/webhooks/xendit", {
      method: "POST",
      headers: token === null ? {} : { "x-callback-token": token },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )

const completed = (id: string) => ({
  event: "payment_session.completed",
  business_id: "test",
  created: new Date().toISOString(),
  data: { payment_session_id: id, status: "COMPLETED" },
})

// A pending order with a session paid on the fake page
async function paidSession() {
  const order = await db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      expiresAt: new Date(Date.now() + 24 * 3_600_000),
    }),
  })
  const started = await startPayment(order.id, TOKEN, {
    gateway: fakeGateway(),
    siteUrl: "http://localhost:3000",
    environment: "development",
  })
  if (!started.ok) throw new Error(started.reason)
  const id = /\/test-payment\/(ps-[0-9a-f]{24})/.exec(started.url)![1]
  await completeFakeSession(id)
  return { order, id }
}

const lines = () =>
  info.mock.calls.map((call) => JSON.parse(String(call[0])) as unknown)

describe("POST /api/webhooks/xendit", () => {
  it("marks the order Paid and answers 200 with no body (H1)", async () => {
    const { order, id } = await paidSession()
    const response = await post(completed(id))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("")
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toMatchObject({ status: "PAID", paymentMethod: "FAKE" })
    expect(await db.paymentEvent.count()).toBe(1)
    expect(lines()).toContainEqual({
      event: "payment.webhook",
      outcome: "paid",
      type: "payment_session.completed",
      sessionId: id,
      orderNumber: order.orderNumber,
    })
  })

  it.each([
    ["a wrong token", "nope"],
    ["no token", null],
  ])("answers 401 to %s and changes nothing (H16)", async (_, token) => {
    const { order, id } = await paidSession()
    // The fake gateway reads its sessions from this table
    const getSession = vi.spyOn(db.fakeGatewaySession, "findUnique")

    const response = await post(completed(id), token)

    expect(response.status).toBe(401)
    expect(getSession).not.toHaveBeenCalled()
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await db.paymentEvent.count()).toBe(0)
  })

  it("logs an unknown session and writes nothing (H7, L3)", async () => {
    const id = "ps-ffffffffffffffffffffffff"
    const response = await post(completed(id))
    expect(response.status).toBe(200)
    expect(await db.paymentEvent.count()).toBe(0)
    expect(lines()).toEqual([
      {
        event: "payment.webhook",
        outcome: "ignored-unknown",
        type: "payment_session.completed",
        sessionId: id,
      },
    ])
  })

  it("logs another environment's session and writes nothing (H8, L5)", async () => {
    const { order, id } = await paidSession()
    await db.fakeGatewaySession.update({
      where: { id },
      data: {
        metadata: {
          order_id: order.id,
          order_number: order.orderNumber,
          environment: "production",
        },
      },
    })
    const response = await post(completed(id))
    expect(response.status).toBe(200)
    expect(await db.paymentEvent.count()).toBe(0)
    expect(lines()).toEqual([
      {
        event: "payment.webhook",
        outcome: "ignored-environment",
        type: "payment_session.completed",
        sessionId: id,
        code: "production",
      },
    ])
  })

  it("refuses a body announced as over 64 KB without reading it", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/webhooks/xendit", {
        method: "POST",
        headers: {
          "x-callback-token": WEBHOOK_TOKEN,
          "content-length": "70000",
        },
        body: "{}",
      })
    )
    expect(response.status).toBe(413)
  })
})
