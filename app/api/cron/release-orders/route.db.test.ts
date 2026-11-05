import { afterEach, describe, expect, it, vi } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { GET, maxDuration, runtime } from "./route"

// docs/specs/033-release-unpaid-orders: T3 through the route (the tests run
// with no CRON_SECRET) and T7

describe("GET /api/cron/release-orders", () => {
  it("refuses with no CRON_SECRET set, whatever the header (T3)", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/release-orders", {
        headers: { Authorization: `Bearer ${"c".repeat(32)}` },
      })
    )
    expect(response.status).toBe(401)
    expect(await response.text()).toBe("")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("sets its own limits (T7)", () => {
    expect(maxDuration).toBe(60)
    expect(runtime).toBe("nodejs")
  })
})

// docs/specs/039-staff-sign-in-admin-shell, I27: with a secret set, the route
// runs the three jobs and answers with all their counts
describe("GET /api/cron/release-orders with a secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function routeWithSecret(secret: string) {
    vi.stubEnv("CRON_SECRET", secret)
    vi.resetModules()
    vi.spyOn(console, "info").mockImplementation(() => {})
    return import("./route")
  }

  it("a wrong token is 401, the right one is 200 with every job's counts", async () => {
    // Nothing left over from other files: the counts below are exact
    await resetCatalog()
    await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
    const secret = "d".repeat(32)
    const { GET: guarded } = await routeWithSecret(secret)
    const call = (token: string | null) =>
      guarded(
        new Request("http://localhost/api/cron/release-orders", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      )

    expect((await call(null)).status).toBe(401)
    expect((await call("wrong")).status).toBe(401)

    const ok = await call(secret)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("Cache-Control")).toBe("no-store")
    expect(await ok.json()).toEqual({
      released: 0,
      skipped: 0,
      emails: 0,
      authCleanup: { sessions: 0, rateLimits: 0 },
      failed: [],
    })
  })
})
