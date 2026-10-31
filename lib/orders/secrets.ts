import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

// The order's secrets (docs/specs/030-place-an-order, §4 Order number, token,
// key; D1, D14). Node only. The access token is a bearer secret: only its
// SHA-256 is ever stored, and none of these values is ever logged.

const KEY_BYTES = 16 // 128 bits, 22 characters
const TOKEN_BYTES = 32 // 256 bits, 43 characters

// A string is a canonical base64url encoding of exactly `bytes` bytes when
// it decodes to that many and encodes back to the same text. That refuses
// every other length, padding, characters outside the alphabet, and the
// non-canonical last character (22 characters carry 132 bits for 128).
function canonical(value: unknown, bytes: number): value is string {
  if (typeof value !== "string") return false
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false
  const decoded = Buffer.from(value, "base64url")
  return decoded.length === bytes && decoded.toString("base64url") === value
}

export const newIdempotencyKey = (): string =>
  randomBytes(KEY_BYTES).toString("base64url")

export const newAccessToken = (): string =>
  randomBytes(TOKEN_BYTES).toString("base64url")

export const keyShape = (value: unknown): value is string =>
  canonical(value, KEY_BYTES)

export const tokenShape = (value: unknown): value is string =>
  canonical(value, TOKEN_BYTES)

const sha256 = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex")

// What the order stores in place of the token
export const hashToken = (token: string): string => sha256(token)

// What the order stores in place of the cart id, which is the cart's bearer
// cookie and so is never copied into another table
export const hashCartId = (cartId: string): string => sha256(cartId)

// True when `token` hashes to `storedHash`, compared in constant time. A
// token or hash of the wrong shape is false, never a throw.
export function tokenMatches(token: unknown, storedHash: unknown): boolean {
  if (typeof token !== "string" || typeof storedHash !== "string") return false
  const given = Buffer.from(hashToken(token), "hex")
  const stored = Buffer.from(storedHash, "hex")
  // timingSafeEqual throws on unequal lengths, so compare only equal ones
  if (stored.length !== given.length) return false
  return timingSafeEqual(given, stored)
}

// What a missing order is compared against, so a lookup that finds nothing
// does the same work as one that finds an order (the 404s stay alike)
export const DUMMY_TOKEN_HASH = sha256("no such order")
