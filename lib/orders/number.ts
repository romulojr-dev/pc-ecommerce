import { randomInt } from "node:crypto"

// The order number (docs/specs/030-place-an-order, §4 Order number): "PCS-"
// and 8 characters of Crockford's base32 (no I, L, O or U, so a number read
// aloud or off a screen can't be mistaken), drawn from the crypto source.
// 40 bits, random and non-sequential. A collision is handled by the placement
// (retry), not prevented here.

export const ORDER_NUMBER_PREFIX = "PCS-"
export const ORDER_NUMBER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const LENGTH = 8
const SHAPE = /^PCS-[0-9A-HJKMNP-TV-Z]{8}$/

export function newOrderNumber(
  // Tests pass a known source; production uses the crypto one
  pick: (max: number) => number = (max) => randomInt(max)
): string {
  let tail = ""
  for (let i = 0; i < LENGTH; i++) {
    tail += ORDER_NUMBER_ALPHABET[pick(ORDER_NUMBER_ALPHABET.length)]
  }
  return ORDER_NUMBER_PREFIX + tail
}

// True for anything shaped like an order number, uppercase only. The order
// page doesn't fold case or map look-alike characters: nobody types the link.
export function orderNumberShape(value: unknown): value is string {
  return typeof value === "string" && SHAPE.test(value)
}
