// The email transport's contract (docs/specs/035-email-foundation-signed-
// links, §4 Outbox): plain strings in, a message id or a short code out. It
// knows nothing about orders. The sender (send.ts) calls it with no
// transaction open.

export type EmailMessage = {
  // "Name <address>" or a bare address
  from: string
  to: string
  subject: string
  html: string
  text: string
  // Resend's `Idempotency-Key`: `{orderId}:{type}`. The same key returns the
  // same message instead of sending a second one (for 24 hours).
  idempotencyKey: string
}

// A failure is a code, never a message or a body: `timeout`, `network`,
// `http-{status}[:{name}]`, `invalid-response`
export type SendResult = { ok: true; id: string } | { ok: false; code: string }

export type EmailTransport = {
  send(message: EmailMessage): Promise<SendResult>
}
