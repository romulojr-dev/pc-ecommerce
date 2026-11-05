// When an outbox row is due, and when a recipient is over the cap (docs/specs/
// 035-email-foundation-signed-links, Behavior 4, §4 Outbox). Pure: the claim
// transaction (send.ts) applies these to rows it has locked.

export type EmailStatusName =
  "PENDING" | "SENDING" | "SENT" | "FAILED" | "SKIPPED"

// At most this many emails per recipient in the window (an abuse guard;
// general rate limiting is #64)
export const EMAIL_CAP = 5
export const CAP_WINDOW_MS = 24 * 3_600_000
// A `sending` row whose claim is older than this is taken over
export const LEASE_MS = 5 * 60_000
// A failed row is tried again no sooner than this after its last claim
export const RETRY_AFTER_MS = 5 * 60_000
// Claims per row, takeovers included
export const MAX_ATTEMPTS = 5
// Resend remembers an Idempotency-Key for 24 hours, so a row isn't sent once
// it is that old (D6)
export const SEND_WINDOW_MS = 24 * 3_600_000
// Rows a page's sweep sends, and rows per batch of the daily cron
export const EMAIL_SWEEP_LIMIT = 10
export const EMAIL_CRON_BATCH = 25
// The transport gives up after this; it must stay well inside the lease
export const TRANSPORT_TIMEOUT_MS = 6_000

export type OutboxRow = {
  status: EmailStatusName
  attempts: number
  claimedAt: Date | null
  createdAt: Date
}

export type DueDecision = "send" | "too-old" | "not-due"

export function dueDecision(row: OutboxRow, now: Date): DueDecision {
  const t = now.getTime()
  const claimed = row.claimedAt?.getTime() ?? null
  let due: boolean
  switch (row.status) {
    case "PENDING":
      due = true
      break
    case "SENDING":
      due = claimed === null || t - claimed >= LEASE_MS
      break
    case "FAILED":
      due =
        row.attempts < MAX_ATTEMPTS &&
        (claimed === null || t - claimed >= RETRY_AFTER_MS)
      break
    default:
      due = false
  }
  if (!due) return "not-due"
  return t - row.createdAt.getTime() >= SEND_WINDOW_MS ? "too-old" : "send"
}

export type CapDecision = "send" | "skip"

// `counted`: the recipient's other rows that count (sent or sending within the
// window)
// Emails a staff member triggers by moving an order (docs/specs/043-order-
// fulfillment-transitions, R9). The cap never skips them, but they still
// count in the recipient's 24-hour count: only the skip is exempt.
export const CAP_EXEMPT_TYPES: readonly string[] = [
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "READY_FOR_PICKUP",
]

export const capDecision = (counted: number, type?: string): CapDecision =>
  type !== undefined && CAP_EXEMPT_TYPES.includes(type)
    ? "send"
    : counted >= EMAIL_CAP
      ? "skip"
      : "send"

// Whether a failure is worth another try: a timeout, a network error, a 429, a
// 5xx, or Resend's 409 for a concurrent request with the same key
export function isRetryableCode(code: string): boolean {
  return (
    code === "timeout" ||
    code === "network" ||
    /^http-429(?::|$)/.test(code) ||
    /^http-5\d\d(?::|$)/.test(code) ||
    code.startsWith("http-409:")
  )
}
