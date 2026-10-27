import type { Facet, FacetRow, FilterOption } from "./types"

// A filter's options with counts (docs/specs/013-spec-filters, "Option
// counts"). The options are the values the scope's products have, so a value
// no product in the category has is never offered (hidden). Each count is
// how many of `otherRows` (the products that pass every *other* active
// filter) have the value, so it can be 0 (shown disabled). A product counts
// once per value, even if a list repeats it.
export function countFacet(
  facet: Facet,
  scopeRows: FacetRow[],
  otherRows: FacetRow[]
): FilterOption[] {
  const labels = new Map<string, string>()
  for (const row of scopeRows) {
    for (const { value, label } of facet.values(row)) labels.set(value, label)
  }

  const counts = new Map<string, number>()
  for (const row of otherRows) {
    const values = new Set(facet.values(row).map(({ value }) => value))
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...labels]
    .map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }))
    .sort(facet.compare)
}
