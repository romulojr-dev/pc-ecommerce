import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

// `pnpm db:seed --reset` refuses production before it touches any database
// (docs/specs/022-share-build, Rules › Production safety, E63–E68). This runs
// the real script as a child process, with a database URL that nothing
// listens on: a refusal exits 1 with the guard's message and never connects.

const root = fileURLToPath(new URL("../../", import.meta.url))
const tsx = fileURLToPath(
  new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url)
)
const script = fileURLToPath(new URL("../seed.ts", import.meta.url))

// Nothing listens on port 1
const URL_OF = (host: string) => `postgresql://user:secret@${host}:1/neondb`

function run(args: string[], env: Record<string, string>) {
  // Typed loosely: Next narrows NODE_ENV's type, and "" must be allowed
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    // The script loads .env.local, but real variables win over it, so
    // every variable the guard reads is set here
    NODE_ENV: "",
    VERCEL_ENV: "",
    PRODUCTION_DATABASE_HOST: "",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    DATABASE_URL: URL_OF("127.0.0.1"),
    DATABASE_URL_UNPOOLED: URL_OF("127.0.0.1"),
    ...env,
  }
  const result = spawnSync(process.execPath, [tsx, script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    env: childEnv as NodeJS.ProcessEnv,
  })
  return { code: result.status, out: result.stdout, err: result.stderr }
}

describe("pnpm db:seed --reset", () => {
  it("refuses when NODE_ENV is production, without connecting (E63, E68)", () => {
    const { code, err, out } = run(["--reset"], {
      NODE_ENV: "production",
      PRODUCTION_DATABASE_HOST: "prod.example.com",
    })
    expect(code).toBe(1)
    expect(err).toContain(
      "Refusing to reset the catalog: NODE_ENV is production."
    )
    expect(out).not.toContain("Resetting catalog")
  }, 120_000)

  it("refuses when VERCEL_ENV is production (E64)", () => {
    const { code, err } = run(["--reset"], {
      VERCEL_ENV: "production",
      PRODUCTION_DATABASE_HOST: "prod.example.com",
    })
    expect(code).toBe(1)
    expect(err).toContain("VERCEL_ENV is production")
  }, 120_000)

  it("refuses the production host with no environment names set (E65)", () => {
    const { code, err, out } = run(["--reset"], {
      DATABASE_URL: URL_OF("ep-prod-1-pooler.neon.example"),
      DATABASE_URL_UNPOOLED: URL_OF("ep-prod-1.neon.example"),
      PRODUCTION_DATABASE_HOST: "ep-prod-1.neon.example",
    })
    expect(code).toBe(1)
    expect(err).toContain("ep-prod-1.neon.example is the production database")
    expect(err).not.toContain("secret")
    expect(out).not.toContain("Resetting catalog")
  }, 120_000)

  it("refuses when it can't tell which database is production (E66)", () => {
    const { code, err } = run(["--reset"], {})
    expect(code).toBe(1)
    expect(err).toContain("PRODUCTION_DATABASE_HOST is not set")
  }, 120_000)

  it("doesn't refuse a plain seed in a production environment (E68)", () => {
    // The production seed procedure (spec 004) must still work. It reaches
    // the database step, which fails here because nothing listens.
    const { code, err, out } = run([], {
      NODE_ENV: "production",
      PRODUCTION_DATABASE_HOST: "prod.example.com",
    })
    expect(out).toContain("Seeding 127.0.0.1")
    expect(err).not.toContain("Refusing")
    expect(code).toBe(1)
  }, 120_000)
})
