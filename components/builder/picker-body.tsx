import { CircleXIcon, InfoIcon } from "lucide-react"

import { PickerCard } from "@/components/builder/picker-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  bannerTitle,
  countLine,
  emptyMessage,
  memoryNote,
  type PickerEntry,
  type PickerList,
} from "@/lib/build-state/picker"
import { SLOT_COPY } from "@/lib/build-state/slots"
import type { Slot } from "@/lib/builder"

export type PickerBodyProps = {
  slot: Slot
  // The candidates request: loading, failed, or answered
  status: "loading" | "error" | "ready"
  list: PickerList
  showAll: boolean
  // The server's Manila date, from the candidates response
  today: string
  onAdd: (entry: PickerEntry, button: HTMLButtonElement) => void
  onRetry: () => void
}

// The slot picker below its title and toggle (docs/specs/021-slot-picker,
// Behavior 5–17), without the dialog, so its states can be checked as
// markup. Two parts: what stays in view (count, notes, banner), and the
// list, the only part that scrolls.
export function PickerBody({
  slot,
  status,
  list,
  showAll,
  today,
  onAdd,
  onRetry,
}: PickerBodyProps) {
  const { plural } = SLOT_COPY[slot]
  const ready = status === "ready"
  const empty =
    ready && list.entries.length === 0 ? emptyMessage(slot, list) : null

  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 text-sm">
        {/* Always mounted, so a change of the toggle is announced */}
        <p aria-live="polite" className="text-muted-foreground">
          {ready && list.total > 0 ? countLine(slot, list, showAll) : ""}
        </p>
        {ready && list.memoryKits !== null && (
          <Note>{memoryNote(list.memoryKits)}</Note>
        )}
        {ready && list.full && (
          <Note>
            Your build has the most parts it can hold. Remove a drive to add
            another.
          </Note>
        )}
        {ready && list.banner.length > 0 && (
          <div
            role="status"
            className="flex flex-col gap-1 rounded-lg border border-destructive/40 p-3"
          >
            <p className="inline-flex items-center gap-1 font-medium text-destructive">
              <CircleXIcon aria-hidden="true" className="size-4" />
              Error
            </p>
            <p className="font-medium">{bannerTitle(slot)}</p>
            <ul className="flex flex-col gap-1">
              {list.banner.map((issue) => (
                <li key={issue.rule}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
        {status === "loading" && (
          <div role="status">
            <span className="sr-only">Loading {plural}…</span>
            <ul aria-hidden="true" className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-4 rounded-lg border p-3">
                  <Skeleton className="size-24" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {status === "error" && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border p-4 text-sm"
          >
            <p>We couldn&apos;t load the {plural}.</p>
            <Button variant="outline" size="lg" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {empty && <p className="rounded-lg border p-4 text-sm">{empty}</p>}
        {ready && list.entries.length > 0 && (
          <ul
            aria-label={`${SLOT_COPY[slot].name} options`}
            className="flex flex-col gap-3"
          >
            {list.entries.map((entry) => (
              <li key={entry.candidate.data.part.id}>
                <PickerCard entry={entry} today={today} onAdd={onAdd} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function Note({ children }: { children: string }) {
  return (
    <p className="flex gap-1.5 rounded-lg bg-muted p-3">
      <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
