// Payment logging (docs/specs/031-pay-with-xendit, §4 Logging): an event name
// and a gateway's failure code or a session id, nothing else. Never the
// secret key, the order's token, a return URL, a request or response body,
// or a shopper's details. Errors thrown by our own code go through
// logSafeFailure (lib/orders/log.ts).

export function logGatewayFailure(event: string, code: string): void {
  console.error(`${event} failed: ${code}`)
}

// One line per webhook or reconcile (docs/specs/032-payment-webhooks, rule
// Logging, L1–L9), the ignored ones included: JSON with only these fields,
// those known at that point. Never the token, the body, the order's key, a URL
// or a shopper's details.
export type PaymentLogFields = {
  event: "payment.webhook" | "payment.reconcile"
  outcome: string
  // Xendit's event name
  type?: string
  sessionId?: string
  orderNumber?: string
  // A gateway failure code, a session's environment, or "unknown-order"
  code?: string
}

export function logPaymentEvent(fields: PaymentLogFields): void {
  const line = JSON.stringify({
    event: fields.event,
    outcome: fields.outcome,
    type: fields.type,
    sessionId: fields.sessionId,
    orderNumber: fields.orderNumber,
    code: fields.code,
  })
  if (fields.outcome === "retry" || fields.outcome === "error") {
    console.error(line)
  } else {
    console.info(line)
  }
}

// A session the gateway made but no Payment row records (A11): #80 finds its
// order through the session's metadata
export function logOrphanedSession(provider: string, sessionId: string): void {
  console.error(`payment.session_orphaned: ${provider} ${sessionId}`)
}
