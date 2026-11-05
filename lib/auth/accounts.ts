import { hashPassword } from "better-auth/crypto"

import type { UserRole } from "@/generated/prisma/client"
import type { DbClient } from "@/lib/db-client"

import { passwordIssue } from "./password-policy"

// The only writers of User and Account (docs/specs/039-staff-sign-in-admin-
// shell, Rule 3): the staff scripts and the seed's --accounts-only mode call
// these; no request does. Each takes a client (callers pass a transaction, so
// the tests pass the test database) and returns a value for every expected
// outcome instead of throwing. Passwords are hashed with Better Auth's own
// function, so sign-in verifies them as it verifies its own, and a plain
// password is never stored, logged or returned. No server-only import: tsx
// runs this.

export const DEMO_EMAIL = "demo@pcsilicon.tech"
export const DEMO_NAME = "Demo reviewer"

const CREDENTIAL = "credential"

export type CreateResult =
  | { status: "created"; userId: string }
  | { status: "exists" }
  | { status: "weak-password"; message: string }

// Stored lower-case and trimmed; sign-in compares the same way (R-2)
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// One INSERT … ON CONFLICT DO NOTHING (no caught P2002): of two creates for
// one email, one gets the row and the other "exists" (R-10)
async function insertUser(
  client: DbClient,
  data: { email: string; name: string; role: UserRole }
): Promise<string | null> {
  const rows = await client.user.createManyAndReturn({
    data: [{ ...data, emailVerified: true }],
    skipDuplicates: true,
    select: { id: true },
  })
  return rows[0]?.id ?? null
}

async function insertCredential(
  client: DbClient,
  userId: string,
  password: string
) {
  await client.account.create({
    data: {
      userId,
      providerId: CREDENTIAL,
      accountId: userId,
      password: await hashPassword(password),
    },
  })
}

export async function createStaffUser(
  client: DbClient,
  input: {
    email: string
    name: string
    role: Exclude<UserRole, "DEMO">
    password: string
  }
): Promise<CreateResult> {
  const issue = passwordIssue(input.password)
  if (issue) return { status: "weak-password", message: issue }

  const userId = await insertUser(client, {
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    role: input.role,
  })
  if (!userId) return { status: "exists" }
  await insertCredential(client, userId, input.password)
  return { status: "created", userId }
}

// The demo user, only when no user has the address. An existing demo user is
// left exactly as it is, password included (R-11).
export async function ensureDemoUser(
  client: DbClient,
  password: string
): Promise<CreateResult> {
  const issue = passwordIssue(password)
  if (issue) return { status: "weak-password", message: issue }

  const userId = await insertUser(client, {
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    role: "DEMO",
  })
  if (!userId) return { status: "exists" }
  await insertCredential(client, userId, password)
  return { status: "created", userId }
}

export type PasswordResult =
  | { status: "changed"; sessions: number }
  | { status: "not-found" }
  | { status: "weak-password"; message: string }

// New hash, and every session of the user ends
export async function setStaffPassword(
  client: DbClient,
  input: { email: string; password: string }
): Promise<PasswordResult> {
  const issue = passwordIssue(input.password)
  if (issue) return { status: "weak-password", message: issue }

  const user = await client.user.findUnique({
    where: { email: normalizeEmail(input.email) },
    select: { id: true },
  })
  if (!user) return { status: "not-found" }

  const hash = await hashPassword(input.password)
  const updated = await client.account.updateMany({
    where: { userId: user.id, providerId: CREDENTIAL },
    data: { password: hash },
  })
  if (updated.count === 0) {
    await client.account.create({
      data: {
        userId: user.id,
        providerId: CREDENTIAL,
        accountId: user.id,
        password: hash,
      },
    })
  }
  const sessions = await client.session.deleteMany({
    where: { userId: user.id },
  })
  return { status: "changed", sessions: sessions.count }
}

export type DisableResult =
  | { status: "disabled"; sessions: number }
  | { status: "already-disabled" }
  | { status: "not-found" }

// Blocks sign-in and ends the user's sessions. Doing it twice changes
// nothing.
export async function disableStaff(
  client: DbClient,
  input: { email: string; now?: Date }
): Promise<DisableResult> {
  const email = normalizeEmail(input.email)
  const user = await client.user.findUnique({
    where: { email },
    select: { id: true, disabledAt: true },
  })
  if (!user) return { status: "not-found" }
  if (user.disabledAt) return { status: "already-disabled" }

  await client.user.update({
    where: { id: user.id },
    data: { disabledAt: input.now ?? new Date() },
  })
  const sessions = await client.session.deleteMany({
    where: { userId: user.id },
  })
  return { status: "disabled", sessions: sessions.count }
}

export type EnableResult =
  | { status: "enabled" }
  | { status: "already-enabled" }
  | { status: "not-found" }

// Undoes disableStaff: no new password, no role change
export async function enableStaff(
  client: DbClient,
  input: { email: string }
): Promise<EnableResult> {
  const user = await client.user.findUnique({
    where: { email: normalizeEmail(input.email) },
    select: { id: true, disabledAt: true },
  })
  if (!user) return { status: "not-found" }
  if (!user.disabledAt) return { status: "already-enabled" }
  await client.user.update({
    where: { id: user.id },
    data: { disabledAt: null },
  })
  return { status: "enabled" }
}
