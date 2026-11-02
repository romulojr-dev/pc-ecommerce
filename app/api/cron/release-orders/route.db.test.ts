import { describe, expect, it } from "vitest"

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
