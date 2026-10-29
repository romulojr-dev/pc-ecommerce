import type { Prisma } from "@/generated/prisma/client"
import { db } from "@/lib/db"
import {
  type FilterOptions,
  type FilterValues,
  searchFilters,
} from "@/lib/listing-filters"
import {
  activeWhere,
  type FilterContext,
  type FilterScope,
  loadFilterOptions,
} from "@/lib/listing-filters/server"
import { type ListingState, PAGE_SIZE } from "@/lib/listing-params"
import {
  getListingPage,
  listingSelect,
  type ListingProduct,
  toListingProduct,
} from "@/lib/products"

// Keyword search (docs/specs/014-search, ADR 0005). Server-only: it queries
// the database. The match is the one raw query: Prisma Client can't read the
// tsvector column. Everything after it (filters, counts, cards, price and
// newest sorts) is the typed listing code, scoped to the matching ids.

// The products a search is about, before filters: the active products that
// match the query, with their rank, or every active product when there is no
// query (a brand's products for "Shop by brand")
export type SearchScope = {
  where: FilterScope
  // Rank by product id; null without a query
  ranks: Map<string, number> | null
}

export async function getSearchScope(q: string): Promise<SearchScope> {
  if (!q) return { where: { status: "ACTIVE" }, ranks: null }

  // q is a bound parameter. search_query (the migration product_search)
  // builds the tsquery from [a-z0-9] tokens only, so no input can make it
  // fail, and it is NULL, matching nothing, when there are no tokens. Rank is
  // cover density: query words found next to each other ("16 GB", "RTX
  // 5070") count more, which suits model numbers; ts_rank barely rewards
  // that (ADR 0005, "Ranking"). Normalization 1 divides by the log of the
  // entry's length.
  const rows = await db.$queryRaw<{ id: string; rank: number }[]>`
    SELECT p."id", ts_rank_cd(p."searchVector", query, 1) AS rank
    FROM "Product" p, search_query(${q}) AS query
    WHERE p."status" = 'ACTIVE' AND p."searchVector" @@ query`

  const ranks = new Map(rows.map(({ id, rank }) => [id, rank]))
  return { where: { status: "ACTIVE", id: { in: [...ranks.keys()] } }, ranks }
}

// The options of the search filters (categories, brands) in the scope, each
// counted with the other active filters applied
export function getSearchFilterOptions(
  scope: SearchScope,
  filters: FilterValues,
  context: FilterContext
): Promise<FilterOptions> {
  return loadFilterOptions(scope.where, filters, context, searchFilters)
}

// One page of the scope's products that pass the filters, plus how many
// there are in all. The caller checks the page against pageCount(total).
export async function getSearchProducts(
  scope: SearchScope,
  { sort, page, filters }: ListingState,
  context: FilterContext
): Promise<{ products: ListingProduct[]; total: number }> {
  const where = {
    ...scope.where,
    AND: activeWhere(filters, context, searchFilters),
  } satisfies Prisma.ProductWhereInput

  if (sort !== "relevance") return getListingPage(where, sort, page)
  // parseListingParams offers Best match only with a query
  if (!scope.ranks) return getListingPage(where, "newest", page)

  // Best match: every filtered match in rank order (highest first, then name
  // and id, so pages are stable), then the cards of one page
  const ranks = scope.ranks
  const matches = await db.product.findMany({
    where,
    select: { id: true, name: true },
  })
  const ordered = matches
    .sort(
      (a, b) =>
        ranks.get(b.id)! - ranks.get(a.id)! ||
        compare(a.name, b.name) ||
        compare(a.id, b.id)
    )
    .map(({ id }) => id)
  const pageIds = ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const rows = await db.product.findMany({
    where: { id: { in: pageIds } },
    select: listingSelect,
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  return {
    products: pageIds.flatMap((id) => {
      const row = byId.get(id)
      // Gone between the two queries: leave it out
      return row ? [toListingProduct(row)] : []
    }),
    total: ordered.length,
  }
}

// Code-point order: the same everywhere, unlike locale order
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
