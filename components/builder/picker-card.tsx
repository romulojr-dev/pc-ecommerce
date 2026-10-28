import { CircleXIcon, PackageXIcon, TriangleAlertIcon } from "lucide-react"
import type { MouseEvent } from "react"

import { ProductCard } from "@/components/product/product-card"
import { Button } from "@/components/ui/button"
import { type PickerEntry, stockReason } from "@/lib/build-state/picker"
import { cn } from "@/lib/utils"

type PickerCardProps = {
  entry: PickerEntry
  // The server's Manila date, from the candidates response
  today: string
  onAdd: (entry: PickerEntry, button: HTMLButtonElement) => void
}

const DISABLED_REASON = {
  "not-buyable": () => "Only parts in stock can be added to a build.",
  "at-stock": (stock: number) =>
    `Your build already has all ${stock} we have in stock.`,
  full: () =>
    "Your build has the most parts it can hold. Remove a drive to add another.",
}

// One candidate in the slot picker (docs/specs/021-slot-picker, Behavior
// 12–13): the product card, then its markers, warnings, reasons and action.
// Everything is text in the card, never a tooltip, so keyboard and screen
// reader users get all of it.
export function PickerCard({ entry, today, onAdd }: PickerCardProps) {
  const { candidate, group, errors, warnings, marker, action } = entry
  const { part } = candidate.data
  const greyed = group === "unbuyable" || group === "incompatible"
  const stock = greyed ? stockReason(candidate) : null
  const reasonId = `picker-reason-${part.id}`

  const add = (event: MouseEvent<HTMLButtonElement>) =>
    onAdd(entry, event.currentTarget)

  return (
    <ProductCard
      product={candidate.card}
      layout="list"
      today={today}
      sizes="96px"
      greyed={greyed}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
          {marker && (
            <p className="w-fit rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {marker.kind === "current"
                ? "Current"
                : `In your build (×${marker.quantity})`}
            </p>
          )}
          {group === "warnings" && (
            <div className="flex flex-col gap-1">
              <p className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon aria-hidden="true" className="size-4" />
                Warning
              </p>
              <ul className="flex flex-col gap-1">
                {warnings.map((issue) => (
                  <li key={issue.rule}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}
          {greyed && (
            <ul className="flex flex-col gap-1">
              {errors.map((issue) => (
                <li key={issue.rule} className="flex gap-1.5">
                  <CircleXIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span>{issue.message}</span>
                </li>
              ))}
              {stock && (
                <li className="flex gap-1.5">
                  <PackageXIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <span>{stock}</span>
                </li>
              )}
            </ul>
          )}
        </div>

        {action.kind === "add" && (
          <Button
            size="lg"
            aria-label={`Add ${part.name} to your build`}
            onClick={add}
          >
            Add to build
          </Button>
        )}
        {action.kind === "add-anyway" && (
          <Button
            size="lg"
            variant="outline"
            aria-label={`Add ${part.name} to your build anyway`}
            onClick={add}
          >
            Add anyway
          </Button>
        )}
        {action.kind === "disabled" && (
          <div className="flex flex-col items-end gap-1 text-right">
            <Button
              size="lg"
              disabled
              aria-label={`Add ${part.name} to your build`}
              aria-describedby={reasonId}
            >
              Add to build
            </Button>
            <p
              id={reasonId}
              className={cn("max-w-64 text-xs text-muted-foreground")}
            >
              {action.reason === "at-stock"
                ? DISABLED_REASON["at-stock"](action.stock)
                : DISABLED_REASON[action.reason]()}
            </p>
          </div>
        )}
      </div>
    </ProductCard>
  )
}
