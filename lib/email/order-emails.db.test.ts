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
import { credentialFromParams } from "@/lib/orders/credential"
import { findOrderByCredential } from "@/lib/orders/get-order"
import { hashToken } from "@/lib/orders/secrets"
import {
  checkExpiredOrders,
  releaseExpiredOrders,
  sweepExpiredOrders,
} from "@/lib/orders/release"
import { runReleaseCron } from "@/lib/orders/release-cron"
import {
  completeFakeSession,
  expireFakeSession,
  fakeGateway,
} from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import { reconcileSession } from "@/lib/payments/reconcile"
import { startPayment } from "@/lib/payments/start-payment"
import { buildA, seed } from "@/test-support/seed-parts"
import { insertParts, partsOfBuild } from "@/test-support/build-fixtures"
import { consoleOutput } from "@/test-support/email"
import { db, FIXTURE_TODAY, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
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
} from "@/test-support/release"

import { fakeTransport } from "./fake"
import { sendPending } from "./send"

// docs/specs/036-order-emails: Q4–Q14 (the writers that enqueue; Q1–Q3 are in
// lib/orders/place-order.db.test.ts) and S1–S6 (the real templates through
// the sender), against the test database with the fake gateway and the fake
// email transport. P1 is two Ryzen 5 7600 for Ana Santos, due at EXPIRES.

const revalidateTag = vi.hoisted(() => vi.fn())
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag,
}))

beforeEach(async () => {
  revalidateTag.mockReset()
  await resetCatalog()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = "T".repeat(43)
const NOW = new Date("2026-11-01T07:05:00Z")
const DUE = EXPIRES
// Xendit lagging: the session still reads active when the release closes it
const lagging = () => fakeGateway({ now: () => PLACED })
const gw = fakeGateway({ now: () => NOW })

const outbox = () => db.emailOutbox.findMany({ orderBy: { createdAt: "asc" } })
const typesOf = async () => (await outbox()).map((row) => row.type)
const fakeEmails = () =>
  db.fakeEmail.findMany({ orderBy: { createdAt: "asc" } })
const orderOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })

// ----- reconcile: Q4–Q9 -------------------------------------------------

const reconcileOptions = {
  gateway: gw,
  environment: "development" as const,
  now: NOW,
}

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

async function paidSession() {
  const order = await newOrder()
  const id = await started(order.id)
  await completeFakeSession(id, NOW)
  return { order, id }
}

describe("Payment received is enqueued when the order becomes Paid", () => {
  it("Q4: one row, in the transaction that sets Paid", async () => {
    const { order, id } = await paidSession()

    await reconcileSession(id, {
      ...reconcileOptions,
      event: eventOf("completed", id),
    })

    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
    expect(await outbox()).toEqual([
      expect.objectContaining({
        orderId: order.id,
        type: "PAYMENT_RECEIVED",
        status: "PENDING",
      }),
    ])
  })

  it("Q5: a webhook replay, a reconcile and the status poll add no second row", async () => {
    const { id } = await paidSession()
    const event = eventOf("completed", id)

    await reconcileSession(id, { ...reconcileOptions, event })
    await reconcileSession(id, { ...reconcileOptions, event })
    await reconcileSession(id, reconcileOptions)
    await Promise.all([
      reconcileSession(id, { ...reconcileOptions, event }),
      reconcileSession(id, reconcileOptions),
    ])

    expect(await typesOf()).toEqual(["PAYMENT_RECEIVED"])
  })

  it.each([
    ["amount", { amount: 2_310_000 }],
    ["currency", { currency: "USD" }],
  ])("Q6: a %s mismatch sends nothing", async (_, change) => {
    const { order, id } = await paidSession()
    await db.fakeGatewaySession.update({ where: { id }, data: change })

    expect(
      await reconcileSession(id, {
        ...reconcileOptions,
        event: eventOf("completed", id),
      })
    ).toMatchObject({ outcome: "mismatch" })
    expect(await orderOf(order.id)).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await outbox()).toEqual([])
  })

  it("Q7: a late payment adds no payment email and leaves the cancelled one", async () => {
    const { order, id } = await paidSession()
    await db.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", cancelledAt: NOW, cancelReason: "EXPIRED" },
    })
    await db.payment.updateMany({ data: { status: "EXPIRED" } })
    await db.emailOutbox.create({
      data: {
        orderId: order.id,
        type: "ORDER_CANCELLED",
        recipientHash: "a".repeat(64),
      },
    })

    expect(
      await reconcileSession(id, {
        ...reconcileOptions,
        event: eventOf("completed", id),
      })
    ).toMatchObject({ outcome: "late" })
    expect(await orderOf(order.id)).toMatchObject({ refundRequired: true })
    expect(await typesOf()).toEqual(["ORDER_CANCELLED"])
  })

  it("Q8: a second payment adds no row", async () => {
    const order = await newOrder()
    const first = await started(order.id)
    const second = await started(order.id)
    await forceCompleted(first)
    await reconcileSession(first, {
      ...reconcileOptions,
      event: eventOf("completed", first),
    })
    expect(await typesOf()).toEqual(["PAYMENT_RECEIVED"])

    await forceCompleted(second)
    expect(
      await reconcileSession(second, {
        ...reconcileOptions,
        event: eventOf("completed", second),
      })
    ).toMatchObject({ outcome: "second" })
    expect(await typesOf()).toEqual(["PAYMENT_RECEIVED"])
  })

  it("Q9: an expired session adds no row", async () => {
    const order = await newOrder()
    const id = await started(order.id)
    await expireFakeSession(id, NOW)

    expect(
      await reconcileSession(id, {
        ...reconcileOptions,
        event: eventOf("expired", id),
      })
    ).toMatchObject({ outcome: "expired" })
    expect(await outbox()).toEqual([])
  })
})

