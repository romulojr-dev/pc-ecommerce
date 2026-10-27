import { slugListFilter, type SlugListFilterValue } from "./slug-list"

// Brand slugs, any of which may match (docs/specs/012-common-filters)
export type BrandFilterValue = SlugListFilterValue

// ?brand=amd&brand=intel; options are the brands of the products in the
// scope, by name
export const brandFilter = slugListFilter({
  key: "brand",
  label: "Brand",
  values: (row) => [{ value: row.brand.slug, label: row.brand.name }],
})
