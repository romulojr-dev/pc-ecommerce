import { NextRequest } from "next/server"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { GET as statusRoute } from "@/app/api/orders/[number]/status/route"
import { startPaymentAction } from "@/app/(store)/orders/[number]/actions"
import { fakeGateway } from "@/lib/payments/fake"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"
import {
  EXPIRES,
  heldOrder,
  PLACED,
  releaseTokenHash,
  stockOf,
} from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { confirmCodOrder } from "./confirm-cod"
import { credentialFromParams } from "./credential"
import { getCodConfirmPage } from "./get-cod-confirm"
import { getOrderForPage, findOrderByCredential } from "./get-order"
import { mintCodConfirmLink, mintViewLink } from "./order-links"
import {
  checkExpiredOrders,
  releaseExpiredOrders,
  sweepExpiredOrders,
} from "./release"
import type { LinkParams } from "./signed-link"

// docs/specs/038-cash-on-delivery: C1–C8 and C10, the cash order's confirmation
// against the test database. The order is two Ryzen 5 7600 to Quezon City, due
// 2026-11-05 10:00 in Manila.

vi.mock("@/lib/payments/gateway", async (importOriginal) => {
  const { fakeGateway: fake } = await import("@/lib/payments/fake")
  return {
    ...(await importOriginal<typeof import("@/lib/payments/gateway")>()),
    gateway: () => fake(),
  }
})
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

beforeEach(async () => {
  await resetCatalog()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const DEADLINE = new Date("2026-11-05T02:00:00Z")
// 2026-11-04 12:30 in Manila
const NOW = new Date("2026-11-04T04:30:00Z")

type Data = Parameters<typeof orderData>[0]
const cashOrder = (overrides: Data = {}) =>
  db.order.create({
    data: orderData({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      expiresAt: DEADLINE,
      ...overrides,
    }),
  })
const linkFor = (order: { orderNumber: string; expiresAt: Date }) =>
  mintCodConfirmLink(order.orderNumber, order.expiresAt)
const rowOf = (id: string) => db.order.findUniqueOrThrow({ where: { id } })

describe("opening the confirmation page", () => {
  it("C1: shows the order and changes nothing", async () => {
    const order = await cashOrder()
    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: (await insertParts([seed.ryzen5_7600])).get(
          seed.ryzen5_7600.id
        )!,
        nameSnapshot: "AMD Ryzen 5 7600",
        priceSnapshot: 1_149_500,
        quantity: 2,
        position: 0,
      },
    })
    const before = await rowOf(order.id)

    const data = await getCodConfirmPage(order.orderNumber, linkFor(order), NOW)

    expect(data).toMatchObject({
      view: "confirm",
      orderNumber: order.orderNumber,
      total: 2_311_000,
      items: [{ name: "AMD Ryzen 5 7600", quantity: 2 }],
    })
    expect(await rowOf(order.id)).toEqual(before)
    // No contact details travel to the page (D8)
    const text = JSON.stringify(data)
    for (const personal of ["ana@example.com", "Ana Santos", "+639171234567"]) {
      expect(text).not.toContain(personal)
    }
  })

  it("C1: a pickup order shows the store's current address", async () => {
    await db.storeSettings.create({
      data: {
        storeAddress: "Unit 4, 88 Sample St, Makati",
        storeHours: "Mon-Sat 10-7",
        storeInfo: "x",
      },
    })
    const order = await cashOrder({
      fulfillment: "PICKUP",
      regionCode: null,
      regionName: null,
      provinceCode: null,
      provinceName: null,
      cityCode: null,
      cityName: null,
      barangayCode: null,
      barangayName: null,
      street: null,
      zip: null,
      psgcVersion: null,
      zone: null,
      shippingFee: 0,
      total: 2_299_000,
    })

    expect(
      await getCodConfirmPage(order.orderNumber, linkFor(order), NOW)
    ).toMatchObject({
      view: "confirm",
      address: null,
      store: { address: "Unit 4, 88 Sample St, Makati" },
    })
  })
})

