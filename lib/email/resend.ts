import { z } from "zod"

import { TRANSPORT_TIMEOUT_MS } from "./due"
import type { EmailTransport } from "./transport"

// The Resend adapter (docs/specs/035-email-foundation-signed-links, §4
// Outbox): POST /emails through fetch, with no SDK. The key, the address, the
// subject and the body are never logged or put in a failure code; a code is
// the HTTP status and Resend's error name.

export const RESEND_API = "https://api.resend.com"

export type ResendOptions = {
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
}

const okSchema = z.object({ id: z.string().min(1) })
const errorSchema = z.object({ name: z.string().regex(/^[a-z_]+$/) })

export function resendTransport({
  apiKey,
  fetch: doFetch = fetch,
  timeoutMs = TRANSPORT_TIMEOUT_MS,
}: ResendOptions): EmailTransport {
  return {
    async send(message) {
      let response: Response
      try {
        response = await doFetch(`${RESEND_API}/emails`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": message.idempotencyKey,
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: AbortSignal.timeout(timeoutMs),
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

      const body: unknown = await response.json().catch(() => null)
      if (response.ok) {
        const parsed = okSchema.safeParse(body)
        return parsed.success
          ? { ok: true, id: parsed.data.id }
          : { ok: false, code: "invalid-response" }
      }
      const name = errorSchema.safeParse(body)
      return {
        ok: false,
        code: `http-${response.status}${name.success ? `:${name.data.name}` : ""}`,
      }
    },
  }
}
