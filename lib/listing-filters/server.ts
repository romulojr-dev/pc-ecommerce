import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import type { SpecFilterKind } from "@/lib/specs"

import { countFacet } from "./facets"
import type {
  CommonFilterKey,
  FilterList,
  FilterOptions,
  FilterValues,
} from "./index"
import type { SpecChoiceFilterValue, SpecRangeFilterValue } from "./spec"
import type { FacetRow, SpecFilterInfo } from "./types"

// The database half of the listing filters (docs/specs/012-common-filters,
// docs/specs/013-spec-filters): the condition each one adds to a product
// query, and the options with their counts. Server-only (it imports the
// database); the pure half is in ./index. Common filters are a Record over
// the same keys as the pure half, and spec filters a Record over the same
// kinds, so neither can be added to only one half.

export type FilterContext = {
  // Today in Manila, "YYYY-MM-DD" (manilaToday()). A parameter, not read here,
  // so tests can pin it.
  today: string
}

// The products a listing or a facet is about, e.g. a category's active ones
export type FilterScope = Prisma.ProductWhereInput

type ServerFilter<K extends CommonFilterKey> = {
  where(
    value: NonNullable<FilterValues[K]>,
    context: FilterContext
  ): Prisma.ProductWhereInput
}

const serverFilters: { [K in CommonFilterKey]: ServerFilter<K> } = {
  brand: {
    where: (slugs) => ({ brand: { slug: { in: slugs } } }),
  },

  // Whole pesos in the URL, centavos in the database. Bounds are inclusive,
  // and the price is the one the shopper pays (ADR 0004).
  price: {
    where: ({ min, max }) => ({
      effectivePrice: {
        ...(min !== null && { gte: min * 100 }),
        ...(max !== null && { lte: max * 100 }),
      },
    }),
  },

  // What getStockStatus calls in stock or low stock: units left, and not a
  // pre-order. A ship date of today or earlier has ended the pre-order.
  inStock: {
    where: (_, { today }) => ({
      stock: { gt: 0 },
      OR: [
        { preorderShipsOn: null },
        // A date column: "2026-10-26" is UTC midnight, stored as that day
        { preorderShipsOn: { lte: new Date(today) } },
      ],
    }),
  },
}

// Spec conditions are Prisma's typed JSON path filters on Product.specs. The
// path is the metadata's field name, never text from the URL, and Prisma
// sends every value as a bound parameter. They don't use the GIN index; see
// docs/specs/013-spec-filters, "Finding: the GIN index is not used".
const specWhere: Record<
  SpecFilterKind,
  (info: SpecFilterInfo, value: never) => Prisma.ProductWhereInput
> = {
  enum: ({ field }, values: SpecChoiceFilterValue) => ({
    OR: values.map((value) => ({ specs: { path: [field], equals: value } })),
  }),
  // Numbers are stored as JSON numbers, so they are compared as numbers
  values: ({ field, text }, values: SpecChoiceFilterValue) => ({
    OR: values.map((value) => ({
      specs: { path: [field], equals: text ? value : Number(value) },
    })),
  }),
  contains: ({ field }, values: SpecChoiceFilterValue) => ({
    OR: values.map((value) => ({
      specs: { path: [field], array_contains: [value] },
    })),
  }),
  range: ({ field }, { min, max }: SpecRangeFilterValue) => ({
    specs: {
      path: [field],
      ...(min !== null && { gte: min }),
      ...(max !== null && { lte: max }),
    },
  }),
  boolean: ({ field }) => ({ specs: { path: [field], equals: true } }),
}

function isCommonKey(key: string): key is CommonFilterKey {
  return Object.hasOwn(serverFilters, key)
}

// One condition per active filter of the list, to go in the query's AND so
// that two filters never fight over the same key (inStock has an OR of its
// own)
export function activeWhere(
  filters: FilterValues,
  context: FilterContext,
  list: FilterList
): Prisma.ProductWhereInput[] {
  return list.flatMap((filter) => {
    const value = filters[filter.key]
    if (value === undefined) return []
    // The loops don't know which value type goes with which filter
    if (filter.spec) {
      return [specWhere[filter.spec.kind](filter.spec, value as never)]
    }
    if (isCommonKey(filter.key)) {
      return [serverFilters[filter.key].where(value as never, context)]
    }
    return []
  })
}

const facetSelect = {
  specs: true,
  brand: { select: { slug: true, name: true } },
} satisfies Prisma.ProductSelect

// The options of every filter with a facet, with counts
// (docs/specs/013-spec-filters, "Option counts"). An option is offered when
// a product in the scope has it; its count is over the products that pass
// every other active filter. Filters that aren't active share one query (all
// active filters), so this runs at most 2 + (active filters with a facet)
// queries, in parallel.
export async function loadFilterOptions(
  scope: FilterScope,
  filters: FilterValues,
  context: FilterContext,
  list: FilterList
): Promise<FilterOptions> {
  const active = list.filter((filter) => filters[filter.key] !== undefined)
  const faceted = list.filter((filter) => filter.facet)

  // The active filters a facet's counts use: all but its own
  const othersOf = (key: string | null) =>
    active.filter((filter) => filter.key !== key)
  // Queries are shared by the set of filters they apply
  const queryId = (applied: FilterList) =>
    applied.map((filter) => filter.key).join(",")

  const queries = new Map<string, FilterList>([["", []]])
  for (const applied of [
    othersOf(null),
    ...faceted.map((filter) => othersOf(filter.key)),
  ]) {
    queries.set(queryId(applied), applied)
  }

  const rows = new Map(
    await Promise.all(
      [...queries].map(async ([id, applied]) => {
        const found: FacetRow[] = await db.product.findMany({
          where: { AND: [scope, ...activeWhere(filters, context, applied)] },
          select: facetSelect,
        })
        return [id, found] as const
      })
    )
  )

  const scopeRows = rows.get("")!
  const options: FilterOptions = {}
  for (const filter of faceted) {
    const otherRows = rows.get(queryId(othersOf(filter.key)))!
    options[filter.key] = countFacet(filter.facet!, scopeRows, otherRows)
  }
  return options
}
