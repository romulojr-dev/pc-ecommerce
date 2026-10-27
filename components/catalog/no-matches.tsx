import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  clearFilters,
  type ListingState,
  type ListingTarget,
  listingHref,
} from "@/lib/listing-params"
import { cn, focusRing } from "@/lib/utils"

type NoMatchesProps = {
  target: ListingTarget
  categoryName: string
  state: ListingState
}

// Filters are on and nothing passes them (docs/specs/012-common-filters). The
// sidebar and chips stay on the page, so the shopper can also adjust a single
// filter; this is the way back to everything. It is announced by the shell's
// live region, not by this block.
export function NoMatches({ target, categoryName, state }: NoMatchesProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
      <h2 className="font-medium">No products match your filters.</h2>
      <p className="text-sm text-muted-foreground">
        Remove a filter, or clear them all to see every {categoryName} product.
      </p>
      <Link
        href={listingHref(target, clearFilters(state))}
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          focusRing
        )}
      >
        Clear all filters
      </Link>
    </div>
  )
}
