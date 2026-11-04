"use server"

import { z } from "zod"

import { type ConfirmResult, confirmCodOrder } from "@/lib/orders/confirm-cod"
import { credentialFromParams } from "@/lib/orders/credential"
import { findOrderByCredential } from "@/lib/orders/get-order"
import { type StartResult, startPayment } from "@/lib/payments/start-payment"

// Pay now and Retry payment (docs/specs/031-pay-with-xendit, Behavior 4, 9,
// 13). Like every server action it is a public POST endpoint, so it has no
// logic of its own: the order is opened by its number and key with the
// page's own checks, and startPayment decides the rest. An unknown number and
// a wrong credential are the same `not-found`. The credential is what the
// page's address holds: the key, or a signed link's `sig`, `exp` and `p`
// (docs/specs/035-email-foundation-signed-links). Rate limiting is #64.

const inputSchema = z.object({
  orderNumber: z.string(),
  key: z.string().nullish(),
  sig: z.string().nullish(),
  exp: z.string().nullish(),
  p: z.string().nullish(),
})

// Confirm order, on the cash order's confirmation page (docs/specs/038-cash-
// on-delivery, Behavior 18). A server action is a POST, so a link scanner that
// opens the page changes nothing. It takes the order number and the link's
// three values and nothing else; confirmCodOrder verifies the signature on
// every call. Rate limiting is #64.
const confirmSchema = z.object({
  orderNumber: z.string(),
  sig: z.string(),
  exp: z.string(),
  p: z.string(),
})

export async function confirmCodOrderAction(
  input: unknown
): Promise<ConfirmResult> {
  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: "not-found" }
  const { orderNumber, ...link } = parsed.data
  return confirmCodOrder(orderNumber, link)
}

export async function startPaymentAction(input: unknown): Promise<StartResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, reason: "not-found" }
  const { orderNumber, ...params } = parsed.data
  const credential = credentialFromParams(params)
  const order = await findOrderByCredential(orderNumber, credential)
  if (!order || (credential.kind !== "token" && credential.kind !== "link")) {
    return { ok: false, reason: "not-found" }
  }
  return startPayment(order.id, credential)
}
