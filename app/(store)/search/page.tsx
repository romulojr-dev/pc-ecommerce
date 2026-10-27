import type { Metadata } from "next"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { ActiveFilters } from "@/components/catalog/active-filters"
import { ListingFilters } from "@/components/catalog/listing-filters"
import { ListingPagination } from "@/components/catalog/listing-pagination"
import { ListingResults } from "@/components/catalog/listing-results"
import { ListingShell } from "@/components/catalog/listing-shell"
import { ListingSort } from "@/components/catalog/listing-sort"
import { NoMatches } from "@/components/catalog/no-matches"
import {
  SearchNoResults,
  SearchPrompt,
} from "@/components/catalog/search-states"
import { Container } from "@/components/layout/container"
import { getMenuCategories } from "@/lib/categories"
import {
  activeFilterCount,
  type FilterOptions,
  type FilterValues,
  normalizeFilters,
} from "@/lib/listing-filters"
import {
  filtersFor,
  isCanonicalQuery,
  listingHref,
  listingQuery,
  PAGE_SIZE,
  pageCount,
  parseListingParams,
  parseView,
  searchTarget,
  VIEW_COOKIE,
} from "@/lib/listing-params"
import {
  getSearchFilterOptions,
  getSearchProducts,
  getSearchScope,
} from "@/lib/search"
import { SEARCH_PATH } from "@/lib/site"
import { manilaToday } from "@/lib/stock"

// Search results are thin and endless, so they are never indexed; their
// product links stay followable (docs/specs/014-search, "SEO")
const robots = { index: false, follow: true }

export async function generateMetadata({
  searchParams,
}: PageProps<"/search">): Promise<Metadata> {
  const raw = await searchParams
  const target = searchTarget(raw)
  const { page } = parseListingParams(target, raw)
  const title = target.q ? `Search: ${target.q}` : "Search"
  return { title: page > 1 ? `${title} — Page ${page}` : title, robots }
}

// Keyword search and brand browsing (docs/specs/014-search)
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  // Render on every request: stock and prices change at runtime (ADR 0003)
  await connection()

  const raw = await searchParams
  const target = searchTarget(raw)
  const { q } = target
  const state = parseListingParams(target, raw)

  // Nothing to search for or filter by: the prompt, at the bare URL
  if (!q && activeFilterCount(state.filters) === 0) {
    if (Object.keys(raw).length > 0) redirect(SEARCH_PATH)
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <SearchPrompt categories={await getMenuCategories()} />
      </Container>
    )
  }

  const today = manilaToday()
  const scope = await getSearchScope(q)
  const [options, { products, total }] = await Promise.all([
    getSearchFilterOptions(scope, state.filters, { today }),
    getSearchProducts(scope, state, { today }),
  ])
  const count = pageCount(total)

  // One URL per state, as on a category page: filter values that aren't
  // options go first (a brand none of the matches has), then a page past the
  // end, then anything not canonical (an untidy query, spelled-out defaults)
  const filters = normalizeFilters(state.filters, options, filtersFor(target))
  if (
    listingQuery(target, { ...state, filters }) !== listingQuery(target, state)
  ) {
    redirect(listingHref(target, { ...state, filters, page: 1 }))
  }
  if (state.page > count) {
    redirect(listingHref(target, { ...state, page: count }))
  }
  if (!isCanonicalQuery(target, raw, state)) {
    redirect(listingHref(target, state))
  }

  // The query matches nothing at all: no filter could help
  if (scope.ranks?.size === 0) {
    return (
      <Container className="py-10">
        <h1 className="text-2xl font-semibold tracking-tight">
          No results for &ldquo;{q}&rdquo;
        </h1>
        <p role="status" className="sr-only">
          No results for &ldquo;{q}&rdquo;.
        </p>
        <SearchNoResults categories={await getMenuCategories()} />
      </Container>
    )
  }

  const from = (state.page - 1) * PAGE_SIZE + 1
  const to = from + products.length - 1
  // Grid or list, read here so the first render matches the shopper's choice
  const view = parseView((await cookies()).get(VIEW_COOKIE)?.value)

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">
        {heading(q, state.filters, options)}
      </h1>
      <ListingShell
        announcement={
          total === 0
            ? "No products match your filters."
            : `Showing ${from} to ${to} of ${total} ${total === 1 ? "result" : "results"}`
        }
        sidebar={
          <ListingFilters target={target} state={state} options={options} />
        }
      >
        <ActiveFilters
          target={target}
          state={state}
          options={options}
          className="mb-4"
        />
        {total === 0 ? (
          <NoMatches
            target={target}
            everything={q ? `every result for “${q}”` : "every product"}
            state={state}
          />
        ) : (
          <>
            <ListingResults
              products={products}
              initialView={view}
              today={today}
              summary={
                <p className="text-sm text-muted-foreground">
                  Showing {from}–{to} of {total}{" "}
                  {total === 1 ? "result" : "results"}
                </p>
              }
              controls={<ListingSort target={target} state={state} />}
            />
            <ListingPagination target={target} state={state} count={count} />
          </>
        )}
      </ListingShell>
    </Container>
  )
}

// "Results for “rtx 5070”"; a brand's name when browsing one brand (Shop by
// brand); otherwise "All products"
function heading(
  q: string,
  filters: FilterValues,
  options: FilterOptions
): React.ReactNode {
  if (q) return <>Results for &ldquo;{q}&rdquo;</>
  const brands = filters.brand ?? []
  if (brands.length === 1 && activeFilterCount(filters) === 1) {
    const brand = options.brand?.find((option) => option.value === brands[0])
    if (brand) return brand.label
  }
  return "All products"
}
