import { CircleXIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"

import { ProductImage } from "@/components/product/product-image"
import type { BuilderPartData } from "@/lib/build-state/parts"
import type { Severity } from "@/lib/builder"
import { formatPeso } from "@/lib/format"
import { productHref } from "@/lib/site"
import { isBuyable, stockStatusLabel } from "@/lib/stock"
import { cn, focusRing } from "@/lib/utils"

type PartInfoProps = {
  data: BuilderPartData
  quantity: number
  severity: Severity | null
  // The line under a part that can't be bought now
  note: string
  // Under the note: the builder's buttons, none on the shared page
  children?: React.ReactNode
}

// One part in a slot: its image, brand, name linked to its page, the price
// the shopper pays, its stock label, any issue marker, and a note when it
// can't be bought now (docs/specs/020-builder-page, Behavior 12–13). Shared by
// the builder's rows and the shared page's (docs/specs/022-share-build,
// Behavior 13–14).
export function PartInfo({
  data,
  quantity,
  severity,
  note,
  children,
}: PartInfoProps) {
  const { part } = data
  const buyable = isBuyable(data.stockStatus)

  return (
    <li className="flex gap-4">
      <ProductImage
        image={data.image}
        productName={part.name}
        sizes="64px"
        className="size-16 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{data.brand}</p>
            <Link
              href={productHref(part.category, data.slug)}
              className={cn("font-medium hover:underline", focusRing)}
            >
              {part.name}
            </Link>
          </div>
          <PartPrice data={data} quantity={quantity} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={cn(!buyable && "font-medium text-destructive")}>
            {stockStatusLabel[data.stockStatus]}
          </span>
          {severity && <SeverityMarker severity={severity} />}
        </div>
        {!buyable && <p className="text-sm text-muted-foreground">{note}</p>}

        {children}
      </div>
    </li>
  )
}

// The price the shopper pays (struck-through regular price when on sale),
// and the line total when there's more than one
function PartPrice({
  data,
  quantity,
}: {
  data: BuilderPartData
  quantity: number
}) {
  const unit = formatPeso(data.effectivePrice)
  return (
    <div className="flex flex-col items-end text-right tabular-nums">
      <p className="flex items-baseline gap-2">
        {data.salePrice !== null && (
          <span className="text-sm text-muted-foreground">
            <span className="sr-only">Was </span>
            <s>{formatPeso(data.price)}</s>
          </span>
        )}
        <span className={cn(quantity === 1 && "font-semibold")}>
          {quantity > 1 ? `${unit} × ${quantity}` : unit}
        </span>
      </p>
      {quantity > 1 && (
        <p className="font-semibold">
          {formatPeso(data.effectivePrice * quantity)}
        </p>
      )}
    </div>
  )
}

export function SeverityMarker({ severity }: { severity: Severity }) {
  const Icon = severity === "error" ? CircleXIcon : TriangleAlertIcon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium",
        severity === "error"
          ? "text-destructive"
          : "text-amber-700 dark:text-amber-400"
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {severity === "error" ? "Error" : "Warning"}
    </span>
  )
}
