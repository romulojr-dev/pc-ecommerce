import Link from "next/link"

import { categoryIcon } from "@/components/catalog/category-icons"
import { HomeSection } from "@/components/home/home-section"
import type { MenuCategory } from "@/lib/categories"
import { cn, focusRing } from "@/lib/utils"

// Shop by category (docs/specs/016-home-page): one tile per top-level
// category, linking to its listing
export function CategoryTiles({ categories }: { categories: MenuCategory[] }) {
  return (
    <HomeSection id="shop-by-category" title="Shop by category">
      <ul className="grid grid-cols-4 gap-3 lg:grid-cols-8">
        {categories.map(({ name, slug }) => {
          const Icon = categoryIcon(slug)
          return (
            <li key={slug}>
              <Link
                href={`/${slug}`}
                className={cn(
                  "flex h-full flex-col items-start gap-3 rounded-lg border bg-card p-4 text-sm text-card-foreground transition-colors hover:border-foreground/30",
                  focusRing
                )}
              >
                <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                {name}
              </Link>
            </li>
          )
        })}
      </ul>
    </HomeSection>
  )
}
