import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import { manilaToday } from "@/lib/stock"
import { isBuilderCategory, validateSpecs } from "@/lib/specs"
import { specsFromForm, type SpecFormValues } from "@/lib/specs/form-fields"

import { adminTransaction, recordAudit } from "../audit"
import type { AdminActor } from "../guard"
import {
  type FieldErrors,
  type ProductFields,
  type ProductFormInput,
  validateProductFields,
} from "../product-input"
import { PRODUCT_COPY } from "../products-copy"

// Creating and editing a product (docs/specs/045-admin-products-create-edit,
// B9–B24, R1, R6–R10, R15). The server action only forwards here, after the
// guard has checked the origin, the session and `can()`.
//
// Order: read and check everything (no write yet), then ONE transaction with
// the change and its audit row. Nothing here calls an outside service. The
// caller invalidates the product cache with updateTag after a `saved` result.
//
// A unique clash found in the transaction aborts it, so SKU and slug are
// checked first; the unique indexes stay the backstop for a race, and that
// race's error is caught OUTSIDE the transaction (it is already rolled back)
// and turned into the same field error.

export type SaveResult =
  | { kind: "saved"; id: string; editVersion: number }
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "stale" }
  | { kind: "unchanged" }
  | { kind: "not-found" }

export type UpdateInput = ProductFormInput & {
  id: string
  expectedVersion: number
}

const specKey = (key: string) => `specs.${key}`

// Problems with the spec values of the chosen category: the text that isn't a
// number, then what validateSpecs says. Keyed `specs.<field>`; an issue about
// the whole object is keyed `specs`.
function specProblems(
  categorySlug: string,
  values: SpecFormValues
): { specs: Record<string, unknown> | null; errors: FieldErrors } {
  if (!isBuilderCategory(categorySlug)) return { specs: null, errors: {} }
  const { specs, errors: textErrors } = specsFromForm(categorySlug, values)
  const errors: FieldErrors = {}
  for (const [key, message] of Object.entries(textErrors)) {
    errors[specKey(key)] = message
  }
  const result = validateSpecs(categorySlug, specs)
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key =
        issue.path.length > 0 ? specKey(String(issue.path[0])) : "specs"
      // The text problem above is the better message for the same field
      errors[key] ??= issue.message
    }
  }
  return { specs: Object.keys(errors).length === 0 ? specs : null, errors }
}

async function takenFields(
  sku: string,
  slug: string,
  excludeId?: string
): Promise<FieldErrors> {
  const not = excludeId ? { id: { not: excludeId } } : {}
  const [bySku, bySlug] = await Promise.all([
    db.product.findFirst({
      where: { sku: { equals: sku, mode: "insensitive" }, ...not },
      select: { id: true },
    }),
    db.product.findFirst({ where: { slug, ...not }, select: { id: true } }),
  ])
  const errors: FieldErrors = {}
  if (bySku) errors.sku = PRODUCT_COPY.errors.skuTaken
  if (bySlug) errors.slug = PRODUCT_COPY.errors.slugTaken
  return errors
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
}

async function rowIds(categorySlug: string, brandId: string) {
  const [category, brand] = await Promise.all([
    db.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true },
    }),
    db.brand.findUnique({ where: { id: brandId }, select: { id: true } }),
  ])
  return { categoryId: category?.id ?? null, brandId: brand?.id ?? null }
}

const dateOf = (text: string | null) => (text ? new Date(text) : null)

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : 1
          )
        )
      : inner
  )
}

// ---- Create ----

