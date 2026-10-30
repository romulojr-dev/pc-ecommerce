import { cookies } from "next/headers"

import { isCartId } from "./id"

// The cart's cookie (docs/specs/025-cart-single-items, Behavior 2–5, D4). The
// __Host- prefix makes the browser refuse it unless it is Secure, set from
// path "/" and has no Domain. Chromium treats http://localhost as secure, so
// dev and the Playwright run work; a phone on a LAN address over http does
// not (D4).
export const CART_COOKIE = "__Host-cart"

// 30 days, renewed by every cart change
export const CART_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

// The cart id the browser sent, or null when there is none or it isn't shaped
// like one (such a value is never looked up)
export async function readCartId(): Promise<string | null> {
  const value = (await cookies()).get(CART_COOKIE)?.value
  return isCartId(value) ? value : null
}

// Server actions and route handlers only: a Server Component can't set cookies
export async function writeCartId(cartId: string): Promise<void> {
  ;(await cookies()).set(CART_COOKIE, cartId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CART_COOKIE_MAX_AGE,
  })
}
