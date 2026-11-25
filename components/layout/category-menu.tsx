import { CategoryDrawer } from "@/components/layout/category-drawer"
import { getMenuCategories } from "@/lib/categories"

// Server component: the categories come from a tagged cache (ADR 0003), so
// pages that render the header stay static. The drawer itself is the client
// part (it needs the current path and its open state).
async function CategoryMenu() {
  const categories = await getMenuCategories()
  if (categories.length === 0) return null

  return <CategoryDrawer categories={categories} />
}

export { CategoryMenu }
