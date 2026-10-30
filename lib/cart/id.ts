import { randomBytes } from "node:crypto"

// The cart id (docs/specs/025-cart-single-items, D3): 128 random bits in
// URL-safe base64, 22 characters. It is a bearer token, so it is never a
// cuid and never derived from anything.
const CART_ID_SHAPE = /^[A-Za-z0-9_-]{22}$/

export function newCartId(): string {
  return randomBytes(16).toString("base64url")
}

// True for anything shaped like a cart id. A cookie that isn't is treated as
// no cart, without a database read.
export function isCartId(value: unknown): value is string {
  return typeof value === "string" && CART_ID_SHAPE.test(value)
}
