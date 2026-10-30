"use server"

import { refresh } from "next/cache"

import {
  addToCart,
  type CartOutcome,
  removeFromCart,
  setCartQuantity,
} from "@/lib/cart/cart"
import { readCartId, writeCartId } from "@/lib/cart/cookie"
import type { CartResult } from "@/lib/cart/types"

// The cart's server actions (docs/specs/025-cart-single-items, Behavior 7–11,
// 19–21). Like every server action they are public POST endpoints, so they
// trust nothing they are sent and have no logic of their own: lib/cart/cart.ts
// checks the input and the cart. The cart comes only from the cookie. Each
// returns the result and never the cart id. Rate limiting is #64.

// Renews the cookie when the cart changed, and hands back the result
async function settle({ result, cartId, renewCookie }: CartOutcome) {
  if (renewCookie && cartId) await writeCartId(cartId)
  return result
}

export async function addToCartAction(input: unknown): Promise<CartResult> {
  return settle(await addToCart(input, { cartId: await readCartId() }))
}

export async function setCartQuantityAction(
  input: unknown
): Promise<CartResult> {
  const result = await settle(
    await setCartQuantity(input, { cartId: await readCartId() })
  )
  // The cart page shows the new line, total and subtotal
  refresh()
  return result
}

export async function removeFromCartAction(
  input: unknown
): Promise<CartResult> {
  const result = await settle(
    await removeFromCart(input, { cartId: await readCartId() })
  )
  refresh()
  return result
}
