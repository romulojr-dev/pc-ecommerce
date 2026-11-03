import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { env } from "@/lib/env"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { credentialFromParams } from "./credential"
import { findOrderByCredential, getOrderForPage } from "./get-order"
import { mintViewLink } from "./order-links"
import { hashToken, newAccessToken } from "./secrets"
import { signOrderLink } from "./signed-link"

// The order credential (docs/specs/035-email-foundation-signed-links): the
// access token or a signed `view` link opens the same page. K1, K3, K4, K5,
// K9, K10.

beforeEach(resetCatalog)
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()
const NOW = new Date("2026-11-01T08:00:00Z")
const DAY = 86_400

async function newOrder(number?: string) {
  return db.order.create({
    data: orderData({
      accessTokenHash: hashToken(newAccessToken()),
      ...(number ? { orderNumber: number } : {}),
    }),
  })
}

const link = (number: string, over: Partial<{ p: string }> = {}) => {
  const view = mintViewLink(number, NOW)
  return credentialFromParams({ ...view, ...over })
}

describe("a signed link opens the order", () => {
  it("gives the same order as the key, without the save-the-link prompt (K1)", async () => {
    const order = await db.order.create({
      data: orderData({ accessTokenHash: hashToken(TOKEN) }),
    })

    const byKey = await getOrderForPage(order.orderNumber, TOKEN, NOW)
    const byLink = await getOrderForPage(
      order.orderNumber,
      link(order.orderNumber),
      NOW
    )

    expect(byKey).toMatchObject({ viaLink: false })
    expect(byLink).toMatchObject({ viaLink: true })
    expect({ ...byLink, viaLink: false }).toEqual(byKey)
  })

  it("opens in every status", async () => {
    const order = await newOrder()
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        cancelledAt: NOW,
        cancelReason: "EXPIRED",
      },
    })
    expect(
      await getOrderForPage(order.orderNumber, link(order.orderNumber), NOW)
    ).toMatchObject({ status: "CANCELLED" })
  })

  it("is read-only and finds the order for Pay now and the status route", async () => {
    const order = await newOrder()
    expect(
      await findOrderByCredential(
        order.orderNumber,
        link(order.orderNumber),
        NOW
      )
    ).toEqual({
      id: order.id,
      orderNumber: order.orderNumber,
      status: "PENDING_PAYMENT",
    })
  })
})

describe("every bad link is the same miss (K3)", () => {
  it("is null for a wrong signature, expiry, purpose, order and secret", async () => {
    const order = await newOrder()
    const other = await newOrder()
    const good = mintViewLink(order.orderNumber, NOW)
    const flipped = good.sig.startsWith("A") ? "B" : "A"

    const misses = [
      // one character of the signature
      credentialFromParams({ ...good, sig: flipped + good.sig.slice(1) }),
      // expired: 90 days and a second on
      mintViewLink(
        order.orderNumber,
        new Date(NOW.getTime() - 91 * DAY * 1000)
      ),
      // another order's link
      mintViewLink(other.orderNumber, NOW),
      // the purpose for COD (#95), signed correctly but not a `view`
      signOrderLink(
        env.ORDER_LINK_SECRET,
        order.orderNumber,
        "cod-confirm",
        Math.floor(NOW.getTime() / 1000) + DAY
      ),
      // signed with another secret (a rotated one)
      signOrderLink(
        "x".repeat(40),
        order.orderNumber,
        "view",
        Math.floor(NOW.getTime() / 1000) + DAY
      ),
    ].map((credential) =>
      "kind" in credential ? credential : credentialFromParams(credential)
    )

    for (const credential of misses) {
      expect(
        await getOrderForPage(order.orderNumber, credential, NOW)
      ).toBeNull()
      expect(
        await findOrderByCredential(order.orderNumber, credential, NOW)
      ).toBeNull()
    }
    // The order's own link, minted the same way, does open it
    expect(
      await getOrderForPage(order.orderNumber, link(order.orderNumber), NOW)
    ).not.toBeNull()
  })

  it("is null for an unknown order, and does one read like a known one", async () => {
    const spy = vi.spyOn(db.order, "findUnique")
    expect(
      await getOrderForPage("PCS-AAAAAAAA", link("PCS-AAAAAAAA"), NOW)
    ).toBeNull()
    const order = await newOrder()
    spy.mockClear()
    await getOrderForPage(
      order.orderNumber,
      credentialFromParams({
        ...mintViewLink(order.orderNumber, NOW),
        sig: "A".repeat(43),
      }),
      NOW
    )
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("opens a correctly signed link of any lifetime (K10)", async () => {
    const order = await newOrder()
    const far = signOrderLink(
      env.ORDER_LINK_SECRET,
      order.orderNumber,
      "view",
      Math.floor(NOW.getTime() / 1000) + 400 * DAY
    )
    expect(
      await getOrderForPage(order.orderNumber, credentialFromParams(far), NOW)
    ).not.toBeNull()
  })

  it("a link signed with a rotated secret is dead, the key is not (K9)", async () => {
    const order = await db.order.create({
      data: orderData({ accessTokenHash: hashToken(TOKEN) }),
    })
    const old = signOrderLink(
      "the-old-secret-0123456789abcdef0123456789",
      order.orderNumber,
      "view",
      Math.floor(NOW.getTime() / 1000) + DAY
    )
    expect(
      await getOrderForPage(order.orderNumber, credentialFromParams(old), NOW)
    ).toBeNull()
    expect(await getOrderForPage(order.orderNumber, TOKEN, NOW)).not.toBeNull()
  })
})

describe("a malformed credential reads nothing (K4)", () => {
  it("makes no database query", async () => {
    const order = await newOrder()
    const good = mintViewLink(order.orderNumber, NOW)
    const spy = vi.spyOn(db.order, "findUnique")

    const malformed = [
      // a key and a link together
      credentialFromParams({ key: TOKEN, ...good }),
      // an incomplete link
      credentialFromParams({ sig: good.sig, exp: good.exp }),
      // shapes (L7)
      credentialFromParams({ ...good, sig: good.sig.slice(0, 42) }),
      credentialFromParams({ ...good, exp: "123" }),
      credentialFromParams({ ...good, p: "VIEW" }),
      credentialFromParams({ ...good, p: "edit" }),
      credentialFromParams({}),
    ]
    for (const credential of malformed) {
      expect(
        await getOrderForPage(order.orderNumber, credential, NOW)
      ).toBeNull()
      expect(
        await findOrderByCredential(order.orderNumber, credential, NOW)
      ).toBeNull()
    }
    expect(
      await getOrderForPage("pcs-aaaaaaaa", credentialFromParams(good), NOW)
    ).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe("the key is unchanged (K5)", () => {
  it("opens with a bare token, a parsed one and not with a wrong one", async () => {
    const order = await db.order.create({
      data: orderData({ accessTokenHash: hashToken(TOKEN) }),
    })
    for (const credential of [TOKEN, credentialFromParams({ key: TOKEN })]) {
      expect(
        await getOrderForPage(order.orderNumber, credential, NOW)
      ).toMatchObject({ orderNumber: order.orderNumber, viaLink: false })
    }
    expect(
      await getOrderForPage(order.orderNumber, newAccessToken(), NOW)
    ).toBeNull()
  })
})
