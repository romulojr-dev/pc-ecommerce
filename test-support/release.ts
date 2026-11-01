import { hashToken } from "@/lib/orders/secrets"
import { fakeGateway } from "@/lib/payments/fake"
import { startPayment } from "@/lib/payments/start-payment"

import { db } from "./db"
import { orderData } from "./orders"

// Orders that hold stock, as placement leaves them (docs/specs/030-place-an-
// order): the order, its items, one ORDER_RESERVED movement per product and
// the stock taken. For the release tests (docs/specs/033-release-unpaid-
// orders).

export const RELEASE_TOKEN = "T".repeat(43)
// P1's times (spec 033 §3)
export const PLACED = new Date("2026-11-01T07:00:00Z")
export const EXPIRES = new Date("2026-11-02T07:00:00Z")

export async function heldOrder(
  lines: { productId: string; quantity: number }[],
  overrides: Parameters<typeof orderData>[0] = {}
) {
  const order = await db.order.create({
    data: orderData({
      expiresAt: EXPIRES,
      createdAt: PLACED,
      ...overrides,
    }),
  })
  await db.orderItem.createMany({
    data: lines.map(({ productId, quantity }, position) => ({
      orderId: order.id,
      productId,
      nameSnapshot: "Fixture part",
      priceSnapshot: 100_000,
      quantity,
      position,
    })),
  })
  for (const { productId, quantity } of lines) {
    await db.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    })
  }
  await db.stockMovement.createMany({
    data: lines.map(({ productId, quantity }) => ({
      productId,
      change: -quantity,
      reason: "ORDER_RESERVED" as const,
      orderId: order.id,
    })),
  })
  return order
}

// The token openSession pays with: give it to one order per test
export const releaseTokenHash = () => hashToken(RELEASE_TOKEN)

// Opens a fake session through Pay now at placement time, for an order made
// with releaseTokenHash(); returns its id
export async function openSession(orderId: string): Promise<string> {
  const result = await startPayment(orderId, RELEASE_TOKEN, {
    now: PLACED,
    gateway: fakeGateway({ now: () => PLACED }),
    siteUrl: "http://localhost:3000",
    environment: "development",
  })
  if (!result.ok) throw new Error(result.reason)
  return /\/test-payment\/(ps-[0-9a-f]{24})/.exec(result.url)![1]
}

// A fake session forced to Completed whatever its state: a payment that
// slipped past a cancel (spec 033 G2, G3)
export const forceCompleted = (id: string) =>
  db.fakeGatewaySession.update({
    where: { id },
    data: { status: "COMPLETED", paymentId: `py-${id.slice(3)}` },
  })

export const stockOf = async (id: string) =>
  (await db.product.findUniqueOrThrow({ where: { id } })).stock
