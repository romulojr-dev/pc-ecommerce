import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"
import { formValuesFromSpecs, specFormFields } from "@/lib/specs/form-fields"

import { centavosToPesos } from "./money"
import type { FieldErrors, ProductFormInput } from "./product-input"
import { PRODUCT_COPY } from "./products-copy"
import type { ProductForEdit } from "./queries/products"

// The product form's starting values and error list (docs/specs/045-admin-
// products-create-edit, B9, B13, B14). Pure: the form component and its tests
// share them.

export function emptyProductForm(categorySlug: string): ProductFormInput {
  return {
    categorySlug,
    name: "",
    sku: "",
    slug: "",
    brandId: "",
    featured: false,
    price: "",
    salePrice: "",
    description: "",
    weightGrams: "",
    warrantyMonths: "12",
    boxContents: "",
    preorderShipsOn: "",
    specs: {},
  }
}

export function formFromProduct(product: ProductForEdit): ProductFormInput {
  const category = product.categorySlug as BuilderCategorySlug
  return {
    categorySlug: product.categorySlug,
    name: product.name,
    sku: product.sku,
    slug: product.slug,
    brandId: product.brandId,
    featured: product.isFeatured,
    price: centavosToPesos(product.price),
    salePrice:
      product.salePrice === null ? "" : centavosToPesos(product.salePrice),
    description: product.description ?? "",
    weightGrams: String(product.weightGrams),
    warrantyMonths: String(product.warrantyMonths),
    boxContents: product.boxContents.join("\n"),
    preorderShipsOn: product.preorderShipsOn ?? "",
    specs: formValuesFromSpecs(category, product.specs),
  }
}

// The order fields appear in on the form, for the summary's list
const COMMON_ORDER = [
  "name",
  "sku",
  "slug",
  "categorySlug",
  "brandId",
  "price",
  "salePrice",
  "description",
  "weightGrams",
  "warrantyMonths",
  "boxContents",
  "preorderShipsOn",
] as const

const COMMON_LABELS: Record<(typeof COMMON_ORDER)[number], string> = {
  name: PRODUCT_COPY.form.labels.name,
  sku: PRODUCT_COPY.form.labels.sku,
  slug: PRODUCT_COPY.form.labels.slug,
  categorySlug: PRODUCT_COPY.form.labels.category,
  brandId: PRODUCT_COPY.form.labels.brand,
  price: PRODUCT_COPY.form.labels.price,
  salePrice: PRODUCT_COPY.form.labels.salePrice,
  description: PRODUCT_COPY.form.labels.description,
  weightGrams: PRODUCT_COPY.form.labels.weightGrams,
  warrantyMonths: PRODUCT_COPY.form.labels.warrantyMonths,
  boxContents: PRODUCT_COPY.form.labels.boxContents,
  preorderShipsOn: PRODUCT_COPY.form.labels.preorderShipsOn,
}

export type ErrorItem = { key: string; label: string; message: string }

// Every error once, in the order of the form: common fields, then the spec
// fields in metadata order, then anything left (a whole-object issue)
export function errorItems(
  errors: FieldErrors,
  categorySlug: string
): ErrorItem[] {
  const items: ErrorItem[] = []
  const seen = new Set<string>()
  const add = (key: string, label: string) => {
    const message = errors[key]
    if (message !== undefined && !seen.has(key)) {
      seen.add(key)
      items.push({ key, label, message })
    }
  }
  for (const key of COMMON_ORDER) add(key, COMMON_LABELS[key])
  if (Object.hasOwn(builderCategories, categorySlug)) {
    for (const field of specFormFields(categorySlug as BuilderCategorySlug)
      .fields) {
      add(`specs.${field.key}`, field.label)
    }
  }
  for (const key of Object.keys(errors)) {
    add(key, key.startsWith("specs") ? PRODUCT_COPY.form.sections.specs : key)
  }
  return items
}
