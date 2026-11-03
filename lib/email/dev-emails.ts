import "server-only"

import { db } from "@/lib/db"

import { DEV_EMAILS_LIMIT } from "./dev-view"

// The newest emails the fake transport recorded, newest first (docs/specs/
// 036-order-emails, Behavior 14). Only /dev/emails reads them, and only after
// its guard.
export function listFakeEmails(limit = DEV_EMAILS_LIMIT) {
  return db.fakeEmail.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    select: {
      id: true,
      from: true,
      to: true,
      subject: true,
      html: true,
      text: true,
      createdAt: true,
    },
  })
}

export type DevEmail = Awaited<ReturnType<typeof listFakeEmails>>[number]
