import { vi } from "vitest"

import type { EmailType } from "@/generated/prisma/client"
import { recipientHash } from "@/lib/email/recipient"
import type { EmailTemplates } from "@/lib/email/templates"
import type { EmailTransport, SendResult } from "@/lib/email/transport"

import { db } from "./db"
import { orderData } from "./orders"

// Helpers for the email tests (docs/specs/035-email-foundation-signed-links).

export const PLACED = new Date("2026-11-01T07:00:00Z")
export const MINUTE = 60_000
export const HOUR = 60 * MINUTE

export const ago = (from: Date, ms: number) => new Date(from.getTime() - ms)

// A template for any type: the tests' stand-in until #93 registers the real
// ones. Its body carries the link, so a test can read it back.
export const testTemplates = (
  types: EmailType[] = [
    "ORDER_PLACED",
    "PAYMENT_RECEIVED",
    "ORDER_CANCELLED",
    "COD_CONFIRM",
  ]
): EmailTemplates =>
  Object.fromEntries(
    types.map((type) => [
      type,
      ({ order, viewUrl }) => ({
        subject: `${type} ${order.orderNumber}`,
        html: `<p><a href="${viewUrl}">${order.orderNumber}</a></p>`,
        text: `${order.orderNumber} ${viewUrl}`,
      }),
    ])
  )

// A new order for `email` (the fixture's default is ana@example.com)
export const newOrder = (email?: string) =>
  db.order.create({
    data: orderData(email ? { guestEmail: email } : {}),
  })

// An outbox row as the tests need it: any status and times, written directly
export async function outboxRow(
  orderId: string,
  email: string,
  overrides: Partial<Parameters<typeof db.emailOutbox.create>[0]["data"]> = {}
) {
  return db.emailOutbox.create({
    data: {
      orderId,
      type: "ORDER_PLACED",
      recipientHash: recipientHash(email),
      createdAt: PLACED,
      ...overrides,
    } as Parameters<typeof db.emailOutbox.create>[0]["data"],
  })
}

// `n` rows that already count against `email`'s cap (sent at `sentAt`), each
// on its own order
export async function countedRows(
  email: string,
  n: number,
  sentAt: Date,
  status: "SENT" | "SENDING" | "FAILED" | "SKIPPED" = "SENT"
) {
  for (let i = 0; i < n; i++) {
    const order = await newOrder()
    await outboxRow(order.id, email, {
      status,
      createdAt: ago(sentAt, MINUTE),
      ...(status === "SENT"
        ? { sentAt, providerMessageId: `fake_counted_${i}`, attempts: 1 }
        : {}),
      ...(status === "SENDING" ? { claimedAt: sentAt, attempts: 1 } : {}),
      ...(status === "FAILED"
        ? { claimedAt: sentAt, attempts: 5, lastErrorCode: "http-422" }
        : {}),
    })
  }
}

// A transport that records what it was asked to send and answers as told
export function recordingTransport(
  answer: (call: number) => SendResult | Promise<SendResult> = (call) => ({
    ok: true,
    id: `rec_${call}`,
  })
) {
  const sent: Parameters<EmailTransport["send"]>[0][] = []
  const transport: EmailTransport = {
    async send(message) {
      sent.push(message)
      return answer(sent.length)
    },
  }
  return { transport, sent }
}

// Every console line written while `run` runs, joined: for the "never logs a
// secret" tests (O14)
export async function consoleOutput(run: () => Promise<unknown>) {
  const lines: string[] = []
  const methods = ["log", "info", "warn", "error", "debug"] as const
  const spies = methods.map((method) =>
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(
        args
          .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
          .join(" ")
      )
    })
  )
  try {
    await run()
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  return lines
}
