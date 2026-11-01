import type { SessionInput } from "./session-request"

// The provider-neutral payment gateway (docs/specs/031-pay-with-xendit, §6
// The gateway interface; ADR 0010). The rest of the app speaks only this:
// centavos, instants and neutral statuses. Each adapter maps its gateway's
// words onto these. Types only.

export type ProviderName = "XENDIT" | "FAKE"

// A session's state at the gateway. `closed` is a session we cancelled
// (Xendit's CANCELED).
export type SessionStatus = "active" | "completed" | "expired" | "closed"

// A failure, as a short code that is safe to log: never a body, a key or a
// URL (e.g. "timeout", "http-500", "http-400:INVALID_AMOUNT")
export type GatewayFailure = { ok: false; code: string }

export type CreatedSession = {
  id: string
  // Where the shopper pays
  url: string
  status: SessionStatus
  expiresAt: Date
}

export type SessionDetails = {
  id: string
  status: SessionStatus
  // null when the gateway's amount isn't a valid peso amount
  amountCentavos: number | null
  currency: string
  metadata: Record<string, unknown> | null
  // The captured payment, once there is one
  paymentId: string | null
}

export type PaymentDetails = {
  id: string
  status: "succeeded" | "failed" | "pending"
  amountCentavos: number | null
  currency: string
  // The channel paid with, e.g. GCASH, PAYMAYA, CARDS
  method: string | null
}

// Closing a session (spec 031, Behavior 14): `closed` when it is no longer
// payable (cancelled now, or already expired or cancelled), `completed` when
// it was paid first
export type CloseOutcome = "closed" | "completed"

export interface PaymentGateway {
  readonly provider: ProviderName
  // Who the return page is waiting to hear from ("Xendit")
  readonly name: string
  // The Test mode banner's instructions (FR-27)
  readonly testInstructions: string
  createSession(
    input: SessionInput
  ): Promise<{ ok: true; session: CreatedSession } | GatewayFailure>
  closeSession(
    id: string
  ): Promise<{ ok: true; outcome: CloseOutcome } | GatewayFailure>
  // null: the gateway doesn't know the session
  getSession(
    id: string
  ): Promise<{ ok: true; session: SessionDetails | null } | GatewayFailure>
  // For #80: confirm a payment before marking an order Paid
  getPayment(
    id: string
  ): Promise<{ ok: true; payment: PaymentDetails | null } | GatewayFailure>
}
