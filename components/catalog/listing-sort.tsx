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
  type ListingTarget,
  listingHref,
  SORT_LABELS,
  sortsFor,
} from "@/lib/listing-params"

type ListingSortProps = {
  target: ListingTarget
  state: ListingState
}

// The listing's sort control, with the sorts its target offers (Best match
// only for a search). A new sort starts again at page 1 and keeps the
// filters.
export function ListingSort({ target, state }: ListingSortProps) {
  const router = useRouter()
  const labelId = useId()
  const sorts = sortsFor(target)
  const items = Object.fromEntries(
    sorts.map((sort) => [sort, SORT_LABELS[sort]])
  )

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm text-muted-foreground">
        Sort by
      </span>
      <Select
        items={items}
        value={state.sort}
        onValueChange={(value) => {
          if (value) {
            router.push(listingHref(target, { ...state, sort: value, page: 1 }))
          }
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sorts.map((value) => (
            <SelectItem key={value} value={value}>
              {SORT_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
