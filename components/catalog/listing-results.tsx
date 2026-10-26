"use client"

import { LayoutGridIcon, ListIcon } from "lucide-react"
import { useState } from "react"

import { ProductCard } from "@/components/product/product-card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { type ListingView, parseView, VIEW_COOKIE } from "@/lib/listing-params"
import type { ProductCardData } from "@/lib/products"
import { cn, focusRing } from "@/lib/utils"

// shadcn's pressed state (bg-muted) is too close to unpressed; use a solid fill
const toggleItem = cn(
  "aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90 aria-pressed:hover:text-background",
  focusRing
)

// First row of the 4-column grid: these hold the LCP image
const EAGER_CARDS = 4

type ListingResultsProps = {
  products: ProductCardData[]
  // From the view cookie, so the first render already has the right layout
  initialView: ListingView
  // Server-rendered toolbar parts: the count line (left) and controls shown
  // before the toggle (the sort, later filters)
  summary: React.ReactNode
  controls: React.ReactNode
}

// A listing's products in a grid or a list. The view is a display preference:
// kept in a cookie for every listing and later visits, never in the URL.
export function ListingResults({
  products,
  initialView,
  summary,
  controls,
}: ListingResultsProps) {
  const [view, setView] = useState(initialView)

  function changeView(next: ListingView) {
    setView(next)
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-4">
        {summary}
        <div className="flex items-center gap-4">
          {controls}
          <ToggleGroup
            aria-label="View"
            variant="outline"
            spacing={0}
            value={[view]}
            // Pressing the active item would empty the value; keep it instead
            onValueChange={([next]) => {
              if (next) changeView(parseView(next))
            }}
          >
            <ToggleGroupItem value="grid" className={toggleItem}>
              <LayoutGridIcon aria-hidden="true" />
              Grid
            </ToggleGroupItem>
            <ToggleGroupItem value="list" className={toggleItem}>
              <ListIcon aria-hidden="true" />
              List
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <ul
        className={cn(
          "mt-6",
          view === "grid"
            ? "grid grid-cols-3 gap-4 xl:grid-cols-4"
            : "flex flex-col gap-3"
        )}
      >
        {products.map((product, index) => (
          <li key={product.slug}>
            <ProductCard
              product={product}
              layout={view}
              sizes={
                view === "grid" ? "(min-width: 1280px) 272px, 30vw" : "96px"
              }
              loading={index < EAGER_CARDS ? "eager" : "lazy"}
              headingLevel={2}
              className="h-full"
            />
          </li>
        ))}
      </ul>
    </>
  )
}
