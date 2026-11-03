import { randomBytes } from "node:crypto"

import { db } from "@/lib/db"

import type { EmailTransport } from "./transport"

// The fake transport (docs/specs/035-email-foundation-signed-links, D11): it
// records each email in the FakeEmail table for the tests and E2E to read, and
// sends nothing. Like Resend, the same idempotency key returns the same
// message, with no second row. Refused in Production by lib/email/env-schema.

export type FakeEmailOptions = {
  // Every send fails with this code instead
  fail?: string
}

export function fakeTransport({ fail }: FakeEmailOptions = {}): EmailTransport {
  return {
    async send(message) {
      if (fail) return { ok: false, code: fail }
      const id = `fake_${randomBytes(12).toString("hex")}`
      // No conflict target: a repeat of the key is no row, not an error
      await db.fakeEmail.createMany({
        data: [{ id, ...message }],
        skipDuplicates: true,
      })
      const row = await db.fakeEmail.findUniqueOrThrow({
        where: { idempotencyKey: message.idempotencyKey },
        select: { id: true },
      })
      return { ok: true, id: row.id }
    },
  }
}
