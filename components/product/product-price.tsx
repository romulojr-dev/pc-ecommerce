import { discountPercent, formatPeso } from "@/lib/format"
import { cn } from "@/lib/utils"

type ProductPriceProps = {
  // Centavos
  price: number
  // Centavos, below price; null when not on sale
  salePrice: number | null
  className?: string
}

// A product's price, or its sale price with the old price struck through and
// the % off (docs/specs/010-product-page). No client hooks.
export function ProductPrice({
  price,
  salePrice,
  className,
}: ProductPriceProps) {
  if (salePrice === null) {
    return (
      <p className={cn("text-3xl font-semibold tabular-nums", className)}>
        {formatPeso(price)}
      </p>
    )
  }

  const percent = discountPercent(price, salePrice)
  return (
    <div
      className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}
    >
      <p className="text-3xl font-semibold tabular-nums">
        {formatPeso(salePrice)}
      </p>
      <p className="text-muted-foreground tabular-nums">
        {/* <s> isn't announced by screen readers, so say it */}
        <span className="sr-only">Was </span>
        <s>{formatPeso(price)}</s>
      </p>
      {percent > 0 && (
        <p className="rounded-md bg-destructive/10 px-2 py-0.5 text-sm font-medium text-destructive dark:bg-destructive/20">
          {percent}% off
        </p>
      )}
    </div>
  )
}
