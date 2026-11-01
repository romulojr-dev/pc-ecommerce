// Payment logging (docs/specs/031-pay-with-xendit, §4 Logging): an event name
// and a gateway's failure code or a session id, nothing else. Never the
// secret key, the order's token, a return URL, a request or response body,
// or a shopper's details. Errors thrown by our own code go through
// logSafeFailure (lib/orders/log.ts).

export function logGatewayFailure(event: string, code: string): void {
  console.error(`${event} failed: ${code}`)
}

// A session the gateway made but no Payment row records (A11): #80 finds its
// order through the session's metadata
export function logOrphanedSession(provider: string, sessionId: string): void {
  console.error(`payment.session_orphaned: ${provider} ${sessionId}`)
}
