import Link from "next/link"

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
  className?: string
}

// A product in a listing, search results or related products
// (docs/specs/008-category-listing). No client hooks or server-only imports,
// so server and client components can both render it. The name is the card's
// only link; its ::after covers the card, so the whole card is clickable.
export function ProductCard({
  product,
  layout,
  today,
  sizes,
  loading,
  headingLevel = 3,
  className,
}: ProductCardProps) {
  const Heading = `h${headingLevel}` as const
  const status = getStockStatus(product, today)

  return (
    <article
      className={cn(
        "relative rounded-lg border bg-card text-card-foreground transition-colors hover:border-foreground/30",
        // The link has no ring of its own, so the card shows its focus
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background",
        layout === "grid"
          ? "flex flex-col gap-3 p-3"
          : "flex items-center gap-4 p-3",
        className
      )}
    >
      <ProductImage
        image={product.image}
        productName={product.name}
        sizes={sizes}
        loading={loading}
        className={layout === "grid" ? "w-full" : "size-24 shrink-0"}
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
      </div>
      <div
        className={cn(
          "flex flex-col gap-0.5",
          layout === "list" && "shrink-0 items-end text-right"
        )}
      >
        <p className="font-semibold tabular-nums">
          {formatPeso(product.price)}
        </p>
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
    </article>
  )
}
