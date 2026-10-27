import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"

import type {
  CommonFilterKey,
  FilterOption,
  FilterOptions,
  FilterValues,
} from "./index"

// The database half of the listing filters (docs/specs/012-common-filters):
// the condition each one adds to a product query, and where its options come
// from. Server-only (it imports the database); the pure half is in ./index.
// This is a Record over the same keys as the pure half, so a filter can't be
// added to only one of them.

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
  // Not narrowed by the other filters (option counts come with story 3)
  options?(scope: FilterScope): Promise<FilterOption[]>
}

const serverFilters: { [K in CommonFilterKey]: ServerFilter<K> } = {
  brand: {
    where: (slugs) => ({ brand: { slug: { in: slugs } } }),

    // Brands with at least one product in the scope, by name
    async options(scope) {
      const brands = await db.brand.findMany({
        where: { products: { some: scope } },
        orderBy: { name: "asc" },
        select: { slug: true, name: true },
      })
      return brands.map(({ slug, name }) => ({ value: slug, label: name }))
    },
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

const FILTER_KEYS = Object.keys(serverFilters) as CommonFilterKey[]

// One condition per active filter, to go in the query's AND so that two
// filters never fight over the same key (inStock has an OR of its own)
export function activeWhere(
  filters: FilterValues,
  context: FilterContext
): Prisma.ProductWhereInput[] {
  return FILTER_KEYS.flatMap((key) => {
    const value = filters[key]
    if (value === undefined) return []
    // The loop doesn't know which value type goes with which key
    return [serverFilters[key].where(value as never, context)]
  })
}

// The options of every filter that has some, for the products in the scope
export async function loadFilterOptions(
  scope: FilterScope
): Promise<FilterOptions> {
  const options: FilterOptions = {}
  await Promise.all(
    FILTER_KEYS.map(async (key) => {
      const load = serverFilters[key].options
      if (load) options[key] = await load(scope)
    })
  )
  return options
}
