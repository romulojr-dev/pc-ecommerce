import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { cleanAuthTables } from "@/lib/auth/cleanup"
import { fakeGateway } from "@/lib/payments/fake"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { EXPIRES, heldOrder, PLACED } from "@/test-support/release"
import { seed } from "@/test-support/seed-parts"

import { type CronDeps, runReleaseCron } from "./release-cron"

// docs/specs/039-staff-sign-in-admin-shell: I26 (the cleanup), I27b–I27f (all
// jobs always run, then 500 naming the failed ones)

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidateTag: vi.fn(),
}))

let info: { mock: { calls: unknown[][] } }
let error: { mock: { calls: unknown[][] } }
beforeEach(async () => {
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  error = vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => db.$disconnect())

const SECRET = "c".repeat(32)
const NOW = EXPIRES
const HOUR = 3_600_000

const run = (deps: Partial<CronDeps> = {}) =>
  runReleaseCron(`Bearer ${SECRET}`, {
    secret: SECRET,
    now: NOW,
    gateway: fakeGateway({ now: () => PLACED }),
    environment: "development",
    deps,
  })

const infoLines = () =>
  info.mock.calls.map(([line]) => JSON.parse(String(line)))
const errorText = () =>
  error.mock.calls.map((call) => call.join(" ")).join("\n")

async function user(email: string) {
  return db.user.create({
    data: { email, name: email, role: "STAFF", emailVerified: true },
  })
}

async function session(userId: string, token: string, expiresAt: Date) {
  return db.session.create({ data: { userId, token, expiresAt } })
}

const rateLimit = (key: string, lastRequest: number) =>
  db.rateLimit.create({
    data: { key, count: 1, lastRequest: BigInt(lastRequest) },
  })

// One order the release will take, one session that has expired
async function dueWork() {
  const ids = await insertParts([seed.ryzen5_7600], {
    [seed.ryzen5_7600.id]: { stock: 40 },
  })
  await heldOrder([{ productId: ids.get(seed.ryzen5_7600.id)!, quantity: 1 }])
  const owner = await user("a@example.com")
  await session(owner.id, "expired-token", new Date(NOW.getTime() - HOUR))
  return owner
}

describe("cleanAuthTables (I26)", () => {
  it("deletes expired sessions and old rate-limit rows, and nothing else", async () => {
    const owner = await user("a@example.com")
    await session(owner.id, "expired-1", new Date(NOW.getTime() - HOUR))
    await session(owner.id, "expired-2", new Date(NOW.getTime() - 1000))
    const live = await session(owner.id, "live", new Date(NOW.getTime() + HOUR))
    await rateLimit("198.51.100.1|/sign-in/email", NOW.getTime() - 2 * HOUR)
    await rateLimit("198.51.100.2|/sign-in/email", NOW.getTime() - 24 * HOUR)
    await rateLimit("198.51.100.3|/sign-in/email", NOW.getTime() - 1000)
    await db.account.create({
      data: {
        userId: owner.id,
        providerId: "credential",
        accountId: owner.id,
        password: "hash",
      },
    })

    expect(await cleanAuthTables(NOW)).toEqual({ sessions: 2, rateLimits: 2 })

    expect((await db.session.findMany()).map((row) => row.id)).toEqual([
      live.id,
    ])
    expect((await db.rateLimit.findMany()).map((row) => row.key)).toEqual([
      "198.51.100.3|/sign-in/email",
    ])
    expect(await db.user.count()).toBe(1)
    expect(await db.account.count()).toBe(1)
  })

  it("a session expiring this very instant is gone; a rate limit exactly an hour old stays", async () => {
    const owner = await user("a@example.com")
    await session(owner.id, "now", new Date(NOW.getTime()))
    await session(owner.id, "later", new Date(NOW.getTime() + 1))
    await rateLimit("edge|/sign-in/email", NOW.getTime() - HOUR)
    await rateLimit("older|/sign-in/email", NOW.getTime() - HOUR - 1)

    expect(await cleanAuthTables(NOW)).toEqual({ sessions: 1, rateLimits: 1 })
    expect((await db.session.findMany()).map((row) => row.token)).toEqual([
      "later",
    ])
    expect((await db.rateLimit.findMany()).map((row) => row.key)).toEqual([
      "edge|/sign-in/email",
    ])
  })

  it("is safe to run twice and logs the two counts", async () => {
    const owner = await user("a@example.com")
    await session(owner.id, "expired", new Date(NOW.getTime() - HOUR))
    await Promise.all([cleanAuthTables(NOW), cleanAuthTables(NOW)])
    expect(await db.session.count()).toBe(0)
    expect(infoLines().every((line) => line.event === "auth.cleanup")).toBe(
      true
    )
    expect(JSON.stringify(infoLines())).not.toContain("expired")
  })
})

describe("the cron runs every job (I27, I27f)", () => {
  it("answers 200 with the three jobs' counts and no failure", async () => {
    await dueWork()
    const answer = await run()
    expect(answer).toEqual({
      status: 200,
      body: {
        released: 1,
        skipped: 0,
        // The cancellation's email, sent in the same run
        emails: 1,
        authCleanup: { sessions: 1, rateLimits: 0 },
        failed: [],
      },
    })
    expect(await db.session.count()).toBe(0)
    expect(errorText()).toBe("")
    expect(infoLines().at(-1)).toMatchObject({
      event: "order.release.cron",
      released: 1,
    })
    expect(infoLines().at(-1)).not.toHaveProperty("failed")
  })
})

describe("one job failing does not stop the others (I27b–I27e)", () => {
  const boom = () => {
    throw new Error("secret-detail-do-not-log")
  }

  it("the cleanup fails: the release and the emails still ran, 500, the log names it (I27b)", async () => {
    await dueWork()
    const answer = await run({ cleanAuthTables: boom })
    expect(answer).toEqual({
      status: 500,
      body: {
        released: 1,
        skipped: 0,
        emails: 1,
        authCleanup: null,
        failed: ["auth-cleanup"],
      },
    })
    expect(errorText()).toContain("cron job auth-cleanup failed: Error")
    expect(errorText()).not.toContain("secret-detail-do-not-log")
    expect(infoLines().at(-1)).toMatchObject({ failed: ["auth-cleanup"] })
  })

  it("the release fails: the cleanup and the emails still ran, 500, the log names it (I27c)", async () => {
    await dueWork()
    const sendPending = vi.fn(async () => ({
      claimed: 0,
      skipped: 0,
      tooOld: 0,
    })) as unknown as CronDeps["sendPending"]
    const answer = await run({ sweepExpiredOrders: boom, sendPending })
    expect(answer.status).toBe(500)
    expect(answer).toMatchObject({
      body: {
        released: 0,
        authCleanup: { sessions: 1, rateLimits: 0 },
        failed: ["release"],
      },
    })
    expect(await db.session.count()).toBe(0)
    expect(sendPending).toHaveBeenCalled()
    expect(errorText()).toContain("cron job release failed: Error")
    expect(errorText()).not.toContain("secret-detail-do-not-log")
  })

  it("a release batch that reports failure counts as the release failing (I27c)", async () => {
    await dueWork()
    const answer = await run({
      sweepExpiredOrders: async () => ({
        released: 0,
        skipped: 0,
        tried: [],
        failed: true,
      }),
    })
    expect(answer).toMatchObject({
      status: 500,
      body: { failed: ["release"], authCleanup: { sessions: 1 } },
    })
  })

  it("the emails fail: the release and the cleanup still ran (I27d)", async () => {
    await dueWork()
    const answer = await run({ sendPending: boom })
    expect(answer).toMatchObject({
      status: 500,
      body: {
        released: 1,
        authCleanup: { sessions: 1, rateLimits: 0 },
        failed: ["emails"],
      },
    })
    expect(errorText()).toContain("cron job emails failed: Error")
  })

  it("two fail: the third still ran and both are named, in run order (I27e)", async () => {
    await dueWork()
    const answer = await run({ sweepExpiredOrders: boom, sendPending: boom })
    expect(answer).toMatchObject({
      status: 500,
      body: {
        released: 0,
        authCleanup: { sessions: 1, rateLimits: 0 },
        failed: ["release", "emails"],
      },
    })
    expect(await db.session.count()).toBe(0)
  })

  it("all three fail: still 500 with every job named, and nothing throws", async () => {
    const answer = await run({
      sweepExpiredOrders: boom,
      sendPending: boom,
      cleanAuthTables: boom,
    })
    expect(answer).toMatchObject({
      status: 500,
      body: { failed: ["release", "emails", "auth-cleanup"] },
    })
  })
})
