import { Prisma } from "@/generated/prisma/client"
import { describe, expect, it } from "vitest"

import { normalizeRecipient } from "@/lib/email/recipient"
import { db } from "@/test-support/db"

import { customerKeySql } from "./customer-key-sql"

// docs/specs/042-admin-customers, E28: the SQL key equals normalizeRecipient
// for every address, so the customer list, the buyer filter and the email cap
// agree on who is one customer.

const ADDRESSES = [
  "ana@example.com",
  "Ana@Example.COM",
  "  ana@example.com  ",
  "\tana@example.com\n",
  " ana@example.com ",
  "﻿ana@example.com",
  "ana+promo@example.com",
  "ANA+Promo@Example.com ",
  "ana+a+b@example.com",
  "ana+@example.com",
  "+ana@example.com",
  "+@example.com",
  "a.na@example.com",
  "ana@sub.example.co.ph",
  "ana@example+shop.com",
  "ana+x@example+shop.com",
  "ana",
  "",
  "   ",
  "@example.com",
  "@",
  "a@b@c.com",
  "a+b@c@d.com",
  "a@b+c@d.com",
  "ab@c+d",
  "ana@",
  "ana+tag@",
  "a+b",
  "Ünï+tag@Example.com".replace(/[^\x00-\x7f]/g, "u"),
]

describe("E28: the SQL customer key agrees with normalizeRecipient", () => {
  it("matches on every address in the table", async () => {
    const values = Prisma.join(
      ADDRESSES.map((a, i) => Prisma.sql`(${i}::int, ${a}::text)`)
    )
    const rows = await db.$queryRaw<{ n: number; key: string }[]>`
      SELECT o."n", ${customerKeySql()} AS key
      FROM (VALUES ${values}) AS o("n", "guestEmail")
      ORDER BY o."n"`
    expect(rows).toHaveLength(ADDRESSES.length)
    for (const { n, key } of rows) {
      expect(key, JSON.stringify(ADDRESSES[n])).toBe(
        normalizeRecipient(ADDRESSES[n])
      )
    }
  })
})
