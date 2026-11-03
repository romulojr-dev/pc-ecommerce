import { NextRequest } from "next/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db"
import { mintViewLink } from "@/lib/orders/order-links"
import { hashToken, newAccessToken } from "@/lib/orders/secrets"
import { resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { GET } from "./route"

// docs/specs/031-pay-with-xendit: R1–R3

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const TOKEN = newAccessToken()

function get(number: string, key?: string, query = "") {
  const request = new NextRequest(
    `http://localhost:3000/api/orders/${number}/status${query}`,
    { headers: key === undefined ? {} : { "X-Order-Key": key } }
  )
  return GET(request, { params: Promise.resolve({ number }) })
}

async function newOrder() {
  return db.order.create({
    data: orderData({ accessTokenHash: hashToken(TOKEN) }),
  })
}

describe("GET /api/orders/[number]/status", () => {
  it("answers the status for the right key, uncached (R1)", async () => {
    const { orderNumber } = await newOrder()
    const response = await get(orderNumber, TOKEN)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "PENDING_PAYMENT" })
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("answers the same 404 for every miss (R2)", async () => {
    const { orderNumber } = await newOrder()
    const misses = [
      await get(orderNumber, newAccessToken()),
      await get(orderNumber),
      await get("PCS-AAAAAAAA", TOKEN),
      await get("nope", TOKEN),
    ]
    for (const response of misses) {
      expect(response.status).toBe(404)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
      expect(await response.json()).toEqual({ error: "not-found" })
    }
  })

  it("doesn't read a malformed number from the database (R2)", async () => {
    const spy = vi.spyOn(db.order, "findUnique")
    await get("nope", TOKEN)
    expect(spy).not.toHaveBeenCalled()
  })

  it("ignores a key in the query string (R3)", async () => {
    const { orderNumber } = await newOrder()
    const response = await get(orderNumber, undefined, `?key=${TOKEN}`)
    expect(response.status).toBe(404)
  })
})

// docs/specs/035-email-foundation-signed-links: K2–K4, the signed link in
// the X-Order-Link header
describe("with a signed link", () => {
  const getWith = (number: string, headers: Record<string, string>) =>
    GET(
      new NextRequest(`http://localhost:3000/api/orders/${number}/status`, {
        headers,
      }),
      { params: Promise.resolve({ number }) }
    )
  const linkHeader = (number: string) => {
    const { sig, exp, p } = mintViewLink(number)
    return { "X-Order-Link": new URLSearchParams({ sig, exp, p }).toString() }
  }

  it("answers the status for a valid link, uncached (K2)", async () => {
    const { orderNumber } = await newOrder()
    const response = await getWith(orderNumber, linkHeader(orderNumber))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "PENDING_PAYMENT" })
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("answers the same 404 for a bad link (K3)", async () => {
    const { orderNumber } = await newOrder()
    const other = await db.order.create({
      data: orderData({ accessTokenHash: hashToken(newAccessToken()) }),
    })
    const good = linkHeader(orderNumber)["X-Order-Link"]
    const misses = [
      await getWith(orderNumber, {
        "X-Order-Link": good.replace(/sig=./, "sig=Z"),
      }),
      await getWith(orderNumber, linkHeader(other.orderNumber)),
      await getWith(orderNumber, { "X-Order-Link": "sig=a&exp=1&p=view" }),
      await getWith(orderNumber, {
        "X-Order-Key": TOKEN,
        "X-Order-Link": good,
      }),
    ]
    for (const response of misses) {
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: "not-found" })
    }
  })

  it("reads nothing for a malformed link (K4)", async () => {
    const spy = vi.spyOn(db.order, "findUnique")
    await getWith("PCS-7KQ2M9XD", { "X-Order-Link": "sig=a&exp=1&p=view" })
    expect(spy).not.toHaveBeenCalled()
  })
})
