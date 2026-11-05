import { beforeEach, describe, expect, test } from "vitest"

import { db } from "@/lib/db"
import { resetCatalog } from "@/test-support/db"

import {
  createStaffUser,
  DEMO_EMAIL,
  disableStaff,
  enableStaff,
  ensureDemoUser,
  setStaffPassword,
} from "./accounts"
import { auth } from "./auth"

// docs/specs/039-staff-sign-in-admin-shell, I18–I25 (the library half), I28

const PASSWORD = "correct horse battery"
const NEW_PASSWORD = "another long password"
let ip = 0

beforeEach(async () => {
  ip = 0
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
})

// A real sign-in over HTTP, from its own IP so the limit never interferes
async function signIn(email: string, password: string) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": `198.51.100.${++ip}`,
      },
      body: JSON.stringify({ email, password }),
    })
  )
}

const create = (email: string, role: "OWNER" | "STAFF" = "STAFF") =>
  db.$transaction((tx) =>
    createStaffUser(tx, { email, name: "Ana Cruz", role, password: PASSWORD })
  )

describe("createStaffUser", () => {
  test("creates a user that can sign in, with a hashed password", async () => {
    const result = await create("ana@example.com", "OWNER")
    expect(result.status).toBe("created")

    const user = await db.user.findUniqueOrThrow({
      where: { email: "ana@example.com" },
    })
    expect(user).toMatchObject({
      name: "Ana Cruz",
      role: "OWNER",
      disabledAt: null,
    })
    const account = await db.account.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(account.providerId).toBe("credential")
    expect(account.password).toBeTruthy()
    expect(account.password).not.toContain(PASSWORD)

    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(200)
    expect((await signIn("ana@example.com", "not the password")).status).toBe(
      401
    )
  })

  test("the email is stored lower-case and trimmed, and Staff@ and staff@ are one user (R-2)", async () => {
    await create("  Ana@Example.COM ")
    expect((await db.user.findMany()).map((u) => u.email)).toEqual([
      "ana@example.com",
    ])
    expect(await create("ANA@example.com")).toEqual({ status: "exists" })
    expect((await signIn("Ana@Example.com", PASSWORD)).status).toBe(200)
  })

  test("an existing email is 'exists' and the hash is unchanged (I21)", async () => {
    await create("ana@example.com")
    const before = await db.account.findFirstOrThrow()
    const again = await db.$transaction((tx) =>
      createStaffUser(tx, {
        email: "ana@example.com",
        name: "Someone else",
        role: "OWNER",
        password: NEW_PASSWORD,
      })
    )
    expect(again).toEqual({ status: "exists" })
    const after = await db.account.findFirstOrThrow()
    expect(after.password).toBe(before.password)
    expect((await db.user.findFirstOrThrow()).role).toBe("STAFF")
    expect(await db.user.count()).toBe(1)
  })

  test("two creates at once for one email: one wins, one says exists (R-10)", async () => {
    const results = await Promise.all([
      create("race@example.com"),
      create("race@example.com"),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(["created", "exists"])
    expect(await db.user.count()).toBe(1)
    expect(await db.account.count()).toBe(1)
  })

  test("a short password writes nothing", async () => {
    const result = await db.$transaction((tx) =>
      createStaffUser(tx, {
        email: "ana@example.com",
        name: "Ana",
        role: "STAFF",
        password: "short",
      })
    )
    expect(result).toEqual({
      status: "weak-password",
      message: "The password must be at least 12 characters.",
    })
    expect(await db.user.count()).toBe(0)
  })
})

describe("setStaffPassword (I20)", () => {
  test("changes the hash, ends every session, the new password signs in", async () => {
    await create("ana@example.com")
    await signIn("ana@example.com", PASSWORD)
    await signIn("ana@example.com", PASSWORD)
    expect(await db.session.count()).toBe(2)
    const before = await db.account.findFirstOrThrow()

    const result = await db.$transaction((tx) =>
      setStaffPassword(tx, { email: "ANA@example.com", password: NEW_PASSWORD })
    )
    expect(result).toEqual({ status: "changed", sessions: 2 })
    expect(await db.session.count()).toBe(0)
    expect((await db.account.findFirstOrThrow()).password).not.toBe(
      before.password
    )
    expect((await signIn("ana@example.com", NEW_PASSWORD)).status).toBe(200)
    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(401)
  })

  test("another user's sessions are not touched", async () => {
    await create("ana@example.com")
    await create("ben@example.com")
    await signIn("ben@example.com", PASSWORD)
    await db.$transaction((tx) =>
      setStaffPassword(tx, { email: "ana@example.com", password: NEW_PASSWORD })
    )
    expect(await db.session.count()).toBe(1)
  })

  test("an unknown email and a short password are refused", async () => {
    expect(
      await db.$transaction((tx) =>
        setStaffPassword(tx, {
          email: "nobody@example.com",
          password: NEW_PASSWORD,
        })
      )
    ).toEqual({ status: "not-found" })
    await create("ana@example.com")
    const short = await db.$transaction((tx) =>
      setStaffPassword(tx, { email: "ana@example.com", password: "short" })
    )
    expect(short.status).toBe("weak-password")
    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(200)
  })
})

describe("disableStaff and enableStaff (I18, I19)", () => {
  test("disabling ends the sessions and blocks sign-in with the wrong-password answer", async () => {
    await create("ana@example.com")
    await signIn("ana@example.com", PASSWORD)
    await signIn("ana@example.com", PASSWORD)

    const result = await db.$transaction((tx) =>
      disableStaff(tx, { email: "ana@example.com" })
    )
    expect(result).toEqual({ status: "disabled", sessions: 2 })
    expect(await db.session.count()).toBe(0)

    const blocked = await signIn("ana@example.com", PASSWORD)
    const wrong = await signIn("ana@example.com", "not the password")
    expect(blocked.status).toBe(wrong.status)
    expect(await blocked.json()).toEqual(await wrong.json())
    expect(await db.session.count()).toBe(0)
  })

  test("disabling twice changes nothing", async () => {
    await create("ana@example.com")
    await db.$transaction((tx) =>
      disableStaff(tx, { email: "ana@example.com" })
    )
    const first = await db.user.findFirstOrThrow()
    const again = await db.$transaction((tx) =>
      disableStaff(tx, { email: "ana@example.com" })
    )
    expect(again).toEqual({ status: "already-disabled" })
    expect((await db.user.findFirstOrThrow()).disabledAt).toEqual(
      first.disabledAt
    )
  })

  test("enabling clears the block; the old password signs in again, no new session was needed", async () => {
    await create("ana@example.com")
    await db.$transaction((tx) =>
      disableStaff(tx, { email: "ana@example.com" })
    )
    const enabled = await db.$transaction((tx) =>
      enableStaff(tx, { email: "ana@example.com" })
    )
    expect(enabled).toEqual({ status: "enabled" })
    expect((await db.user.findFirstOrThrow()).role).toBe("STAFF")
    expect((await signIn("ana@example.com", PASSWORD)).status).toBe(200)
  })

  test("enabling an active user and an unknown email", async () => {
    await create("ana@example.com")
    expect(
      await db.$transaction((tx) =>
        enableStaff(tx, { email: "ana@example.com" })
      )
    ).toEqual({ status: "already-enabled" })
    expect(
      await db.$transaction((tx) =>
        enableStaff(tx, { email: "no@example.com" })
      )
    ).toEqual({ status: "not-found" })
    expect(
      await db.$transaction((tx) =>
        disableStaff(tx, { email: "no@example.com" })
      )
    ).toEqual({ status: "not-found" })
  })
})

describe("ensureDemoUser (I22, I23, I28)", () => {
  const ensure = (password: string) =>
    db.$transaction((tx) => ensureDemoUser(tx, password))

  test("creates one demo user, and a second run changes nothing", async () => {
    expect((await ensure("a-public-demo-password")).status).toBe("created")
    const user = await db.user.findUniqueOrThrow({
      where: { email: DEMO_EMAIL },
    })
    expect(user).toMatchObject({ role: "DEMO", name: "Demo reviewer" })
    const account = await db.account.findFirstOrThrow()

    expect(await ensure("a-public-demo-password")).toEqual({ status: "exists" })
    expect(await db.user.count()).toBe(1)
    const after = await db.account.findFirstOrThrow()
    expect(after.password).toBe(account.password)
    expect(after.updatedAt).toEqual(account.updatedAt)
    expect(
      (await db.user.findUniqueOrThrow({ where: { email: DEMO_EMAIL } }))
        .updatedAt
    ).toEqual(user.updatedAt)
  })

  test("a different password the second time leaves the first one working (I23)", async () => {
    await ensure("a-public-demo-password")
    await ensure("a-different-demo-password")
    expect((await signIn(DEMO_EMAIL, "a-public-demo-password")).status).toBe(
      200
    )
    expect((await signIn(DEMO_EMAIL, "a-different-demo-password")).status).toBe(
      401
    )
  })

  test("a password under 12 characters writes nothing (I24b)", async () => {
    const result = await ensure("11-chars-pw")
    expect(result.status).toBe("weak-password")
    expect(await db.user.count()).toBe(0)
  })

  test("an existing user with that email, whatever its role, is left alone", async () => {
    await create(DEMO_EMAIL, "OWNER")
    expect(await ensure("a-public-demo-password")).toEqual({ status: "exists" })
    expect((await db.user.findFirstOrThrow()).role).toBe("OWNER")
  })

  test("the catalog reset leaves users, accounts and sessions (I28)", async () => {
    await create("ana@example.com")
    await signIn("ana@example.com", PASSWORD)
    await resetCatalog()
    expect(await db.user.count()).toBe(1)
    expect(await db.account.count()).toBe(1)
    expect(await db.session.count()).toBe(1)
  })
})
