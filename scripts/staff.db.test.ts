import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"

import { beforeEach, describe, expect, test } from "vitest"

import { auth } from "@/lib/auth/auth"
import { db } from "@/lib/db"

// The staff scripts and `db:seed --accounts-only`, run as real processes
// against the test database (docs/specs/039-staff-sign-in-admin-shell,
// Rules 23–28, U9, U11, I18–I25). Slow (a process each), so the cases are few
// and each checks several things.

const tsx = createRequire(import.meta.url).resolve("tsx/cli")
const PASSWORD = "correct horse battery"
const DEMO_PASSWORD = "a-public-demo-password"

function run(
  script: string,
  args: string[],
  {
    input = "",
    env = {},
  }: { input?: string; env?: Record<string, string> } = {}
) {
  const result = spawnSync(process.execPath, [tsx, script, ...args], {
    input,
    encoding: "utf8",
    cwd: process.cwd(),
    // The worker's environment already points at the test database
    env: { ...process.env, ...env },
    timeout: 60_000,
  })
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: `${result.stdout}${result.stderr}`,
  }
}

const staff = (
  command: string,
  args: string[],
  input?: string,
  env?: Record<string, string>
) => run("scripts/staff.ts", [command, ...args], { input, env })
const seed = (args: string[], env?: Record<string, string>) =>
  run("prisma/seed.ts", args, { env })

async function signInStatus(email: string, password: string, n: number) {
  const res = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        "x-forwarded-for": `198.51.100.${n}`,
      },
      body: JSON.stringify({ email, password }),
    })
  )
  return res.status
}

beforeEach(async () => {
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
})

describe("pnpm staff:create", () => {
  test("reads the password from stdin, names the host first, and never prints the password", () => {
    const result = staff(
      "create",
      ["--email", "Ana@Example.com", "--name", "Ana Cruz", "--role", "owner"],
      `${PASSWORD}\n`
    )
    expect(result.code, result.output).toBe(0)
    expect(result.stdout.split("\n")[0]).toBe("Database: localhost")
    expect(result.stdout).toContain("Created owner ana@example.com.")
    expect(result.output).not.toContain(PASSWORD)
  })

  test("the created user signs in with that password", async () => {
    staff(
      "create",
      ["--email", "ana@example.com", "--name", "Ana", "--role", "staff"],
      `${PASSWORD}\n`
    )
    expect(await signInStatus("ana@example.com", PASSWORD, 1)).toBe(200)
    expect(await signInStatus("ana@example.com", "not the password", 2)).toBe(
      401
    )
    expect((await db.user.findFirstOrThrow()).role).toBe("STAFF")
  })

  test("there is no password option, and nothing is written (U11)", async () => {
    const result = staff("create", [
      "--email",
      "ana@example.com",
      "--name",
      "Ana",
      "--role",
      "staff",
      "--password",
      "hunter2hunter2",
    ])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Unknown option: --password")
    expect(result.output).not.toContain("hunter2hunter2")
    expect(await db.user.count()).toBe(0)
  })

  test("a short or empty password is refused (I21 neighbours)", async () => {
    const short = staff(
      "create",
      ["--email", "a@example.com", "--name", "A", "--role", "staff"],
      "short\n"
    )
    expect(short.code).toBe(1)
    expect(short.stderr).toContain("at least 12 characters")
    const empty = staff(
      "create",
      ["--email", "a@example.com", "--name", "A", "--role", "staff"],
      ""
    )
    expect(empty.code).toBe(1)
    expect(empty.stderr).toContain("No password was given.")
    expect(await db.user.count()).toBe(0)
  })

  test("an existing email is an error and the password stays", async () => {
    const args = [
      "--email",
      "ana@example.com",
      "--name",
      "Ana",
      "--role",
      "staff",
    ]
    staff("create", args, `${PASSWORD}\n`)
    const again = staff("create", args, "another long password\n")
    expect(again.code).toBe(1)
    expect(again.stderr).toContain("ana@example.com already exists.")
    expect(await signInStatus("ana@example.com", PASSWORD, 1)).toBe(200)
  })

  test("--role demo is refused", async () => {
    const result = staff(
      "create",
      ["--email", "d@example.com", "--name", "D", "--role", "demo"],
      `${PASSWORD}\n`
    )
    expect(result.code).toBe(1)
    expect(await db.user.count()).toBe(0)
  })
})

describe("the production rule (U4, U5, U6)", () => {
  const args = [
    "--email",
    "ana@example.com",
    "--name",
    "Ana",
    "--role",
    "staff",
  ]

  test("production without --production: refused after the host line, nothing written", async () => {
    const result = staff("create", args, `${PASSWORD}\n`, {
      PRODUCTION_DATABASE_HOST: "localhost",
    })
    expect(result.code).toBe(1)
    expect(result.stdout.split("\n")[0]).toBe("Database: localhost")
    expect(result.stderr).toContain(
      "Refusing: localhost is the production database. Pass --production to confirm."
    )
    expect(await db.user.count()).toBe(0)
  })

  test("--production on production works; --production elsewhere is refused", async () => {
    const ok = staff("create", [...args, "--production"], `${PASSWORD}\n`, {
      PRODUCTION_DATABASE_HOST: "localhost",
    })
    expect(ok.code, ok.output).toBe(0)
    expect(await db.user.count()).toBe(1)

    await db.$executeRaw`TRUNCATE TABLE "Account", "User" CASCADE`
    const refused = staff(
      "create",
      [...args, "--production"],
      `${PASSWORD}\n`,
      {
        PRODUCTION_DATABASE_HOST: "ep-other.neon.tech",
      }
    )
    expect(refused.code).toBe(1)
    expect(refused.stderr).toContain("--production was passed but")
    expect(await db.user.count()).toBe(0)
  })
})