describe("confirming", () => {
  it("C2: moves the order to COD confirmed and records when, from the call's own clock", async () => {
    const order = await cashOrder()
    const before = await rowOf(order.id)

    const result = await confirmCodOrder(order.orderNumber, linkFor(order), NOW)

    expect(result).toEqual({ ok: true, outcome: "confirmed" })
    const after = await rowOf(order.id)
    expect(after).toMatchObject({
      status: "COD_CONFIRMED",
      confirmedAt: NOW,
      updatedAt: NOW,
    })
    // Nothing else changed: no payment, no deadline, no email
    expect({ ...after, status: 0, confirmedAt: 0, updatedAt: 0 }).toEqual({
      ...before,
      status: 0,
      confirmedAt: 0,
      updatedAt: 0,
    })
    expect(await db.emailOutbox.count()).toBe(0)
    expect(await db.payment.count()).toBe(0)
  })

  it("C2: the page then says it is confirmed", async () => {
    const order = await cashOrder()
    await confirmCodOrder(order.orderNumber, linkFor(order), NOW)

    expect(
      await getCodConfirmPage(order.orderNumber, linkFor(order), NOW)
    ).toMatchObject({ view: "confirmed" })
  })

  it("C3: confirming again is a no-op that keeps the first time", async () => {
    const order = await cashOrder()
    await confirmCodOrder(order.orderNumber, linkFor(order), NOW)
    const first = await rowOf(order.id)

    const again = await confirmCodOrder(
      order.orderNumber,
      linkFor(order),
      new Date(NOW.getTime() + 60_000)
    )

    expect(again).toEqual({ ok: true, outcome: "already" })
    expect(await rowOf(order.id)).toEqual(first)
  })

  it("C3: two confirmations at once: one confirms, one finds it confirmed", async () => {
    const order = await cashOrder()

    const results = await Promise.all([
      confirmCodOrder(order.orderNumber, linkFor(order), NOW),
      confirmCodOrder(order.orderNumber, linkFor(order), NOW),
    ])

    expect(results.map((r) => (r.ok ? r.outcome : r.reason)).sort()).toEqual([
      "already",
      "confirmed",
    ])
    expect((await rowOf(order.id)).confirmedAt).toEqual(NOW)
  })

  it("C3: a later status counts as already confirmed", async () => {
    const order = await cashOrder({
      status: "PROCESSING",
      confirmedAt: new Date(NOW.getTime() - 3_600_000),
    })

    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), NOW)
    ).toEqual({ ok: true, outcome: "already" })
  })
})

describe("after the deadline", () => {
  const LATE = new Date(DEADLINE.getTime() + 1)

  it("C4: a pending order past its deadline, not yet released, reads cancelled and refuses", async () => {
    const order = await cashOrder()
    const before = await rowOf(order.id)

    expect(
      await getCodConfirmPage(order.orderNumber, linkFor(order), LATE)
    ).toMatchObject({ view: "cancelled" })
    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), LATE)
    ).toEqual({ ok: false, reason: "expired" })
    expect(await rowOf(order.id)).toEqual(before)
  })

  it("C4: at the deadline itself, too", async () => {
    const order = await cashOrder()

    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), DEADLINE)
    ).toEqual({ ok: false, reason: "expired" })
    expect((await rowOf(order.id)).status).toBe("PENDING_CONFIRMATION")
  })

  it("C5: a released order reads cancelled and refuses", async () => {
    const order = await cashOrder({
      status: "CANCELLED",
      cancelledAt: DEADLINE,
      cancelReason: "EXPIRED",
    })

    expect(
      await getCodConfirmPage(order.orderNumber, linkFor(order), LATE)
    ).toMatchObject({ view: "cancelled" })
    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), NOW)
    ).toEqual({ ok: false, reason: "expired" })
    expect((await rowOf(order.id)).status).toBe("CANCELLED")
  })
})

