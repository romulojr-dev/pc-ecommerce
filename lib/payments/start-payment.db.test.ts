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
import { guardTransactions } from "@/test-support/release"

import {
  completeFakeSession,
  expireFakeSession,
  type FakeOptions,
  fakeGateway,
  readFakeSession,
} from "./fake"
import type { PaymentGateway } from "./gateway-types"
import { reconcileSession } from "./reconcile"
import { startPayment, type StartOptions } from "./start-payment"

// Starting a payment (docs/specs/031-pay-with-xendit, Behavior 13–14; docs/
// specs/034-start-payment-outside-transaction, B1–B18), against the fake
// gateway in the test database. Every gateway goes through guardTransactions,
// so a gateway call inside a transaction fails the test.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = "T".repeat(43)
const NOW = new Date("2026-11-01T08:00:00Z")
const EXPIRES = new Date("2026-11-02T07:00:00Z")
const SITE = "http://localhost:3000"

const fake = (extra: FakeOptions = {}) =>
  fakeGateway({ now: () => NOW, ...extra })

const options = (extra: StartOptions = {}): StartOptions => ({
  now: NOW,
  siteUrl: SITE,
  environment: "development",
  ...extra,
  gateway: guardTransactions(extra.gateway ?? fake()),
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
  db.payment.findMany({ where: { orderId }, orderBy: { referenceId: "asc" } })

const statuses = async (orderId: string) =>
  (await payments(orderId)).map(({ referenceId, status }) => [
    referenceId.split("-").at(-1),
    status,
  ])

// The session id from a fake payment URL
const sessionOf = (url: string) =>
  /\/test-payment\/(ps-[0-9a-f]{24})\?/.exec(url)![1]

async function started(orderId: string, extra: StartOptions = {}) {
  const result = await startPayment(orderId, TOKEN, options(extra))
  if (!result.ok) throw new Error(`not started: ${result.reason}`)
  return sessionOf(result.url)
}

// Ages are on the database clock (spec 034, D4); the column has no zone
const backdate = (paymentId: string, seconds: number) =>
  db.$executeRaw`
    UPDATE "Payment"
    SET "createdAt" = (now() AT TIME ZONE 'UTC') - make_interval(secs => ${seconds})
    WHERE "id" = ${paymentId}`

// An attempt a start recorded and never settled
async function openingAttempt(
  order: { id: string; orderNumber: string },
  secondsAgo: number
) {
  const row = await db.payment.create({
    data: {
      orderId: order.id,
      provider: "FAKE",
      status: "OPENING",
      referenceId: `${order.orderNumber}-1`,
      amount: 2_311_000,
      expiresAt: EXPIRES,
    },
  })
  await backdate(row.id, secondsAgo)
  return row
}

// A session the gateway made for the order that no Payment row holds: what a
// crash or a lost create answer leaves behind
async function orphanSession(
  order: { id: string; orderNumber: string },
  attempt: number
) {
  const id = sessionId()
  await db.fakeGatewaySession.create({
    data: {
      id,
      status: "ACTIVE",
      amount: 2_311_000,
      currency: "PHP",
      referenceId: `${order.orderNumber}-${attempt}`,
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber,
        environment: "development",
      },
      expiresAt: EXPIRES,
    },
  })
  return id
}

const reconcile = (id: string) =>
  reconcileSession(id, {
    gateway: fake(),
    now: NOW,
    environment: "development",
  })

// A promise the test resolves, with a flag for "something is waiting on it"
function gate() {
  let open!: () => void
  let reached!: () => void
  const promise = new Promise<void>((resolve) => (open = resolve))
  const waiting = new Promise<void>((resolve) => (reached = resolve))
  return {
    hold: () => {
      reached()
      return promise
    },
    waiting,
    open: () => open(),
  }
}

const quietLogs = () => {
  const lines: unknown[][] = []
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args) => {
      lines.push(args)
    })
  }
  return lines
}

