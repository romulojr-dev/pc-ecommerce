import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { startPaymentAction } from "@/app/(store)/orders/[number]/actions"
import { credentialFromParams } from "@/lib/orders/credential"
import { mintViewLink } from "@/lib/orders/order-links"
import { hashToken, newAccessToken } from "@/lib/orders/secrets"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { fakeGateway } from "./fake"
import {
  chooseOnFakePage,
  type FakePageContext,
  openFakePage,
} from "./fake-page"
import { startPayment } from "./start-payment"

// Paying through a signed link (docs/specs/035-email-foundation-signed-links,
// Behavior 13–14): K6–K8, and the Pay now action.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()
const NOW = new Date("2026-11-01T07:00:00Z")
const SITE = "http://localhost:3000"
const context: FakePageContext = {
  gatewayIsFake: true,
  environment: "development",
  now: NOW,
  gateway: fakeGateway({ now: () => NOW }),
}
const options = {
  now: NOW,
  gateway: fakeGateway({ now: () => NOW }),
  siteUrl: SITE,
  environment: "development" as const,
}

const newOrder = (expiresAt = new Date("2026-11-02T07:00:00Z")) =>
  db.order.create({
    data: orderData({
      accessTokenHash: hashToken(TOKEN),
      createdAt: NOW,
      expiresAt,
    }),
  })

const viewLink = (orderNumber: string, now = NOW) =>
  credentialFromParams(mintViewLink(orderNumber, now))

describe("starting a payment with a link (K6)", () => {
  it("opens the payment page with the link credential", async () => {
    const order = await newOrder()
    // The shopper arrived with a link minted a day ago
    const result = await startPayment(
      order.id,
      viewLink(order.orderNumber, new Date(NOW.getTime() - 86_400_000)),
      options
    )
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.url).toMatch(
      /^\/test-payment\/ps-[0-9a-f]{24}\?sig=[\w-]{43}&exp=\d{10}&p=view$/
    )
    const payment = await db.payment.findFirstOrThrow({
      where: { orderId: order.id },
    })
    expect(payment.status).toBe("PENDING")
  })

  it("the session's return URLs carry the new link, for both outcomes", async () => {
    const order = await newOrder()
    const create = vi.fn(fakeGateway({ now: () => NOW }).createSession)
    const gw = { ...fakeGateway({ now: () => NOW }), createSession: create }
    await startPayment(order.id, viewLink(order.orderNumber), {
      ...options,
      gateway: gw,
    })

    const input = create.mock.calls[0][0]
    // Signed now, good for 90 days, not the arriving link's lifetime
    const fresh = mintViewLink(order.orderNumber, NOW)
    expect(fresh.exp).toBe(
      String(Math.floor(NOW.getTime() / 1000) + 90 * 86_400)
    )
    const query = `sig=${fresh.sig}&exp=${fresh.exp}&p=view`
    expect(input.successUrl).toBe(
      `${SITE}/orders/${order.orderNumber}?${query}&payment=return`
    )
    expect(input.cancelUrl).toBe(
      `${SITE}/orders/${order.orderNumber}?${query}&payment=cancelled`
    )
  })
})

describe("starting a payment with the key (K7)", () => {
  it("is as before: the return URLs and the page carry the key", async () => {
    const order = await newOrder()
    const create = vi.fn(fakeGateway({ now: () => NOW }).createSession)
    const gw = { ...fakeGateway({ now: () => NOW }), createSession: create }

    const result = await startPayment(order.id, TOKEN, {
      ...options,
      gateway: gw,
    })

    expect(result).toMatchObject({ ok: true })
    if (result.ok) {
      expect(result.url).toMatch(
        new RegExp(`^/test-payment/ps-[0-9a-f]{24}\\?key=${TOKEN}$`)
      )
    }
    expect(create.mock.calls[0][0].successUrl).toBe(
      `${SITE}/orders/${order.orderNumber}?key=${TOKEN}&payment=return`
    )
  })

  it("refuses an unusable credential", async () => {
    const order = await newOrder()
    expect(
      await startPayment(order.id, credentialFromParams({}), options)
    ).toEqual({ ok: false, reason: "not-found" })
  })
})

describe("the fake payment page with a link (K8)", () => {
  async function openedWithLink() {
    const order = await newOrder()
    const started = await startPayment(
      order.id,
      viewLink(order.orderNumber),
      options
    )
    if (!started.ok) throw new Error(started.reason)
    const id = /\/test-payment\/(ps-[0-9a-f]{24})/.exec(started.url)![1]
    return { order, id }
  }

  it("opens for the link, for the key, and not for another order's link", async () => {
    const { order, id } = await openedWithLink()
    const other = await db.order.create({
      data: orderData({ accessTokenHash: hashToken(newAccessToken()) }),
    })

    expect(
      await openFakePage(id, viewLink(order.orderNumber), context)
    ).toMatchObject({
      orderNumber: order.orderNumber,
      orderHref: expect.stringMatching(
        new RegExp(
          `^/orders/${order.orderNumber}\\?sig=[\\w-]{43}&exp=\\d{10}&p=view$`
        )
      ),
    })
    expect(await openFakePage(id, TOKEN, context)).toMatchObject({
      orderNumber: order.orderNumber,
      orderHref: `/orders/${order.orderNumber}?key=${TOKEN}`,
    })
    expect(
      await openFakePage(id, viewLink(other.orderNumber), context)
    ).toBeNull()
  })

  it("Pay through the link marks the order Paid through the webhook path", async () => {
    const { order, id } = await openedWithLink()

    const url = await chooseOnFakePage(
      "pay",
      id,
      viewLink(order.orderNumber),
      context
    )

    expect(url).toMatch(
      new RegExp(
        `^/orders/${order.orderNumber}\\?sig=[\\w-]{43}&exp=\\d{10}&p=view&payment=return$`
      )
    )
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } })
    ).toMatchObject({ status: "PAID" })
  })
})

describe("Pay now with the action", () => {
  const linkInput = (number: string) => ({
    orderNumber: number,
    key: null,
    ...mintViewLink(number),
  })

  it("starts a payment for a valid link", async () => {
    const order = await newOrder(new Date(Date.now() + 86_400_000))
    const result = await startPaymentAction(linkInput(order.orderNumber))
    expect(result).toMatchObject({ ok: true })
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1)
  })

  it("answers not-found for every bad credential", async () => {
    const order = await newOrder()
    const good = linkInput(order.orderNumber)
    const bad = [
      { ...good, sig: "A".repeat(43) },
      { ...good, p: "cod-confirm" },
      { ...good, key: TOKEN },
      { orderNumber: order.orderNumber },
      { ...linkInput("PCS-AAAAAAAA") },
    ]
    for (const input of bad) {
      expect(await startPaymentAction(input)).toEqual({
        ok: false,
        reason: "not-found",
      })
    }
    expect(await db.payment.count()).toBe(0)
  })
})
