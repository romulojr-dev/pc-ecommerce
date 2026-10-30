import { Trash2Icon, XCircleIcon } from "lucide-react"
import Link from "next/link"

import { CartQuantity } from "@/components/cart/cart-quantity"
import { ProductImage } from "@/components/product/product-image"
import { StockLine } from "@/components/product/stock-line"
import { Button } from "@/components/ui/button"
import type { CartLineView } from "@/lib/cart/types"
import { formatPeso } from "@/lib/format"
import { productHref } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

// What a line says under itself after a change: a stock note, or why the
// change failed
export type LineMessage = { kind: "note" | "error"; text: string }

// The Remove button's id, so focus can move to a neighbour after a removal
export const removeButtonId = (lineId: string) => `remove-${lineId}`

type CartLineProps = {
  line: CartLineView
  // A change for this line is running
  busy: boolean
  message: LineMessage | null
  onQuantity: (quantity: number) => void
  onRemove: () => void
}

// One single-item line of /cart (docs/specs/025-cart-single-items, Behavior
// 17, 24): image, name, current price, stepper, line total, stock status and
// Remove. A product that is no longer sold keeps its line with nothing to
// buy: no link, price or stepper, and a note that the subtotal leaves it out.
export function CartLine({
  line,
  busy,
  message,
  onQuantity,
  onRemove,
}: CartLineProps) {
  return (
    <li aria-busy={busy} className="flex gap-4 py-5">
      <ProductImage
        image={line.image}
        productName={line.name}
        sizes="96px"
        className="size-24 shrink-0"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm text-muted-foreground">{line.brand}</p>
        {line.sold ? (
          <Link
            href={productHref(line.categorySlug, line.slug)}
            className={cn(
              "w-fit rounded-sm font-medium hover:underline",
              focusRing
            )}
          >
            {line.name}
          </Link>
        ) : (
          <p className="font-medium">{line.name}</p>
        )}
        {line.sold ? (
          <>
            <UnitPrice line={line} />
            <StockLine
              status={line.status}
              preorderShipsOn={line.preorderShipsOn}
            />
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <XCircleIcon aria-hidden="true" className="size-4" />
              No longer sold
            </p>
            <p className="text-sm text-muted-foreground">
              Not included in the subtotal.
            </p>
          </>
        )}
        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={cn(
              "text-sm",
              message.kind === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-3">
        {line.sold && (
          <>
            <CartQuantity
              name={line.name}
              quantity={line.quantity}
              max={line.max}
              disabled={busy}
              onChange={onQuantity}
            />
            <p className="font-semibold tabular-nums">
              <span className="sr-only">Line total: </span>
              {formatPeso(line.lineTotal)}
            </p>
          </>
        )}
        <Button
          id={removeButtonId(line.id)}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${line.name}`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden="true" data-icon="inline-start" />
          Remove
        </Button>
      </div>
    </li>
  )
}

// The price the shopper pays, with the regular price struck through on sale
function UnitPrice({ line }: { line: CartLineView }) {
  return (
    <p className="text-sm tabular-nums">
      <span className="font-medium">{formatPeso(line.unitPrice)}</span>
      {line.salePrice !== null && (
        <span className="ml-2 text-muted-foreground">
          {/* <s> isn't announced by screen readers, so say it */}
          <span className="sr-only">Was </span>
          <s>{formatPeso(line.price)}</s>
        </span>
      )}
    </p>
  )
}
