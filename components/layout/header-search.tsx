"use client"

import { SearchIcon } from "lucide-react"
import Form from "next/form"
import { usePathname } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MAX_QUERY_LENGTH } from "@/lib/listing-params"
import { SEARCH_PATH } from "@/lib/site"

type HeaderSearchProps = {
  // The cleaned query of /search, from the store layout's @search slot;
  // "" on every other page (the slot's default)
  serverQuery: string
}

// The header's search box (docs/specs/014-search). A GET form to /search, so
// Enter submits it with or without JavaScript; with it, next/form navigates
// client-side. On the results page it shows the query that was searched.
//
// The query comes from the server through a parallel-route slot, not from
// useSearchParams: that hook needs a Suspense boundary on prerendered pages,
// and the boundary sends an empty box first, which stays empty without
// JavaScript. After a client-side navigation away from /search the slot
// keeps its last page, so the box also checks the path.
function HeaderSearch({ serverQuery }: HeaderSearchProps) {
  const pathname = usePathname()
  const query = pathname === SEARCH_PATH ? serverQuery : ""

  // Keyed by the query: defaultValue only applies on mount, so a new search
  // (or leaving the results page) remounts the box with the right text
  return (
    <Form
      key={query}
      action={SEARCH_PATH}
      role="search"
      className="relative w-full max-w-65"
    >
      <Label htmlFor="site-search" className="sr-only">
        Search parts
      </Label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="site-search"
        type="search"
        name="q"
        defaultValue={query}
        maxLength={MAX_QUERY_LENGTH}
        enterKeyHint="search"
        placeholder="Search parts…"
        autoComplete="off"
        className="h-9 rounded-xl border-transparent bg-muted pl-9 md:text-sm dark:bg-muted"
      />
    </Form>
  )
}

export { HeaderSearch }
