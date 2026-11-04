import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { verifyCodConfirmLink } from "@/lib/orders/order-links"
import { codConfirmExp } from "@/lib/orders/signed-link"
import { db, resetCatalog } from "@/test-support/db"
import { orderData } from "@/test-support/orders"

import { enqueueEmail } from "./outbox"
import { sendPending } from "./send"

// docs/specs/038-cash-on-delivery: D8. The real template registry, the sender
// and the fake transport: a cash order's confirmation arrives with a confirm
// link that works until the order's deadline, and an online order's email
// carries none.

beforeEach(async () => {
  await resetCatalog()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const SITE = "https://pcsilicon.tech"
// 2026-11-04 10:00 in Manila; the order is due 24 hours later
const NOW = new Date("2026-11-04T02:00:00Z")
// A deadline with milliseconds, to see the link round down
const EXPIRES = new Date("2026-11-05T02:00:00.750Z")

async function cashOrder(overrides: Parameters<typeof orderData>[0] = {}) {
  const order = await db.order.create({
    data: orderData({
      paymentOption: "COD",
      status: "PENDING_CONFIRMATION",
      expiresAt: EXPIRES,
      ...overrides,
    }),
  })
  const row = await db.$transaction((tx) =>
    enqueueEmail(tx, order.id, "COD_CONFIRM")
  )
  return { order, row: row! }
}

const linkOf = (text: string, purpose: "cod-confirm" | "view") => {
  const found = text
    .split(/\s+/)
    .find((word) => word.includes(`p=${purpose}`) && word.startsWith("http"))
  if (!found) throw new Error(`no ${purpose} link in the email`)
  return new URL(found)
}

describe("D8: the confirmation email through the sender", () => {
  it("is sent once, from the registry, with a confirm link and a view link", async () => {
    const { order, row } = await cashOrder()

    const summary = await sendPending({ now: NOW, siteUrl: SITE })

    expect(summary).toMatchObject({ sent: 1 })
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: row.id } })
    ).toMatchObject({ status: "SENT" })
    const email = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:COD_CONFIRM` },
    })
    expect(email.to).toBe("ana@example.com")
    expect(email.subject).toBe(
      `[Demo] Confirm your cash-on-delivery order ${order.orderNumber}`
    )
    for (const part of [email.html, email.text]) {
      expect(part).toContain("Confirm order")
      expect(part).toContain("View your order")
    }
    expect(email.text).not.toContain("Pay now")
  })

  it("the confirm link is signed for this order and lasts until its deadline", async () => {
    const { order } = await cashOrder()
    await sendPending({ now: NOW, siteUrl: SITE })
    const { text } = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:COD_CONFIRM` },
    })

    const url = linkOf(text, "cod-confirm")
    const params = {
      sig: url.searchParams.get("sig")!,
      exp: url.searchParams.get("exp")!,
      p: url.searchParams.get("p")!,
    }

    expect(url.origin + url.pathname).toBe(
      `${SITE}/orders/${order.orderNumber}`
    )
    expect(params.exp).toBe(String(codConfirmExp(EXPIRES)))
    const deadline = codConfirmExp(EXPIRES) * 1000
    expect(
      verifyCodConfirmLink(order.orderNumber, params, new Date(deadline - 1))
    ).toBe("ok")
    expect(
      verifyCodConfirmLink(order.orderNumber, params, new Date(deadline))
    ).toBe("expired")
    // another order's number doesn't take it
    expect(verifyCodConfirmLink("PCS-7KQ2M9XD", params, NOW)).toBe("invalid")
  })

  it("the view link is a different link and doesn't confirm", async () => {
    const { order } = await cashOrder()
    await sendPending({ now: NOW, siteUrl: SITE })
    const { text } = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:COD_CONFIRM` },
    })

    const view = linkOf(text, "view")
    const confirm = linkOf(text, "cod-confirm")

    expect(view.searchParams.get("sig")).not.toBe(
      confirm.searchParams.get("sig")
    )
    expect(
      verifyCodConfirmLink(
        order.orderNumber,
        {
          sig: view.searchParams.get("sig")!,
          exp: view.searchParams.get("exp")!,
          p: "cod-confirm",
        },
        NOW
      )
    ).toBe("invalid")
  })

  it("an email sent after the order was confirmed shows its status, not a button", async () => {
    const { order } = await cashOrder()
    await db.order.update({
      where: { id: order.id },
      data: { status: "COD_CONFIRMED", confirmedAt: NOW },
    })

    await sendPending({ now: NOW, siteUrl: SITE })

    const { text } = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:COD_CONFIRM` },
    })
    expect(text).toContain("Status: COD confirmed")
    expect(text).not.toContain("p=cod-confirm")
  })

  it("a pickup order carries the store's current address", async () => {
    await db.storeSettings.create({
      data: {
        storeAddress: "Unit 4, 88 Sample St, Makati",
        storeHours: "Mon-Sat 10-7",
        storeInfo: "x",
      },
    })
    const { order } = await cashOrder({
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

    await sendPending({ now: NOW, siteUrl: SITE })

    const { subject, text } = await db.fakeEmail.findFirstOrThrow({
      where: { idempotencyKey: `${order.id}:COD_CONFIRM` },
    })
    expect(subject).toContain("pay-on-pickup")
    expect(text).toContain("Unit 4, 88 Sample St, Makati")
  })
})