// ----- release: Q10–Q14 -------------------------------------------------

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

// P1 as release leaves it ready: two Ryzens held, a session opened
async function dueP1(withSession = true) {
  const { ryzen, kingston } = await parts()
  const order = await heldOrder([{ productId: ryzen, quantity: 2 }], {
    orderNumber: "PCS-7KQ2M9XD",
    accessTokenHash: releaseTokenHash(),
  })
  const session = withSession ? await openSession(order.id) : null
  return { order, session, ryzen, kingston }
}

const sweep = (gateway: PaymentGateway = lagging()) =>
  sweepExpiredOrders(DUE, { gateway, environment: "development" })

describe("Order cancelled is enqueued when the release cancels an order", () => {
  it("Q10: one row per cancelled order, and a second run adds none", async () => {
    const { order } = await dueP1()

    expect(await sweep()).toMatchObject({ released: 1 })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await outbox()).toEqual([
      expect.objectContaining({
        orderId: order.id,
        type: "ORDER_CANCELLED",
        status: "PENDING",
      }),
    ])

    expect(await sweep()).toMatchObject({ released: 0 })
    expect(await typesOf()).toEqual(["ORDER_CANCELLED"])
  })

  it("Q11: an order the release skips gets no row", async () => {
    const { order: one, kingston } = await dueP1(false)
    const two = await heldOrder([{ productId: kingston, quantity: 1 }], {
      accessTokenHash: releaseTokenHash("U".repeat(43)),
    })
    await db.payment.create({
      data: paymentData(two.id, {
        status: "PAID",
        paidAt: PLACED,
        problem: "AMOUNT_MISMATCH",
        receivedAmount: 2_310_000,
      }),
    })

    expect(await sweep()).toMatchObject({ released: 1 })

    const rows = await outbox()
    expect(rows).toHaveLength(1)
    expect(rows[0].orderId).toBe(one.id)
    expect(await orderOf(two.id)).toMatchObject({ status: "PENDING_PAYMENT" })
  })

  it("Q12: a missed payment makes the order Paid and sends the payment email only", async () => {
    const { order, session } = await dueP1()
    await completeFakeSession(session!, PLACED)

    expect(await sweep()).toMatchObject({ released: 0, skipped: 1 })

    expect(await orderOf(order.id)).toMatchObject({ status: "PAID" })
    expect(await typesOf()).toEqual(["PAYMENT_RECEIVED"])
  })

  it("Q13: a release in a transaction that rolls back leaves no row", async () => {
    const { order } = await dueP1()
    const check = await checkExpiredOrders({
      now: DUE,
      limit: 25,
      gateway: lagging(),
      environment: "development",
    })

    await expect(
      db.$transaction(async (tx) => {
        const result = await releaseExpiredOrders(tx, {
          now: DUE,
          orderIds: check.cleared.map(({ id }) => id),
        })
        expect(result.emails).toHaveLength(1)
        throw new Error("the purchase failed after the release")
      })
    ).rejects.toThrow("the purchase failed")

    expect(await orderOf(order.id)).toMatchObject({ status: "PENDING_PAYMENT" })
    expect(await outbox()).toEqual([])
  })

  it("Q13a: a purchase that commits its release leaves the row", async () => {
    const ids = await insertParts(partsOfBuild(buildA()), {
      [seed.ryzen5_7600.id]: { stock: 2 },
    })
    const ryzen = ids.get(seed.ryzen5_7600.id)!
    const p1 = await heldOrder([{ productId: ryzen, quantity: 2 }], {
      accessTokenHash: releaseTokenHash(),
    })
    await openSession(p1.id)

    const { result } = await addToCart(
      { productId: ryzen, quantity: 1 },
      { cartId: null, today: FIXTURE_TODAY, now: DUE, gateway: lagging() }
    )

    expect(result).toMatchObject({ ok: true })
    expect(await orderOf(p1.id)).toMatchObject({ status: "CANCELLED" })
    expect(await typesOf()).toEqual(["ORDER_CANCELLED"])
  })

  it("Q14: the cron releases, then sends the email in the same run", async () => {
    const { order } = await dueP1()

    const answer = await runReleaseCron("Bearer cron-secret-0123456789", {
      secret: "cron-secret-0123456789",
      now: DUE,
      gateway: lagging(),
      environment: "development",
    })

    expect(answer).toMatchObject({ status: 200, body: { released: 1 } })
    expect(await orderOf(order.id)).toMatchObject({ status: "CANCELLED" })
    expect(await outbox()).toEqual([
      expect.objectContaining({ type: "ORDER_CANCELLED", status: "SENT" }),
    ])
    expect(await fakeEmails()).toHaveLength(1)
  })
})

