"use server"

import { readCartId } from "@/lib/cart/cookie"
import {
  type ReviewResult,
  reviewCheckout,
} from "@/lib/checkout/review-checkout"
import { ordersEnabled } from "@/lib/orders/enabled"

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
