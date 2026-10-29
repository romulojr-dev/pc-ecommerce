"use client"

import { LayoutGridIcon, ListIcon } from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import { FitBadge } from "@/components/fit/fit-badge"
import { ProductCard } from "@/components/product/product-card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useFits } from "@/hooks/use-fits"
import { type ListingView, parseView, VIEW_COOKIE } from "@/lib/listing-params"
import type { ListingProduct } from "@/lib/products"
import { cn, focusRing } from "@/lib/utils"

// shadcn's pressed state (bg-muted) is too close to unpressed; use a solid fill
const toggleItem = cn(
  "aria-pressed:bg-foreground aria-pressed:text-background aria-pressed:hover:bg-foreground/90 aria-pressed:hover:text-background",
  focusRing
)

// First two rows of the 3-column grid: both start above the fold at 1280 x 800
const EAGER_CARDS = 6

type ListingResultsProps = {
  products: ListingProduct[]
  // From the view cookie, so the first render already has the right layout
  initialView: ListingView
  // Today in Manila, from the server, so cards show pre-orders consistently
  today: string
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
  today,
  summary,
  controls,
}: ListingResultsProps) {
  const [view, setView] = useState(initialView)
  // "Fits your build" (docs/specs/023-fits-your-build-hints): one parts
  // request for every card on the page. Null until the saved build has
  // loaded, so the first render matches the server's.
  const withFit = useMemo(
    () => products.flatMap((product) => (product.fit ? [product.fit] : [])),
    [products]
  )
  const fits = useFits(withFit)
  const fitById = new Map(
    withFit.map((part, index) => [part.id, fits?.[index]])
  )

  function changeView(next: ListingView) {
    setView(next)
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {/* Elements from the server can arrive as lazy references when their
            data streams in late (a slow connection), and React 19.3 then
            misses that they were listed in place and warns about missing keys
            (issue #44). As a Fragment's only child they are in no list. */}
        <Fragment>{summary}</Fragment>
        <div className="flex items-center gap-4">
          <Fragment>{controls}</Fragment>
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
            ? "grid grid-cols-2 gap-4 lg:grid-cols-3"
            : "flex flex-col gap-3"
        )}
      >
        {products.map((product, index) => (
          <li key={product.slug}>
            <ProductCard
              product={product}
              layout={view}
              today={today}
              sizes={
                view === "grid"
                  ? "(min-width: 1280px) 285px, (min-width: 1024px) 200px, 45vw"
                  : "96px"
              }
              loading={index < EAGER_CARDS ? "eager" : "lazy"}
              headingLevel={2}
              className="h-full"
            >
              {product.fit && (
                <FitBadge fit={fitById.get(product.fit.id) ?? null} />
              )}
            </ProductCard>
          </li>
        ))}
      </ul>
    </>
  )
}
