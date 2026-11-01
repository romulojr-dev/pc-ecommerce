import { env } from "@/lib/env"
import { handlePaymentEvent } from "@/lib/payments/events"
import { logPaymentEvent } from "@/lib/payments/log"
import { MAX_WEBHOOK_BYTES } from "@/lib/payments/webhook"

// Xendit's payment session webhooks (docs/specs/032-payment-webhooks; ADR
// 0010). The handler checks the x-callback-token header, then asks Xendit
// what happened to the session before changing anything. The answer has no
// body: 5xx only when a later try can do better, so Xendit retries exactly
// those. POST handlers are never cached, and other methods get Next's 405.
export async function POST(request: Request) {
  // A body announced as too large isn't read at all
  const length = Number(request.headers.get("content-length"))
  if (Number.isFinite(length) && length > MAX_WEBHOOK_BYTES) {
    logPaymentEvent({ event: "payment.webhook", outcome: "too-large" })
    return new Response(null, { status: 413 })
  }

  const { status } = await handlePaymentEvent(
    { headers: request.headers, body: await request.text() },
    env.XENDIT_WEBHOOK_TOKEN
  )
  return new Response(null, { status })
}
