import Link from "next/link"

import { HomeSection } from "@/components/home/home-section"
import type { HomeBrand } from "@/lib/home"
import { searchHref } from "@/lib/listing-params"
import { cn, focusRing } from "@/lib/utils"

// Shop by brand (docs/specs/016-home-page): every brand with products, as
// text links to its search results
export function BrandList({ brands }: { brands: HomeBrand[] }) {
  if (brands.length === 0) return null
  return (
    <HomeSection id="shop-by-brand" title="Shop by brand">
      <ul className="flex flex-wrap gap-x-6 gap-y-2 border-y py-4">
        {brands.map(({ name, slug }) => (
          <li key={slug}>
            <Link
              href={searchHref("", { brand: [slug] })}
              className={cn("rounded-sm text-sm hover:underline", focusRing)}
            >
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
