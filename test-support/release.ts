import { vi } from "vitest"

import { hashToken } from "@/lib/orders/secrets"
import { fakeGateway } from "@/lib/payments/fake"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
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

// The token openSession pays with: one order per token, since the hash is
// unique
export const releaseTokenHash = (token = RELEASE_TOKEN) => hashToken(token)

// Opens a fake session through Pay now at placement time, for an order made
// with releaseTokenHash(token); returns its id
export async function openSession(
  orderId: string,
  token = RELEASE_TOKEN
): Promise<string> {
  const result = await startPayment(orderId, token, {
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

// Spec 033 S8 (spec 032 H17's rule): wraps db.$transaction to note when one
// is open, and returns the gateway with every call failing the test while it
// is. Restore with vi.restoreAllMocks().
export function guardTransactions(base: PaymentGateway): PaymentGateway {
  let open = 0
  const original = db.$transaction.bind(db)
  vi.spyOn(db, "$transaction").mockImplementation(((
    fn: (tx: unknown) => Promise<unknown>,
    options?: unknown
  ) =>
    original(async (tx) => {
      open++
      try {
        return await fn(tx)
      } finally {
        open--
      }
    }, options as never)) as never)

  const guard =
    <K extends "getSession" | "getPayment" | "closeSession">(name: K) =>
    (...args: Parameters<PaymentGateway[K]>) => {
      if (open > 0) throw new Error(`${name} called inside a transaction`)
      return (base[name] as (...a: typeof args) => unknown)(...args)
    }
  return {
    ...base,
    getSession: guard("getSession"),
    getPayment: guard("getPayment"),
    closeSession: guard("closeSession"),
  } as PaymentGateway
}
