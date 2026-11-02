import { createHash, timingSafeEqual } from "node:crypto"

// Comparing a secret a request sent with the one the server holds: Xendit's
// webhook token (docs/specs/032-payment-webhooks) and the cron secret
// (docs/specs/033-release-unpaid-orders). Server only.

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest()

// Constant time: both sides are hashed first, so different lengths can't
// return early. Missing or empty on either side never matches.
export function secretMatches(
  given: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!given || !expected) return false
  return timingSafeEqual(sha256(given), sha256(expected))
}

// The token of an `Authorization: Bearer <token>` header, or null for any
// other shape (another scheme, no token, extra parts)
export function bearerOf(header: string | null | undefined): string | null {
  const match = /^Bearer ([^\s,]+)$/.exec(header ?? "")
  return match ? match[1] : null
}
