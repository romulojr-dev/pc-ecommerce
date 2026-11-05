import { describe, expect, test } from "vitest"

import { decideScriptTarget } from "./script-guard"

// docs/specs/039-staff-sign-in-admin-shell, U4–U8, U8b–U8d

const url = (host: string) => `postgresql://user:secret-pw@${host}/neondb`
const PRODUCTION = "ep-x.neon.tech"

describe("production host set", () => {
  test("the production database without --production is refused (U4)", () => {
    const result = decideScriptTarget({
      databaseUrl: url("ep-x.neon.tech"),
      productionHost: PRODUCTION,
      production: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        "Refusing: ep-x.neon.tech is the production database. Pass --production to confirm."
      )
    }
  })

  test("the production database with --production is allowed (U5)", () => {
    expect(
      decideScriptTarget({
        databaseUrl: url("ep-x.neon.tech"),
        productionHost: PRODUCTION,
        production: true,
      })
    ).toEqual({ ok: true, host: "ep-x.neon.tech" })
  })

  test("--production on another database is refused (U6)", () => {
    const result = decideScriptTarget({
      databaseUrl: url("ep-y.neon.tech"),
      productionHost: PRODUCTION,
      production: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toBe(
        "Refusing: --production was passed but ep-y.neon.tech is not the production database."
      )
    }
  })

  test("another database without the flag is allowed", () => {
    expect(
      decideScriptTarget({
        databaseUrl: url("ep-y.neon.tech"),
        productionHost: PRODUCTION,
        production: false,
      })
    ).toEqual({ ok: true, host: "ep-y.neon.tech" })
  })

  test("pooled and upper-case spellings of the production host are production (U8b)", () => {
    for (const host of ["ep-x-pooler.neon.tech", "EP-X.NEON.TECH"]) {
      const refused = decideScriptTarget({
        databaseUrl: url(host),
        productionHost: PRODUCTION,
        production: false,
      })
      expect(refused.ok, host).toBe(false)
      expect(
        decideScriptTarget({
          databaseUrl: url(host),
          productionHost: PRODUCTION,
          production: true,
        }).ok,
        host
      ).toBe(true)
    }
  })

  test("a pooled PRODUCTION_DATABASE_HOST matches the direct URL (U8c)", () => {
    const result = decideScriptTarget({
      databaseUrl: url("ep-x.neon.tech"),
      productionHost: "ep-x-pooler.neon.tech",
      production: false,
    })
    expect(result.ok).toBe(false)
  })

  test("only a -pooler suffix is stripped: ep-xy is not ep-x (U8d)", () => {
    expect(
      decideScriptTarget({
        databaseUrl: url("ep-xy.neon.tech"),
        productionHost: PRODUCTION,
        production: false,
      }).ok
    ).toBe(true)
  })
})

describe("production host unset", () => {
  test("a local database is allowed (U7)", () => {
    for (const host of ["localhost:5433", "127.0.0.1:5432", "[::1]:5432"]) {
      expect(
        decideScriptTarget({
          databaseUrl: url(host),
          productionHost: undefined,
          production: false,
        }).ok,
        host
      ).toBe(true)
    }
  })

  test("a remote database is refused and the message says to set the variable (U8)", () => {
    const result = decideScriptTarget({
      databaseUrl: url("ep-y.neon.tech"),
      productionHost: undefined,
      production: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain("PRODUCTION_DATABASE_HOST is not set")
      expect(result.message).toContain("Set it in .env.local.")
    }
  })

  test("--production is refused too: nothing says it is production", () => {
    expect(
      decideScriptTarget({
        databaseUrl: url("ep-y.neon.tech"),
        productionHost: undefined,
        production: true,
      }).ok
    ).toBe(false)
    expect(
      decideScriptTarget({
        databaseUrl: url("localhost:5433"),
        productionHost: undefined,
        production: true,
      }).ok
    ).toBe(false)
  })
})

describe("bad input", () => {
  test("no URL or a non-postgres URL is refused", () => {
    for (const databaseUrl of [undefined, "", "mysql://u:p@h/db", "nonsense"]) {
      expect(
        decideScriptTarget({
          databaseUrl,
          productionHost: PRODUCTION,
          production: false,
        }).ok
      ).toBe(false)
    }
  })

  test("no message ever contains the password", () => {
    const cases = [
      { host: "ep-x.neon.tech", production: false },
      { host: "ep-y.neon.tech", production: true },
      { host: "ep-z.neon.tech", production: false },
    ]
    for (const { host, production } of cases) {
      for (const productionHost of [PRODUCTION, undefined]) {
        const result = decideScriptTarget({
          databaseUrl: url(host),
          productionHost,
          production,
        })
        if (!result.ok) expect(result.message).not.toContain("secret-pw")
      }
    }
  })
})
