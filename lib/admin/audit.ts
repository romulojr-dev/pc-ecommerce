import "server-only"

import { randomUUID } from "node:crypto"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

import { type AuditAction, type AuditEntity, auditJsonText } from "./audit-data"

// The audit log (docs/specs/040-admin-permissions-audit-masking, Behavior
// 8–12). recordAudit takes a BRANDED transaction client. Prisma's own
// TransactionClient is a structural subset of PrismaClient, so the plain `db`
// would compile against it; the brand exists only on the client that
// adminTransaction hands to its callback, so calling recordAudit outside a
// transaction is a type error.

declare const auditTxBrand: unique symbol
export type AuditTx = Prisma.TransactionClient & {
  readonly [auditTxBrand]: true
}

// The transaction an admin change runs in. The handler makes its change and
// calls recordAudit(tx, …) inside the callback; both commit or neither does.
export function adminTransaction<Result>(
  fn: (tx: AuditTx) => Promise<Result>
): Promise<Result> {
  return db.$transaction(async (tx) => fn(tx as AuditTx))
}

export type AuditEntry = {
  actorId: string
  entity: AuditEntity
  entityId: string
  action: AuditAction
  // The changed fields only; null/absent for a create (before) or delete (after)
  before?: unknown
  after?: unknown
}

// Appends one row. The id is made here and createdAt is the database's own
// clock (the column default), not the app's. A secret-looking key is stored as
// "[redacted]"; a value over 16 KB or not JSON throws, which rolls back the
// change with it.
export async function recordAudit(
  tx: AuditTx,
  entry: AuditEntry
): Promise<void> {
  const before = auditJsonText(entry.before)
  const after = auditJsonText(entry.after)
  await tx.$executeRaw`
    INSERT INTO "AuditLog" ("id", "actorId", "entity", "entityId", "action", "before", "after")
    VALUES (${randomUUID()}, ${entry.actorId}, ${entry.entity}, ${entry.entityId}, ${entry.action}, ${before}::jsonb, ${after}::jsonb)`
}
