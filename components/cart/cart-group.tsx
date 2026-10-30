"use client"

import { Trash2Icon, XCircleIcon } from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import { IssueList, StatusLine } from "@/components/builder/summary-parts"
import type { LineMessage } from "@/components/cart/cart-line"
import { removeButtonId } from "@/components/cart/cart-line"
import { ProductImage } from "@/components/product/product-image"
import { StockLine } from "@/components/product/stock-line"
import { Button, buttonVariants } from "@/components/ui/button"
import { SLOT_COPY } from "@/lib/build-state/slots"
import { retiredBanner, type SharedRow } from "@/lib/build-state/shared"
import { groupLabel, groupName } from "@/lib/cart/copy"
import type { CartGroupView } from "@/lib/cart/types"
import { formatPeso } from "@/lib/format"
import { productHref } from "@/lib/site"
import { cn, focusRing } from "@/lib/utils"

type CartGroupProps = {
  group: CartGroupView
  // A change for this group is running
  busy: boolean
  message: LineMessage | null
  onRemove: () => void
  // Starts open; tests render the open state
  defaultExpanded?: boolean
}

// One build group of /cart (docs/specs/026-add-build-to-cart, Behavior
// 13–19): a single line with the group's label, total and compatibility
// status, that expands to list its parts. The parts have no stepper and no
// Remove: a group changes only as a whole, and is removed, never edited.
export function CartGroup({
  group,
  busy,
  message,
  onRemove,
  defaultExpanded = false,
}: CartGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const panelId = useId()
  const name = groupName(group.number)
  const rows = group.slots.flatMap(({ slot, rows }) =>
    rows.map((row) => ({ slot, row }))
  )
  const retired = rows.filter(({ row }) => row.kind === "retired").length

  return (
    <li aria-busy={busy} className="flex flex-col gap-4 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="font-medium">
            {groupLabel(group.number, group.partCount)}
          </h3>
          <StatusLine status={group.status} />
        </div>
        <p className="shrink-0 font-semibold tabular-nums">
          <span className="sr-only">Build total: </span>
          {formatPeso(group.total)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Hide parts" : "Show parts"}
        </Button>
        <Link
          href={`/builds/${group.slug}`}
          aria-label={`View build: ${name}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            focusRing
          )}
        >
          View build
        </Link>
        <Button
          id={removeButtonId(group.buildId)}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${name}`}
          disabled={busy}
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden="true" data-icon="inline-start" />
          Remove
        </Button>
      </div>

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

      <div id={panelId} hidden={!expanded} className="flex flex-col gap-4">
        {expanded && (
          <>
            {retired > 0 && (
              <p className="text-sm text-muted-foreground">
                {retiredBanner(retired)}
              </p>
            )}
            <ul className="divide-y rounded-md border px-4">
              {rows.map(({ slot, row }) => (
                <GroupRow
                  key={row.kind === "part" ? row.data.part.id : row.id}
                  slotName={SLOT_COPY[slot].name}
                  row={row}
                />
              ))}
            </ul>
            {group.issues.length > 0 && <IssueList issues={group.issues} />}
          </>
        )}
      </div>
    </li>
  )
}

// One part of an expanded group: the category, image, name, price and stock.
// A part that is no longer sold keeps its name and brand and nothing to buy.
function GroupRow({ slotName, row }: { slotName: string; row: SharedRow }) {
  if (row.kind === "retired") {
    return (
      <li className="flex flex-col gap-1 py-3">
        <p className="text-xs text-muted-foreground">{slotName}</p>
        <p className="text-sm text-muted-foreground">{row.brand}</p>
        <p className="font-medium">{row.name}</p>
        <p className="flex items-center gap-2 text-sm font-medium text-destructive">
          <XCircleIcon aria-hidden="true" className="size-4" />
          No longer sold
        </p>
      </li>
    )
  }

  const { data, quantity } = row
  return (
    <li className="flex gap-3 py-3">
      <ProductImage
        image={data.image}
        productName={data.part.name}
        sizes="56px"
        className="size-14 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">{slotName}</p>
        <Link
          href={productHref(data.part.category, data.slug)}
          className={cn(
            "w-fit rounded-sm text-sm font-medium hover:underline",
            focusRing
          )}
        >
          {data.part.name}
        </Link>
        <p className="text-sm tabular-nums">
          <span>{formatPeso(data.effectivePrice)}</span>
          {data.salePrice !== null && (
            <span className="ml-2 text-muted-foreground">
              {/* <s> isn't announced by screen readers, so say it */}
              <span className="sr-only">Was </span>
              <s>{formatPeso(data.price)}</s>
            </span>
          )}
          {quantity > 1 && <span className="ml-2">× {quantity}</span>}
        </p>
        <StockLine status={data.stockStatus} preorderShipsOn={null} />
      </div>
      <p className="shrink-0 text-sm font-medium tabular-nums">
        <span className="sr-only">Line total: </span>
        {formatPeso(data.effectivePrice * quantity)}
      </p>
    </li>
  )
}
