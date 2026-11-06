import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

import {
  HISTORY_PAGE_SIZE,
  INVENTORY_PAGE_SIZE,
  type InventoryParams,
  pageCountOf,
  resolvePage,
} from "../inventory-params"
import { lowStockCondition } from "../low-stock-sql"
import { HIDDEN_IN_DEMO } from "../mask"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"

// Inventory as Admin reads it (docs/specs/046-admin-inventory-adjustments,
// B4, B5, B8, B14, R9). Named fields only, and a role check of its own beside
// the page's. Products hold no customer data, so every role sees the same
// stock; the only thing Demo doesn't see is a movement's free-text note.

export type InventoryRow = {
  id: string
  name: string
  sku: string
  categorySlug: string
  categoryName: string
  status: string
  stock: number
  lowStockAt: number
}

export type InventoryList = {
  ok: true
  rows: InventoryRow[]
  total: number
  // The page actually read (a request past the last page lands on the last)
  page: number
  pageCount: number
}

// '%', '_' and the escape character itself are text in a search term
const likeOf = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`

function whereOf(params: InventoryParams): Prisma.Sql {
  const conditions: Prisma.Sql[] = []
  if (params.category) {
    conditions.push(Prisma.sql`c."slug" = ${params.category}`)
  }
  if (params.q) {
    const pattern = likeOf(params.q)
    conditions.push(
      Prisma.sql`(p."name" ILIKE ${pattern} OR p."sku" ILIKE ${pattern} OR b."name" ILIKE ${pattern})`
    )
  }
  if (params.level) conditions.push(lowStockCondition(params.level))
  return conditions.length === 0
    ? Prisma.empty
    : Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
}

// Lowest stock first, then name, then id (D5): stable across pages
export async function listInventory(
  role: AdminRole,
  params: InventoryParams
): Promise<InventoryList> {
  assertCan(role, "inventory.view")
  const where = whereOf(params)
  const [{ n }] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    JOIN "Brand" b ON b."id" = p."brandId"
    ${where}`
  const total = Number(n)
  const page = resolvePage(params.page, total, INVENTORY_PAGE_SIZE)
  const rows = await db.$queryRaw<InventoryRow[]>`
    SELECT p."id", p."name", p."sku", p."status"::text AS "status",
           p."stock", p."lowStockAt",
           c."slug" AS "categorySlug", c."name" AS "categoryName"
    FROM "Product" p
    JOIN "Category" c ON c."id" = p."categoryId"
    JOIN "Brand" b ON b."id" = p."brandId"
    ${where}
    ORDER BY p."stock" ASC, p."name" ASC, p."id" ASC
    LIMIT ${INVENTORY_PAGE_SIZE} OFFSET ${(page - 1) * INVENTORY_PAGE_SIZE}`
  return {
    ok: true,
    rows,
    total,
    page,
    pageCount: pageCountOf(total, INVENTORY_PAGE_SIZE),
  }
}

export type InventoryProduct = {
  id: string
  name: string
  sku: string
  status: string
  categorySlug: string
  categoryName: string
  stock: number
  lowStockAt: number
}

// What an id from a URL may look like; anything else is not looked up
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/

// null for an unknown or malformed id, with no read for the latter
export async function getInventoryProduct(
  role: AdminRole,
  id: string
): Promise<InventoryProduct | null> {
  assertCan(role, "inventory.view")
  if (!ID_SHAPE.test(id)) return null
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      stock: true,
      lowStockAt: true,
      category: { select: { slug: true, name: true } },
    },
  })
  if (!product) return null
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    status: product.status,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    stock: product.stock,
    lowStockAt: product.lowStockAt,
  }
}

export type MovementRow = {
  id: string
  createdAt: Date
  reason: string
  change: number
  // The order's number (not its id, token hash or any customer field)
  orderNumber: string | null
  // The staff member's name; null is the system
  actorName: string | null
  // Free text: Demo gets "Hidden in demo" for a movement that has one
  note: string | null
}

export type MovementList = {
  ok: true
  rows: MovementRow[]
  total: number
  page: number
  pageCount: number
  // The product's oldest movement, for "Changes before … aren't recorded"
  firstAt: Date | null
}

// Newest first, with an id tiebreak (R9)
export async function listMovements(
  role: AdminRole,
  productId: string,
  requestedPage: number
): Promise<MovementList> {
  assertCan(role, "inventory.view")
  const empty: MovementList = {
    ok: true,
    rows: [],
    total: 0,
    page: 1,
    pageCount: 1,
    firstAt: null,
  }
  if (!ID_SHAPE.test(productId)) return empty
  const where = { productId }
  const [total, oldest] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.aggregate({ where, _min: { createdAt: true } }),
  ])
  const page = resolvePage(requestedPage, total, HISTORY_PAGE_SIZE)
  const found = await db.stockMovement.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      reason: true,
      change: true,
      note: true,
      order: { select: { orderNumber: true } },
      actor: { select: { name: true } },
    },
  })
  const demo = role === "demo"
  return {
    ok: true,
    rows: found.map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      reason: movement.reason,
      change: movement.change,
      orderNumber: movement.order?.orderNumber ?? null,
      actorName: movement.actor?.name ?? null,
      note:
        movement.note === null ? null : demo ? HIDDEN_IN_DEMO : movement.note,
    })),
    total,
    page,
    pageCount: pageCountOf(total, HISTORY_PAGE_SIZE),
    firstAt: oldest._min.createdAt,
  }
}
