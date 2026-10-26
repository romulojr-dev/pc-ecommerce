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
