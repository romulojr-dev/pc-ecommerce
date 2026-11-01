import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cronSecretSchema } from "./cron-secret-schema"

// docs/specs/033-release-unpaid-orders: N1–N3

describe("CRON_SECRET schema", () => {
  it("may be unset (N1)", () => {
    expect(cronSecretSchema.parse(undefined)).toBeUndefined()
  })

  it("accepts 16 characters or more", () => {
    expect(cronSecretSchema.parse("s".repeat(16))).toBe("s".repeat(16))
  })

  it("refuses a shorter secret (N2)", () => {
    const result = cronSecretSchema.safeParse("s".repeat(15))
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe(
      "must be at least 16 characters"
    )
  })
})

describe("the daily cron (N3)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

  it("is listed in vercel.json at midnight Manila", () => {
    expect(JSON.parse(read("vercel.json")).crons).toEqual([
      { path: "/api/cron/release-orders", schedule: "0 16 * * *" },
    ])
  })

  it("has its secret in .env.example", () => {
    expect(read(".env.example")).toMatch(/^CRON_SECRET=/m)
  })
})
