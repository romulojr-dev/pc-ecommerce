import { slugListFilter, type SlugListFilterValue } from "./slug-list"

// Category slugs, any of which may match. Search results only
// (docs/specs/014-search): a category page is already one category.
export type CategoryFilterValue = SlugListFilterValue

// ?category=gpu&category=cpu; options are the categories of the products in
// the scope, by name
export const categoryFilter = slugListFilter({
  key: "category",
  label: "Category",
  values: (row) => [{ value: row.category.slug, label: row.category.name }],
})
