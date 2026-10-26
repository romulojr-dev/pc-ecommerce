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
  type ListingSort as Sort,
  listingHref,
  SORT_LABELS,
  SORTS,
} from "@/lib/listing-params"

type ListingSortProps = {
  slug: string
  sort: Sort
}

// The listing's sort control. A new sort starts again at page 1.
export function ListingSort({ slug, sort }: ListingSortProps) {
  const router = useRouter()
  const labelId = useId()

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm text-muted-foreground">
        Sort by
      </span>
      <Select
        items={SORT_LABELS}
        value={sort}
        onValueChange={(value) => {
          if (value) router.push(listingHref(slug, { sort: value, page: 1 }))
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
