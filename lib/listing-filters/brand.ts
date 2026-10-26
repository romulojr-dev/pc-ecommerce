import { all } from "./raw"
import type { ListingFilter } from "./types"

// Brand slugs, any of which may match (docs/specs/012-common-filters)
export type BrandFilterValue = string[]

const SLUG = /^[a-z0-9-]+$/
// More than this is never a real selection
const MAX_BRANDS = 20

export const brandFilter = {
  key: "brand",

  // ?brand=amd&brand=intel: slug-shaped values, once each, in a fixed order
  parse(raw) {
    const slugs = [...new Set(all(raw, "brand").filter((v) => SLUG.test(v)))]
      .sort()
      .slice(0, MAX_BRANDS)
    return slugs.length > 0 ? slugs : null
  },

  serialize(slugs) {
    return slugs.map((slug) => ["brand", slug])
  },

  chips(slugs, options) {
    return slugs.map((slug) => {
      const name = options.find((option) => option.value === slug)?.label
      const rest = slugs.filter((other) => other !== slug)
      return {
        label: `Brand: ${name ?? slug}`,
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
} satisfies ListingFilter<BrandFilterValue>
