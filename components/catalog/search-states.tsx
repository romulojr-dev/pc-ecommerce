import Link from "next/link"

import type { MenuCategory } from "@/lib/categories"
import { searchHref } from "@/lib/listing-params"
import { categoryHref } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

// The search page's states without results (docs/specs/014-search, "Empty
// and no-results states"). Plain links, so they work without JavaScript.

const EXAMPLE_SEARCHES = ["RTX 5070", "Ryzen 7", "B650", "DDR5"]

const pill = cn(
  "inline-flex rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
  focusRing
)

// /search with nothing to search for yet
export function SearchPrompt({ categories }: { categories: MenuCategory[] }) {
  return (
    <div className="mt-6 flex flex-col gap-8">
      <p className="text-muted-foreground">
        Search by part name, brand or model number.
      </p>
      <section aria-labelledby="search-examples">
        <h2 id="search-examples" className="font-medium">
          Try searching for
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_SEARCHES.map((q) => (
            <li key={q}>
              <Link href={searchHref(q)} className={pill}>
                {q}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CategoryLinks categories={categories} title="Or browse a category" />
    </div>
  )
}

// A query that matches nothing. The page's heading says so; this gives ways on.
export function SearchNoResults({
  categories,
}: {
  categories: MenuCategory[]
}) {
  return (
    <div className="mt-6 flex flex-col gap-8">
      <section aria-labelledby="search-suggestions">
        <h2 id="search-suggestions" className="font-medium">
          Suggestions
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Check the spelling.</li>
          <li>Use fewer words.</li>
          <li>
            Try just the model number: &ldquo;5070&rdquo; instead of &ldquo;RTX
            5070 Super&rdquo;.
          </li>
        </ul>
      </section>
      <CategoryLinks categories={categories} title="Browse a category" />
    </div>
  )
}

function CategoryLinks({
  categories,
  title,
}: {
  categories: MenuCategory[]
  title: string
}) {
  if (categories.length === 0) return null
  return (
    <nav aria-labelledby="search-categories">
      <h2 id="search-categories" className="font-medium">
        {title}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link href={categoryHref(category.slug)} className={pill}>
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
