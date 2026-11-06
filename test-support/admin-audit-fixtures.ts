import { join } from "node:path"

import type { ProductFormInput } from "@/lib/admin/product-input"

import { insertParts } from "./build-fixtures"
import { db } from "./db"
import { orderData } from "./orders"
import { seed } from "./seed-parts"

// One fixture per audited admin mutation (docs/specs/047-admin-audit-log-
// view, R12, D10). `audit-coverage.db.test.ts` lists every marked admin
// action, requires a fixture for each, runs it as Owner and checks that it
// wrote an audit row. A marked write action with no fixture here fails that
// test, so a new mutation cannot skip the audit log; a fixture whose export is
// gone fails it too.
//
// `setup` builds what the call needs and returns a context; `input` is a valid
// call that changes something; `refused` is a call that is refused or changes
// nothing and so must write no audit row (R11).

export type AuditFixture = {
  file: string
  export: string
  // The audit rows the valid call must write
  writes: { entity: string; action: string }[]
  setup: () => Promise<Record<string, string | number>>
  input: (ctx: Record<string, string | number>) => unknown
  refused: (ctx: Record<string, string | number>) => Promise<unknown> | unknown
}

const actionsFile = (...parts: string[]) =>
  join(process.cwd(), "app", "admin", "(shell)", ...parts, "actions.ts")

const NUMBER = "PCS-A7D10001"

async function productWithStock(stock: number) {
  const ids = await insertParts([seed.ryzen5_7600], {
    [seed.ryzen5_7600.id]: { stock },
  })
  return ids.get(seed.ryzen5_7600.id)!
}

export function productForm(
  brandId: string,
  over: Partial<ProductFormInput> = {}
): ProductFormInput {
  return {
    categorySlug: "psu",
    name: "Corsair RM1000e",
    sku: "RM1000E-AUDIT",
    slug: "corsair-rm1000e-audit",
    brandId,
    featured: false,
    price: "9,499.50",
    salePrice: "",
    description: "",
    weightGrams: "2100",
    warrantyMonths: "120",
    boxContents: "",
    preorderShipsOn: "",
    specs: {
      formFactor: "ATX",
      wattageW: "1000",
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
    ...over,
  }
}

async function psuCatalog() {
  await db.category.create({ data: { slug: "psu", name: "Power Supply" } })
  return (await db.brand.create({ data: { slug: "corsair", name: "Corsair" } }))
    .id
}

export const AUDIT_FIXTURES: AuditFixture[] = [
  {
    file: actionsFile("inventory"),
    export: "adjustStockAction",
    writes: [{ entity: "product", action: "stock-adjusted" }],
    setup: async () => ({ productId: await productWithStock(10) }),
    input: (ctx) => ({
      productId: ctx.productId,
      reason: "RECEIVED",
      delta: 5,
      note: "",
      shownStock: 10,
    }),
    // Below zero
    refused: (ctx) => ({
      productId: ctx.productId,
      reason: "DAMAGED",
      delta: -999,
      note: "",
      shownStock: 10,
    }),
  },
  {
    file: actionsFile("inventory"),
    export: "setLowStockAtAction",
    writes: [{ entity: "product", action: "updated" }],
    setup: async () => ({ productId: await productWithStock(10) }),
    input: (ctx) => ({ productId: ctx.productId, lowStockAt: 7 }),
    // The value it already has (E28)
    refused: async (ctx) => ({
      productId: ctx.productId,
      lowStockAt: (
        await db.product.findUniqueOrThrow({
          where: { id: ctx.productId as string },
        })
      ).lowStockAt,
    }),
  },
  {
    file: actionsFile("products"),
    export: "createProductAction",
    writes: [{ entity: "product", action: "created" }],
    setup: async () => ({ brandId: await psuCatalog() }),
    input: (ctx) => productForm(ctx.brandId as string),
    refused: (ctx) =>
      productForm(ctx.brandId as string, { name: "x", sku: "A", slug: "a-a" }),
  },
  {
    file: actionsFile("products"),
    export: "updateProductAction",
    writes: [{ entity: "product", action: "updated" }],
    setup: async () => {
      const brandId = await psuCatalog()
      const form = productForm(brandId)
      const product = await db.product.create({
        data: {
          name: form.name,
          sku: form.sku,
          slug: form.slug,
          description: null,
          price: 949_950,
          weightGrams: 2100,
          warrantyMonths: 120,
          boxContents: [],
          specs: {
            formFactor: "ATX",
            wattageW: 1000,
            efficiencyRating: "GOLD",
            modularity: "FULL",
          },
          category: { connect: { slug: "psu" } },
          brand: { connect: { id: brandId } },
        },
      })
      return { brandId, productId: product.id, version: product.editVersion }
    },
    input: (ctx) => ({
      ...productForm(ctx.brandId as string, { price: "9,000" }),
      id: ctx.productId,
      expectedVersion: ctx.version,
    }),
    // The stored values, unchanged
    refused: (ctx) => ({
      ...productForm(ctx.brandId as string),
      id: ctx.productId,
      expectedVersion: ctx.version,
    }),
  },
  {
    file: actionsFile("orders", "[number]"),
    export: "transitionOrderAction",
    writes: [{ entity: "order", action: "status-changed" }],
    setup: async () => {
      await db.order.create({
        data: orderData({
          orderNumber: NUMBER,
          status: "PAID",
          paidAt: new Date("2026-11-01T01:00:00Z"),
        }),
      })
      return {}
    },
    input: () => ({
      orderNumber: NUMBER,
      expectedStatus: "PAID",
      to: "PROCESSING",
    }),
    // The screen showed another status (stale)
    refused: () => ({
      orderNumber: NUMBER,
      expectedStatus: "PROCESSING",
      to: "SHIPPED",
      courier: "LBC",
      trackingNumber: "123456784821",
    }),
  },
  {
    file: actionsFile("orders", "[number]"),
    export: "cancelOrderAction",
    writes: [{ entity: "order", action: "cancelled" }],
    setup: async () => {
      await db.order.create({
        data: orderData({
          orderNumber: NUMBER,
          status: "PENDING_PAYMENT",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      })
      return {}
    },
    input: () => ({
      orderNumber: NUMBER,
      expectedStatus: "PENDING_PAYMENT",
      reason: "OUT_OF_STOCK",
    }),
    refused: () => ({
      orderNumber: NUMBER,
      expectedStatus: "PAID",
      reason: "OUT_OF_STOCK",
    }),
  },
]
