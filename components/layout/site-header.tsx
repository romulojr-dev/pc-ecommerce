import Link from "next/link"
import { CircleUserIcon, ShoppingCartIcon, WrenchIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { CategoryMenu } from "@/components/layout/category-menu"
import { Logo } from "@/components/layout/logo"
import { siteConfig } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

const iconLink = cn(
  buttonVariants({ variant: "ghost", size: "icon-lg" }),
  focusRing,
  "[&_svg:not([class*='size-'])]:size-5"
)

type SiteHeaderProps = {
  // The search box, from the store layout's @search slot (header-search.tsx)
  search: React.ReactNode
}

function SiteHeader({ search }: SiteHeaderProps) {
  return (
    <header className="grid h-20 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-6 border-b px-6">
      <div className="flex items-center gap-3">
        <CategoryMenu />
        {search}
      </div>

      <Link
        href="/"
        aria-label={`${siteConfig.name} home`}
        className={cn("rounded-md", focusRing)}
      >
        <Logo />
      </Link>

      <nav
        aria-label="Shop tools"
        className="flex items-center gap-2 justify-self-end"
      >
        <Link
          href="/builder"
          className={cn(
            buttonVariants({ size: "lg" }),
            focusRing,
            "mr-2 rounded-lg px-3 text-sm font-semibold"
          )}
        >
          <WrenchIcon aria-hidden="true" data-icon="inline-start" />
          PC Builder
        </Link>
        <Link href="/cart" aria-label="Cart" className={iconLink}>
          <ShoppingCartIcon aria-hidden="true" />
        </Link>
        <Link href="/login" aria-label="Account" className={iconLink}>
          <CircleUserIcon aria-hidden="true" />
        </Link>
      </nav>
    </header>
  )
}

export { SiteHeader }