describe("links that open nothing", () => {
  async function misses() {
    const order = await cashOrder()
    const other = await cashOrder({
      expiresAt: new Date(DEADLINE.getTime() + 1_000),
    })
    const good = linkFor(order)
    const flipped = good.sig.startsWith("A") ? "B" : "A"
    const view = mintViewLink(order.orderNumber, NOW)
    return {
      order,
      // each is shaped like a link, so each costs one order read
      read: [
        ["a changed signature", { ...good, sig: flipped + good.sig.slice(1) }],
        ["a changed expiry", { ...good, exp: String(Number(good.exp) + 1) }],
        [
          "a view signature under the cod-confirm purpose",
          { ...view, p: "cod-confirm" },
        ],
        ["a view link", view],
        ["another order's link", linkFor(other)],
      ] as [string, LinkParams][],
      // not shaped like one: refused before any read
      malformed: [
        ["a non-numeric expiry", { ...good, exp: "tomorrow" }],
        ["a short signature", { ...good, sig: "abc" }],
        ["an unknown purpose", { ...good, p: "refund" }],
      ] as [string, LinkParams][],
    }
  }

  it("C6: each is the same not-found, with one order read, and writes nothing", async () => {
    const { order, read } = await misses()
    const before = await rowOf(order.id)

    for (const [, link] of read) {
      const spy = vi.spyOn(db.order, "findUnique")
      expect(await getCodConfirmPage(order.orderNumber, link, NOW)).toBeNull()
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()
      expect(await confirmCodOrder(order.orderNumber, link, NOW)).toEqual({
        ok: false,
        reason: "not-found",
      })
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    }
    expect(await rowOf(order.id)).toEqual(before)
  })

  it("C6: a link of the wrong shape is refused without a database read", async () => {
    const { order, malformed } = await misses()
    const spy = vi.spyOn(db.order, "findUnique")

    for (const [, link] of malformed) {
      expect(await getCodConfirmPage(order.orderNumber, link, NOW)).toBeNull()
      expect(await confirmCodOrder(order.orderNumber, link, NOW)).toEqual({
        ok: false,
        reason: "not-found",
      })
    }
    expect(await confirmCodOrder("not-a-number", linkFor(order), NOW)).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it("C6: an unknown order costs the same read", async () => {
    const order = await cashOrder()
    const spy = vi.spyOn(db.order, "findUnique")

    expect(await confirmCodOrder("PCS-AAAAAAAA", linkFor(order), NOW)).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("C7: a cod-confirm link on an online order opens nothing and writes nothing", async () => {
    const order = await db.order.create({
      data: orderData({ expiresAt: DEADLINE }),
    })
    const before = await rowOf(order.id)

    expect(
      await getCodConfirmPage(order.orderNumber, linkFor(order), NOW)
    ).toBeNull()
    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), NOW)
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await rowOf(order.id)).toEqual(before)
  })
})

describe("the purpose opens only the confirmation page (spec 035 K3)", () => {
  it("C8: the order page, the status route and Pay now all answer not found", async () => {
    const order = await cashOrder({
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    const link = linkFor(order)
    const credential = credentialFromParams(link)

    expect(await getOrderForPage(order.orderNumber, credential)).toBeNull()
    expect(
      await findOrderByCredential(order.orderNumber, credential)
    ).toBeNull()

    const response = await statusRoute(
      new NextRequest(
        `http://localhost:3000/api/orders/${order.orderNumber}/status`,
        {
          headers: {
            "X-Order-Link": `sig=${link.sig}&exp=${link.exp}&p=${link.p}`,
          },
        }
      ),
      { params: Promise.resolve({ number: order.orderNumber }) }
    )
    expect(response.status).toBe(404)

    expect(
      await startPaymentAction({ orderNumber: order.orderNumber, ...link })
    ).toEqual({ ok: false, reason: "not-found" })
    expect(await db.payment.count()).toBe(0)
  })

  it("C8: and a view link doesn't confirm", async () => {
    const order = await cashOrder()
    const view = mintViewLink(order.orderNumber, NOW)

    expect(await confirmCodOrder(order.orderNumber, view, NOW)).toEqual({
      ok: false,
      reason: "not-found",
    })
    expect((await rowOf(order.id)).status).toBe("PENDING_CONFIRMATION")
  })
})

describe("logs", () => {
  it("carry the event, outcome and order number, never the link", async () => {
    const order = await cashOrder()
    const link = linkFor(order)

    await confirmCodOrder(order.orderNumber, link, NOW)
    await confirmCodOrder(order.orderNumber, link, NOW)
    await confirmCodOrder(
      order.orderNumber,
      { ...link, sig: "x".repeat(43) },
      NOW
    )

    const lines = vi
      .mocked(console.info)
      .mock.calls.map(([line]) => String(line))
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        event: "order.cod_confirm",
        outcome: "confirmed",
        orderNumber: order.orderNumber,
      },
      {
        event: "order.cod_confirm",
        outcome: "already",
        orderNumber: order.orderNumber,
      },
      { event: "order.cod_confirm", outcome: "not-found" },
    ])
    for (const line of lines) {
      expect(line).not.toContain(link.sig)
      expect(line).not.toContain("ana@example.com")
    }
  })
})

