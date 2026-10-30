"use server"

import { refresh } from "next/cache"

import { addBuildToCart, removeBuildFromCart } from "@/lib/cart/build"
import {
  addToCart,
  type CartOutcome,
  removeFromCart,
  setCartQuantity,
} from "@/lib/cart/cart"
import { readCartId, writeCartId } from "@/lib/cart/cookie"
import type { BuildCartResult, CartResult } from "@/lib/cart/types"

// The cart's server actions (docs/specs/025-cart-single-items, Behavior 7–11,
// 19–21). Like every server action they are public POST endpoints, so they
// trust nothing they are sent and have no logic of their own: lib/cart/cart.ts
// checks the input and the cart. The cart comes only from the cookie. Each
// returns the result and never the cart id. Rate limiting is #64.

// Renews the cookie when the cart changed, and hands back the result
async function settle<Result>({
  result,
  cartId,
  renewCookie,
}: CartOutcome<Result>): Promise<Result> {
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

// Add build to cart (docs/specs/026-add-build-to-cart): the input is the
// build's items and the keys of the warnings the shopper confirmed, nothing
// else. The server checks the build itself and answers with what the builder
// shows; the cart page isn't open, so there is nothing to refresh.
export async function addBuildToCartAction(
  input: unknown
): Promise<BuildCartResult> {
  return settle(await addBuildToCart(input, { cartId: await readCartId() }))
}

// Removes a whole build group from the cart page
export async function removeBuildFromCartAction(
  input: unknown
): Promise<CartResult> {
  const result = await settle(
    await removeBuildFromCart(input, { cartId: await readCartId() })
  )
  refresh()
  return result
}
