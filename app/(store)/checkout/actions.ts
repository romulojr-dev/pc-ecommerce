"use server"

import { readCartId } from "@/lib/cart/cookie"
import {
  type ReviewResult,
  reviewCheckout,
} from "@/lib/checkout/review-checkout"

// The checkout's server action (docs/specs/029-checkout-steps, D1). Like every
// server action it is a public POST endpoint, so it has no logic of its own:
// reviewCheckout checks the input and the cart. It only reads: no write, no
// cookie set. The cart comes only from the cookie. Rate limiting is #64.
export async function reviewCheckoutAction(
  input: unknown
): Promise<ReviewResult> {
  return reviewCheckout(await readCartId(), input)
}
