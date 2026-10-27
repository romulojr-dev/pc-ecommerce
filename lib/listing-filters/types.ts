import type { FieldMeta, SpecFilterKind } from "@/lib/specs"

// The shape of a page's awaited searchParams
export type RawSearchParams = Record<string, string | string[] | undefined>

// One choice of a filter, e.g. a brand: `value` goes in the URL, `label` on
// screen. `count` is how many products would match with it checked, given
// the other active filters (docs/specs/013-spec-filters); the options loader
// always sets it.
export type FilterOption = { value: string; label: string; count?: number }

// What the options loader reads of each product to count the options
export type FacetRow = {
  specs: unknown
  brand: { slug: string; name: string }
  category: { slug: string; name: string }
}

// How a filter finds its options in products: the values one product has, and
// the order to show them in. Pure, so the counting is unit-tested.
export type Facet = {
  values(row: FacetRow): FilterOption[]
  compare(a: FilterOption, b: FilterOption): number
}

// A removable piece of an active filter, e.g. one brand of several. `without`
// is the filter's value once this piece is removed, null when nothing is left.
export type FilterChip<V> = { label: string; without: V | null }

// The pure half of a listing filter (docs/specs/012-common-filters): how it
// is read from and written to the URL, and how it shows as chips. Server and
// client components both import it, so it must not touch the database; its
// database condition and options live in ./server.ts under the same key.
export type ListingFilter<V> = {
  // Names the filter in the state, in chips and in tests
  key: string
  // null = the filter is inactive. Never throws: bad values are ignored.
  parse(raw: RawSearchParams): V | null
  // Canonical URL entries. Never called for an inactive filter.
  serialize(value: V): [string, string][]
  chips(value: V, options: FilterOption[]): FilterChip<V>[]
  // Drops values that aren't among the options (parsing is pure, so it can't
  // know them). Only for filters with options. null = nothing left.
  normalize?(value: V, options: FilterOption[]): V | null
  // Filters with options (brand, spec filters) say how to find them
  facet?: Facet
  // Set on spec filters (docs/specs/013-spec-filters): the field they filter,
  // read by the sidebar and the database half
  spec?: SpecFilterInfo
}

export type SpecFilterInfo = {
  field: string
  meta: FieldMeta
  kind: SpecFilterKind
  // A `values` filter on free text (a chipset) rather than numbers
  text: boolean
}
