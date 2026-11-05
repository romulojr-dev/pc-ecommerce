import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { getSessionCookie } from "better-auth/cookies"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { db } from "@/lib/db"
import {
  ALLOWED_PATHS,
  createProbeAuth,
  DISABLED_PATHS,
  PROBE_SECRET,
} from "@/test-support/auth-probe"

// Probes of what spec 039 assumes about Better Auth 1.7.17 (plan task 1).
// Each test is one assumption; a failure is reported to the user before the
// rest of the story is built on it.

type Auth = ReturnType<typeof createProbeAuth>
const PASSWORD = "correct horse battery"
const CUID = /^c[a-z0-9]{24}$/

async function clean() {
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
}

async function makeUser(auth: Auth, email: string, role = "STAFF") {
  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser(
    { email, name: email, emailVerified: true, role },
    { method: "admin" }
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(PASSWORD),
  })
  return user
}

function request(
  path: string,
  init: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
  base = "http://localhost:3000"
) {
  return new Request(`${base}/api/auth${path}`, {
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      origin: base,
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

const signIn = (
  auth: Auth,
  email: string,
  ip: string,
  password = PASSWORD,
  base?: string
) =>
  auth.handler(
    request(
      "/sign-in/email",
      { body: { email, password }, headers: { "x-forwarded-for": ip } },
      base
    )
  )

function cookieHeader(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

const getSession = (auth: Auth, cookie: string) =>
  auth.handler(request("/get-session", { method: "GET", headers: { cookie } }))

beforeEach(clean)
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("P1 disabledPaths", () => {
  test("every endpoint of the installed version is allowed or disabled", () => {
    const auth = createProbeAuth()
    const paths = Object.values(auth.api)
      .map((e) => (e as { path?: string }).path)
      .filter((p): p is string => !!p)
    const known = new Set([...ALLOWED_PATHS, ...DISABLED_PATHS])
    expect(paths.filter((p) => !known.has(p))).toEqual([])
  })

  test("exact-path endpoints in disabledPaths answer 404, for each method", async () => {
    const auth = createProbeAuth()
    const failures: string[] = []
    for (const path of DISABLED_PATHS.filter((p) => !p.includes(":"))) {
      for (const method of ["GET", "POST"]) {
        const res = await auth.handler(
          request(path, { method, body: method === "POST" ? {} : undefined })
        )
        if (res.status !== 404) failures.push(`${method} ${path} ${res.status}`)
      }
    }
    expect(failures).toEqual([])
  })

  // FINDING: disabledPaths is matched with includes() on the literal path, so
  // the two parameterized endpoints cannot be disabled by listing them.
  test("FINDING: parameterized endpoints are not blocked by disabledPaths", async () => {
    const auth = createProbeAuth()
    const responding: string[] = []
    for (const [method, path] of [
      ["GET", "/callback/google"],
      ["POST", "/callback/google"],
      ["GET", "/reset-password/abc"],
    ]) {
      const res = await auth.handler(
        request(path, { method, body: method === "POST" ? {} : undefined })
      )
      if (res.status !== 404) responding.push(`${method} ${path} ${res.status}`)
    }
    expect(responding).toEqual([
      "GET /callback/google 302",
      "POST /callback/google 302",
      "GET /reset-password/abc 400",
    ])
  })

  test("an allowlist in front of the handler blocks everything but the three", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    const guarded = (req: Request) => {
      const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "")
      const allowed =
        (req.method === "POST" &&
          (path === "/sign-in/email" || path === "/sign-out")) ||
        (path === "/get-session" &&
          (req.method === "GET" || req.method === "POST"))
      return allowed
        ? auth.handler(req)
        : Promise.resolve(new Response("Not Found", { status: 404 }))
    }
    const failures: string[] = []
    for (const path of DISABLED_PATHS) {
      const concrete = path.replace(":id", "google").replace(":token", "abc")
      for (const method of ["GET", "POST"]) {
        const res = await guarded(
          request(concrete, {
            method,
            body: method === "POST" ? {} : undefined,
          })
        )
        if (res.status !== 404)
          failures.push(`${method} ${concrete} ${res.status}`)
      }
    }
    expect(failures).toEqual([])
    const ok = await guarded(
      request("/sign-in/email", {
        body: { email: "a@example.com", password: PASSWORD },
        headers: { "x-forwarded-for": "198.51.100.1" },
      })
    )
    expect(ok.status).toBe(200)
  })

  test("variants of a disabled path don't get through", async () => {
    const auth = createProbeAuth()
    const variants = [
      "/sign-up/email/",
      "//sign-up/email",
      "/SIGN-UP/EMAIL",
      "/sign-up/%65mail",
      "/sign-up/email?x=1",
      "/sign-up/./email",
      "/change-password/",
      "/update-user/",
      "/list-sessions/",
    ]
    const failures: string[] = []
    for (const v of variants) {
      const res = await auth.handler(request(v, { body: {} }))
      if (res.status !== 404) failures.push(`${v} ${res.status}`)
    }
    expect(failures).toEqual([])
  })

  test("the three allowed endpoints answer", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    const ok = await signIn(auth, "a@example.com", "198.51.100.1")
    expect(ok.status).toBe(200)
    const cookie = cookieHeader(ok)
    expect((await getSession(auth, cookie)).status).toBe(200)
    const out = await auth.handler(
      request("/sign-out", { body: {}, headers: { cookie } })
    )
    expect(out.status).toBe(200)
  })
})

describe("P2 rate limit", () => {
  test("HTTP sign-in: database storage, IP and path key, 3 per 10 s", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    await makeUser(auth, "demo@example.com", "DEMO")
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await signIn(
        auth,
        "a@example.com",
        "198.51.100.1",
        "wrong-password-1"
      )
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 3)).not.toContain(429)
    expect(statuses[3]).toBe(429)
    // A correct password is refused too while limited
    expect((await signIn(auth, "a@example.com", "198.51.100.1")).status).toBe(
      429
    )
    // Another IP is unaffected
    expect(
      (await signIn(auth, "demo@example.com", "198.51.100.2")).status
    ).toBe(200)
    const rows = await db.rateLimit.findMany()
    expect(rows.map((r) => r.key).sort()).toEqual([
      "198.51.100.1|/sign-in/email",
      "198.51.100.2|/sign-in/email",
    ])
  })

  test("the limit ends with the window", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    vi.useFakeTimers({ toFake: ["Date"] })
    for (let i = 0; i < 4; i++) {
      await signIn(auth, "a@example.com", "198.51.100.1", "wrong-password-1")
    }
    vi.setSystemTime(Date.now() + 11_000)
    expect((await signIn(auth, "a@example.com", "198.51.100.1")).status).toBe(
      200
    )
  })

  test("is on in test and in a production configuration", async () => {
    const ctx = await createProbeAuth().$context
    expect(ctx.rateLimit.enabled).toBe(true)
    expect(ctx.rateLimit.storage).toBe("database")
    vi.stubEnv("NODE_ENV", "production")
    const prod = createProbeAuth({ baseURL: "https://pcsilicon.tech" })
    expect((await prod.$context).rateLimit.enabled).toBe(true)
  })

  test("under test a request with no IP header falls back to one shared bucket", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    const noHeader = () =>
      auth.handler(
        request("/sign-in/email", {
          body: { email: "a@example.com", password: "wrong-password-1" },
        })
      )
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await noHeader()).status)
    expect(statuses[3]).toBe(429)
    expect((await db.rateLimit.findMany()).map((r) => r.key)).toEqual([
      "127.0.0.1|/sign-in/email",
    ])
  })

  // The "no IP" fallback differs by NODE_ENV, read when the module loads, so
  // production is checked in a child process (the resolver itself, which the
  // rate limiter calls)
  test("in production no IP, or a forwarded chain, resolves to no IP (shared bucket)", () => {
    // @better-auth/core isn't a direct dependency, so it is found from
    // better-auth's own location
    const betterAuthMain = createRequire(import.meta.url).resolve("better-auth")
    const ipModule = pathToFileURL(
      createRequire(betterAuthMain).resolve("@better-auth/core/utils/ip")
    ).href
    const script = `
      import(${JSON.stringify(ipModule)}).then(({ getIP }) => {
        const ip = (h) => getIP({ headers: new Headers(h) }, {})
        console.log(JSON.stringify([
          ip({}),
          ip({ "x-forwarded-for": "198.51.100.9" }),
          ip({ "x-forwarded-for": "203.0.113.7, 198.51.100.9" }),
          ip({ "x-forwarded-for": "not-an-ip" }),
        ]))
      })`
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        env: { ...process.env, NODE_ENV: "production", TEST: "", VITEST: "" },
        cwd: process.cwd(),
        encoding: "utf8",
      }
    )
    const lines = out.trim().split(/\r?\n/)
    expect(JSON.parse(lines[lines.length - 1]!)).toEqual([
      null,
      "198.51.100.9",
      null,
      null,
    ])
  })
})

