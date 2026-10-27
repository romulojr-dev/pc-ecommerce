"use client"

import { SearchIcon } from "lucide-react"
import Form from "next/form"
import { usePathname, useSearchParams } from "next/navigation"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cleanQuery, MAX_QUERY_LENGTH } from "@/lib/listing-params"
import { SEARCH_PATH } from "@/lib/site"

// The header's search box (docs/specs/014-search). A GET form to /search, so
// Enter submits it with or without JavaScript; with it, next/form navigates
// client-side. On the results page it shows the query that was searched.
function HeaderSearch() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query =
    pathname === SEARCH_PATH ? cleanQuery({ q: searchParams.getAll("q") }) : ""

  // Keyed by the query: defaultValue only applies on mount, so a new search
  // (or leaving the results page) remounts the box with the right text
  return <SearchBox key={query} query={query} />
}

// The box without the URL, for the Suspense fallback of prerendered pages,
// where the search params aren't known until the browser renders
function HeaderSearchFallback() {
  return <SearchBox query="" />
}

function SearchBox({ query }: { query: string }) {
  return (
    <Form
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

export { HeaderSearch, HeaderSearchFallback }