describe("the first session (B1)", () => {
  it("claims, then attaches a pending Payment, in two transactions", async () => {
    const order = await newOrder()
    const result = await startPayment(order.id, TOKEN, options())

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url).toMatch(
      new RegExp(`^/test-payment/ps-[0-9a-f]{24}\\?key=${TOKEN}$`)
    )
    expect(vi.mocked(db.$transaction).mock.calls.length).toBe(2)
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
    const session = await readFakeSession(sessionOf(result.url), NOW)
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
  it("closes the open session and opens a new one (B2)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const second = await started(order.id)

    expect(second).not.toBe(first)
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "PENDING"],
    ])
    expect((await readFakeSession(first, NOW))?.status).toBe("closed")
    expect((await readFakeSession(second, NOW))?.status).toBe("active")
  })

  it("opens one session from two clicks at once; the other waits (B3, B3a)", async () => {
    const order = await newOrder()
    await started(order.id)
    // The create waits until the other click has answered, so it surely
    // meets the opening attempt
    const create = gate()
    const gw = fake({ holdCreate: create.hold })
    const click = () =>
      startPayment(order.id, TOKEN, options({ gateway: gw })).then((r) => {
        if (!r.ok && r.reason === "opening") create.open()
        return r
      })

    const results = await Promise.all([click(), click()])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "opening" },
    ])
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "PENDING"],
    ])
    expect(await db.fakeGatewaySession.count()).toBe(2)

    // B3a: the waiting page asks again and gets its own session
    const third = await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "EXPIRED"],
      ["3", "PENDING"],
    ])
    expect((await readFakeSession(third, NOW))?.status).toBe("active")
  })

  it("stops when the open session was already paid (B4)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    await completeFakeSession(first, NOW)

    expect(await startPayment(order.id, TOKEN, options())).toEqual({
      ok: false,
      reason: "confirming",
    })
    const rows = await payments(order.id)
    expect(
      rows.map(({ status, providerRef }) => [status, providerRef])
    ).toEqual([
      ["PENDING", first],
      ["FAILED", null],
    ])
    expect(await db.fakeGatewaySession.count()).toBe(1)
  })

  it("replaces a session that expired at the gateway (B5)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    await expireFakeSession(first, NOW)

    await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "PENDING"],
    ])
  })

  it("keeps the old session open and fails the attempt when the close fails (B6)", async () => {
    quietLogs()
    const order = await newOrder()
    const first = await started(order.id)

    expect(
      await startPayment(
        order.id,
        TOKEN,
        options({ gateway: fake({ fail: { close: true } }) })
      )
    ).toEqual({ ok: false, reason: "error" })
    expect(await statuses(order.id)).toEqual([
      ["1", "PENDING"],
      ["2", "FAILED"],
    ])
    expect((await readFakeSession(first, NOW))?.status).toBe("active")
    expect(await db.fakeGatewaySession.count()).toBe(1)

    // A later Retry works
    await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "FAILED"],
      ["3", "PENDING"],
    ])
  })

  it("keeps the closed session expired when the create fails (B7)", async () => {
    quietLogs()
    const order = await newOrder()
    await started(order.id)
    // The real fake closes; a wrapper refuses to create
    const failing: PaymentGateway = {
      ...fake(),
      createSession: fake({ fail: { create: true } }).createSession,
    }

    expect(
      await startPayment(order.id, TOKEN, options({ gateway: failing }))
    ).toEqual({ ok: false, reason: "error" })
    expect(await statuses(order.id)).toEqual([
      ["1", "EXPIRED"],
      ["2", "FAILED"],
    ])
    expect(await db.payment.count({ where: { status: "OPENING" } })).toBe(0)

    await started(order.id)
    expect((await statuses(order.id)).at(-1)).toEqual(["3", "PENDING"])
  })

  it("accepts the orphan a lost create answer leaves (B7a)", async () => {
    quietLogs()
    const order = await newOrder()

    expect(
      await startPayment(
        order.id,
        TOKEN,
        options({ gateway: fake({ fail: { createLost: true } }) })
      )
    ).toEqual({ ok: false, reason: "error" })
    const [failed] = await payments(order.id)
    expect(failed).toMatchObject({ status: "FAILED", providerRef: null })
    // Nothing can find it to close it
    const [orphan] = await db.fakeGatewaySession.findMany()
    expect(orphan.status).toBe("ACTIVE")

    const next = await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])
    expect(
      await db.fakeGatewaySession.count({ where: { status: "ACTIVE" } })
    ).toBe(2)

    // Paid anyway: the webhook records it through the orphan path
    await completeFakeSession(orphan.id, NOW)
    expect((await reconcile(orphan.id)).outcome).toBe("paid")
    expect(
      await db.payment.findFirst({ where: { providerRef: orphan.id } })
    ).toMatchObject({ status: "PAID" })
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status
    ).toBe("PAID")
    expect((await readFakeSession(next, NOW))?.status).toBe("closed")
  })

  it("lets the next Pay now open a session at once after a failed create (B8)", async () => {
    quietLogs()
    const order = await newOrder()
    expect(
      await startPayment(
        order.id,
        TOKEN,
        options({ gateway: fake({ fail: { create: true } }) })
      )
    ).toEqual({ ok: false, reason: "error" })

    await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])
  })
})

