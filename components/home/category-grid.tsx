import Link from "next/link"

import type { MenuCategory } from "@/lib/categories"
import { categoryHref } from "@/lib/site"
import type { BuilderCategorySlug } from "@/lib/specs/registry"
import { cn, focusRing } from "@/lib/utils"

// The home page's short labels, in the design's order. The categories
// themselves (which exist, their slugs and links) still come from the
// database through getMenuCategories; this only renames and orders them, and
// is keyed by the registry's slugs so a renamed slug is a type error.
export const CATEGORY_TILES: readonly {
  slug: BuilderCategorySlug
  label: string
}[] = [
  { slug: "cpu", label: "CPU" },
  { slug: "gpu", label: "Graphics Card" },
  { slug: "motherboard", label: "Mobo" },
  { slug: "memory", label: "Memory" },
  { slug: "storage", label: "Storage" },
  { slug: "psu", label: "Power Supply" },
  { slug: "case", label: "Case" },
  { slug: "cpu-cooler", label: "Cooling" },
]

export type CategoryTile = { label: string; href: string }

// The tiles to show: the design's eight in its order, for the categories that
// exist, then any other top-level category under its own name
export function categoryTiles(categories: MenuCategory[]): CategoryTile[] {
  const existing = new Set(categories.map((category) => category.slug))
  const known = new Set<string>(CATEGORY_TILES.map((tile) => tile.slug))
  return [
    ...CATEGORY_TILES.filter((tile) => existing.has(tile.slug)).map((tile) => ({
      label: tile.label,
      href: categoryHref(tile.slug),
    })),
    ...categories
      .filter((category) => !known.has(category.slug))
      .map((category) => ({
        label: category.name,
        href: categoryHref(category.slug),
      })),
  ]
}

// Shop by category: solid, text-only tiles, each a link to its listing
export function CategoryGrid({ categories }: { categories: MenuCategory[] }) {
  const tiles = categoryTiles(categories)
  if (tiles.length === 0) return null

  return (
    <section aria-labelledby="shop-by-category">
      <h2
        id="shop-by-category"
        className="text-[22px] font-semibold tracking-[-0.02em]"
      >
        Shop by category
      </h2>
      <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {tiles.map(({ label, href }) => (
          <li key={href} className="flex min-w-0">
            <Link
              href={href}
              className={cn(
                "flex min-h-[88px] w-full min-w-0 items-start rounded-lg bg-muted p-4 text-left [overflow-wrap:anywhere] transition-colors duration-150 hover:bg-[#EBEBEB] dark:hover:bg-neutral-700/60",
                focusRing
              )}
            >
              <span className="text-xl leading-[1.15] font-semibold tracking-[-0.02em]">
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
