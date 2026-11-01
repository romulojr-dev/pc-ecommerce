import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import {
  completeFakeSession,
  expireFakeSession,
  fakeGateway,
  readFakeSession,
} from "./fake"
import type { SessionInput } from "./session-request"

// The fake gateway behaves like Xendit's sessions (docs/specs/031-pay-with-
// xendit, §6 Fake adapter, D7–D9)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

const TOKEN = "A".repeat(43)
const NOW = new Date("2026-11-01T07:00:00Z")
const input: SessionInput = {
  referenceId: "PCS-7KQ2M9XD-1",
  amountCentavos: 2_311_000,
  currency: "PHP",
  description: "PC Silicon order PCS-7KQ2M9XD",
  metadata: {
    order_id: "cord1",
    order_number: "PCS-7KQ2M9XD",
    environment: "development",
  },
  successUrl: `http://localhost:3000/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=return`,
  cancelUrl: `http://localhost:3000/orders/PCS-7KQ2M9XD?key=${TOKEN}&payment=cancelled`,
  expiresAt: new Date("2026-11-02T07:00:00Z"),
}

const gateway = fakeGateway({ now: () => NOW })

async function create() {
  const result = await gateway.createSession(input)
  if (!result.ok) throw new Error(result.code)
  return result.session
}

describe("createSession", () => {
  it("stores a Xendit-shaped session and links to the store's test page", async () => {
    const session = await create()
    expect(session.id).toMatch(/^ps-[0-9a-f]{24}$/)
    expect(session.url).toBe(`/test-payment/${session.id}?key=${TOKEN}`)
    expect(session.status).toBe("active")

    const row = await db.fakeGatewaySession.findUniqueOrThrow({
      where: { id: session.id },
    })
    expect(row).toMatchObject({
      status: "ACTIVE",
      amount: 2_311_000,
      currency: "PHP",
      referenceId: "PCS-7KQ2M9XD-1",
      metadata: input.metadata,
    })
    // No URL, and so no token, is stored (D9)
    expect(JSON.stringify(row)).not.toContain(TOKEN)
  })

  it("fails like a gateway error when told to (A6, A7)", async () => {
    expect(
      await fakeGateway({ fail: { create: true } }).createSession(input)
    ).toEqual({
      ok: false,
      code: "http-500",
    })
    expect(await db.fakeGatewaySession.count()).toBe(0)
  })
})

describe("closeSession", () => {
  it("cancels an active session", async () => {
    const { id } = await create()
    expect(await gateway.closeSession(id)).toEqual({
      ok: true,
      outcome: "cancelled",
    })
    expect((await readFakeSession(id, NOW))?.status).toBe("closed")
  })

  it("says not-active for a paid session and leaves it paid", async () => {
    const { id } = await create()
    await completeFakeSession(id, NOW)
    expect(await gateway.closeSession(id)).toEqual({
      ok: true,
      outcome: "not-active",
    })
    expect((await readFakeSession(id, NOW))?.status).toBe("completed")
  })

  it("says not-active for an expired or cancelled session (A5)", async () => {
    const { id } = await create()
    await expireFakeSession(id, NOW)
    expect(await gateway.closeSession(id)).toEqual({
      ok: true,
      outcome: "not-active",
    })
    const other = await create()
    await gateway.closeSession(other.id)
    expect(await gateway.closeSession(other.id)).toEqual({
      ok: true,
      outcome: "not-active",
    })
  })

  // docs/specs/033-release-unpaid-orders, S9 and S9a
  it("fails with the chosen code, after the chosen delay", async () => {
    const { id } = await create()
    const slow = fakeGateway({
      now: () => NOW,
      fail: { close: true, code: "timeout" },
      closeDelayMs: 30,
    })
    const started = Date.now()
    expect(await slow.closeSession(id)).toEqual({ ok: false, code: "timeout" })
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
    expect((await readFakeSession(id, NOW))?.status).toBe("active")
  })

  it("expires a session whose time has passed", async () => {
    const { id } = await create()
    const later = fakeGateway({ now: () => input.expiresAt })
    expect(await later.getSession(id)).toMatchObject({
      ok: true,
      session: { status: "expired" },
    })
    // Stored as expired, so a later read at any clock agrees
    expect((await readFakeSession(id, NOW))?.status).toBe("expired")
  })
})

describe("paying", () => {
  it("completes once, with a payment the gateway can confirm", async () => {
    const { id } = await create()
    const paid = await completeFakeSession(id, NOW)
    expect(paid?.status).toBe("completed")
    expect(paid?.paymentId).toMatch(/^py-[0-9a-f]{24}$/)
    expect(await completeFakeSession(id, NOW)).toBeNull()

    expect(await gateway.getPayment(paid!.paymentId!)).toEqual({
      ok: true,
      payment: {
        id: paid!.paymentId,
        status: "succeeded",
        amountCentavos: 2_311_000,
        currency: "PHP",
        method: "FAKE",
      },
    })
  })

  it("can't complete a cancelled session", async () => {
    const { id } = await create()
    await gateway.closeSession(id)
    expect(await completeFakeSession(id, NOW)).toBeNull()
  })
})
