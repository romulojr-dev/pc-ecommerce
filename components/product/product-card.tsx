import Link from "next/link"
import type { ReactNode } from "react"

import { ProductImage } from "@/components/product/product-image"
import { formatPeso } from "@/lib/format"
import type { ProductCardData } from "@/lib/products"
import { productHref } from "@/lib/site"
import { getStockStatus, stockStatusLabel } from "@/lib/stock"
import { cn } from "@/lib/utils"

type ProductCardProps = {
  product: ProductCardData
  layout: "grid" | "list"
  // Today in Manila (manilaToday()), from the server: decides pre-orders
  today: string
  // The rendered image width, passed to ProductImage
  sizes: string
  // "eager" for cards in the first row, which hold the page's LCP image
  loading?: "lazy" | "eager"
  // 2 when the cards are the page's main content, 3 under a section heading
  headingLevel?: 2 | 3
  // The slot picker's greyed card: a part that doesn't fit or can't be
  // bought (docs/specs/021-slot-picker, Rules › Greyed cards). The card is
  // muted, the text keeps its contrast.
  greyed?: boolean
  // Shown under the card, above the link that covers it, so its buttons
  // stay clickable: the picker's badges, reasons and action
  children?: ReactNode
  className?: string
}

// A product in a listing, search results or related products
// (docs/specs/008-category-listing). On sale, it shows the sale price, the
// one the filters and price sorts use (docs/specs/012-common-filters), with
// the list price struck through. No client hooks or server-only imports,
// so server and client components can both render it. The name is the card's
// only link; its ::after covers the card, so the whole card is clickable.
export function ProductCard({
  product,
  layout,
  today,
  sizes,
  loading,
  headingLevel = 3,
  greyed = false,
  children,
  className,
}: ProductCardProps) {
  const Heading = `h${headingLevel}` as const
  const status = getStockStatus(product, today)

  const rowClass =
    layout === "grid" ? "flex flex-col gap-3" : "flex items-center gap-4"

  const row = (
    <>
      <ProductImage
        image={product.image}
        productName={product.name}
        sizes={sizes}
        loading={loading}
        className={cn(
          layout === "grid" ? "w-full" : "size-24 shrink-0",
          greyed && "opacity-50 grayscale"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <Heading className="text-sm leading-snug font-medium">
          <Link
            href={productHref(product.categorySlug, product.slug)}
            className="outline-none after:absolute after:inset-0 after:rounded-lg hover:underline"
          >
            {product.name}
          </Link>
        </Heading>
        {product.summary && (
          // One line; the rest is cut visually but still read out
          <p className="truncate text-xs text-muted-foreground">
            {product.summary}
          </p>
        )}
      </div>
      <div
        className={cn(
          "flex flex-col gap-0.5",
          layout === "list" && "shrink-0 items-end text-right"
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-x-2",
            layout === "list" && "justify-end"
          )}
        >
          <p className="font-semibold tabular-nums">
            {formatPeso(product.salePrice ?? product.price)}
          </p>
          {product.salePrice !== null && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {/* <s> isn't announced by screen readers, so say it */}
              <span className="sr-only">Was </span>
              <s>{formatPeso(product.price)}</s>
            </p>
          )}
        </div>
        <p
          className={cn(
            "text-xs",
            status === "out-of-stock"
              ? "text-destructive"
              : "text-muted-foreground"
          )}
        >
          {stockStatusLabel[status]}
        </p>
      </div>
    </>
  )

  return (
    <article
      className={cn(
        "relative rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:border-foreground/30",
        // The link has no ring of its own, so the card shows its focus
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background",
        greyed && "bg-muted/60",
        children ? "flex flex-col gap-3" : rowClass,
        className
      )}
    >
      {children ? (
        <>
          <div className={rowClass}>{row}</div>
          <div className="relative z-10">{children}</div>
        </>
      ) : (
        row
      )}
    </article>
  )
}
