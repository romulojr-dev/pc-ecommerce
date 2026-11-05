import "server-only"

import { db } from "@/lib/db"

import { type AuditEntryView, auditEntryView } from "../mask"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"

// The audit log as Admin reads it (docs/specs/040-admin-permissions-audit-
// masking, Behavior 17): newest first, the actor as name and role, and for
// Demo the before / after masked.

export async function listAuditEntries(
  role: AdminRole,
  filter: { entity?: string; entityId?: string; limit?: number } = {}
): Promise<AuditEntryView[]> {
  assertCan(role, "audit.view")
  const rows = await db.auditLog.findMany({
    where: {
      ...(filter.entity ? { entity: filter.entity } : {}),
      ...(filter.entityId ? { entityId: filter.entityId } : {}),
    },
    select: {
      id: true,
      entity: true,
      entityId: true,
      action: true,
      before: true,
      after: true,
      createdAt: true,
      actor: { select: { name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(filter.limit ?? 100, 200),
  })
  return rows.map((row) => auditEntryView(role, row))
}
