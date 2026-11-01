import { createHash, timingSafeEqual } from "node:crypto"

// Where payment events arrive (docs/specs/031-pay-with-xendit, §6 The event
// seam; ADR 0010). Xendit sends a static verification token in the
// x-callback-token header, not a signature. In this story the only sender is
// the fake payment page, in process; #80 adds POST /api/webhooks/xendit and
// replaces this function's body with the real handler, so the fake runs the
// same code path as a webhook.

export const CALLBACK_TOKEN_HEADER = "x-callback-token"

const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest()

// Constant time: both sides are hashed first, so different lengths can't
// return early
export function callbackTokenMatches(
  given: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!given || !expected) return false
  return timingSafeEqual(sha256(given), sha256(expected))
}

export type PaymentEvent = {
  headers: Record<string, string>
  body: string
}

export type DeliveryResult = { ok: true } | { ok: false; status: 400 | 401 }

// `expectedToken` is XENDIT_WEBHOOK_TOKEN, passed in so this stays free of
// the environment (and testable without it)
export function deliverPaymentEvent(
  { headers, body }: PaymentEvent,
  expectedToken: string | undefined
): DeliveryResult {
  const given = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === CALLBACK_TOKEN_HEADER
  )?.[1]
  if (!callbackTokenMatches(given, expectedToken)) {
    return { ok: false, status: 401 }
  }

  let event: unknown
  try {
    event = JSON.parse(body)
  } catch {
    return { ok: false, status: 400 }
  }
  const type =
    typeof event === "object" && event !== null && "event" in event
      ? String(event.event)
      : "unknown"
  const sessionId =
    typeof event === "object" &&
    event !== null &&
    "data" in event &&
    typeof event.data === "object" &&
    event.data !== null &&
    "payment_session_id" in event.data
      ? String(event.data.payment_session_id)
      : "unknown"
  // Until #80 an event is only recorded as delivered: nothing marks Paid
  console.info(`payment.event_delivered: ${type} ${sessionId}`)
  return { ok: true }
}
