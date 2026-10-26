import { ChevronDownIcon, LayoutGridIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CategoryMenuLink } from "@/components/layout/category-menu-link"
import { getMenuCategories } from "@/lib/categories"
import { cn, focusRing } from "@/lib/utils"

// Server component: the categories come from a tagged cache (ADR 0003), so
// pages that render the header stay static
async function CategoryMenu() {
  const categories = await getMenuCategories()
  if (categories.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="lg"
            className={cn("group/category-menu shrink-0", focusRing)}
          />
        }
      >
        <LayoutGridIcon aria-hidden="true" data-icon="inline-start" />
        Categories
        <ChevronDownIcon
          aria-hidden="true"
          data-icon="inline-end"
          className="transition-transform group-data-popup-open/category-menu:rotate-180"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        {categories.map((category) => (
          <CategoryMenuLink key={category.slug} {...category} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { CategoryMenu }
