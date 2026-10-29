import { CircleXIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"

import { QuantityStepper } from "@/components/builder/quantity-stepper"
import { ProductImage } from "@/components/product/product-image"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BuilderPartData } from "@/lib/build-state/parts"
import { worstSeverity } from "@/lib/build-state/severity"
import { SLOT_COPY } from "@/lib/build-state/slots"
import {
  type Issue,
  SLOT_LIMITS,
  type Severity,
  type Slot,
} from "@/lib/builder"
import { formatPeso } from "@/lib/format"
import { productHref } from "@/lib/site"
import { isBuyable, stockStatusLabel } from "@/lib/stock"
import { cn, focusRing } from "@/lib/utils"

export type SlotEntry = { quantity: number; data: BuilderPartData }

// Opens the slot picker (docs/specs/021-slot-picker, Behavior 1): to add a
// part, or for storage to replace the drive named in `replace`. `trigger`
// gets focus back when the picker closes without a pick.
export type OpenPicker = (
  slot: Slot,
  trigger: HTMLElement,
  replace?: string
) => void

// The attribute the builder focuses after a pick: the slot's Change button
// for that part
export const changeFocusKey = (slot: Slot, productId: string) =>
  `change-${slot}-${productId}`

type SlotSectionProps = {
  slot: Slot
  entries: readonly SlotEntry[]
  // The saved build or its parts haven't loaded yet, or failed to
  loading: boolean
  issues: readonly Issue[]
  onRemove: (productId: string) => void
  onQuantity: (productId: string, quantity: number) => void
  onOpenPicker: OpenPicker
}

// One builder slot (docs/specs/020-builder-page, Behavior 10–14): its parts,
// or a button to choose one. "Choose", "Change" and "Add another drive" open
// the slot picker (docs/specs/021-slot-picker, Behavior 1).
export function SlotSection({
  slot,
  entries,
  loading,
  issues,
  onRemove,
  onQuantity,
  onOpenPicker,
}: SlotSectionProps) {
  const copy = SLOT_COPY[slot]
  const headingId = `slot-${slot}`

  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
        {copy.name}
      </h2>
      {loading ? (
        <div className="flex items-center gap-4" aria-hidden="true">
          <Skeleton className="size-16" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      ) : entries.length === 0 ? (
        <Button
          variant="outline"
          size="lg"
          className="w-fit"
          onClick={(event) => onOpenPicker(slot, event.currentTarget)}
        >
          {copy.choose}
        </Button>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {entries.map((entry) => (
              <PartRow
                key={entry.data.part.id}
                slot={slot}
                entry={entry}
                severity={worstSeverity(issues, slot, entry.data.part.id)}
                onRemove={() => onRemove(entry.data.part.id)}
                onQuantity={(quantity) =>
                  onQuantity(entry.data.part.id, quantity)
                }
                onChange={(trigger) =>
                  onOpenPicker(
                    slot,
                    trigger,
                    SLOT_LIMITS[slot].multipleEntries
                      ? entry.data.part.id
                      : undefined
                  )
                }
              />
            ))}
          </ul>
          {SLOT_LIMITS[slot].multipleEntries && (
            <Button
              variant="outline"
              size="lg"
              className="w-fit"
              onClick={(event) => onOpenPicker(slot, event.currentTarget)}
            >
              Add another drive
            </Button>
          )}
        </>
      )}
    </li>
  )
}

// Lives in lib/build-state/severity.ts, since the shared page uses it too
export { worstSeverity }

type PartRowProps = {
  slot: Slot
  entry: SlotEntry
  severity: Severity | null
  onRemove: () => void
  onQuantity: (quantity: number) => void
  onChange: (trigger: HTMLElement) => void
}

function PartRow({
  slot,
  entry: { quantity, data },
  severity,
  onRemove,
  onQuantity,
  onChange,
}: PartRowProps) {
  const { part } = data
  const buyable = isBuyable(data.stockStatus)
  const multipleUnits = SLOT_LIMITS[slot].quantity === "any"

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
        {!buyable && (
          <p className="text-sm text-muted-foreground">
            Not available to buy right now. Replace it to add this build to
            cart.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {multipleUnits && (
            <QuantityStepper
              partName={part.name}
              quantity={quantity}
              stock={data.stock}
              buyable={buyable}
              onChange={onQuantity}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={
              SLOT_LIMITS[slot].multipleEntries
                ? `Change ${part.name}`
                : `Change ${SLOT_COPY[slot].name}`
            }
            data-focus={changeFocusKey(slot, part.id)}
            onClick={(event) => onChange(event.currentTarget)}
          >
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remove ${part.name} from your build`}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
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
