"use client"

import { useRouter } from "next/navigation"
import { useId } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type ListingState,
  listingHref,
  SORT_LABELS,
  SORTS,
} from "@/lib/listing-params"

type ListingSortProps = {
  slug: string
  state: ListingState
}

// The listing's sort control. A new sort starts again at page 1 and keeps the
// filters.
export function ListingSort({ slug, state }: ListingSortProps) {
  const router = useRouter()
  const labelId = useId()

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm text-muted-foreground">
        Sort by
      </span>
      <Select
        items={SORT_LABELS}
        value={state.sort}
        onValueChange={(value) => {
          if (value) {
            router.push(listingHref(slug, { ...state, sort: value, page: 1 }))
          }
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((value) => (
            <SelectItem key={value} value={value}>
              {SORT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
