import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { listFakeEmails } from "./dev-emails"

// docs/specs/036-order-emails, V3: the page lists the newest 50.

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("listFakeEmails", () => {
  it("V3: returns exactly the newest 50, newest first", async () => {
    await db.fakeEmail.createMany({
      data: Array.from({ length: 60 }, (_, n) => ({
        id: `fake_${String(n).padStart(2, "0")}`,
        idempotencyKey: `key-${n}`,
        from: "PC Silicon <orders@mail.pcsilicon.tech>",
        to: "ana@example.com",
        subject: `Email ${n}`,
        html: "<p>x</p>",
        text: "x",
        createdAt: new Date(Date.UTC(2026, 10, 1, 7, n)),
      })),
    })

    const emails = await listFakeEmails()

    expect(emails).toHaveLength(50)
    expect(emails[0].subject).toBe("Email 59")
    expect(emails.at(-1)?.subject).toBe("Email 10")
  })

  it("is empty when nothing was recorded", async () => {
    expect(await listFakeEmails()).toEqual([])
  })
})