export async function createProduct(
  actor: AdminActor,
  input: ProductFormInput,
  today: string = manilaToday()
): Promise<SaveResult> {
  const common = validateProductFields(input, null, today)
  const { specs, errors: specErrors } = specProblems(
    input.categorySlug,
    input.specs
  )
  const errors: FieldErrors = {
    ...(common.ok ? {} : common.errors),
    ...specErrors,
  }
  if (!common.ok || specs === null || Object.keys(errors).length > 0) {
    return { kind: "invalid", errors }
  }
  const fields = common.value

  const [ids, taken] = await Promise.all([
    rowIds(fields.categorySlug, fields.brandId),
    takenFields(fields.sku, fields.slug),
  ])
  if (!ids.categoryId) errors.categorySlug = PRODUCT_COPY.errors.category
  if (!ids.brandId) errors.brandId = PRODUCT_COPY.errors.brand
  Object.assign(errors, taken)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  try {
    return await adminTransaction(async (tx): Promise<SaveResult> => {
      // No stock, effectivePrice, searchVector or status: the column defaults
      // (stock 0, DRAFT) and the triggers own them (R7)
      const product = await tx.product.create({
        data: {
          name: fields.name,
          sku: fields.sku,
          slug: fields.slug,
          description: fields.description,
          price: fields.price,
          salePrice: fields.salePrice,
          specs: specs as Prisma.InputJsonValue,
          weightGrams: fields.weightGrams,
          warrantyMonths: fields.warrantyMonths,
          boxContents: fields.boxContents,
          preorderShipsOn: dateOf(fields.preorderShipsOn),
          isFeatured: fields.isFeatured,
          categoryId: ids.categoryId!,
          brandId: ids.brandId!,
        },
        select: { id: true, editVersion: true },
      })
      await recordAudit(tx, {
        actorId: actor.id,
        entity: "product",
        entityId: product.id,
        action: "created",
        after: {
          name: fields.name,
          sku: fields.sku,
          category: fields.categorySlug,
          brandId: fields.brandId,
          price: fields.price,
          salePrice: fields.salePrice,
        },
      })
      return { kind: "saved", id: product.id, editVersion: product.editVersion }
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const raced = await takenFields(fields.sku, fields.slug)
    if (Object.keys(raced).length === 0) throw error
    return { kind: "invalid", errors: raced }
  }
}

// ---- Update ----

type Stored = {
  id: string
  status: "DRAFT" | "ACTIVE"
  editVersion: number
  fields: ProductFields
  specs: unknown
}

async function loadStored(id: string): Promise<Stored | null> {
  const product = await db.product.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      editVersion: true,
      name: true,
      sku: true,
      slug: true,
      brandId: true,
      isFeatured: true,
      price: true,
      salePrice: true,
      description: true,
      weightGrams: true,
      warrantyMonths: true,
      boxContents: true,
      preorderShipsOn: true,
      specs: true,
      category: { select: { slug: true } },
    },
  })
  if (!product) return null
  return {
    id: product.id,
    status: product.status,
    editVersion: product.editVersion,
    specs: product.specs,
    fields: {
      categorySlug: product.category.slug,
      name: product.name,
      sku: product.sku,
      slug: product.slug,
      brandId: product.brandId,
      isFeatured: product.isFeatured,
      price: product.price,
      salePrice: product.salePrice,
      description: product.description,
      weightGrams: product.weightGrams,
      warrantyMonths: product.warrantyMonths,
      boxContents: product.boxContents,
      preorderShipsOn: product.preorderShipsOn
        ? product.preorderShipsOn.toISOString().slice(0, 10)
        : null,
    },
  }
}

// The fields whose new value differs from the stored one (R19). Compared on
// the normalized values; box contents in order.
const SCALAR_FIELDS = [
  "name",
  "sku",
  "slug",
  "brandId",
  "isFeatured",
  "price",
  "salePrice",
  "description",
  "weightGrams",
  "warrantyMonths",
  "preorderShipsOn",
] as const

function changedFields(before: ProductFields, after: ProductFields) {
  const changed: string[] = SCALAR_FIELDS.filter(
    (field) => before[field] !== after[field]
  )
  if (stableJson(before.boxContents) !== stableJson(after.boxContents)) {
    changed.push("boxContents")
  }
  if (before.categorySlug !== after.categorySlug) changed.push("category")
  return changed
}

// The changed spec keys with their old and new values (R10)
function specDiff(before: unknown, after: Record<string, unknown>) {
  const old = (before ?? {}) as Record<string, unknown>
  const from: Record<string, unknown> = {}
  const to: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(old), ...Object.keys(after)])) {
    if (stableJson(old[key]) !== stableJson(after[key])) {
      from[key] = old[key] ?? null
      to[key] = after[key] ?? null
    }
  }
  return { from, to }
}