describe("P3 absolute sessions", () => {
  test("expiresAt is 8 h and never moves; older than 8 h is rejected", async () => {
    const auth = createProbeAuth()
    const user = await makeUser(auth, "a@example.com")
    vi.useFakeTimers({ toFake: ["Date"] })
    const start = Date.now()
    const cookie = cookieHeader(
      await signIn(auth, "a@example.com", "198.51.100.1")
    )
    const row = await db.session.findFirstOrThrow({
      where: { userId: user.id },
    })
    expect(
      Math.abs(row.expiresAt.getTime() - (start + 8 * 3600_000))
    ).toBeLessThan(5000)

    for (const offset of [3600_000, 7 * 3600_000 + 59 * 60_000]) {
      vi.setSystemTime(start + offset)
      const get = await getSession(auth, cookie)
      expect(
        ((await get.json()) as { user?: unknown } | null)?.user
      ).toBeTruthy()
      const after = await db.session.findFirstOrThrow({
        where: { userId: user.id },
      })
      expect(after.expiresAt.getTime()).toBe(row.expiresAt.getTime())
      expect(after.updatedAt.getTime()).toBe(row.updatedAt.getTime())
    }
    vi.setSystemTime(start + 8 * 3600_000 + 60_000)
    expect(await (await getSession(auth, cookie)).json()).toBeNull()
  })
})

