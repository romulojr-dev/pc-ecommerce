import { type AuthCleanup, cleanAuthTables } from "@/lib/auth/cleanup"
import { EMAIL_CRON_BATCH } from "@/lib/email/due"
import { sendPending } from "@/lib/email/send"
import type { PaymentGateway } from "@/lib/payments/gateway-types"
import type { PaymentEnvironment } from "@/lib/payments/session-request"
import { bearerOf, secretMatches } from "@/lib/secrets/compare"

import { logCronEvent, logSafeFailure } from "./log"
import { sweepExpiredOrders } from "./release"
import { CRON_BATCH, CRON_BUDGET_MS } from "./release-rules"

// The daily cron's work (docs/specs/033-release-unpaid-orders, behavior
// 26–30; the sign-in cleanup is docs/specs/039-staff-sign-in-admin-shell,
// Rule 30), apart from the route so the tests can pass the secret and a
// clock.
//
// Three jobs: the release of unpaid orders, the due emails, and the cleanup of
// expired sessions and rate-limit rows. **Every job always runs**, each in
// its own try/catch, so a failure in one never stops the others. If any
// failed, the answer is 500 and the log names which.

export const CRON_JOBS = ["release", "emails", "auth-cleanup"] as const
export type CronJob = (typeof CRON_JOBS)[number]

export type CronBody = {
  released: number
  skipped: number
  // Rows claimed for sending
  emails: number
  // null when that job failed
  authCleanup: AuthCleanup | null
  // The jobs that failed, in run order; empty on success
  failed: CronJob[]
}

export type CronAnswer = { status: 401 } | { status: 200 | 500; body: CronBody }

// What the jobs call; the tests replace one to make it fail
export type CronDeps = {
  sweepExpiredOrders: typeof sweepExpiredOrders
  sendPending: typeof sendPending
  cleanAuthTables: typeof cleanAuthTables
}

const realDeps: CronDeps = { sweepExpiredOrders, sendPending, cleanAuthTables }

export async function runReleaseCron(
  authorization: string | null,
  {
    secret,
    now = new Date(),
    clock = Date.now,
    budgetMs = CRON_BUDGET_MS,
    gateway,
    environment,
    deps = realDeps,
  }: {
    secret: string | undefined
    now?: Date
    clock?: () => number
    budgetMs?: number
    gateway?: PaymentGateway
    environment?: PaymentEnvironment
    deps?: Partial<CronDeps>
  }
): Promise<CronAnswer> {
  // Nothing is read before the secret matches; no secret set refuses all
  if (!secretMatches(bearerOf(authorization), secret)) {
    logCronEvent({ outcome: "unauthorized" })
    return { status: 401 }
  }

  const jobs: CronDeps = { ...realDeps, ...deps }
  const started = clock()
  const failed: CronJob[] = []
  const fail = (job: CronJob, error?: unknown) => {
    failed.push(job)
    if (error !== undefined) logSafeFailure(`cron job ${job}`, error)
  }

  // 1. The release: batches until one finds nothing, each leaving out the
  // orders already tried in this run, within the budget. A batch that fails
  // ends this job (not the run).
  const tried: string[] = []
  let released = 0
  let skipped = 0
  try {
    while (clock() - started < budgetMs) {
      const batch = await jobs.sweepExpiredOrders(now, {
        limit: CRON_BATCH,
        exclude: tried,
        gateway,
        environment,
        via: "cron",
      })
      if (batch.failed) {
        fail("release")
        break
      }
      released += batch.released
      skipped += batch.skipped
      tried.push(...batch.tried)
      if (batch.tried.length === 0) break
    }
  } catch (error) {
    fail("release", error)
  }

  // 2. The emails that are due: those the release just enqueued, and the
  // retries of earlier failures (docs/specs/035-email-foundation-signed-links,
  // Behavior 3). Within what is left of the budget.
  let emails = 0
  try {
    while (clock() - started < budgetMs) {
      const batch = await jobs.sendPending({ now, limit: EMAIL_CRON_BATCH })
      emails += batch.claimed
      if (batch.claimed + batch.tooOld + batch.skipped === 0) break
    }
  } catch (error) {
    fail("emails", error)
  }

  // 3. Sign-in housekeeping. Cheap, so it takes no share of the budget.
  let authCleanup: AuthCleanup | null = null
  try {
    authCleanup = await jobs.cleanAuthTables(now)
  } catch (error) {
    fail("auth-cleanup", error)
  }

  const body: CronBody = { released, skipped, emails, authCleanup, failed }
  logCronEvent(
    failed.length > 0
      ? { released, skipped, emails, failed }
      : { released, skipped, emails }
  )
  return { status: failed.length > 0 ? 500 : 200, body }
}
