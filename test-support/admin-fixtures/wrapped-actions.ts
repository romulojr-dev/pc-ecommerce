"use server"

import { z } from "zod"

import { adminAction } from "@/lib/admin/guard"
import { db } from "@/lib/db"

// A real adminAction that writes, so the "call every marked function as Demo"
// check has something it must see refused. Never imported by the app.
export const createVoucherAction = adminAction(
  "vouchers.write",
  z.object({ code: z.string().min(3) }),
  async ({ input }) => {
    await db.voucher.create({
      data: {
        code: input.code.toUpperCase(),
        type: "FIXED",
        value: 10000,
        minSpend: 0,
        startsAt: new Date("2026-01-01T00:00:00Z"),
      },
    })
    return "created"
  }
)