describe("P4 hashed verification identifiers", () => {
  test("the stored identifier is not the plain one", async () => {
    const ctx = await createProbeAuth().$context
    await ctx.internalAdapter.createVerificationValue({
      identifier: "plain-identifier-123",
      value: "v",
      expiresAt: new Date(Date.now() + 60_000),
    })
    const row = await db.verification.findFirstOrThrow()
    expect(row.identifier).not.toContain("plain-identifier-123")
  })
})

describe("P5 cookies", () => {
  test("http://localhost: no prefix, no Secure", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com")
    const res = await signIn(auth, "a@example.com", "198.51.100.1")
    const set = res.headers
      .getSetCookie()
      .find((c) => c.includes("session_token"))!
    expect(set.startsWith("better-auth.session_token=")).toBe(true)
    expect(set).toContain("HttpOnly")
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).toContain("Path=/")
    expect(set).not.toMatch(/Secure/i)
    const req = new Request("http://localhost:3000", {
      headers: { cookie: cookieHeader(res) },
    })
    expect(getSessionCookie(req)).toBeTruthy()
  })

  test("https: __Secure- prefix and Secure", async () => {
    const auth = createProbeAuth({ baseURL: "https://pcsilicon.tech" })
    await makeUser(auth, "a@example.com")
    const res = await signIn(
      auth,
      "a@example.com",
      "198.51.100.1",
      PASSWORD,
      "https://pcsilicon.tech"
    )
    const set = res.headers
      .getSetCookie()
      .find((c) => c.includes("session_token"))!
    expect(set.startsWith("__Secure-better-auth.session_token=")).toBe(true)
    expect(set).toContain("HttpOnly")
    expect(set).toMatch(/SameSite=Lax/i)
    expect(set).toContain("Path=/")
    expect(set).toMatch(/Secure/i)
    const req = new Request("https://pcsilicon.tech", {
      headers: { cookie: cookieHeader(res) },
    })
    expect(getSessionCookie(req)).toBeTruthy()
  })
})

describe("P6 cuid ids", () => {
  test("User, Session and Account ids are cuids from the database default", async () => {
    const auth = createProbeAuth()
    const user = await makeUser(auth, "a@example.com")
    await signIn(auth, "a@example.com", "198.51.100.1")
    expect(user.id).toMatch(CUID)
    expect((await db.session.findFirstOrThrow()).id).toMatch(CUID)
    expect((await db.account.findFirstOrThrow()).id).toMatch(CUID)
  })
})

