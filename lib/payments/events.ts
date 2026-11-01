import { createHash, timingSafeEqual } from "node:crypto"

import { logPaymentEvent } from "./log"
import type { WebhookOutcome } from "./outcome"
import { type ReconcileOptions, reconcileSession } from "./reconcile"
import { MAX_WEBHOOK_BYTES, parseWebhook, webhookStatus } from "./webhook"

// Where payment events arrive (docs/specs/032-payment-webhooks, behavior
// 1–6 and 18; ADR 0010): POST /api/webhooks/xendit, and the fake payment page
// in process, so the fake runs the same code path as a webhook.
//
//   token → size → body → reconcileSession → HTTP answer
//
// Xendit sends a static verification token in the x-callback-token header,
// not a signature, so the body is only a hint carrying a session id:
// reconcileSession asks Xendit what really happened. Every call writes
// exactly one log line, the ignored ones included.

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
  // A request's Headers (a repeated header reads as "a, b", so it never
  // matches), or plain pairs from the fake page
  headers: Headers | Record<string, string>
  body: string
}

export type DeliveryResult = { status: number; outcome: WebhookOutcome }

export type DeliveryOptions = {
  // Test seam: the unit tests replace the database-backed reconcile
  reconcile?: typeof reconcileSession
  reconcileOptions?: Omit<ReconcileOptions, "event">
}

function headerOf(headers: PaymentEvent["headers"], name: string) {
  if (headers instanceof Headers) return headers.get(name)
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name
  )?.[1]
}

// `expectedToken` is XENDIT_WEBHOOK_TOKEN, passed in by the caller
export async function handlePaymentEvent(
  { headers, body }: PaymentEvent,
  expectedToken: string | undefined,
  { reconcile = reconcileSession, reconcileOptions }: DeliveryOptions = {}
): Promise<DeliveryResult> {
  const done = (
    outcome: WebhookOutcome,
    fields: {
      type?: string
      sessionId?: string
      orderNumber?: string
      code?: string
    } = {}
  ): DeliveryResult => {
    logPaymentEvent({ event: "payment.webhook", outcome, ...fields })
    return { status: webhookStatus(outcome), outcome }
  }

  // Nothing is read or written before the token matches
  if (
    !callbackTokenMatches(
      headerOf(headers, CALLBACK_TOKEN_HEADER),
      expectedToken
    )
  ) {
    return done("unauthorized")
  }
  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES) {
    return done("too-large")
  }

  const parsed = parseWebhook(body)
  if (parsed.kind === "malformed") return done("malformed")
  if (parsed.kind !== "event") {
    return done(parsed.kind, { type: parsed.eventName })
  }

  const { eventName: type, sessionId } = parsed
  const result = await reconcile(sessionId, {
    ...reconcileOptions,
    event: { eventId: parsed.eventId, type, payload: parsed.payload },
  })
  return done(result.outcome, {
    type,
    sessionId,
    orderNumber: result.orderNumber,
    code: result.code,
  })
}
