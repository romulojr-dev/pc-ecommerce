import { randomBytes } from "node:crypto"

// A shared build's link (docs/specs/022-share-build, Rules › Same contents,
// same link): 10 random characters of a-z and 0-9, made when the row is
// first created and never derived from the contents. An unguessable slug is
// the only access control (about 51 bits).

export const SHARE_SLUG_LENGTH = 10
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"

// Largest multiple of the alphabet size that fits in a byte (7 × 36): bytes
// from here up are skipped, so no character is likelier than another
const LIMIT = 252

const SLUG_SHAPE = /^[a-z0-9]{10}$/

// True for anything shaped like a share slug. The page 404s on anything else
// without touching the database.
export function isShareSlug(value: string): boolean {
  return SLUG_SHAPE.test(value)
}

// `bytes` is the source of randomness; tests pass their own
export function randomSlug(
  bytes: (count: number) => Uint8Array = randomBytes
): string {
  let slug = ""
  while (slug.length < SHARE_SLUG_LENGTH) {
    for (const byte of bytes(SHARE_SLUG_LENGTH)) {
      if (byte >= LIMIT) continue
      slug += ALPHABET[byte % ALPHABET.length]
      if (slug.length === SHARE_SLUG_LENGTH) break
    }
  }
  return slug
}
