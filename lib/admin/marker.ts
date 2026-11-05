// The marker adminAction / adminRoute put on the function they return
// (docs/specs/040-admin-permissions-audit-masking, Behavior 7). Tests find
// unguarded entry points by its absence. No imports: tests and the guard share
// it.

export const ADMIN_ACTION_MARKER = Symbol.for("pcs.adminAction")

type Marked = { [ADMIN_ACTION_MARKER]?: unknown }

export function markAdminFunction<F extends (...args: never[]) => unknown>(
  fn: F,
  action: string
): F {
  Object.defineProperty(fn, ADMIN_ACTION_MARKER, {
    value: action,
    enumerable: false,
  })
  return fn
}

// The action name a function is marked with, or null when it is unguarded
export function adminMarkerOf(value: unknown): string | null {
  if (typeof value !== "function") return null
  const marked = (value as Marked)[ADMIN_ACTION_MARKER]
  return typeof marked === "string" ? marked : null
}
