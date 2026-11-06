import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

import {
  type ProductParams,
  PRODUCTS_PAGE_SIZE,
  productPageCount,
  resolveProductPage,
} from "../products-params"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"

// Products as Admin reads them (docs/specs/045-admin-products-create-edit,
// B4, B5, B14, R12). Named fields only, and a role check of its own beside
// the page's. Products hold no customer data, so Demo sees the same values as
// Owner (B1).

export type ProductRow = {
  id: string
  name: string
  sku: string
  categorySlug: string
  categoryName: string
  brandName: string
  status: "DRAFT" | "ACTIVE"
  // Centavos
  price: number
  salePrice: number | null
  stock: number
  isFeatured: boolean
}

export type ProductList = {
  ok: true
  rows: ProductRow[]
  total: number
  // The page actually read (a request past the last page lands on the last)
  page: number
  pageCount: number
}

function whereOf(params: ProductParams): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {}
  if (params.status)
    where.status = params.status === "draft" ? "DRAFT" : "ACTIVE"
  if (params.category) where.category = { slug: params.category }
  if (params.q) {
    // Prisma does not escape LIKE wildcards in `contains`; `\` is Postgres's
    // default escape character
    const contains = {
      contains: params.q.replace(/[\\%_]/g, "\\$&"),
      mode: "insensitive" as const,
    }
    where.OR = [
      { name: contains },
      { sku: contains },
      { brand: { name: contains } },
    ]
  }
  return where
}

export async function listProducts(
  role: AdminRole,
  params: ProductParams
): Promise<ProductList> {
  assertCan(role, "products.view")
  const where = whereOf(params)
  const total = await db.product.count({ where })
  const page = resolveProductPage(params.page, total)
  const found = await db.product.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PRODUCTS_PAGE_SIZE,
    take: PRODUCTS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      price: true,
      salePrice: true,
      stock: true,
      isFeatured: true,
      category: { select: { slug: true, name: true } },
      brand: { select: { name: true } },
    },
  })
  return {
    ok: true,
    rows: found.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categorySlug: product.category.slug,
      categoryName: product.category.name,
      brandName: product.brand.name,
      status: product.status,
      price: product.price,
      salePrice: product.salePrice,
      stock: product.stock,
      isFeatured: product.isFeatured,
    })),
    total,
    page,
    pageCount: productPageCount(total),
  }
}

export type ProductForEdit = {
  id: string
  status: "DRAFT" | "ACTIVE"
  name: string
  sku: string
  slug: string
  categorySlug: string
  brandId: string
  isFeatured: boolean
  price: number
  salePrice: number | null
  description: string | null
  stock: number
  weightGrams: number
  warrantyMonths: number
  boxContents: string[]
  // "YYYY-MM-DD" or null
  preorderShipsOn: string | null
  specs: unknown
  // The edit token the form posts back (D5)
  editVersion: number
  updatedAt: string
}

// What an id from a URL may look like; anything else is not looked up
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/

// null for an unknown or malformed id, with no read for the latter
export async function getProductForEdit(
  role: AdminRole,
  id: string
): Promise<ProductForEdit | null> {
  assertCan(role, "products.view")
  if (!ID_SHAPE.test(id)) return null
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      name: true,
      sku: true,
      slug: true,
      brandId: true,
      isFeatured: true,
      price: true,
      salePrice: true,
      description: true,
      stock: true,
      weightGrams: true,
      warrantyMonths: true,
      boxContents: true,
      preorderShipsOn: true,
      specs: true,
      editVersion: true,
      updatedAt: true,
      category: { select: { slug: true } },
    },
  })
  if (!product) return null
  return {
    id: product.id,
    status: product.status,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    categorySlug: product.category.slug,
    brandId: product.brandId,
    isFeatured: product.isFeatured,
    price: product.price,
    salePrice: product.salePrice,
    description: product.description,
    stock: product.stock,
    weightGrams: product.weightGrams,
    warrantyMonths: product.warrantyMonths,
    boxContents: product.boxContents,
    preorderShipsOn: product.preorderShipsOn
      ? product.preorderShipsOn.toISOString().slice(0, 10)
      : null,
    specs: product.specs,
    editVersion: product.editVersion,
    updatedAt: product.updatedAt.toISOString(),
  }
}

export type BrandOption = { id: string; name: string }

export async function listBrandOptions(
  role: AdminRole
): Promise<BrandOption[]> {
  assertCan(role, "products.view")
  return db.brand.findMany({
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  })
}
