import { z } from "zod"

import { isBuilderCategory } from "@/lib/specs"

import { pesosToCentavos } from "./money"
import { PRODUCT_COPY } from "./products-copy"

// The shape and rules of a product form (docs/specs/045-admin-products-create-
// edit, B9, B15, B19, B20, R7, R8, R10, R17). Pure: the browser shows the
// errors as you type and the server decides, with the same functions. The
// specs are validated by the caller (validateSpecs) because they depend on
// the category.

export const LIMITS = {
  nameMin: 3,
  nameMax: 150,
  skuMax: 64,
  slugMin: 3,
  slugMax: 120,
  descriptionMax: 5000,
  weightMax: 100_000,
  warrantyMax: 120,
  boxLines: 30,
  boxLineMax: 120,
} as const

export type ProductStatusName = "DRAFT" | "ACTIVE"

// What the form sends: strings as typed, unknown keys refused (D10). Nothing
// here can name effectivePrice, searchVector, stock or editVersion's value
// beyond the one the form was loaded with (R7).
const fields = {
  categorySlug: z.string().max(100),
  name: z.string().max(1000),
  sku: z.string().max(1000),
  slug: z.string().max(1000),
  brandId: z.string().max(100),
  featured: z.boolean(),
  price: z.string().max(100),
  salePrice: z.string().max(100),
  description: z.string().max(20_000),
  weightGrams: z.string().max(100),
  warrantyMonths: z.string().max(100),
  boxContents: z.string().max(10_000),
  preorderShipsOn: z.string().max(100),
  // Raw form values by spec field key; spec form fields turn them into the
  // typed specs (lib/specs/form-fields)
  specs: z.record(
    z.string().max(100),
    z.union([z.string().max(1000), z.boolean(), z.array(z.string().max(100))])
  ),
}

export const createProductSchema = z.strictObject(fields)
export const updateProductSchema = z.strictObject({
  ...fields,
  id: z.string().min(1).max(100),
  // The editVersion the form was loaded with (D5)
  expectedVersion: z.int().min(0).max(2_000_000_000),
})

export type ProductFormInput = z.infer<typeof createProductSchema>

// What a valid form means
export type ProductFields = {
  categorySlug: string
  name: string
  sku: string
  slug: string
  brandId: string
  isFeatured: boolean
  price: number
  salePrice: number | null
  description: string | null
  weightGrams: number
  warrantyMonths: number
  boxContents: string[]
  // "YYYY-MM-DD" or null
  preorderShipsOn: string | null
}

// What the stored product says, for the rules that compare
export type StoredProduct = {
  status: ProductStatusName
  sku: string
  slug: string
  categorySlug: string
  preorderShipsOn: string | null
}

