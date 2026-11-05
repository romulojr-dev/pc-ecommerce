import { db } from "@/lib/db"
import type { DbClient } from "@/lib/db-client"

import { cleanupCutoffs } from "./rate-limit"

// The daily cron's housekeeping for sign-in (docs/specs/039-staff-sign-in-
// admin-shell, Rule 30): sessions that have expired and rate-limit rows no
// window can still need. It never touches users, accounts or a session that
// is still valid. Each is one statement, so overlapping runs are safe.

export type AuthCleanup = { sessions: number; rateLimits: number }

export async function cleanAuthTables(
  now: Date,
  client: DbClient = db
): Promise<AuthCleanup> {
  const { sessionCutoff, rateLimitCutoffMs } = cleanupCutoffs(now)

  // A session is valid while now < expiresAt, so one expiring at this very
  // instant is already expired
  const sessions = await client.session.deleteMany({
    where: { expiresAt: { lte: sessionCutoff } },
  })
  const rateLimits = await client.rateLimit.deleteMany({
    where: { lastRequest: { lt: BigInt(rateLimitCutoffMs) } },
  })

  const result = { sessions: sessions.count, rateLimits: rateLimits.count }
  console.info(JSON.stringify({ event: "auth.cleanup", ...result }))
  return result
}
