import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

import { type ChangeRow, auditChanges } from "../audit-changes"
import { type AuditTarget, auditTarget, humanize } from "../audit-labels"
import { AUDIT_PAGE_SIZE, type AuditParams } from "../audit-params"
import { pageCountOf, resolvePage } from "../inventory-params"
import { manilaDayRange } from "../manila-day"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"

// The audit log as Admin reads it (docs/specs/047-admin-audit-log-view, B4 to
// B11, R1 to R8). Named fields only, a role check of its own beside the
// page's, one page of rows with the order numbers and product names of that
// page looked up in two batched reads. The entry carries the changes as text
// and never the raw before / after: the diff runs on the raw values and the
// Demo rule is applied to each side before anything leaves this module.

export type AuditEntryView = {
  id: string
  entity: string
  action: string
  actor: { name: string; role: string }
  createdAt: Date
  target: AuditTarget
  changes: ChangeRow[]
}

export type AuditActor = { id: string; name: string; role: string }

export type AuditPage = {
  entries: AuditEntryView[]
  total: number
  // The page actually read (a request past the last page lands on the last)
  page: number
  pageCount: number
  actors: AuditActor[]
  // The actor in the URL is not a user with audit rows, so it was ignored
  unknownActor: boolean
}

export async function listAuditPage(
  role: AdminRole,
  params: AuditParams
): Promise<AuditPage> {
  assertCan(role, "audit.view")

  // Users who have at least one row, disabled ones included (D15)
  const users = await db.user.findMany({
    where: { auditLogs: { some: {} } },
    select: { id: true, name: true, role: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  })
  const actors: AuditActor[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: humanize(u.role),
  }))
  const actorKnown =
    params.actor !== "" && actors.some((a) => a.id === params.actor)

  const where: Prisma.AuditLogWhereInput = {
    ...(params.entity ? { entity: params.entity } : {}),
    ...(actorKnown ? { actorId: params.actor } : {}),
    ...(params.from || params.to
      ? { createdAt: manilaDayRange(params.from, params.to) }
      : {}),
  }

  const total = await db.auditLog.count({ where })
  const page = resolvePage(params.page, total, AUDIT_PAGE_SIZE)
  const rows = await db.auditLog.findMany({
    where,
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
  })

  // Two batched reads for the page's rows, never one per row (R5)
  const orderIds = [
    ...new Set(rows.filter((r) => r.entity === "order").map((r) => r.entityId)),
  ]
  const productIds = [
    ...new Set(
      rows.filter((r) => r.entity === "product").map((r) => r.entityId)
    ),
  ]
  const [orders, products] = await Promise.all([
    orderIds.length
      ? db.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, orderNumber: true },
        })
      : [],
    productIds.length
      ? db.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true },
        })
      : [],
  ])
  const orderNumbers = new Map(orders.map((o) => [o.id, o.orderNumber]))
  const productsById = new Map(products.map((p) => [p.id, p]))

  const entries = rows.map((row): AuditEntryView => {
    const product = productsById.get(row.entityId)
    return {
      id: row.id,
      entity: row.entity,
      action: row.action,
      actor: { name: row.actor.name, role: humanize(row.actor.role) },
      createdAt: row.createdAt,
      target: auditTarget(role, row.entity, row.entityId, {
        orderNumber: orderNumbers.get(row.entityId),
        product: product ? { name: product.name, sku: product.sku } : undefined,
      }),
      changes: auditChanges(role, row.before, row.after),
    }
  })

  return {
    entries,
    total,
    page,
    pageCount: pageCountOf(total, AUDIT_PAGE_SIZE),
    actors,
    unknownActor: params.actor !== "" && !actorKnown,
  }
}