export type FieldErrors = Partial<Record<string, string>>

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WHOLE = /^\d{1,9}$/
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// A real calendar date (no 2026-02-30)
export function isCalendarDate(text: string): boolean {
  const match = DATE.exec(text)
  if (!match) return false
  const [year, month, day] = [match[1], match[2], match[3]].map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

// The pre-order ship date: today or later in Manila, checked only when it
// differs from the stored one (E14a–E14c). `today` is "YYYY-MM-DD".
export function shipDateError(
  text: string,
  stored: string | null,
  today: string
): string | null {
  const value = text.trim()
  if (value === "") return null
  if (!isCalendarDate(value)) return PRODUCT_COPY.errors.shipDateFormat
  if (value === stored) return null
  return value >= today ? null : PRODUCT_COPY.errors.shipDate
}

// A changed SKU, slug or category is refused on a product that is not a draft
// (R8). Returns the errors by field.
export function lockedFieldErrors(
  stored: StoredProduct,
  input: Pick<ProductFormInput, "sku" | "slug" | "categorySlug">
): FieldErrors {
  if (stored.status === "DRAFT") return {}
  const errors: FieldErrors = {}
  const locked = PRODUCT_COPY.form.locked
  if (input.sku.trim() !== stored.sku) errors.sku = locked
  if (input.slug.trim() !== stored.slug) errors.slug = locked
  if (input.categorySlug !== stored.categorySlug) errors.categorySlug = locked
  return errors
}

function wholeNumber(text: string, min: number, max: number): number | null {
  const value = text.trim()
  if (!WHOLE.test(value)) return null
  const number = Number(value)
  return number >= min && number <= max ? number : null
}

export type ProductFieldsResult =
  { ok: true; value: ProductFields } | { ok: false; errors: FieldErrors }

// All the common-field rules at once, so a form shows every problem together.
// `stored` is null on create.
export function validateProductFields(
  input: ProductFormInput,
  stored: StoredProduct | null,
  today: string
): ProductFieldsResult {
  const errors: FieldErrors = {
    ...(stored ? lockedFieldErrors(stored, input) : {}),
  }
  const copy = PRODUCT_COPY.errors

  const name = input.name.trim()
  if (name.length < LIMITS.nameMin || name.length > LIMITS.nameMax) {
    errors.name = `Enter a name of ${LIMITS.nameMin} to ${LIMITS.nameMax} characters.`
  }

  const sku = input.sku.trim()
  if (
    sku.length < 1 ||
    sku.length > LIMITS.skuMax ||
    CONTROL_CHARACTERS.test(sku)
  ) {
    errors.sku ??= `Enter a SKU of 1 to ${LIMITS.skuMax} characters.`
  }

  const slug = input.slug.trim()
  if (
    slug.length < LIMITS.slugMin ||
    slug.length > LIMITS.slugMax ||
    !SLUG.test(slug)
  ) {
    errors.slug ??=
      "Use lower-case letters, digits and single hyphens (3 to 120 characters)."
  }

  if (!isBuilderCategory(input.categorySlug)) {
    errors.categorySlug ??= copy.category
  }
  if (input.brandId.trim() === "") errors.brandId = copy.brand

  const price = pesosToCentavos(input.price)
  if (!price.ok) {
    errors.price = price.reason === "range" ? copy.priceRange : copy.price
  }

  let salePrice: number | null = null
  if (input.salePrice.trim() !== "") {
    const sale = pesosToCentavos(input.salePrice)
    if (!sale.ok) {
      errors.salePrice = sale.reason === "range" ? copy.priceRange : copy.price
    } else if (price.ok && sale.centavos >= price.centavos) {
      errors.salePrice = copy.salePrice
    } else {
      salePrice = sale.centavos
    }
  }

  const description = input.description.trim()
  if (description.length > LIMITS.descriptionMax) {
    errors.description = `Keep the description under ${LIMITS.descriptionMax} characters.`
  }

  const weightGrams = wholeNumber(input.weightGrams, 1, LIMITS.weightMax)
  if (weightGrams === null) {
    errors.weightGrams = `Enter a whole number of grams from 1 to ${LIMITS.weightMax}.`
  }
  const warrantyMonths = wholeNumber(
    input.warrantyMonths,
    0,
    LIMITS.warrantyMax
  )
  if (warrantyMonths === null) {
    errors.warrantyMonths = `Enter a whole number of months from 0 to ${LIMITS.warrantyMax}.`
  }

  const boxContents = input.boxContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
  if (
    boxContents.length > LIMITS.boxLines ||
    boxContents.some((line) => line.length > LIMITS.boxLineMax)
  ) {
    errors.boxContents = `Up to ${LIMITS.boxLines} lines of up to ${LIMITS.boxLineMax} characters.`
  }

  const dateError = shipDateError(
    input.preorderShipsOn,
    stored?.preorderShipsOn ?? null,
    today
  )
  if (dateError) errors.preorderShipsOn = dateError

  if (Object.keys(errors).length > 0 || !price.ok) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    value: {
      categorySlug: input.categorySlug,
      name,
      sku,
      slug,
      brandId: input.brandId.trim(),
      isFeatured: input.featured,
      price: price.centavos,
      salePrice,
      description: description === "" ? null : description,
      weightGrams: weightGrams!,
      warrantyMonths: warrantyMonths!,
      boxContents,
      preorderShipsOn:
        input.preorderShipsOn.trim() === ""
          ? null
          : input.preorderShipsOn.trim(),
    },
  }
}
