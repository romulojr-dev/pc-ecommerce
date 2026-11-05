import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import { auth } from "@/lib/auth/auth"

// docs/specs/039-staff-sign-in-admin-shell, I17, I17b, I17c, Rule 15

// The request headers the guard reads, set per test; redirect() throws like
// Next's does, carrying the target
let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))

const { loadAdminSession, requireAdminSession } = await import("./session")

const PASSWORD = "correct horse battery"
let ip = 0

async function makeUser(email: string, role = "STAFF") {
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

// A real sign-in, so the cookie is a real one; each from its own IP, so the
// sign-in limit never gets in the way
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

const withCookie = (cookie: string) => new Headers({ cookie })

beforeEach(async () => {
  ip = 0
  currentHeaders = new Headers()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
})
afterEach(() => {
  vi.useRealTimers()
})

describe("loadAdminSession", () => {
  test("returns the person, the role from the user row and the session id", async () => {
    const user = await makeUser("owner@example.com", "OWNER")
    const cookie = await signInCookie("owner@example.com")
    const session = await loadAdminSession(withCookie(cookie))
    expect(session).toEqual({
      sessionId: (await db.session.findFirstOrThrow()).id,
      user: {
        id: user.id,
        name: "owner@example.com",
        email: "owner@example.com",
        role: "OWNER",
      },
    })
  })

  test("no cookie, a made-up cookie and a signed-out cookie give null", async () => {
    await makeUser("a@example.com")
    expect(await loadAdminSession(new Headers())).toBeNull()
    expect(
      await loadAdminSession(withCookie("better-auth.session_token=abc.def"))
    ).toBeNull()
    const cookie = await signInCookie("a@example.com")
    await db.session.deleteMany()
    expect(await loadAdminSession(withCookie(cookie))).toBeNull()
  })
})

describe("a disabled user with a live session (I17)", () => {
  test("is refused on every call, the session is deleted, and re-enabling needs a fresh sign-in", async () => {
    const user = await makeUser("a@example.com")
    const cookie = await signInCookie("a@example.com")
    expect(await loadAdminSession(withCookie(cookie))).not.toBeNull()

    // Disabled directly in the database; the session row is kept
    await db.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    })
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)

    // The first call refuses and deletes that session; the rest refuse
    expect(await loadAdminSession(withCookie(cookie))).toBeNull()
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
    for (let i = 0; i < 3; i++) {
      expect(await loadAdminSession(withCookie(cookie))).toBeNull()
    }

    // Re-enabled: the old cookie is still refused, a new sign-in works
    await db.user.update({ where: { id: user.id }, data: { disabledAt: null } })
    expect(await loadAdminSession(withCookie(cookie))).toBeNull()
    const fresh = await signInCookie("a@example.com")
    expect(await loadAdminSession(withCookie(fresh))).not.toBeNull()
  })

  test("requireAdminSession redirects that cookie to the form (I17b)", async () => {
    const user = await makeUser("a@example.com")
    const cookie = await signInCookie("a@example.com")
    currentHeaders = withCookie(cookie)
    expect((await requireAdminSession()).user.id).toBe(user.id)

    await db.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    })
    await expect(requireAdminSession()).rejects.toThrow(
      "NEXT_REDIRECT /admin/login"
    )
  })

  test("two sessions: using one deletes only that one (I17c)", async () => {
    const user = await makeUser("a@example.com")
    const other = await makeUser("b@example.com")
    const a = await signInCookie("a@example.com")
    const b = await signInCookie("a@example.com")
    const otherCookie = await signInCookie("b@example.com")
    await db.user.update({
      where: { id: user.id },
      data: { disabledAt: new Date() },
    })

    expect(await loadAdminSession(withCookie(a))).toBeNull()
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
    expect(await loadAdminSession(withCookie(b))).toBeNull()
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)

    // Another person's session is never touched
    expect(await db.session.count({ where: { userId: other.id } })).toBe(1)
    expect(await loadAdminSession(withCookie(otherCookie))).not.toBeNull()
  })
})

describe("requireAdminSession", () => {
  test("no cookie redirects to /admin/login", async () => {
    currentHeaders = new Headers()
    await expect(requireAdminSession()).rejects.toThrow(
      "NEXT_REDIRECT /admin/login"
    )
  })
})