// ----- the real templates through the sender: S1–S6 ----------------------

// The first link to an order in an email's text
function orderLinkIn(text: string) {
  const link = /https?:\/\/\S+\/orders\/\S+/.exec(text)?.[0]
  if (!link) throw new Error("no order link in the email")
  const url = new URL(link)
  return {
    number: url.pathname.split("/").pop()!,
    credential: credentialFromParams({
      sig: url.searchParams.get("sig"),
      exp: url.searchParams.get("exp"),
      p: url.searchParams.get("p"),
    }),
  }
}

const send = (now = NOW, transport = guardEmailTransport(fakeTransport())) =>
  sendPending({ now, transport })

// Enqueues a row as the writers do, in a transaction
const enqueue = (
  orderId: string,
  type: "ORDER_PLACED" | "PAYMENT_RECEIVED" | "ORDER_CANCELLED"
) =>
  db.emailOutbox.create({
    data: {
      orderId,
      type,
      recipientHash: "b".repeat(64),
      createdAt: PLACED,
    },
  })

describe("the emails as the sender builds them", () => {
  it("S1: Order placed reaches the shopper, and its link opens the order", async () => {
    const { order } = await dueP1()
    await enqueue(order.id, "ORDER_PLACED")

    expect(await send()).toMatchObject({ claimed: 1, sent: 1 })

    const [email] = await fakeEmails()
    expect(email).toMatchObject({
      to: "ana@example.com",
      subject: "[Demo] Order PCS-7KQ2M9XD placed",
    })
    expect(email.text).toContain("Pay now")
    expect(email.html).toContain(
      "This is a demo store in test mode. No real money was charged and nothing will ship."
    )
    const { number, credential } = orderLinkIn(email.text)
    expect(number).toBe("PCS-7KQ2M9XD")
    expect(await findOrderByCredential(number, credential, NOW)).toMatchObject({
      id: order.id,
    })
    expect(await outbox()).toEqual([
      expect.objectContaining({ status: "SENT", attempts: 1 }),
    ])
  })

  it("S2: Payment received follows, with the amount, and its link opens the order", async () => {
    const { order, session } = await dueP1()
    await completeFakeSession(session!, PLACED)
    await reconcileSession(session!, {
      ...reconcileOptions,
      event: eventOf("completed", session!),
    })

    await send()

    const [email] = await fakeEmails()
    expect(email.subject).toBe("[Demo] Payment received for order PCS-7KQ2M9XD")
    expect(email.text).toContain("Amount paid: ₱23,110.00")
    expect(email.text).toContain("with the test payment page.")
    const { number, credential } = orderLinkIn(email.text)
    expect(await findOrderByCredential(number, credential, NOW)).toMatchObject({
      id: order.id,
      status: "PAID",
    })
  })

  it("S3: Order cancelled carries the reason and no order link", async () => {
    await dueP1()
    await sweep()

    await send(DUE)

    const [email] = await fakeEmails()
    expect(email.subject).toBe("[Demo] Order PCS-7KQ2M9XD was cancelled")
    expect(email.text).toContain("because it wasn't paid in time")
    expect(email.text).not.toContain("/orders/")
    expect(email.html).not.toContain("/orders/")
  })

  it("S4: a failed send is retried once and arrives once", async () => {
    const { order } = await dueP1()
    await enqueue(order.id, "ORDER_PLACED")
    const real = fakeTransport()
    let calls = 0
    const transport = guardEmailTransport({
      async send(message) {
        calls++
        return calls === 1 ? { ok: false, code: "timeout" } : real.send(message)
      },
    })

    expect(await send(NOW, transport)).toMatchObject({ failed: 1 })
    expect(await fakeEmails()).toHaveLength(0)
    const later = new Date(NOW.getTime() + 5 * 60_000)
    expect(await send(later, transport)).toMatchObject({ sent: 1 })

    expect(calls).toBe(2)
    expect(await fakeEmails()).toHaveLength(1)
    expect(await outbox()).toEqual([
      expect.objectContaining({ status: "SENT", attempts: 2 }),
    ])
  })

  it("S5: no address, link, name or body is logged", async () => {
    const { order, session } = await dueP1()
    await enqueue(order.id, "ORDER_PLACED")
    await completeFakeSession(session!, PLACED)
    await reconcileSession(session!, {
      ...reconcileOptions,
      event: eventOf("completed", session!),
    })
    const other = await heldOrder(
      [{ productId: (await db.product.findFirstOrThrow()).id, quantity: 1 }],
      { accessTokenHash: releaseTokenHash("V".repeat(43)) }
    )
    await enqueue(other.id, "ORDER_CANCELLED")

    const lines = await consoleOutput(() => send())

    const logged = lines.join("\n")
    expect(logged).toContain("email.sent")
    for (const secret of [
      "ana@example.com",
      "Ana Santos",
      "sig=",
      "/orders/",
      "[Demo]",
      "demo store",
      TOKEN,
      "12 Mabini",
    ]) {
      expect(logged).not.toContain(secret)
    }
  })

  it("S6: a sixth email in a day to one shopper is skipped by the cap", async () => {
    const recipient = "b".repeat(64)
    for (let i = 0; i < 3; i++) {
      const order = await db.order.create({
        data: orderData({
          status: "PAID",
          paidAt: PLACED,
          paymentMethod: "GCASH",
        }),
      })
      for (const type of ["ORDER_PLACED", "PAYMENT_RECEIVED"] as const) {
        await db.emailOutbox.create({
          data: { orderId: order.id, type, recipientHash: recipient },
        })
      }
    }

    expect(await send()).toMatchObject({ sent: 5, skipped: 1 })

    const rows = await outbox()
    expect(rows.filter((row) => row.status === "SENT")).toHaveLength(5)
    expect(rows.filter((row) => row.status === "SKIPPED")).toHaveLength(1)
    expect((await orderOf(rows[0].orderId)).status).toBe("PAID")
  })

  it("T5: a placed email sent after the order was cancelled has no Pay now, and no call runs inside a transaction", async () => {
    const { order } = await dueP1()
    // Created an hour before it is sent: a row 24 h old is `too-old` (spec 035)
    await db.emailOutbox.create({
      data: {
        orderId: order.id,
        type: "ORDER_PLACED",
        recipientHash: "b".repeat(64),
        createdAt: new Date(DUE.getTime() - 3_600_000),
      },
    })
    const gateway = guardTransactions(lagging())

    await sweepExpiredOrders(DUE, { gateway, environment: "development" })
    await send(DUE)

    const emails = await fakeEmails()
    expect(emails).toHaveLength(2)
    const placed = emails.find((email) => email.subject.includes("placed"))!
    expect(placed.text).not.toContain("Pay now")
    expect(placed.text).toContain("Status: Cancelled")
    expect(placed.text).toContain("View your order")
  })
})
