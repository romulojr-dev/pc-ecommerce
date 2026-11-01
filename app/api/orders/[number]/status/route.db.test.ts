import { NextRequest } from "next/server"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db } from "@/lib/db"
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
