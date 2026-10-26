"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CheckIcon } from "lucide-react"

import { DropdownMenuLinkItem } from "@/components/ui/dropdown-menu"
import type { MenuCategory } from "@/lib/categories"
import { categoryHref, isCurrentCategory } from "@/lib/site"

// The only client part of the category menu: it needs the current path
function CategoryMenuLink({ name, slug }: MenuCategory) {
  const current = isCurrentCategory(usePathname(), slug)

  return (
    // Client navigation keeps the layout mounted, so close the menu on click
    <DropdownMenuLinkItem
      closeOnClick
      render={<Link href={categoryHref(slug)} />}
      aria-current={current ? "page" : undefined}
      className="text-sm aria-[current=page]:font-medium"
    >
      {name}
      {current && <CheckIcon aria-hidden="true" className="ml-auto" />}
    </DropdownMenuLinkItem>
  )
}

export { CategoryMenuLink }
