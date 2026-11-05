import "server-only"

import { denialMessage } from "@/lib/admin/denial"
import { type AdminAction, type AdminRole, can } from "@/lib/admin/permissions"

// Every admin query takes the viewer's role and refuses what it can't view:
// the page's own check is the first lock, this is the second
// (docs/specs/040-admin-permissions-audit-masking, R19).

export class QueryDeniedError extends Error {
  constructor(action: AdminAction) {
    super(`not allowed: ${action}`)
    this.name = "QueryDeniedError"
  }
}

export function assertCan(role: AdminRole, action: AdminAction): void {
  if (!can(role, action)) throw new QueryDeniedError(action)
}

export type Denied = { ok: false; error: "forbidden"; message: string }

export function denied(role: AdminRole, action: AdminAction): Denied {
  return { ok: false, error: "forbidden", message: denialMessage(role, action) }
}