export async function updateProduct(
  actor: AdminActor,
  input: UpdateInput,
  today: string = manilaToday()
): Promise<SaveResult> {
  const stored = await loadStored(input.id)
  if (!stored) return { kind: "not-found" }
  // The cheap early answer; the conditional update below is the real check
  if (stored.editVersion !== input.expectedVersion) return { kind: "stale" }

  const common = validateProductFields(
    input,
    {
      status: stored.status,
      sku: stored.fields.sku,
      slug: stored.fields.slug,
      categorySlug: stored.fields.categorySlug,
      preorderShipsOn: stored.fields.preorderShipsOn,
    },
    today
  )
  const { specs, errors: specErrors } = specProblems(
    input.categorySlug,
    input.specs
  )
  const errors: FieldErrors = {
    ...(common.ok ? {} : common.errors),
    ...specErrors,
  }
  if (!common.ok || specs === null || Object.keys(errors).length > 0) {
    return { kind: "invalid", errors }
  }
  const fields = common.value

  const categoryChanged = fields.categorySlug !== stored.fields.categorySlug
  const [ids, taken] = await Promise.all([
    rowIds(fields.categorySlug, fields.brandId),
    takenFields(fields.sku, fields.slug, stored.id),
  ])
  if (!ids.categoryId) errors.categorySlug = PRODUCT_COPY.errors.category
  if (!ids.brandId) errors.brandId = PRODUCT_COPY.errors.brand
  Object.assign(errors, taken)
  if (Object.keys(errors).length > 0) return { kind: "invalid", errors }

  const changed = changedFields(stored.fields, fields)
  const diff = specDiff(stored.specs, specs)
  const specsChanged = categoryChanged || Object.keys(diff.to).length > 0
  if (specsChanged) changed.push("specs")
  if (changed.length === 0) return { kind: "unchanged" }

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const name of changed) {
    if (name === "specs") {
      before.specs = diff.from
      after.specs = diff.to
    } else if (name === "category") {
      before.category = stored.fields.categorySlug
      after.category = fields.categorySlug
    } else {
      const key = name as (typeof SCALAR_FIELDS)[number] | "boxContents"
      before[name] = stored.fields[key]
      after[name] = fields[key]
    }
  }

  try {
    return await adminTransaction(async (tx): Promise<SaveResult> => {
      // One conditional statement: the version the form was loaded with, and
      // +1 in the same write (R6). Only the changed fields are written.
      const result = await tx.product.updateMany({
        where: { id: stored.id, editVersion: input.expectedVersion },
        data: {
          ...(changed.includes("name") ? { name: fields.name } : {}),
          ...(changed.includes("sku") ? { sku: fields.sku } : {}),
          ...(changed.includes("slug") ? { slug: fields.slug } : {}),
          ...(changed.includes("brandId") ? { brandId: ids.brandId! } : {}),
          ...(changed.includes("isFeatured")
            ? { isFeatured: fields.isFeatured }
            : {}),
          ...(changed.includes("price") ? { price: fields.price } : {}),
          ...(changed.includes("salePrice")
            ? { salePrice: fields.salePrice }
            : {}),
          ...(changed.includes("description")
            ? { description: fields.description }
            : {}),
          ...(changed.includes("weightGrams")
            ? { weightGrams: fields.weightGrams }
            : {}),
          ...(changed.includes("warrantyMonths")
            ? { warrantyMonths: fields.warrantyMonths }
            : {}),
          ...(changed.includes("boxContents")
            ? { boxContents: fields.boxContents }
            : {}),
          ...(changed.includes("preorderShipsOn")
            ? { preorderShipsOn: dateOf(fields.preorderShipsOn) }
            : {}),
          // The category and its specs always change together (R8)
          ...(categoryChanged ? { categoryId: ids.categoryId! } : {}),
          ...(specsChanged ? { specs: specs as Prisma.InputJsonValue } : {}),
          editVersion: { increment: 1 },
        },
      })
      if (result.count === 0) return { kind: "stale" }
      await recordAudit(tx, {
        actorId: actor.id,
        entity: "product",
        entityId: stored.id,
        action: "updated",
        before,
        after,
      })
      return {
        kind: "saved",
        id: stored.id,
        editVersion: input.expectedVersion + 1,
      }
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const raced = await takenFields(fields.sku, fields.slug, stored.id)
    if (Object.keys(raced).length === 0) throw error
    return { kind: "invalid", errors: raced }
  }
}
