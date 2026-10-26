import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  type ListingState,
  listingHref,
  paginationItems,
} from "@/lib/listing-params"

type ListingPaginationProps = {
  slug: string
  state: ListingState
  // Number of pages, from pageCount(total)
  count: number
}

// Page links for a listing; nothing when there is one page. Links keep the
// rest of the state (sort, and later filters).
export function ListingPagination({
  slug,
  state,
  count,
}: ListingPaginationProps) {
  if (count <= 1) return null

  const hrefFor = (page: number) => listingHref(slug, { ...state, page })

  return (
    <Pagination aria-label="Pagination" className="mt-10">
      <PaginationContent>
        {state.page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={hrefFor(state.page - 1)} />
          </PaginationItem>
        )}
        {paginationItems(state.page, count).map((item, index) => (
          <PaginationItem
            key={item === "ellipsis" ? `ellipsis-${index}` : item}
          >
            {item === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={hrefFor(item)}
                isActive={item === state.page}
                aria-label={`Page ${item}`}
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        {state.page < count && (
          <PaginationItem>
            <PaginationNext href={hrefFor(state.page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  )
}
