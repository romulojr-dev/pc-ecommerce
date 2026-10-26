import type { Metadata } from "next"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { ListingFilters } from "@/components/catalog/listing-filters"
import { ListingPagination } from "@/components/catalog/listing-pagination"
import { ListingResults } from "@/components/catalog/listing-results"
import { ListingShell } from "@/components/catalog/listing-shell"
import { ListingSort } from "@/components/catalog/listing-sort"
import { Container } from "@/components/layout/container"
import { getCategoryBySlug } from "@/lib/categories"
import { activeFilterCount, normalizeFilters } from "@/lib/listing-filters"
import {
  DEFAULT_SORT,
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

  const { page, filters } = parseListingParams(await searchParams)

  return {
    title: page > 1 ? `${category.name} — Page ${page}` : category.name,
    description: `Shop ${category.name} in the Philippines at ${siteConfig.name}. Compare prices and stock, then check compatibility in the PC Builder.`,
    // Sort variants list the same products, so they share the unsorted URL
    alternates: {
      canonical: listingHref(category.slug, {
        sort: DEFAULT_SORT,
        page,
        filters,
      }),
    },
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

  const raw = await searchParams
  const state = parseListingParams(raw)
  const today = manilaToday()
  const [options, { products, total }] = await Promise.all([
    getFilterOptions(category.id),
    getCategoryProducts(category.id, state, { today }),
  ])
  const count = pageCount(total)

  // One URL per state. A brand that isn't one of the category's goes first
  // (parsing can't know the options); the products just loaded then match the
  // cleaned filters too, since an unknown brand adds none. Then past the end
  // goes to the last page, and bad or spelled-out values to the canonical URL.
  const filters = normalizeFilters(state.filters, options)
  if (listingQuery({ ...state, filters }) !== listingQuery(state)) {
    redirect(listingHref(category.slug, { ...state, filters, page: 1 }))
  }
  if (state.page > count) {
    redirect(listingHref(category.slug, { ...state, page: count }))
  }
  if (!isCanonicalQuery(raw, state)) {
    redirect(listingHref(category.slug, state))
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
          sidebar={
            <ListingFilters
              slug={category.slug}
              state={state}
              options={options}
            />
          }
        >
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">
              No products match your filters.
            </p>
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
                controls={<ListingSort slug={category.slug} state={state} />}
              />
              <ListingPagination
                slug={category.slug}
                state={state}
                count={count}
              />
            </>
          )}
        </ListingShell>
      )}
    </Container>
  )
}
