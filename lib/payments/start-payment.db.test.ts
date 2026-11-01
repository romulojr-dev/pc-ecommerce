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

import {
  completeFakeSession,
  expireFakeSession,
  fakeGateway,
  readFakeSession,
} from "./fake"
import { startPayment, type StartOptions } from "./start-payment"

// Starting a payment (docs/specs/031-pay-with-xendit, Behavior 13–14):
// A1–A9a, A11, against the fake gateway in the test database

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = "T".repeat(43)
const NOW = new Date("2026-11-01T07:00:00Z")
const EXPIRES = new Date("2026-11-02T07:00:00Z")
const SITE = "http://localhost:3000"

const options = (extra: StartOptions = {}): StartOptions => ({
  now: NOW,
  gateway: fakeGateway({ now: () => NOW }),
  siteUrl: SITE,
  environment: "development",
  ...extra,
})

async function newOrder(overrides: Parameters<typeof orderData>[0] = {}) {
  return db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      expiresAt: EXPIRES,
      ...overrides,
    }),
  })
}

const payments = (orderId: string) =>
  db.payment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } })

// The session id from a fake payment URL
const sessionOf = (url: string) =>
  /\/test-payment\/(ps-[0-9a-f]{24})\?/.exec(url)![1]

async function started(orderId: string, extra: StartOptions = {}) {
  const result = await startPayment(orderId, TOKEN, options(extra))
  if (!result.ok) throw new Error(`not started: ${result.reason}`)
  return sessionOf(result.url)
}

describe("the first session (A1)", () => {
  it("opens a session and records a pending Payment", async () => {
    const order = await newOrder()
    const result = await startPayment(order.id, TOKEN, options())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url).toMatch(
      new RegExp(`^/test-payment/ps-[0-9a-f]{24}\\?key=${TOKEN}$`)
    )
    const [payment] = await payments(order.id)
    expect(payment).toMatchObject({
      provider: "FAKE",
      providerRef: sessionOf(result.url),
      referenceId: `${order.orderNumber}-1`,
      amount: 2_311_000,
      currency: "PHP",
      status: "PENDING",
      expiresAt: EXPIRES,
      method: null,
    })
    const session = await readFakeSession(payment.providerRef, NOW)
    expect(session).toMatchObject({
      status: "active",
      amountCentavos: 2_311_000,
      referenceId: `${order.orderNumber}-1`,
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber,
        environment: "development",
      },
    })
  })
})

