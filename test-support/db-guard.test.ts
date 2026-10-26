import { describe, expect, it } from "vitest"

import { resolveTestDatabase, TestDatabaseError } from "./db-guard"

// Dev database on Neon: pooled for the app, direct for migrations
const neon = {
  DATABASE_URL:
    "postgresql://user:secret@ep-dev-123-pooler.region.aws.neon.tech/neondb",
  DATABASE_URL_UNPOOLED:
    "postgresql://user:secret@ep-dev-123.region.aws.neon.tech/neondb",
}
const neonTest =
  "postgresql://user:secret@ep-test-456.region.aws.neon.tech/neondb?sslmode=require"

describe("resolveTestDatabase", () => {
  it("accepts another host and prints host and database only", () => {
    const result = resolveTestDatabase({ ...neon, TEST_DATABASE_URL: neonTest })
    expect(result.url).toBe(neonTest)
    expect(result.label).toBe("ep-test-456.region.aws.neon.tech:5432/neondb")
    expect(result.label).not.toContain("secret")
  })

  it("accepts a test URL when no app URLs are set", () => {
    expect(() =>
      resolveTestDatabase({ TEST_DATABASE_URL: neonTest })
    ).not.toThrow()
  })

  it.each([undefined, ""])("refuses a missing URL (%j)", (value) => {
    expect(() =>
      resolveTestDatabase({ ...neon, TEST_DATABASE_URL: value })
    ).toThrow(/TEST_DATABASE_URL is not set/)
  })

  it.each(["not a url", "mysql://user:pw@host/db", "http://host/db"])(
    "refuses %j",
    (value) => {
      expect(() =>
        resolveTestDatabase({ ...neon, TEST_DATABASE_URL: value })
      ).toThrow(TestDatabaseError)
    }
  )

  it("refuses the pooled app host", () => {
    expect(() =>
      resolveTestDatabase({ ...neon, TEST_DATABASE_URL: neon.DATABASE_URL })
    ).toThrow(/same host as DATABASE_URL\b/)
  })

  it("refuses the direct app host, even for another database name", () => {
    expect(() =>
      resolveTestDatabase({
        ...neon,
        TEST_DATABASE_URL:
          "postgresql://user:secret@ep-dev-123.region.aws.neon.tech/other",
      })
    ).toThrow(/same host/)
  })

  it("treats a pooled test URL of the app's branch as the same host", () => {
    expect(() =>
      resolveTestDatabase({
        DATABASE_URL_UNPOOLED: neon.DATABASE_URL_UNPOOLED,
        TEST_DATABASE_URL: neon.DATABASE_URL,
      })
    ).toThrow(/same host as DATABASE_URL_UNPOOLED/)
  })

  describe("on a loopback server (CI, local Docker)", () => {
    const app = "postgresql://postgres:postgres@localhost:5432/pcsilicon"

    it("accepts a different database name", () => {
      const result = resolveTestDatabase({
        DATABASE_URL: app,
        DATABASE_URL_UNPOOLED: app,
        TEST_DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5432/pcsilicon_test",
      })
      expect(result.label).toBe("localhost:5432/pcsilicon_test")
    })

    it("refuses the same database", () => {
      expect(() =>
        resolveTestDatabase({
          DATABASE_URL: app,
          DATABASE_URL_UNPOOLED: app,
          TEST_DATABASE_URL: app,
        })
      ).toThrow(/same database/)
    })

    it("accepts the same database name on another port (another server)", () => {
      expect(() =>
        resolveTestDatabase({
          DATABASE_URL: app,
          TEST_DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5433/pcsilicon",
        })
      ).not.toThrow()
    })
  })

  it("refuses any shared remote host, whatever the database is called", () => {
    expect(() =>
      resolveTestDatabase({
        DATABASE_URL: "postgresql://u:p@db.example.com:5432/shop",
        TEST_DATABASE_URL: "postgresql://u:p@db.example.com:5432/shop_test",
      })
    ).toThrow(/same host/)
  })
})