describe("pnpm staff:set-password, staff:disable and --enable", () => {
  const create = () =>
    staff(
      "create",
      ["--email", "ana@example.com", "--name", "Ana", "--role", "staff"],
      `${PASSWORD}\n`
    )

  test("set-password changes it, ends the sessions and never prints it", async () => {
    create()
    await signInStatus("ana@example.com", PASSWORD, 1)
    expect(await db.session.count()).toBe(1)
    const result = staff(
      "set-password",
      ["--email", "ana@example.com"],
      "another long password\n"
    )
    expect(result.code, result.output).toBe(0)
    expect(result.stdout).toContain(
      "Changed the password for ana@example.com and ended 1 session(s)."
    )
    expect(result.output).not.toContain("another long password")
    expect(await db.session.count()).toBe(0)
    expect(
      await signInStatus("ana@example.com", "another long password", 2)
    ).toBe(200)
  })

  test("disable ends the sessions and blocks sign-in; create --enable undoes it", async () => {
    create()
    await signInStatus("ana@example.com", PASSWORD, 1)
    const disabled = staff("disable", ["--email", "ana@example.com"])
    expect(disabled.code, disabled.output).toBe(0)
    expect(disabled.stdout).toContain(
      "Disabled ana@example.com and ended 1 session(s)."
    )
    expect(await db.session.count()).toBe(0)
    expect(await signInStatus("ana@example.com", PASSWORD, 2)).toBe(401)

    const enabled = staff("create", ["--email", "ana@example.com", "--enable"])
    expect(enabled.code, enabled.output).toBe(0)
    expect(enabled.stdout).toContain("Enabled ana@example.com.")
    expect(await signInStatus("ana@example.com", PASSWORD, 3)).toBe(200)
  })

  test("an unknown email is an error", () => {
    const result = staff("disable", ["--email", "nobody@example.com"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("No user with email nobody@example.com.")
  })
})

describe("pnpm db:seed --accounts-only", () => {
  test("creates the demo user once and leaves the catalog alone (I22, I24)", async () => {
    const products = await db.product.count()
    const first = seed(["--accounts-only"], {
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
    })
    expect(first.code, first.output).toBe(0)
    expect(first.stdout.split("\n")[0]).toBe("Database: localhost")
    expect(first.stdout).toContain("Created the demo account.")
    expect(first.output).not.toContain(DEMO_PASSWORD)
    expect(await signInStatus("demo@pcsilicon.tech", DEMO_PASSWORD, 1)).toBe(
      200
    )
    const hash = (await db.account.findFirstOrThrow()).password

    const second = seed(["--accounts-only"], {
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
    })
    expect(second.code, second.output).toBe(0)
    expect(second.stdout).toContain(
      "The demo account already exists; left as it is."
    )
    expect(await db.user.count()).toBe(1)
    expect((await db.account.findFirstOrThrow()).password).toBe(hash)
    expect(await db.product.count()).toBe(products)
  })

  test("a different password the second time changes nothing (I23)", async () => {
    seed(["--accounts-only"], { DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD })
    seed(["--accounts-only"], {
      DEMO_ACCOUNT_PASSWORD: "a-different-demo-password",
    })
    expect(await signInStatus("demo@pcsilicon.tech", DEMO_PASSWORD, 1)).toBe(
      200
    )
  })

  test("with the variable unset it says so and writes nothing (I24)", async () => {
    const result = seed(["--accounts-only"], { DEMO_ACCOUNT_PASSWORD: "" })
    expect(result.code, result.output).toBe(0)
    expect(result.stdout).toContain(
      "DEMO_ACCOUNT_PASSWORD is not set; skipped the demo account."
    )
    expect(await db.user.count()).toBe(0)
  })

  test("a password under 12 characters is refused and not echoed (I24b)", async () => {
    const result = seed(["--accounts-only"], {
      DEMO_ACCOUNT_PASSWORD: "11-chars-pw",
    })
    expect(result.code).not.toBe(0)
    expect(result.output).toContain("DEMO_ACCOUNT_PASSWORD")
    expect(result.output).not.toContain("11-chars-pw")
    expect(await db.user.count()).toBe(0)
  })

  test("--reset with --accounts-only is refused and writes nothing (I25)", async () => {
    const result = seed(["--accounts-only", "--reset"], {
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
    })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      "--accounts-only can't be combined with --reset."
    )
    expect(await db.user.count()).toBe(0)
  })

  test("the production rule applies to the demo account too", async () => {
    const refused = seed(["--accounts-only"], {
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
      PRODUCTION_DATABASE_HOST: "localhost",
    })
    expect(refused.code).toBe(1)
    expect(refused.stderr).toContain("Pass --production to confirm.")
    expect(await db.user.count()).toBe(0)

    const ok = seed(["--accounts-only", "--production"], {
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
      PRODUCTION_DATABASE_HOST: "localhost",
    })
    expect(ok.code, ok.output).toBe(0)
    expect(await db.user.count()).toBe(1)
  })

  test("--production without --accounts-only is refused", () => {
    const result = seed(["--production"])
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(
      "--production only goes with --accounts-only."
    )
  })
})
