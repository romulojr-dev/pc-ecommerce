"use server"

import { z } from "zod"

import { findOrderByKey } from "@/lib/orders/get-order"
import { type StartResult, startPayment } from "@/lib/payments/start-payment"

// Pay now and Retry payment (docs/specs/031-pay-with-xendit, Behavior 4, 9,
// 13). Like every server action it is a public POST endpoint, so it has no
// logic of its own: the order is opened by its number and key with the
// page's own checks, and startPayment decides the rest. An unknown number and
// a wrong key are the same `not-found`. Rate limiting is #64.

const inputSchema = z.object({
  orderNumber: z.string(),
  key: z.string(),
})

export async function startPaymentAction(input: unknown): Promise<StartResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: "not-found" }
  const { orderNumber, key } = parsed.data
  const order = await findOrderByKey(orderNumber, key)
  if (!order) return { ok: false, reason: "not-found" }
  return startPayment(order.id, key)
}
