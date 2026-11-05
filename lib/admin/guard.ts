import "server-only"

import type { z } from "zod"

import {
  denialMessage,
  FAILED_MESSAGE,
  INVALID_MESSAGE,
  ORIGIN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from "./denial"
import { markAdminFunction } from "./marker"
import { type AdminAction, type AdminRole, can } from "./permissions"

// The one way to build an admin mutation (docs/specs/040-admin-permissions-
// audit-masking, Behavior 5–8). Server actions use adminAction, route handlers
// adminRoute; both authorize BEFORE parsing or reading anything, answer a
// refusal without running the handler or writing, and mark the function they
// return so a test can find every entry point that lacks the wrapper.
//
// A denied request makes no database read beyond the session, never reads the
// body and is not audited. A handler that needs to redirect or 404 should
// return data and let the page do it; Next's control-flow errors still pass
// through untouched.

export type AdminActor = { id: string; name: string; role: AdminRole }

export type GuardSession = {
  user: { id: string; name: string; adminRole: AdminRole }
}

export type GuardDeps = {
  // The signed-in, not disabled person for this request, or null
  loadSession: () => Promise<GuardSession | null>
  // Exact origins a write request may come from (spec 039 trustedOriginsFor)
  trustedOrigins: () => Promise<string[]> | string[]
  log: (line: string) => void
}

export type ActionError = "unauthenticated" | "forbidden" | "invalid" | "failed"
export type ActionResult<Data> =
  { ok: true; data: Data } | { ok: false; error: ActionError; message: string }

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"]

function actorOf(session: GuardSession): AdminActor {
  return {
    id: session.user.id,
    name: session.user.name,
    role: session.user.adminRole,
  }
}

// redirect(), notFound() and friends throw; they are not failures
function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === "string" && digest.startsWith("NEXT_")
}

function failureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === "string") return code
  return error instanceof Error ? error.name : "unknown"
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}

export function createAdminGuards(deps: GuardDeps) {
  // Event name, action and a code only: never input, customer data or secrets
  function logFailure(action: AdminAction, error: unknown) {
    deps.log(
      JSON.stringify({
        event: "admin.failed",
        action,
        code: failureCode(error),
      })
    )
  }

  function adminAction<Schema extends z.ZodType, Data>(
    action: AdminAction,
    schema: Schema,
    handler: (context: {
      actor: AdminActor
      input: z.output<Schema>
    }) => Promise<Data>
  ) {
    async function run(input?: unknown): Promise<ActionResult<Data>> {
      const session = await deps.loadSession()
      if (!session) {
        return {
          ok: false,
          error: "unauthenticated",
          message: UNAUTHENTICATED_MESSAGE,
        }
      }
      const actor = actorOf(session)
      if (!can(actor.role, action)) {
        return {
          ok: false,
          error: "forbidden",
          message: denialMessage(actor.role, action),
        }
      }
      const parsed = schema.safeParse(input)
      if (!parsed.success) {
        return { ok: false, error: "invalid", message: INVALID_MESSAGE }
      }
      try {
        return { ok: true, data: await handler({ actor, input: parsed.data }) }
      } catch (error) {
        if (isNextControlFlow(error)) throw error
        logFailure(action, error)
        return { ok: false, error: "failed", message: FAILED_MESSAGE }
      }
    }
    return markAdminFunction(run, action)
  }

  function adminRoute<Context = unknown>(
    action: AdminAction,
    handler: (context: {
      actor: AdminActor
      request: Request
      routeContext: Context
    }) => Promise<Response>
  ) {
    async function run(
      request: Request,
      routeContext: Context
    ): Promise<Response> {
      // A sibling subdomain is same-site, so the cookie alone doesn't stop it
      if (WRITE_METHODS.includes(request.method.toUpperCase())) {
        const origin = request.headers.get("origin")
        if (!origin || !(await deps.trustedOrigins()).includes(origin)) {
          return jsonResponse(403, {
            error: "origin",
            message: ORIGIN_MESSAGE,
          })
        }
      }
      const session = await deps.loadSession()
      if (!session) {
        return jsonResponse(401, {
          error: "unauthenticated",
          message: UNAUTHENTICATED_MESSAGE,
        })
      }
      const actor = actorOf(session)
      if (!can(actor.role, action)) {
        return jsonResponse(403, {
          error: "forbidden",
          message: denialMessage(actor.role, action),
        })
      }
      try {
        return await handler({ actor, request, routeContext })
      } catch (error) {
        if (isNextControlFlow(error)) throw error
        logFailure(action, error)
        return jsonResponse(500, { error: "failed", message: FAILED_MESSAGE })
      }
    }
    return markAdminFunction(run, action)
  }

  return { adminAction, adminRoute }
}

// The real dependencies load lazily, so a module that only declares its
// actions doesn't open a database client or validate the environment at import
const guards = createAdminGuards({
  async loadSession() {
    const { getAdminSession } = await import("./session")
    return getAdminSession()
  },
  async trustedOrigins() {
    const [{ env }, { trustedOriginsFor }] = await Promise.all([
      import("@/lib/env"),
      import("@/lib/auth/origins"),
    ])
    return trustedOriginsFor(env)
  },
  log: (line) => console.error(line),
})

export const { adminAction, adminRoute } = guards
