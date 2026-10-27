import { all } from "./raw"
import type { FacetRow, FilterOption, ListingFilter } from "./types"

// Slugs, any of which may match: brand (docs/specs/012-common-filters) and
// category (docs/specs/014-search)
export type SlugListFilterValue = string[]

const SLUG = /^[a-z0-9-]+$/
// More than this is never a real selection
const MAX_SLUGS = 20

// A filter on repeated slug values (?brand=amd&brand=intel), with options
// from the products' `values`, by name
export function slugListFilter(config: {
  key: string
  // Chip prefix, e.g. "Brand"
  label: string
  values: (row: FacetRow) => FilterOption[]
}) {
  const { key, label } = config

  return {
    key,

    // Slug-shaped values, once each, in a fixed order
    parse(raw) {
      const slugs = [...new Set(all(raw, key).filter((v) => SLUG.test(v)))]
        .sort()
        .slice(0, MAX_SLUGS)
      return slugs.length > 0 ? slugs : null
    },

    serialize(slugs) {
      return slugs.map((slug) => [key, slug])
    },

    chips(slugs, options) {
      return slugs.map((slug) => {
        const name = options.find((option) => option.value === slug)?.label
        const rest = slugs.filter((other) => other !== slug)
        return {
          label: `${label}: ${name ?? slug}`,
          without: rest.length > 0 ? rest : null,
        }
      })
    },

    normalize(slugs, options) {
      const known = slugs.filter((slug) =>
        options.some((option) => option.value === slug)
      )
      return known.length > 0 ? known : null
    },

    facet: {
      values: config.values,
      compare: (a, b) => a.label.localeCompare(b.label, "en"),
    },
  } satisfies ListingFilter<SlugListFilterValue>
}
