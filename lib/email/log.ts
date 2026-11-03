// Email logging (docs/specs/035-email-foundation-signed-links, Behavior 8):
// JSON with the event, the outbox id, the type and a short code or reason.
// Never the address, its hash, a link, a signature, a token, the subject or
// the body. Errors thrown by our own code go through logSafeFailure
// (lib/orders/log.ts).

export type EmailLogFields = {
  event: "email.sent" | "email.failed" | "email.skipped"
  outboxId: string
  type: string
  // A failure code: timeout, http-422:validation_error, no-template, too-old
  code?: string
  // Why a row was skipped: recipient-cap
  reason?: string
}

export function logEmailEvent(fields: EmailLogFields): void {
  const line = JSON.stringify({
    event: fields.event,
    outboxId: fields.outboxId,
    type: fields.type,
    code: fields.code,
    reason: fields.reason,
  })
  if (fields.event === "email.failed") console.error(line)
  else console.info(line)
}