describe("retrying", () => {
  it("closes the open session and opens a new one (A2)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const second = await started(order.id)

    expect(second).not.toBe(first)
    const [a, b] = await payments(order.id)
    expect(a).toMatchObject({ providerRef: first, status: "EXPIRED" })
    expect(b).toMatchObject({
      providerRef: second,
      status: "PENDING",
      referenceId: `${order.orderNumber}-2`,
    })
    expect((await readFakeSession(first, NOW))?.status).toBe("closed")
    expect((await readFakeSession(second, NOW))?.status).toBe("active")
  })

  it("makes one open session from two clicks at once (A3)", async () => {
    const order = await newOrder()
    await started(order.id)
    const results = await Promise.all([
      startPayment(order.id, TOKEN, options()),
      startPayment(order.id, TOKEN, options()),
    ])

    expect(results.every((r) => r.ok)).toBe(true)
    const rows = await payments(order.id)
    expect(rows).toHaveLength(3)
    expect(rows.filter((p) => p.status === "PENDING")).toHaveLength(1)
    expect(rows.map((p) => p.referenceId).sort()).toEqual([
      `${order.orderNumber}-1`,
      `${order.orderNumber}-2`,
      `${order.orderNumber}-3`,
    ])
    // Only the open Payment's session is still active at the gateway
    for (const row of rows) {
      expect((await readFakeSession(row.providerRef, NOW))?.status).toBe(
        row.status === "PENDING" ? "active" : "closed"
      )
    }
  })

  it("stops when the open session was already paid (A4)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    await completeFakeSession(first, NOW)

    expect(await startPayment(order.id, TOKEN, options())).toEqual({
      ok: false,
      reason: "confirming",
    })
    const rows = await payments(order.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("PENDING")
    expect(await db.fakeGatewaySession.count()).toBe(1)
  })

  it("replaces a session that expired at the gateway (A5)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    await expireFakeSession(first, NOW)

    await started(order.id)
    const [a, b] = await payments(order.id)
    expect(a.status).toBe("EXPIRED")
    expect(b.status).toBe("PENDING")
  })

  it("writes nothing when the close fails (A6)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const order = await newOrder()
    const first = await started(order.id)

    expect(
      await startPayment(
        order.id,
        TOKEN,
        options({ gateway: fakeGateway({ fail: { close: true } }) })
      )
    ).toEqual({ ok: false, reason: "error" })
    const rows = await payments(order.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("PENDING")
    expect((await readFakeSession(first, NOW))?.status).toBe("active")
  })

  it("keeps the closed session expired when the create fails (A7)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const order = await newOrder()
    await started(order.id)
    // The real fake closes; a wrapper refuses to create
    const real = fakeGateway({ now: () => NOW })
    const failing = {
      ...real,
      createSession: fakeGateway({ fail: { create: true } }).createSession,
    }

    expect(
      await startPayment(order.id, TOKEN, options({ gateway: failing }))
    ).toEqual({ ok: false, reason: "error" })
    const rows = await payments(order.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("EXPIRED")

    // A later retry opens a session
    await started(order.id)
    expect((await payments(order.id)).map((p) => p.status)).toEqual([
      "EXPIRED",
      "PENDING",
    ])
  })
})

describe("orders that can't be paid", () => {
  it.each(["CANCELLED", "PAID"] as const)(
    "refuses a %s order (A8)",
    async (status) => {
      const order = await newOrder({ status })
      expect(await startPayment(order.id, TOKEN, options())).toEqual({
        ok: false,
        reason: "not-pending",
      })
      expect(await db.payment.count()).toBe(0)
    }
  )

  it("opens no session with 9 minutes left (A9)", async () => {
    const order = await newOrder()
    const now = new Date(EXPIRES.getTime() - 9 * 60_000)
    expect(await startPayment(order.id, TOKEN, options({ now }))).toEqual({
      ok: false,
      reason: "expired",
    })
    expect(await db.payment.count()).toBe(0)
    expect(await db.fakeGatewaySession.count()).toBe(0)
  })

  it("leaves an open session alone with 9 minutes left (A9a)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const now = new Date(EXPIRES.getTime() - 9 * 60_000)

    expect(await startPayment(order.id, TOKEN, options({ now }))).toEqual({
      ok: false,
      reason: "expired",
    })
    expect((await payments(order.id))[0].status).toBe("PENDING")
    expect((await readFakeSession(first, now))?.status).toBe("active")
  })

  it("answers not-found for an unknown order", async () => {
    expect(await startPayment("nope", TOKEN, options())).toEqual({
      ok: false,
      reason: "not-found",
    })
  })
})

describe("a failure after the gateway made a session (A11)", () => {
  it("rolls back, keeps the orphan, and logs only its id", async () => {
    const lines: unknown[][] = []
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        lines.push(args)
      })
    }
    const order = await newOrder()

    const result = await startPayment(
      order.id,
      TOKEN,
      options({
        afterStep: (step) => {
          if (step === "create") throw new Error(`boom ${TOKEN}`)
        },
      })
    )

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(await db.payment.count()).toBe(0)
    const [orphan] = await db.fakeGatewaySession.findMany()
    expect(orphan).toMatchObject({
      status: "ACTIVE",
      metadata: { order_id: order.id },
    })
    expect(lines.flat().join("\n")).toContain(
      `payment.session_orphaned: FAKE ${orphan.id}`
    )
    expect(JSON.stringify(lines)).not.toContain(TOKEN)
  })
})