// The race: confirming at the deadline against the release. Each run has a
// fresh order due at EXPIRES; the confirm's clock is a moment before it, the
// sweep's is at it. Both lock the order row and re-check its status, so exactly
// one wins; which one is not fixed.
describe("confirming against the release", () => {
  it("C10: exactly one wins, every time", async () => {
    const [ryzen] = [
      (
        await insertParts([seed.ryzen5_7600], {
          [seed.ryzen5_7600.id]: { stock: 200, price: 1_149_500 },
        })
      ).get(seed.ryzen5_7600.id)!,
    ]
    const gateway = fakeGateway({ now: () => PLACED })
    const wins = { confirmed: 0, cancelled: 0 }

    for (let run = 0; run < 20; run++) {
      const order = await heldOrder([{ productId: ryzen, quantity: 1 }], {
        accessTokenHash: releaseTokenHash(`race-${run}`),
        paymentOption: "COD",
        status: "PENDING_CONFIRMATION",
      })
      const before = await stockOf(ryzen)
      const link = linkFor(order)

      const [confirm] = await Promise.all([
        confirmCodOrder(
          order.orderNumber,
          link,
          new Date(EXPIRES.getTime() - 1)
        ),
        sweepExpiredOrders(EXPIRES, { gateway, environment: "development" }),
      ])

      const row = await rowOf(order.id)
      const movements = await db.stockMovement.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "asc" },
      })
      const emails = await db.emailOutbox.count({
        where: { orderId: order.id, type: "ORDER_CANCELLED" },
      })
      if (row.status === "COD_CONFIRMED") {
        wins.confirmed++
        expect(confirm).toEqual({ ok: true, outcome: "confirmed" })
        expect(row.confirmedAt).toEqual(new Date(EXPIRES.getTime() - 1))
        expect(row.cancelledAt).toBeNull()
        expect(await stockOf(ryzen)).toBe(before)
        expect(movements.map((m) => m.reason)).toEqual(["ORDER_RESERVED"])
        expect(emails).toBe(0)
      } else {
        wins.cancelled++
        expect(row.status).toBe("CANCELLED")
        expect(confirm).toEqual({ ok: false, reason: "expired" })
        expect(row.confirmedAt).toBeNull()
        expect(row.cancelReason).toBe("EXPIRED")
        // the stock this order held came back once
        expect(await stockOf(ryzen)).toBe(before + 1)
        expect(movements.map((m) => m.reason)).toEqual([
          "ORDER_RESERVED",
          "ORDER_RELEASED",
        ])
        expect(emails).toBe(1)
      }
    }
    expect(wins.confirmed + wins.cancelled).toBe(20)
  })

  // The two interleavings the race above can't be made to hit on demand, forced
  // with the order row's lock (Behavior 19)
  async function dueCashOrder(token: string) {
    const ryzen = (
      await insertParts([seed.ryzen5_7600], {
        [seed.ryzen5_7600.id]: { stock: 10, price: 1_149_500 },
      })
    ).get(seed.ryzen5_7600.id)!
    const order = await heldOrder([{ productId: ryzen, quantity: 2 }], {
      accessTokenHash: releaseTokenHash(token),
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
    })
    return { ryzen, order }
  }
  const gateway = () => fakeGateway({ now: () => PLACED })
  const justBefore = new Date(EXPIRES.getTime() - 1)

  it("C10: a confirmation that lands between the check and the release wins, and the release leaves the order alone", async () => {
    const { ryzen, order } = await dueCashOrder("between")
    // Step 1 clears the order: it is due and holds no session
    const check = await checkExpiredOrders({
      now: EXPIRES,
      limit: 10,
      gateway: gateway(),
      environment: "development",
    })
    expect(check.cleared.map((o) => o.id)).toEqual([order.id])

    expect(
      await confirmCodOrder(order.orderNumber, linkFor(order), justBefore)
    ).toEqual({ ok: true, outcome: "confirmed" })
    // Step 2 re-checks the status under the lock
    const release = await db.$transaction((tx) =>
      releaseExpiredOrders(tx, { now: EXPIRES, orderIds: [order.id] })
    )

    expect(release.released).toEqual([])
    expect((await rowOf(order.id)).status).toBe("COD_CONFIRMED")
    expect(await stockOf(ryzen)).toBe(8)
    expect(await db.emailOutbox.count()).toBe(0)
  })

  it("C10: a confirmation waiting on the row the release has locked is refused when it commits", async () => {
    const { ryzen, order } = await dueCashOrder("locked")
    let waiting: ReturnType<typeof confirmCodOrder> | undefined

    await db.$transaction(async (tx) => {
      const release = await releaseExpiredOrders(tx, {
        now: EXPIRES,
        orderIds: [order.id],
      })
      expect(release.released.map((o) => o.id)).toEqual([order.id])
      // The confirmation read the order as pending, so it goes for the update
      // and waits for the lock this transaction holds
      waiting = confirmCodOrder(order.orderNumber, linkFor(order), justBefore)
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(await waiting).toEqual({ ok: false, reason: "expired" })
    const row = await rowOf(order.id)
    expect(row).toMatchObject({ status: "CANCELLED", confirmedAt: null })
    expect(await stockOf(ryzen)).toBe(10)
  })

  it("C10: a release waiting on the row a confirmation holds is skipped, not run", async () => {
    const { ryzen, order } = await dueCashOrder("confirm-first")
    const hold = new Promise<void>((resolve) => setTimeout(resolve, 300))
    let skipped: Awaited<ReturnType<typeof releaseExpiredOrders>> | undefined

    // A transaction that has locked the row (as the confirmation's UPDATE does)
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`
        UPDATE "Order"
        SET "status" = 'COD_CONFIRMED', "confirmedAt" = ${justBefore}
        WHERE "id" = ${order.id}`
      const attempt = db.$transaction((other) =>
        releaseExpiredOrders(other, { now: EXPIRES, orderIds: [order.id] })
      )
      await hold
      skipped = await attempt
    })

    // SKIP LOCKED: the release found the row locked and left it
    expect(skipped?.released).toEqual([])
    expect(skipped?.notLocked).toEqual([order.id])
    expect((await rowOf(order.id)).status).toBe("COD_CONFIRMED")
    expect(await stockOf(ryzen)).toBe(8)
  })

  it("C10: the sweep that runs first cancels it, and a confirmation after is refused", async () => {
    const [ryzen] = [
      (
        await insertParts([seed.ryzen5_7600], {
          [seed.ryzen5_7600.id]: { stock: 10, price: 1_149_500 },
        })
      ).get(seed.ryzen5_7600.id)!,
    ]
    const order = await heldOrder([{ productId: ryzen, quantity: 2 }], {
      accessTokenHash: releaseTokenHash("first"),
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
    })
    await sweepExpiredOrders(EXPIRES, {
      gateway: fakeGateway({ now: () => PLACED }),
      environment: "development",
    })

    // a clock before the deadline can't undo a cancellation: the row decides
    expect(
      await confirmCodOrder(
        order.orderNumber,
        linkFor(order),
        new Date(EXPIRES.getTime() - 1)
      )
    ).toEqual({ ok: false, reason: "expired" })
    expect((await rowOf(order.id)).status).toBe("CANCELLED")
    expect(await stockOf(ryzen)).toBe(10)
  })
})