describe("P7 input: false", () => {
  test("a sign-up carrying role (open instance, this test only) cannot set it", async () => {
    const open = betterAuth({
      secret: PROBE_SECRET,
      baseURL: "http://localhost:3000",
      database: prismaAdapter(db, { provider: "postgresql" }),
      emailAndPassword: { enabled: true, minPasswordLength: 12 },
      user: {
        additionalFields: {
          role: {
            type: "string",
            required: true,
            input: false,
            defaultValue: "DEMO",
          },
          disabledAt: { type: "date", required: false, input: false },
        },
      },
      advanced: { database: { generateId: false } },
    })
    const res = await open.handler(
      request("/sign-up/email", {
        body: {
          email: "x@example.com",
          name: "x",
          password: PASSWORD,
          role: "OWNER",
          disabledAt: null,
        },
        headers: { "x-forwarded-for": "198.51.100.5" },
      })
    )
    const created = await db.user.findUnique({
      where: { email: "x@example.com" },
    })
    // Either refused, or created with the server's value
    if (res.status === 200) expect(created?.role).toBe("DEMO")
    else expect(created).toBeNull()
  })

  test("a sign-in body carrying role changes nothing", async () => {
    const auth = createProbeAuth()
    await makeUser(auth, "a@example.com", "STAFF")
    await auth.handler(
      request("/sign-in/email", {
        body: {
          email: "a@example.com",
          password: PASSWORD,
          role: "OWNER",
          disabledAt: null,
        },
        headers: { "x-forwarded-for": "198.51.100.1" },
      })
    )
    const user = await db.user.findUniqueOrThrow({
      where: { email: "a@example.com" },
    })
    expect(user.role).toBe("STAFF")
  })
})

describe("P8 origin check", () => {
  test("trusted and untrusted origins; absent Origin", async () => {
    const host = "https://pc-abc-team.vercel.app"
    const auth = createProbeAuth({
      baseURL: host,
      trustedOrigins: [host, "https://pc-git-feat-team.vercel.app"],
    })
    await makeUser(auth, "a@example.com")
    let n = 0
    const post = (origin: string | null, cookie?: string) =>
      auth.handler(
        new Request(`${host}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `198.51.100.${++n}`,
            ...(origin ? { origin } : {}),
            ...(cookie ? { cookie } : {}),
          },
          body: JSON.stringify({ email: "a@example.com", password: PASSWORD }),
        })
      )
    expect((await post(host)).status).toBe(200)
    expect((await post("https://pc-git-feat-team.vercel.app")).status).toBe(200)
    expect((await post("https://pc-zzz-team.vercel.app")).status).toBe(403)
    expect((await post("https://evil.example")).status).toBe(403)
    // No Origin and no cookie: nothing to check (a browser always sends one)
    expect((await post(null)).status).toBe(200)
    // No Origin but a cookie: refused
    expect((await post(null, "better-auth.session_token=x")).status).toBe(403)
    expect(
      (await post("https://evil.example", "better-auth.session_token=x")).status
    ).toBe(403)
  })

  test("the check is off by default under NODE_ENV=test unless set explicitly", async () => {
    const { betterAuth: make } = await import("better-auth")
    const lax = make({
      secret: PROBE_SECRET,
      baseURL: "https://pc-abc-team.vercel.app",
      database: prismaAdapter(db, { provider: "postgresql" }),
      emailAndPassword: { enabled: true },
    })
    expect((await lax.$context).skipOriginCheck).toBe(true)
    expect((await createProbeAuth().$context).skipOriginCheck).toBe(false)
  })
})

describe("P9 sign-out", () => {
  test("deletes only the caller's session row", async () => {
    const auth = createProbeAuth()
    const user = await makeUser(auth, "demo@example.com", "DEMO")
    const a = cookieHeader(
      await signIn(auth, "demo@example.com", "198.51.100.1")
    )
    const b = cookieHeader(
      await signIn(auth, "demo@example.com", "198.51.100.2")
    )
    expect(await db.session.count({ where: { userId: user.id } })).toBe(2)
    await auth.handler(
      request("/sign-out", { body: {}, headers: { cookie: a } })
    )
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
    const still = await getSession(auth, b)
    expect(
      ((await still.json()) as { user?: unknown } | null)?.user
    ).toBeTruthy()
    expect(await (await getSession(auth, a)).json()).toBeNull()
  })
})

describe("P10 sign-up is refused", () => {
  test("sign-up/email answers 404 and creates nothing", async () => {
    const auth = createProbeAuth()
    const res = await auth.handler(
      request("/sign-up/email", {
        body: { email: "n@example.com", name: "n", password: PASSWORD },
      })
    )
    expect(res.status).toBe(404)
    expect(await db.user.count()).toBe(0)
  })
})
