import { credentialQuery, type OrderCredential } from "@/lib/orders/credential"

import { sessionDescription } from "./copy"
import { canStartSession } from "./payable"

// What a new payment session asks the gateway for (docs/specs/031-pay-with-
// xendit, §4, S1–S8), in the store's own units: centavos and instants. Each
// adapter turns it into its gateway's request. Pure.
//
// Nothing about the shopper goes in it (D6): no name, contact, address or
// items. The return URLs carry the order's credential: its key, or a freshly
// signed link (ADR 0010; docs/specs/035-email-foundation-signed-links, D5).

// The longest session asked for (spec 031, Q2)
export const SESSION_MAX_HOURS = 24

export type PaymentEnvironment = "production" | "preview" | "development"

// The `payment=` value each return URL adds to the order link
export type PaymentParam = "return" | "cancelled" | "error"

export type SessionInput = {
  // `{orderNumber}-{attempt}`: unique per session, and the order number stays
  // readable in the gateway's dashboard (D4)
  referenceId: string
  amountCentavos: number
  currency: "PHP"
  description: string
  metadata: {
    order_id: string
    order_number: string
    environment: PaymentEnvironment
  }
  successUrl: string
  cancelUrl: string
  expiresAt: Date
}

export type SessionOrder = {
  id: string
  orderNumber: string
  total: number
  expiresAt: Date
}

export type SessionContext = {
  // The site's own origin (NEXT_PUBLIC_SITE_URL), never the request's Host
  siteUrl: string
  // How the return URLs open the order: the access token (from the caller:
  // only its hash is stored) or a signed `view` link
  credential: OrderCredential
  environment: PaymentEnvironment
  // 1 + the order's earlier payments
  attempt: number
  now: Date
}

// The order link with a `payment=` value, as an absolute URL on the site
export function returnUrl(
  siteUrl: string,
  orderNumber: string,
  credential: OrderCredential,
  payment: PaymentParam
): string {
  const base = siteUrl.replace(/\/+$/, "")
  return `${base}/orders/${orderNumber}?${credentialQuery(credential)}&payment=${payment}`
}

export function sessionRequest(
  order: SessionOrder,
  { siteUrl, credential, environment, attempt, now }: SessionContext
): { ok: true; input: SessionInput } | { ok: false; reason: "expired" } {
  if (!canStartSession(order.expiresAt, now)) {
    return { ok: false, reason: "expired" }
  }
  const cap = now.getTime() + SESSION_MAX_HOURS * 3_600_000
  return {
    ok: true,
    input: {
      referenceId: `${order.orderNumber}-${attempt}`,
      amountCentavos: order.total,
      currency: "PHP",
      description: sessionDescription(order.orderNumber),
      metadata: {
        order_id: order.id,
        order_number: order.orderNumber,
        environment,
      },
      successUrl: returnUrl(siteUrl, order.orderNumber, credential, "return"),
      cancelUrl: returnUrl(siteUrl, order.orderNumber, credential, "cancelled"),
      expiresAt: new Date(Math.min(order.expiresAt.getTime(), cap)),
    },
  }
}
