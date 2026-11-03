import { EMAIL_CRON_BATCH } from "@/lib/email/due"
import { sendPending } from "@/lib/email/send"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import type { PaymentEnvironment } from "@/lib/payments/session-request"
import { bearerOf, secretMatches } from "@/lib/secrets/compare"

import { logCronEvent } from "./log"
import { sweepExpiredOrders } from "./release"
import { CRON_BATCH, CRON_BUDGET_MS } from "./release-rules"

// The daily cron's work (docs/specs/033-release-unpaid-orders, behavior
// 26–30), apart from the route so the tests can pass the secret and a clock.

export type CronAnswer =
  | { status: 401 }
  | { status: 200 | 500; body: { released: number; skipped: number } }

export async function runReleaseCron(
  authorization: string | null,
  {
    secret,
    now = new Date(),
    clock = Date.now,
    budgetMs = CRON_BUDGET_MS,
    gateway,
    environment,
  }: {
    secret: string | undefined
    now?: Date
    clock?: () => number
    budgetMs?: number
    gateway?: PaymentGateway
    environment?: PaymentEnvironment
  }
): Promise<CronAnswer> {
  // Nothing is read before the secret matches; no secret set refuses all
  if (!secretMatches(bearerOf(authorization), secret)) {
    logCronEvent({ outcome: "unauthorized" })
    return { status: 401 }
  }

  const started = clock()
  const tried: string[] = []
  let released = 0
  let skipped = 0
  let failed = false
  // Batches until one finds nothing, each leaving out the orders already
  // tried in this run, within the budget
  while (clock() - started < budgetMs) {
    const batch = await sweepExpiredOrders(now, {
      limit: CRON_BATCH,
      exclude: tried,
      gateway,
      environment,
      via: "cron",
    })
    if (batch.failed) {
      failed = true
      break
    }
    released += batch.released
    skipped += batch.skipped
    tried.push(...batch.tried)
    if (batch.tried.length === 0) break
  }

  // Then the emails that are due: those the release just enqueued, and the
  // retries of earlier failures (docs/specs/035-email-foundation-signed-links,
  // Behavior 3). Within what is left of the budget; it never fails the run.
  while (clock() - started < budgetMs) {
    const batch = await sendPending({ now, limit: EMAIL_CRON_BATCH })
    if (batch.claimed + batch.tooOld + batch.skipped === 0) break
  }

  logCronEvent({ released, skipped })
  return { status: failed ? 500 : 200, body: { released, skipped } }
}
