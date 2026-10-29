import { TriangleAlertIcon } from "lucide-react"

import { PartInfo } from "@/components/builder/part-summary"
import {
  IssueList,
  PowerLine,
  StatusLine,
} from "@/components/builder/summary-parts"
import { ProductImage } from "@/components/product/product-image"
import { SLOT_COPY } from "@/lib/build-state/slots"
import type { SharedBuildView, SharedRow } from "@/lib/build-state/shared"
import type { Slot } from "@/lib/builder"
import { formatPeso } from "@/lib/format"

type Props = {
  view: SharedBuildView
  // At the end of the summary: Open in builder
  children?: React.ReactNode
}

// A shared build, read-only (docs/specs/022-share-build, Behavior 12–17):
// the banner when parts are no longer sold, the eight slots, and a summary
// beside them. It has none of the builder's controls.
export function SharedBuild({ view, children }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {view.banner && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4" />
          <p>{view.banner}</p>
        </div>
      )}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ol aria-label="Build slots" className="flex flex-col gap-4">
          {view.slots.map(({ slot, rows }) => (
            <SharedSlot key={slot} slot={slot} rows={rows} />
          ))}
        </ol>
        <aside
          aria-labelledby="shared-summary-heading"
          className="flex flex-col gap-5 rounded-lg border p-5 lg:sticky lg:top-6"
        >
          <h2 id="shared-summary-heading" className="text-lg font-semibold">
            Summary
          </h2>
          <dl className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-sm text-muted-foreground">Total</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatPeso(view.total)}
              </dd>
            </div>
          </dl>
          <PowerLine power={view.power} />
          <div className="flex flex-col gap-3">
            <StatusLine status={view.status} />
            {view.checked && <IssueList issues={view.issues} />}
          </div>
          {view.availability && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20">
              {view.availability}
            </p>
          )}
          {children}
        </aside>
      </div>
    </div>
  )
}

function SharedSlot({ slot, rows }: { slot: Slot; rows: SharedRow[] }) {
  const headingId = `slot-${slot}`
  return (
    <li
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
        {SLOT_COPY[slot].name}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No part chosen</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) =>
            row.kind === "part" ? (
              <PartInfo
                key={row.data.part.id}
                data={row.data}
                quantity={row.quantity}
                severity={row.severity}
                note="Not available to buy right now."
              />
            ) : (
              <RetiredRow key={row.id} row={row} />
            )
          )}
        </ul>
      )}
    </li>
  )
}

// A part that is no longer sold: its name and brand, and why it isn't
// counted. No price and no link: it can't be bought.
function RetiredRow({ row }: { row: Extract<SharedRow, { kind: "retired" }> }) {
  return (
    <li className="flex gap-4">
      <ProductImage
        image={null}
        productName={row.name}
        sizes="64px"
        className="size-16 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs text-muted-foreground">{row.brand}</p>
        <p className="font-medium">{row.name}</p>
        <p className="text-sm font-medium text-destructive">No longer sold</p>
        <p className="text-sm text-muted-foreground">
          This part isn&rsquo;t sold anymore, so the total and the checks leave
          it out.
        </p>
      </div>
    </li>
  )
}
