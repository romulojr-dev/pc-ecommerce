import { unstable_cache } from "next/cache"

import { db } from "@/lib/db"

// Shared, rarely changing data: cached by tag, not queried per request (ADR
// 0003). Anything that writes categories must invalidate this tag.
export const CATEGORIES_TAG = "categories"

export type MenuCategory = { name: string; slug: string }

// Top-level categories for the header menu. The 1-hour revalidate only covers
// changes made outside the app (the seed, the Neon console).
export const getMenuCategories = unstable_cache(
  async (): Promise<MenuCategory[]> =>
    db.category.findMany({
      where: { parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, slug: true },
    }),
  ["menu-categories"],
  { tags: [CATEGORIES_TAG], revalidate: 3600 }
)

export type CategorySummary = { id: string; name: string; slug: string }

// One category for its listing page and metadata, or null for an unknown slug.
// The slug argument is part of the cache key.
export const getCategoryBySlug = unstable_cache(
  async (slug: string): Promise<CategorySummary | null> =>
    db.category.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    }),
  ["category-by-slug"],
  { tags: [CATEGORIES_TAG], revalidate: 3600 }
)
