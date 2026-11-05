import { describe, expect, test, vi } from "vitest"
import { z } from "zod"

import { createAdminGuards, type GuardSession } from "./guard"
import { adminMarkerOf } from "./marker"
import type { AdminRole } from "./permissions"

const OWN = "https://pcsilicon.tech"

function session(role: AdminRole): GuardSession {
  return { user: { id: `u-${role}`, name: `${role} person`, adminRole: role } }
}

function setup(current: GuardSession | null) {
  const loadSession = vi.fn(async () => current)
  const log = vi.fn()
  const guards = createAdminGuards({
    loadSession,
    trustedOrigins: () => [OWN],
    log,
  })
  return { ...guards, loadSession, log }
}

const schema = z.object({ sku: z.string().min(1), delta: z.number().int() })

describe("adminAction", () => {
  test("marks the function with its action", () => {
    const { adminAction } = setup(null)
    const fn = adminAction("inventory.adjust", schema, async () => 1)
    expect(adminMarkerOf(fn)).toBe("inventory.adjust")
  })

  test("a permitted role runs the handler with the actor and parsed input (E4)", async () => {
    const { adminAction } = setup(session("staff"))
    const handler = vi.fn(async () => "done")
    const fn = adminAction("inventory.adjust", schema, handler)
    const result = await fn({ sku: "CPU-AMD-7600X", delta: 5 })
    expect(result).toEqual({ ok: true, data: "done" })
    expect(handler).toHaveBeenCalledWith({
      actor: { id: "u-staff", name: "staff person", role: "staff" },
      input: { sku: "CPU-AMD-7600X", delta: 5 },
    })
  })

  test("Demo is refused before the schema runs, with the read-only text (E5)", async () => {
    const { adminAction } = setup(session("demo"))
    const handler = vi.fn()
    const parse = vi.spyOn(schema, "safeParse")
    const fn = adminAction("inventory.adjust", schema, handler)
    // Even an invalid payload gets forbidden, never invalid
    const result = await fn({ nonsense: true })
    expect(result).toEqual({
      ok: false,
      error: "forbidden",
      message: "This account is read-only",
    })
    expect(parse).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  test("Staff on an owner-only action is told so", async () => {
    const { adminAction } = setup(session("staff"))
    const fn = adminAction("products.write", schema, vi.fn())
    expect(await fn({})).toMatchObject({
      error: "forbidden",
      message: "Only owners can do this",
    })
  })

  test("no session is unauthenticated and reads nothing else", async () => {
    const { adminAction, loadSession } = setup(null)
    const handler = vi.fn()
    const result = await adminAction("orders.cancel", schema, handler)({})
    expect(result).toMatchObject({ ok: false, error: "unauthenticated" })
    expect(loadSession).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  test("an invalid payload from a permitted role is invalid (E8)", async () => {
    const { adminAction } = setup(session("owner"))
    const handler = vi.fn()
    const result = await adminAction(
      "products.write",
      schema,
      handler
    )({ sku: "", delta: 1.5 })
    expect(result).toMatchObject({ ok: false, error: "invalid" })
    expect(handler).not.toHaveBeenCalled()
  })

  test("a failing handler answers failed and logs the action and a code only", async () => {
    const { adminAction, log } = setup(session("owner"))
    const secret = "ana.reyes@example.com"
    const fn = adminAction("products.write", schema, async () => {
      throw Object.assign(new Error(`bad row for ${secret}`), { code: "P2002" })
    })
    const result = await fn({ sku: "A", delta: 1 })
    expect(result).toMatchObject({ ok: false, error: "failed" })
    const line = log.mock.calls[0][0] as string
    expect(JSON.parse(line)).toEqual({
      event: "admin.failed",
      action: "products.write",
      code: "P2002",
    })
    expect(line).not.toContain(secret)
  })

  test("a Next redirect error passes through", async () => {
    const { adminAction } = setup(session("owner"))
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/admin;307;",
    })
    const fn = adminAction("products.write", schema, async () => {
      throw redirect
    })
    await expect(fn({ sku: "A", delta: 1 })).rejects.toBe(redirect)
  })
})

function request(method: string, origin: string | null, body = "{}") {
  const headers = new Headers()
  if (origin) headers.set("origin", origin)
  return new Request("https://pcsilicon.tech/api/admin/images", {
    method,
    headers,
    body: method === "GET" ? undefined : body,
  })
}

describe("adminRoute", () => {
  test("marks the function with its action", () => {
    const { adminRoute } = setup(null)
    const fn = adminRoute("images.write", async () => Response.json({}))
    expect(adminMarkerOf(fn)).toBe("images.write")
  })

  test("no cookie is 401 and nothing is read (E6)", async () => {
    const { adminRoute } = setup(null)
    const handler = vi.fn()
    const response = await adminRoute("images.write", handler)(
      request("POST", OWN),
      undefined
    )
    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toMatchObject({ error: "unauthenticated" })
    expect(handler).not.toHaveBeenCalled()
  })

  test("Demo gets 403 and the body is never read", async () => {
    const { adminRoute } = setup(session("demo"))
    const handler = vi.fn()
    const req = request("POST", OWN)
    const response = await adminRoute("images.write", handler)(req, undefined)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "This account is read-only",
    })
    expect(req.bodyUsed).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  test("a permitted write from the app's own origin runs (E21)", async () => {
    const { adminRoute } = setup(session("owner"))
    const handler = vi.fn(async () => Response.json({ ok: true }))
    const response = await adminRoute("images.write", handler)(
      request("POST", OWN),
      undefined
    )
    expect(response.status).toBe(200)
    expect(handler).toHaveBeenCalledOnce()
  })

  test.each([
    ["a sibling subdomain", "https://evil.pcsilicon.tech"],
    ["a foreign origin", "https://example.com"],
    ["no origin", null],
  ])(
    "a write from %s is refused before the session (E20, E21)",
    async (_name, origin) => {
      const { adminRoute, loadSession } = setup(session("owner"))
      const handler = vi.fn()
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const req = request(method, origin)
        const response = await adminRoute("images.write", handler)(
          req,
          undefined
        )
        expect(response.status).toBe(403)
        expect(req.bodyUsed).toBe(false)
      }
      expect(loadSession).not.toHaveBeenCalled()
      expect(handler).not.toHaveBeenCalled()
    }
  )

  test("GET is not checked for origin but still needs its view action (E22)", async () => {
    const { adminRoute } = setup(session("staff"))
    const handler = vi.fn(async () => Response.json({}))
    const foreign = request("GET", "https://example.com")
    expect(
      (await adminRoute("orders.view", handler)(foreign, undefined)).status
    ).toBe(200)
    expect(
      (await adminRoute("products.view", handler)(foreign, undefined)).status
    ).toBe(403)
  })

  test("a failing handler is a 500 with no detail", async () => {
    const { adminRoute, log } = setup(session("owner"))
    const response = await adminRoute("images.write", async () => {
      throw new Error("secret detail")
    })(request("POST", OWN), undefined)
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain("secret detail")
    expect(log.mock.calls[0][0]).not.toContain("secret detail")
  })
})
