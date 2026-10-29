import { QuantityStepper } from "@/components/builder/quantity-stepper"
import { PartInfo, SeverityMarker } from "@/components/builder/part-summary"
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
import { isBuyable } from "@/lib/stock"

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
// Lives in part-summary.tsx, since the shared page uses it too
export { SeverityMarker }

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
    <PartInfo
      data={data}
      quantity={quantity}
      severity={severity}
      note="Not available to buy right now. Replace it to add this build to cart."
    >
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
    </PartInfo>
  )
}
