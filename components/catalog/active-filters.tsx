import { XIcon } from "lucide-react"
import Link from "next/link"

import { type FilterOptions, activeFilterChips } from "@/lib/listing-filters"
import {
  clearFilters,
  type ListingState,
  listingHref,
} from "@/lib/listing-params"
import { cn, focusRing } from "@/lib/utils"

type ActiveFiltersProps = {
  slug: string
  state: ListingState
  options: FilterOptions
  className?: string
}

// The filters in effect, each a link that removes it (docs/specs/012-common-
// filters). Plain links, so they work without JavaScript and crawlers can
// follow them. Removing one starts again at page 1 and keeps the sort and the
// other filters; "Clear all" removes every filter but keeps the sort.
export function ActiveFilters({
  slug,
  state,
  options,
  className,
}: ActiveFiltersProps) {
  const chips = activeFilterChips(state.filters, options)
  if (chips.length === 0) return null

  const link = cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
    focusRing
  )

  return (
    <ul
      aria-label="Active filters"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {chips.map((chip) => (
        <li key={chip.label}>
          <Link
            href={listingHref(slug, {
              ...state,
              filters: chip.filters,
              page: 1,
            })}
            className={cn(link, "bg-muted/50 hover:bg-muted")}
          >
            <span className="sr-only">Remove filter: </span>
            {chip.label}
            <XIcon aria-hidden="true" className="size-3" />
          </Link>
        </li>
      ))}
      <li>
        <Link
          href={listingHref(slug, clearFilters(state))}
          className={cn(
            link,
            "border-transparent text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          )}
        >
          Clear all
        </Link>
      </li>
    </ul>
  )
}
