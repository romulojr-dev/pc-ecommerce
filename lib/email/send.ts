import type { EmailType } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { env } from "@/lib/env"
import { logSafeFailure } from "@/lib/orders/log"
import { mintCodConfirmLink, mintViewLink } from "@/lib/orders/order-links"
import { orderLinkUrl } from "@/lib/orders/signed-link"

import {
  CAP_WINDOW_MS,
  capDecision,
  dueDecision,
  type EmailStatusName,
  isRetryableCode,
  LEASE_MS,
  MAX_ATTEMPTS,
  RETRY_AFTER_MS,
} from "./due"
import { fakeTransport } from "./fake"
import { type EmailLogFields, logEmailEvent } from "./log"
import { resendTransport } from "./resend"
import { type EmailTemplates, templates as registry } from "./templates"
import type { EmailTransport } from "./transport"

// Sending the outbox (docs/specs/035-email-foundation-signed-links,
// Behavior 2–8), always after the transaction that wrote the rows has
// committed, in three steps with **no network call while a transaction is
// open** (the working rule; spec 034's shape):
//
//   1. Claim, one short transaction: lock due rows with SKIP LOCKED, apply the
//      24-hour window and the per-recipient cap (an advisory lock on the
//      recipient serializes concurrent claims), and mark the rest `sending`.
//   2. Send, no transaction: build the email from the order row now and hand it
//      to the transport with the Resend idempotency key `{orderId}:{type}`.
//   3. Settle, one statement: `sent` or `failed`, only if the row is still the
//      claim we made (a takeover leaves a late sender's result unapplied).
//
// A failed or skipped send never changes the order, a payment, stock or the
// cart: nothing here touches them, and nothing here throws.

// The claim's transaction: database work only
export const CLAIM_TRANSACTION = { maxWait: 5_000, timeout: 10_000 } as const

export type SendOptions = {
  now?: Date
  // How many due rows to claim; default 10 (the page sweep's size)
  limit?: number
  // Send only these rows (the writer's `after()`), if they are due
  ids?: string[]
  transport?: EmailTransport
  templates?: EmailTemplates
  siteUrl?: string
  from?: string
}

export type SendSummary = {
  claimed: number
  sent: number
  failed: number
  skipped: number
  tooOld: number
}

const NOTHING: SendSummary = {
  claimed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  tooOld: 0,
}

export function emailTransport(): EmailTransport {
  return env.EMAIL_TRANSPORT === "resend"
    ? resendTransport({ apiKey: env.RESEND_API_KEY ?? "" })
    : fakeTransport()
}

type Candidate = {
  id: string
  orderId: string
  type: EmailType
  status: EmailStatusName
  attempts: number
  claimedAt: Date | null
  createdAt: Date
  recipientHash: string
}

type Claimed = {
  id: string
  orderId: string
  type: EmailType
  claimedAt: Date
}

type Claim = {
  claimed: Claimed[]
  skipped: number
  tooOld: number
  events: EmailLogFields[]
}

