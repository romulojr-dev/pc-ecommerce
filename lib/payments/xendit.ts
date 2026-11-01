import { z } from "zod"

import { fromProviderAmount, toProviderAmount } from "./amount"
import { XENDIT_INSTRUCTIONS } from "./copy"
import type {
  GatewayFailure,
  PaymentDetails,
  PaymentGateway,
  SessionDetails,
  SessionStatus,
} from "./gateway-types"
import type { SessionInput } from "./session-request"

// The Xendit adapter (docs/specs/031-pay-with-xendit, §6; ADR 0010): Payment
// Sessions in PAYMENT_LINK mode, through fetch, with no SDK (D5).
//
//   create  POST /sessions                       (docs: apidocs/create-session)
//   close   POST /sessions/{id}/cancel           (apidocs/cancel-session)
//   read    GET  /sessions/{id}                  (apidocs/get-session)
//   payment GET  /v3/payments/{id}               (apidocs/get-payment)
//
// Basic auth with the secret key as the username and an empty password. The
// key, the request and response bodies and the URLs are never logged or put
// in a failure code; a code is the HTTP status and Xendit's error_code.

export const XENDIT_API = "https://api.xendit.co"
// One call's limit; three calls fit inside startPayment's transaction
export const XENDIT_TIMEOUT_MS = 6_000
// The channels the store offers (PRD, Payments; spec 031, S1)
export const XENDIT_CHANNELS = ["GCASH", "PAYMAYA", "CARDS"] as const
// The v3 payments API's version header (apidocs/get-payment)
const PAYMENTS_API_VERSION = "2024-11-11"

export type XenditOptions = {
  secretKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

const STATUS: Record<string, SessionStatus> = {
  ACTIVE: "active",
  COMPLETED: "completed",
  EXPIRED: "expired",
  CANCELED: "closed",
}

const sessionSchema = z.object({
  payment_session_id: z.string().min(1),
  reference_id: z.string(),
  status: z.string(),
  amount: z.unknown(),
  currency: z.string(),
  expires_at: z.string().optional(),
  payment_link_url: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  payment_id: z.string().nullish(),
})

const paymentSchema = z.object({
  payment_id: z.string().min(1),
  status: z.string(),
  request_amount: z.unknown(),
  currency: z.string(),
  channel_code: z.string().nullish(),
})

const errorSchema = z.object({ error_code: z.string().regex(/^[A-Z0-9_]+$/) })

// Xendit's session body for the store's request (S1)
export function xenditSessionBody(input: SessionInput) {
  return {
    reference_id: input.referenceId,
    session_type: "PAY",
    mode: "PAYMENT_LINK",
    currency: input.currency,
    country: "PH",
    amount: toProviderAmount(input.amountCentavos),
    allowed_payment_channels: [...XENDIT_CHANNELS],
    expires_at: input.expiresAt.toISOString(),
    description: input.description,
    metadata: input.metadata,
    success_return_url: input.successUrl,
    cancel_return_url: input.cancelUrl,
  }
}

const toSession = (
  data: z.infer<typeof sessionSchema>
): SessionDetails | null => {
  const status = STATUS[data.status]
  if (!status) return null
  return {
    id: data.payment_session_id,
    status,
    amountCentavos: fromProviderAmount(data.amount),
    currency: data.currency,
    metadata: data.metadata ?? null,
    paymentId: data.payment_id ?? null,
    referenceId: data.reference_id,
    expiresAt: expiresAtOf(data.expires_at),
  }
}

// An instant, or null for a missing or unreadable one
function expiresAtOf(text: string | undefined): Date | null {
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

const toPayment = (data: z.infer<typeof paymentSchema>): PaymentDetails => ({
  id: data.payment_id,
  status:
    data.status === "SUCCEEDED"
      ? "succeeded"
      : data.status === "FAILED"
        ? "failed"
        : "pending",
  amountCentavos: fromProviderAmount(data.request_amount),
  currency: data.currency,
  method: data.channel_code ?? null,
})

export function xenditGateway({
  secretKey,
  fetch: fetcher = fetch,
  timeoutMs = XENDIT_TIMEOUT_MS,
}: XenditOptions): PaymentGateway {
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`

  // One call: the parsed JSON on 2xx, or a failure code
  async function call(
    method: "GET" | "POST",
    path: string,
    { body, headers }: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<{ ok: true; status: number; json: unknown } | GatewayFailure> {
    let response: Response
    try {
      response = await fetcher(`${XENDIT_API}${path}`, {
        method,
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      })
    } catch (error) {
      const name = error instanceof Error ? error.name : ""
      return {
        ok: false,
        code:
          name === "TimeoutError" || name === "AbortError"
            ? "timeout"
            : "network",
      }
    }
    const json: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, status: response.status, json }
    const known = errorSchema.safeParse(json)
    return {
      ok: false,
      code: known.success
        ? `http-${response.status}:${known.data.error_code}`
        : `http-${response.status}`,
    }
  }

  const readSession = async (id: string) => {
    const result = await call("GET", `/sessions/${encodeURIComponent(id)}`)
    if (!result.ok) {
      return result.code.startsWith("http-404")
        ? ({ ok: true, session: null } as const)
        : result
    }
    const parsed = sessionSchema.safeParse(result.json)
    if (!parsed.success) return { ok: false, code: "invalid-response" } as const
    const session = toSession(parsed.data)
    return session
      ? ({ ok: true, session } as const)
      : ({ ok: false, code: "invalid-response" } as const)
  }

  return {
    provider: "XENDIT",
    name: "Xendit",
    testInstructions: XENDIT_INSTRUCTIONS,

    async createSession(input) {
      const result = await call("POST", "/sessions", {
        body: xenditSessionBody(input),
      })
      if (!result.ok) return result
      const parsed = sessionSchema.safeParse(result.json)
      const status = parsed.success ? STATUS[parsed.data.status] : undefined
      if (
        !parsed.success ||
        !status ||
        !parsed.data.payment_link_url ||
        !parsed.data.expires_at
      ) {
        return { ok: false, code: "invalid-response" }
      }
      return {
        ok: true,
        session: {
          id: parsed.data.payment_session_id,
          url: parsed.data.payment_link_url,
          status,
          expiresAt: new Date(parsed.data.expires_at),
        },
      }
    },

    async closeSession(id) {
      const result = await call(
        "POST",
        `/sessions/${encodeURIComponent(id)}/cancel`
      )
      if (result.ok) return { ok: true, outcome: "cancelled" }
      // 422: only ACTIVE sessions can be cancelled, so it had already ended
      if (result.code.startsWith("http-422")) {
        return { ok: true, outcome: "not-active" }
      }
      return result
    },

    getSession: readSession,

    async getPayment(id) {
      const result = await call(
        "GET",
        `/v3/payments/${encodeURIComponent(id)}`,
        {
          headers: { "api-version": PAYMENTS_API_VERSION },
        }
      )
      if (!result.ok) {
        return result.code.startsWith("http-404")
          ? { ok: true, payment: null }
          : result
      }
      const parsed = paymentSchema.safeParse(result.json)
      return parsed.success
        ? { ok: true, payment: toPayment(parsed.data) }
        : { ok: false, code: "invalid-response" }
    },
  }
}
