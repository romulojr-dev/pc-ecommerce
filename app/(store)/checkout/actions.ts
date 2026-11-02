"use server"

import { readCartId } from "@/lib/cart/cookie"
import {
  type ReviewResult,
  reviewCheckout,
} from "@/lib/checkout/review-checkout"
import { ordersEnabled } from "@/lib/orders/enabled"
import { findOrderByKey } from "@/lib/orders/get-order"
import { orderLink } from "@/lib/orders/link"
import { type PlaceResult, placeOrder } from "@/lib/orders/place-order"
import { linkAfterStart } from "@/lib/payments/pay-link"
import { startPayment } from "@/lib/payments/start-payment"

// What the browser gets for a review: the server's answer, and on success
// whether Place order is switched on (docs/specs/030-place-an-order, D13). The
// switch is read here, not in lib/checkout, so the review itself stays free of
// the environment.
export type ReviewActionResult =
  | (Extract<ReviewResult, { ok: true }> & { ordersEnabled: boolean })
  | Exclude<ReviewResult, { ok: true }>

// The checkout's server action (docs/specs/029-checkout-steps, D1). Like every
// server action it is a public POST endpoint, so it has no logic of its own:
// reviewCheckout checks the input and the cart. It only reads: no write, no
// cookie set. The cart comes only from the cookie. Rate limiting is #64.
export async function reviewCheckoutAction(
  input: unknown
): Promise<ReviewActionResult> {
  const result = await reviewCheckout(await readCartId(), input)
  return result.ok ? { ...result, ordersEnabled: ordersEnabled() } : result
}

// What the browser gets back from Place order (docs/specs/030-place-an-order):
// the order's link and the cart's new count, or why not. `disabled` is the
// ORDERS_ENABLED switch being off. `payUrl` is the payment page to go to
// (docs/specs/031-pay-with-xendit, Behavior 1–3); when no session opened it is
// null and the link carries `payment=error`, so the order page says why.
export type PlaceActionResult =
  | { ok: true; link: string; payUrl: string | null; count: 0 }
  | Exclude<PlaceResult, { ok: true }>
  | { ok: false; reason: "disabled" }

// Place order's server action. Like every action it is a public POST endpoint,
// so it checks the ORDERS_ENABLED switch first (a hidden button alone would
// not stop a direct call), then forwards: placeOrder checks the input, the
// cart and the stock. The cart comes only from the cookie. It sets no cookie:
// the cart cookie stays, with an empty cart behind it. Rate limiting is #64.
export async function placeOrderAction(
  input: unknown
): Promise<PlaceActionResult> {
  if (!ordersEnabled()) return { ok: false, reason: "disabled" }
  const result = await placeOrder(await readCartId(), input)
  if (!result.ok) return result
  const link = orderLink(result.orderNumber, result.accessToken)

  // Then straight to a payment session. The order stands whatever this does
  // (spec 031, D3); a replay starts a fresh session the same way.
  const order = await findOrderByKey(result.orderNumber, result.accessToken)
  const payment = order
    ? await startPayment(order.id, result.accessToken)
    : ({ ok: false, reason: "error" } as const)
  if (payment.ok) return { ok: true, link, payUrl: payment.url, count: 0 }
  return {
    ok: true,
    link: linkAfterStart(link, payment),
    payUrl: null,
    count: 0,
  }
}
