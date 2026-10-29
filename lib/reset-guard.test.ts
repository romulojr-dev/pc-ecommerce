import { describe, expect, it } from "vitest"

import { assertResetAllowed, ResetRefusedError } from "./reset-guard"

// The catalog reset's production guard (docs/specs/022-share-build, Rules ›
// Production safety, E63–E67)

const PRODUCTION_HOST = "ep-prod-789.ap-southeast-1.aws.neon.tech"
const dev =
  "postgresql://user:secret@ep-dev-123-pooler.ap-southeast-1.aws.neon.tech/neondb"
const prodPooled = `postgresql://user:secret@ep-prod-789-pooler.ap-southeast-1.aws.neon.tech/neondb`
const prodDirect = `postgresql://user:secret@${PRODUCTION_HOST}/neondb`

// What a developer's shell looks like: no NODE_ENV, no VERCEL_ENV
const local = {
  DATABASE_URL: dev,
  PRODUCTION_DATABASE_HOST: PRODUCTION_HOST,
}

function refusal(
  env: Record<string, string | undefined>,
  options?: { requireProductionHost?: boolean }
) {
  try {
    assertResetAllowed(env, options)
  } catch (error) {
    expect(error).toBeInstanceOf(ResetRefusedError)
    return (error as Error).message
  }
  return null
}

describe("assertResetAllowed", () => {
  it("refuses when NODE_ENV is production (E63)", () => {
    expect(refusal({ ...local, NODE_ENV: "production" })).toBe(
      "Refusing to reset the catalog: NODE_ENV is production. A reset deletes shared builds and, later, carts and orders."
    )
  })

  it("refuses when VERCEL_ENV is production (E64)", () => {
    expect(refusal({ ...local, VERCEL_ENV: "production" })).toBe(
      "Refusing to reset the catalog: VERCEL_ENV is production. A reset deletes shared builds and, later, carts and orders."
    )
  })

  it("refuses the production host, pooled or direct (E65)", () => {
    const message =
      "Refusing to reset the catalog: ep-prod-789.ap-southeast-1.aws.neon.tech is the production database (PRODUCTION_DATABASE_HOST). A reset deletes shared builds and, later, carts and orders."
    expect(refusal({ ...local, DATABASE_URL: prodPooled })).toBe(message)
    expect(refusal({ ...local, DATABASE_URL: prodDirect })).toBe(message)
  })

  it("compares hosts without regard to case, and a pooled setting (E65)", () => {
    expect(
      refusal({
        DATABASE_URL: prodDirect,
        PRODUCTION_DATABASE_HOST:
          "EP-PROD-789-pooler.ap-southeast-1.aws.neon.tech",
      })
    ).toMatch(/is the production database/)
  })

  it("never prints the password", () => {
    expect(refusal({ ...local, DATABASE_URL: prodPooled })).not.toContain(
      "secret"
    )
  })

  it("refuses when the host is needed and not set (E66)", () => {
    expect(
      refusal({ DATABASE_URL: dev }, { requireProductionHost: true })
    ).toBe(
      "Refusing to reset the catalog: PRODUCTION_DATABASE_HOST is not set, so I can't tell whether this is production. Set it in .env.local."
    )
  })

  it("treats an empty host setting as not set (E66)", () => {
    expect(
      refusal(
        { DATABASE_URL: dev, PRODUCTION_DATABASE_HOST: "" },
        { requireProductionHost: true }
      )
    ).toMatch(/PRODUCTION_DATABASE_HOST is not set/)
  })

  it("refuses when the host is set but DATABASE_URL can't be read", () => {
    expect(refusal({ ...local, DATABASE_URL: "not a url" })).toMatch(
      /DATABASE_URL is not a postgres URL/
    )
    expect(refusal({ PRODUCTION_DATABASE_HOST: PRODUCTION_HOST })).toMatch(
      /DATABASE_URL is not a postgres URL/
    )
  })

  it.each([
    ["no environment names", local],
    ["development", { ...local, NODE_ENV: "development" }],
    ["test", { ...local, NODE_ENV: "test" }],
    ["a preview deployment", { ...local, VERCEL_ENV: "preview" }],
  ])("allows another host in %s (E67)", (_name, env) => {
    expect(refusal(env)).toBeNull()
    expect(refusal(env, { requireProductionHost: true })).toBeNull()
  })

  it("allows an unset host when it isn't required, outside production (E69)", () => {
    expect(refusal({ DATABASE_URL: dev })).toBeNull()
    expect(refusal({})).toBeNull()
  })

  it("still refuses production by environment when the host isn't set", () => {
    expect(refusal({ NODE_ENV: "production" })).toMatch(
      /NODE_ENV is production/
    )
  })
})
