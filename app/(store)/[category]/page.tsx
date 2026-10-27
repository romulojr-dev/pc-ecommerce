import type { Metadata } from "next"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { ActiveFilters } from "@/components/catalog/active-filters"
import { ListingFilters } from "@/components/catalog/listing-filters"
import { ListingPagination } from "@/components/catalog/listing-pagination"
import { ListingResults } from "@/components/catalog/listing-results"
import { ListingShell } from "@/components/catalog/listing-shell"
import { ListingSort } from "@/components/catalog/listing-sort"
import { NoMatches } from "@/components/catalog/no-matches"
import { Container } from "@/components/layout/container"
import { getCategoryBySlug } from "@/lib/categories"
import { activeFilterCount, normalizeFilters } from "@/lib/listing-filters"
import {
  categoryTarget,
  DEFAULT_SORT,
  filtersFor,
  isCanonicalQuery,
  listingHref,
  listingQuery,
  PAGE_SIZE,
  pageCount,
  parseListingParams,
  parseView,
  VIEW_COOKIE,
} from "@/lib/listing-params"
import { getCategoryProducts, getFilterOptions } from "@/lib/products"
import { siteConfig } from "@/lib/site"
import { manilaToday } from "@/lib/stock"

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[category]">): Promise<Metadata> {
  const { category: slug } = await params
  // Cached (categories tag), so this adds no query to the page's own lookup
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const target = categoryTarget(category.slug)
  const { page, filters } = parseListingParams(target, await searchParams)

  return {
    title: page > 1 ? `${category.name} — Page ${page}` : category.name,
    description: `Shop ${category.name} in the Philippines at ${siteConfig.name}. Compare prices and stock, then check compatibility in the PC Builder.`,
    // Sort variants list the same products, so they share the unsorted URL
    alternates: {
      canonical: listingHref(target, {
        sort: DEFAULT_SORT,
        page,
        filters,
      }),
    },
    // Filter combinations aren't useful search landing pages. Their links stay
    // followable, so crawlers still reach the products (FR-7).
    ...(activeFilterCount(filters) > 0 && {
      robots: { index: false, follow: true },
    }),
  }
}

// A category's active products (docs/specs/008-category-listing)
export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/[category]">) {
  // Render on every request: stock and prices change at runtime (ADR 0003)
  await connection()

  const { category: slug } = await params
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const target = categoryTarget(category.slug)
  const raw = await searchParams
  const state = parseListingParams(target, raw)
  const today = manilaToday()
  const [options, { products, total }] = await Promise.all([
    getFilterOptions(category, state.filters, { today }),
    getCategoryProducts(category, state, { today }),
  ])
  const count = pageCount(total)

  // One URL per state. A brand that isn't one of the category's goes first
  // (parsing can't know the options); the products just loaded then match the
  // cleaned filters too, since an unknown brand adds none. Then past the end
  // goes to the last page, and bad or spelled-out values to the canonical URL.
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

  const from = (state.page - 1) * PAGE_SIZE + 1
  const to = from + products.length - 1
  // Grid or list, read here so the first render matches the shopper's choice
  const view = parseView((await cookies()).get(VIEW_COOKIE)?.value)

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
      {total === 0 && activeFilterCount(state.filters) === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No products in this category yet.
        </p>
      ) : (
        <ListingShell
          announcement={
            total === 0
              ? "No products match your filters."
              : `Showing ${from} to ${to} of ${total} ${total === 1 ? "product" : "products"}`
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
              everything={`every ${category.name} product`}
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
                    {total === 1 ? "product" : "products"}
                  </p>
                }
                controls={<ListingSort target={target} state={state} />}
              />
              <ListingPagination target={target} state={state} count={count} />
            </>
          )}
        </ListingShell>
      )}
    </Container>
  )
}