describe("a slow gateway (B9, B9a)", () => {
  it("leaves the order free to lock while the create waits (B9)", async () => {
    const order = await newOrder()
    await started(order.id)
    const create = gate()
    const start = startPayment(
      order.id,
      TOKEN,
      options({ gateway: fake({ holdCreate: create.hold }) })
    )
    await create.waiting

    const locked = await db.$transaction(
      (tx) => tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE NOWAIT`
    )
    expect(locked).toEqual([{ id: order.id }])

    create.open()
    expect((await start).ok).toBe(true)
    expect((await statuses(order.id)).at(-1)).toEqual(["2", "PENDING"])
  })

  it("lets a webhook pay the order meanwhile; the attach then backs off (B9a)", async () => {
    quietLogs()
    const order = await newOrder()
    const orphan = await orphanSession(order, 0)
    const create = gate()
    const start = startPayment(
      order.id,
      TOKEN,
      options({ gateway: fake({ holdCreate: create.hold }) })
    )
    await create.waiting

    await completeFakeSession(orphan, NOW)
    expect((await reconcile(orphan)).outcome).toBe("paid")

    create.open()
    expect(await start).toEqual({ ok: false, reason: "not-pending" })
    const attempt = await db.payment.findFirstOrThrow({
      where: { orderId: order.id, referenceId: `${order.orderNumber}-1` },
    })
    expect(attempt).toMatchObject({ status: "FAILED", providerRef: null })
    const made = await db.fakeGatewaySession.findFirstOrThrow({
      where: { referenceId: `${order.orderNumber}-1` },
    })
    expect(made.status).toBe("CANCELED")
  })
})

describe("an attempt left opening (B10–B12, B14)", () => {
  it("answers opening while it is fresh (B10)", async () => {
    const order = await newOrder()
    await openingAttempt(order, 30)
    const gw = fake()
    const create = vi.spyOn(gw, "createSession")

    expect(
      await startPayment(order.id, TOKEN, options({ gateway: gw }))
    ).toEqual({ ok: false, reason: "opening" })
    expect(await statuses(order.id)).toEqual([["1", "OPENING"]])
    expect(create).not.toHaveBeenCalled()
  })

  it("takes it over once it is 60 s old (B11)", async () => {
    const order = await newOrder()
    await openingAttempt(order, 60)

    await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])
    expect(await db.fakeGatewaySession.count()).toBe(1)
  })

  it("judges the age on the database clock, not the server's (B11a)", async () => {
    const order = await newOrder()
    await openingAttempt(order, 30)
    const now = new Date(NOW.getTime() + 3_600_000)

    expect(await startPayment(order.id, TOKEN, options({ now }))).toEqual({
      ok: false,
      reason: "opening",
    })
  })

  it("leaves the orphan of a crash to the webhook (B12)", async () => {
    const order = await newOrder()
    await openingAttempt(order, 60)
    const orphan = await orphanSession(order, 1)

    const next = await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])

    await completeFakeSession(orphan, NOW)
    expect((await reconcile(orphan)).outcome).toBe("paid")
    const paid = await db.payment.findFirstOrThrow({
      where: { providerRef: orphan },
    })
    expect(paid.status).toBe("PAID")
    expect(
      (await db.payment.findFirstOrThrow({ where: { providerRef: next } }))
        .status
    ).toBe("EXPIRED")
    expect((await readFakeSession(next, NOW))?.status).toBe("closed")
  })

  it("never brings back an attempt another start took over (B14)", async () => {
    quietLogs()
    const order = await newOrder()
    const paused = gate()
    const first = startPayment(
      order.id,
      TOKEN,
      options({
        afterStep: async (step) => {
          if (step === "create") await paused.hold()
        },
      })
    )
    await paused.waiting
    const [mine] = await payments(order.id)
    await backdate(mine.id, 61)

    const second = await started(order.id)
    paused.open()

    expect(await first).toEqual({ ok: false, reason: "error" })
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])
    const sessions = await db.fakeGatewaySession.findMany({
      orderBy: { referenceId: "asc" },
    })
    expect(sessions.map(({ status }) => status)).toEqual(["CANCELED", "ACTIVE"])
    expect(sessions[1].id).toBe(second)
  })
})

describe("the attach fails after the gateway made a session (B13)", () => {
  it("fails the attempt, closes the orphan and logs only its id (B13)", async () => {
    const lines = quietLogs()
    const order = await newOrder()
    let calls = 0

    const result = await startPayment(
      order.id,
      TOKEN,
      options({
        afterStep: (step) => {
          if (step === "attach" && ++calls === 1) {
            throw new Error(`boom ${TOKEN}`)
          }
        },
      })
    )

    expect(result).toEqual({ ok: false, reason: "error" })
    expect(await statuses(order.id)).toEqual([["1", "FAILED"]])
    const [orphan] = await db.fakeGatewaySession.findMany()
    expect(orphan).toMatchObject({
      status: "CANCELED",
      metadata: { order_id: order.id },
    })
    expect(lines.flat().join("\n")).toContain(
      `payment.session_orphaned: FAKE ${orphan.id}`
    )
    expect(JSON.stringify(lines)).not.toContain(TOKEN)
  })

  it("leaves the attempt opening when the second try fails too (B13a)", async () => {
    quietLogs()
    const order = await newOrder()

    expect(
      await startPayment(
        order.id,
        TOKEN,
        options({
          afterStep: (step) => {
            if (step === "attach") throw new Error("boom")
          },
        })
      )
    ).toEqual({ ok: false, reason: "error" })
    const [attempt] = await payments(order.id)
    expect(attempt.status).toBe("OPENING")
    expect((await db.fakeGatewaySession.findFirstOrThrow()).status).toBe(
      "CANCELED"
    )

    // A minute later it is abandoned and Pay now works
    await backdate(attempt.id, 60)
    await started(order.id)
    expect(await statuses(order.id)).toEqual([
      ["1", "FAILED"],
      ["2", "PENDING"],
    ])
  })
})

describe("orders that can't be paid", () => {
  it.each(["CANCELLED", "PAID"] as const)(
    "refuses a %s order with no gateway call (B15)",
    async (status) => {
      const order = await newOrder(
        status === "CANCELLED"
          ? { status, cancelledAt: EXPIRES, cancelReason: "EXPIRED" }
          : { status }
      )
      const gw = fake()
      const create = vi.spyOn(gw, "createSession")
      expect(
        await startPayment(order.id, TOKEN, options({ gateway: gw }))
      ).toEqual({ ok: false, reason: "not-pending" })
      expect(create).not.toHaveBeenCalled()
      expect(await db.payment.count()).toBe(0)
    }
  )

  it("opens no session with 9 minutes left (B16)", async () => {
    const order = await newOrder()
    const now = new Date(EXPIRES.getTime() - 9 * 60_000)
    expect(await startPayment(order.id, TOKEN, options({ now }))).toEqual({
      ok: false,
      reason: "expired",
    })
    expect(await db.payment.count()).toBe(0)
    expect(await db.fakeGatewaySession.count()).toBe(0)
  })

  // docs/specs/033-release-unpaid-orders, P1 and P2: Pay now from a page
  // opened before the deadline
  it.each([
    ["past expiresAt, not released yet (P1)", {}, "expired"],
    [
      "cancelled by the release (P2)",
      { status: "CANCELLED", cancelledAt: EXPIRES, cancelReason: "EXPIRED" },
      "not-pending",
    ],
  ] as const)(
    "refuses an order %s with no gateway call",
    async (_, overrides, reason) => {
      const order = await newOrder(overrides)
      const gw = fake()
      const close = vi.spyOn(gw, "closeSession")
      const create = vi.spyOn(gw, "createSession")
      const now = new Date(EXPIRES.getTime() + 1_000)

      expect(
        await startPayment(order.id, TOKEN, options({ now, gateway: gw }))
      ).toEqual({ ok: false, reason })
      expect(close).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
      expect(await db.payment.count()).toBe(0)
    }
  )

  it("leaves an open session alone with 9 minutes left (B16)", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const now = new Date(EXPIRES.getTime() - 9 * 60_000)

    expect(await startPayment(order.id, TOKEN, options({ now }))).toEqual({
      ok: false,
      reason: "expired",
    })
    expect(await statuses(order.id)).toEqual([["1", "PENDING"]])
    expect((await readFakeSession(first, now))?.status).toBe("active")
  })

  it("answers not-found for an unknown order", async () => {
    expect(await startPayment("nope", TOKEN, options())).toEqual({
      ok: false,
      reason: "not-found",
    })
  })
})

// docs/specs/032-payment-webhooks, S9
describe("a payment that needs checking (B18)", () => {
  it("refuses Pay now with no gateway call and nothing written", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await db.payment.updateMany({
      where: { providerRef: id },
      data: {
        status: "PAID",
        paidAt: NOW,
        problem: "AMOUNT_MISMATCH",
        receivedAmount: 2_310_000,
      },
    })
    const gw = fake()
    const create = vi.spyOn(gw, "createSession")
    const close = vi.spyOn(gw, "closeSession")

    expect(
      await startPayment(order.id, TOKEN, options({ gateway: gw }))
    ).toEqual({ ok: false, reason: "needs-check" })
    expect(create).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(await payments(order.id)).toHaveLength(1)
  })
})

describe("the transaction guard itself", () => {
  it("fails a gateway call made inside a transaction", async () => {
    const gw = guardTransactions(fake())
    await expect(
      db.$transaction(() => gw.closeSession(sessionId()))
    ).rejects.toThrow("closeSession called inside a transaction")
    // Outside one it reaches the fake, which doesn't know the session
    await expect(gw.closeSession(sessionId())).resolves.toEqual({
      ok: false,
      code: "not-found",
    })
  })
})
