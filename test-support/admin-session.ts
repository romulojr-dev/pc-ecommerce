import { expect } from "vitest"

import { auth } from "@/lib/auth/auth"

// Real staff users and real sign-in cookies for the admin integration tests.
// Each sign-in comes from its own IP so the rate limit never gets in the way.

const PASSWORD = "correct horse battery"
let ip = 0

export function resetSignInIps() {
  ip = 0
}

export async function makeStaffUser(email: string, role: string) {
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

export async function signInCookie(email: string) {
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