async function claim(
  now: Date,
  limit: number,
  ids: string[] | undefined
): Promise<Claim> {
  const leaseBefore = new Date(now.getTime() - LEASE_MS)
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS)
  const capSince = new Date(now.getTime() - CAP_WINDOW_MS)
  const scoped = ids !== undefined

  return db.$transaction(async (tx): Promise<Claim> => {
    const rows = await tx.$queryRaw<Candidate[]>`
      SELECT "id", "orderId", "type"::text AS "type",
        "status"::text AS "status", "attempts", "claimedAt", "createdAt",
        "recipientHash"
      FROM "EmailOutbox"
      WHERE (${scoped} = false OR "id" = ANY(${ids ?? []}::text[]))
        AND ("status" = 'PENDING'
          OR ("status" = 'SENDING' AND "claimedAt" <= ${leaseBefore})
          OR ("status" = 'FAILED' AND "attempts" < ${MAX_ATTEMPTS}
              AND "claimedAt" <= ${retryBefore}))
      ORDER BY "createdAt", "id"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`

    const result: Claim = { claimed: [], skipped: 0, tooOld: 0, events: [] }
    // A fixed order for the recipient locks, so two claims never wait on each
    // other in a cycle
    const ordered = [...rows].sort((a, b) =>
      a.recipientHash < b.recipientHash
        ? -1
        : a.recipientHash > b.recipientHash
          ? 1
          : 0
    )

    for (const row of ordered) {
      const decision = dueDecision(row, now)
      if (decision === "not-due") continue
      if (decision === "too-old") {
        await tx.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            lastErrorCode: "too-old",
            attempts: MAX_ATTEMPTS,
          },
        })
        result.tooOld++
        result.events.push({
          event: "email.failed",
          outboxId: row.id,
          type: row.type,
          code: "too-old",
        })
        continue
      }

      // One claim at a time per recipient, then count: the second of two
      // concurrent claims sees the first one's `sending` row
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${row.recipientHash}, 0))`
      const [{ count }] = await tx.$queryRaw<{ count: number }[]>`
        SELECT count(*)::int AS "count" FROM "EmailOutbox"
        WHERE "recipientHash" = ${row.recipientHash}
          AND "id" <> ${row.id}
          AND (("status" = 'SENT' AND "sentAt" > ${capSince})
            OR ("status" = 'SENDING' AND "claimedAt" > ${capSince}))`

      if (capDecision(count, row.type) === "skip") {
        await tx.emailOutbox.update({
          where: { id: row.id },
          data: { status: "SKIPPED" },
        })
        result.skipped++
        result.events.push({
          event: "email.skipped",
          outboxId: row.id,
          type: row.type,
          reason: "recipient-cap",
        })
        continue
      }

      await tx.emailOutbox.update({
        where: { id: row.id },
        data: {
          status: "SENDING",
          claimedAt: now,
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
      })
      result.claimed.push({
        id: row.id,
        orderId: row.orderId,
        type: row.type,
        claimedAt: now,
      })
    }
    return result
  }, CLAIM_TRANSACTION)
}

type Outcome = "sent" | "failed"

async function deliver(
  row: Claimed,
  {
    now,
    transport,
    templates,
    siteUrl,
    from,
  }: Required<
    Pick<SendOptions, "now" | "transport" | "templates" | "siteUrl" | "from">
  >
): Promise<Outcome> {
  // Settles only the claim we made; a row taken over meanwhile is left alone
  const settle = (
    data: Parameters<typeof db.emailOutbox.updateMany>[0]["data"]
  ) =>
    db.emailOutbox.updateMany({
      where: { id: row.id, status: "SENDING", claimedAt: row.claimedAt },
      data,
    })

  const fail = async (code: string, final: boolean): Promise<Outcome> => {
    await settle({
      status: "FAILED",
      lastErrorCode: code,
      // A failure retrying can't fix is never due again
      ...(final || !isRetryableCode(code) ? { attempts: MAX_ATTEMPTS } : {}),
    })
    logEmailEvent({
      event: "email.failed",
      outboxId: row.id,
      type: row.type,
      code,
    })
    return "failed"
  }

  // The email is built from the order as it is now
  const order = await db.order.findUnique({
    where: { id: row.orderId },
    include: { items: { orderBy: { position: "asc" } } },
  })
  if (!order) return fail("no-order", true)

  const template = templates[row.type]
  if (!template) return fail("no-template", true)

  let content
  try {
    // A pickup order shows the store's address and hours as they are now
    // (docs/specs/036-order-emails, Behavior 2)
    const settings =
      order.fulfillment === "PICKUP"
        ? await db.storeSettings.findUnique({
            where: { id: 1 },
            select: { storeAddress: true, storeHours: true },
          })
        : null
    content = await template({
      order,
      siteUrl,
      now,
      store: settings
        ? { address: settings.storeAddress, hours: settings.storeHours }
        : null,
      viewUrl: orderLinkUrl(
        siteUrl,
        order.orderNumber,
        mintViewLink(order.orderNumber, now)
      ),
      // A cash order's link lasts until its deadline (docs/specs/038-cash-on-
      // delivery, D10); an online order has none
      confirmUrl:
        order.paymentOption === "COD"
          ? orderLinkUrl(
              siteUrl,
              order.orderNumber,
              mintCodConfirmLink(order.orderNumber, order.expiresAt)
            )
          : null,
    })
  } catch (error) {
    logSafeFailure("Rendering email", error)
    return fail("render-error", true)
  }

  let result
  try {
    result = await transport.send({
      from,
      to: order.guestEmail,
      ...content,
      idempotencyKey: `${row.orderId}:${row.type}`,
    })
  } catch {
    result = { ok: false, code: "network" } as const
  }
  if (!result.ok) return fail(result.code, false)

  await settle({
    status: "SENT",
    sentAt: now,
    providerMessageId: result.id,
    lastErrorCode: null,
  })
  logEmailEvent({ event: "email.sent", outboxId: row.id, type: row.type })
  return "sent"
}

// Claims due rows and sends them. Never throws: a failure is logged by its
// kind and the rows stay for the next retry.
export async function sendPending({
  now = new Date(),
  limit = 10,
  ids,
  transport = emailTransport(),
  templates = registry,
  siteUrl = env.NEXT_PUBLIC_SITE_URL,
  from = env.EMAIL_FROM,
}: SendOptions = {}): Promise<SendSummary> {
  try {
    const claimed = await claim(now, limit, ids)
    for (const event of claimed.events) logEmailEvent(event)

    const summary: SendSummary = {
      ...NOTHING,
      claimed: claimed.claimed.length,
      skipped: claimed.skipped,
      tooOld: claimed.tooOld,
    }
    for (const row of claimed.claimed) {
      try {
        const outcome = await deliver(row, {
          now,
          transport,
          templates,
          siteUrl,
          from,
        })
        summary[outcome]++
      } catch (error) {
        // A database error while settling: the row stays `sending` and is
        // taken over after the lease
        logSafeFailure("Sending email", error)
      }
    }
    return summary
  } catch (error) {
    logSafeFailure("Claiming emails", error)
    return NOTHING
  }
}

// The writer's `after()`: send this row, if it is due
export const sendEmail = (
  id: string,
  options: Omit<SendOptions, "ids" | "limit"> = {}
) => sendPending({ ...options, ids: [id], limit: 1 })
