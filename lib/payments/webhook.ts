import type { WebhookOutcome } from "./outcome"

// Reading a Xendit webhook body (docs/specs/032-payment-webhooks, behavior
// 3–6, B1–B6). Only the event type and the session id are read: everything
// else comes from Xendit's API (rule Only reconcileSession sets Paid). Pure.

// Xendit's session bodies are under 2 KB
export const MAX_WEBHOOK_BYTES = 64 * 1024

// Xendit's payment_session_id: "ps-" and 24 hex characters
export const SESSION_ID = /^ps-[0-9a-f]{24}$/

const TYPES = {
  "payment_session.completed": "completed",
  "payment_session.expired": "expired",
} as const

export type SessionEventType = (typeof TYPES)[keyof typeof TYPES]

export type ParsedWebhook =
  | {
      kind: "event"
      type: SessionEventType
      // Xendit's name, e.g. "payment_session.completed"
      eventName: string
      sessionId: string
      // Xendit sends no event id: a session completes or expires once
      eventId: string
      payload: unknown
    }
  | { kind: "ignored-type"; eventName: string }
  | { kind: "ignored-unknown"; eventName: string }
  | { kind: "malformed" }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export function parseWebhook(body: string): ParsedWebhook {
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return { kind: "malformed" }
  }
  if (!isRecord(payload) || typeof payload.event !== "string") {
    return { kind: "malformed" }
  }

  const eventName = payload.event
  const type = TYPES[eventName as keyof typeof TYPES]
  if (!type) return { kind: "ignored-type", eventName }

  const sessionId = isRecord(payload.data)
    ? payload.data.payment_session_id
    : undefined
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    return { kind: "ignored-unknown", eventName }
  }
  return {
    kind: "event",
    type,
    eventName,
    sessionId,
    eventId: `${eventName}:${sessionId}`,
    payload,
  }
}

// The HTTP answer (behavior 18): 5xx only for what a later try can fix, so
// Xendit retries those and nothing else
export function webhookStatus(outcome: WebhookOutcome): number {
  switch (outcome) {
    case "unauthorized":
      return 401
    case "malformed":
      return 400
    case "too-large":
      return 413
    case "active":
    case "not-yet":
    case "retry":
      return 503
    case "error":
      return 500
    default:
      return 200
  }
}
