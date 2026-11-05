import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

import { auth } from "@/lib/auth/auth"
import { db } from "@/lib/db"

// docs/specs/040-admin-permissions-audit-masking, T4 (E5 to E8): the real
// wrappers with real sessions

let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))

const { adminAction } = await import("./guard")

const PASSWORD = "correct horse battery"
let ip = 0

async function makeUser(email: string, role: string) {
  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser(
    { email, name: email, emailVerified: true, role },
    { method: "admin" }
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(PASSWORD),
  })
  return user
}

async function signInCookie(email: string) {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": `198.51.100.${++ip}`,
      },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  )
  expect(res.status).toBe(200)
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

// A change the handler would make: one Voucher row
const writeVoucher = adminAction(
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

beforeEach(async () => {
  ip = 0
  currentHeaders = new Headers()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User", "Voucher" CASCADE`
})

describe("the real adminAction", () => {
  test("Owner writes; Demo is refused and nothing is written (E5)", async () => {
    await makeUser("owner@example.com", "OWNER")
    await makeUser("demo@example.com", "DEMO")

    currentHeaders = new Headers({
      cookie: await signInCookie("demo@example.com"),
    })
    expect(await writeVoucher({ code: "DEMO1" })).toMatchObject({
      ok: false,
      error: "forbidden",
      message: "This account is read-only",
    })
    // An invalid payload is still forbidden, not invalid
    expect(await writeVoucher({})).toMatchObject({ error: "forbidden" })
    expect(await db.voucher.count()).toBe(0)

    currentHeaders = new Headers({
      cookie: await signInCookie("owner@example.com"),
    })
    expect(await writeVoucher({ code: "OWNER1" })).toEqual({
      ok: true,
      data: "created",
    })
    expect(await db.voucher.count()).toBe(1)
  })

  test("Staff is told the action is the owner's", async () => {
    await makeUser("staff@example.com", "STAFF")
    currentHeaders = new Headers({
      cookie: await signInCookie("staff@example.com"),
    })
    expect(await writeVoucher({ code: "STAFF1" })).toMatchObject({
      error: "forbidden",
      message: "Only owners can do this",
    })
    expect(await db.voucher.count()).toBe(0)
  })

  test("no cookie is unauthenticated (E6)", async () => {
    expect(await writeVoucher({ code: "NONE1" })).toMatchObject({
      error: "unauthenticated",
    })
    expect(await db.voucher.count()).toBe(0)
  })

  test("an invalid payload from the Owner is invalid (E8)", async () => {
    await makeUser("owner@example.com", "OWNER")
    currentHeaders = new Headers({
      cookie: await signInCookie("owner@example.com"),
    })
    expect(await writeVoucher({ code: "x" })).toMatchObject({
      error: "invalid",
    })
    expect(await db.voucher.count()).toBe(0)
  })

  test("a user disabled after signing in is refused and the session deleted (E7)", async () => {
    const user = await makeUser("owner@example.com", "OWNER")
    currentHeaders = new Headers({
      cookie: await signInCookie("owner@example.com"),
    })
    await db.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    })
    expect(await writeVoucher({ code: "LATE1" })).toMatchObject({
      error: "unauthenticated",
    })
    expect(await db.voucher.count()).toBe(0)
    expect(await db.session.count()).toBe(0)
  })
})
