"use client"

import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Issue } from "@/lib/builder"

// What the confirmation shows: the part, why it doesn't fit, and when the add
// also replaces a part, one sentence saying so
export type MisfitRequest = {
  partName: string
  errors: readonly Issue[]
  note?: string
}

// The confirmation before adding a part that doesn't fit: the slot picker's
// "Add anyway" (docs/specs/021-slot-picker, Behavior 15) and Add to build on
// the product page (docs/specs/024-add-anyway-product-page). Open while there
// is a request. Cancel and Escape close it through `onOpenChange`; the caller
// adds on `onConfirm`.
export function MisfitDialog({
  request,
  onOpenChange,
  onConfirm,
  finalFocus,
}: {
  request: MisfitRequest | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  // Where focus goes when it closes: the button that asked
  finalFocus: ComponentProps<typeof DialogContent>["finalFocus"]
}) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      {request && (
        <DialogContent
          showCloseButton={false}
          className="text-sm"
          finalFocus={finalFocus}
        >
          <DialogHeader>
            <DialogTitle className="text-base">
              Add a part that doesn&apos;t fit?
            </DialogTitle>
            <DialogDescription className="flex flex-col gap-2 text-sm text-foreground">
              <span>The {request.partName} doesn&apos;t fit your build:</span>
            </DialogDescription>
          </DialogHeader>
          <MisfitDetails errors={request.errors} note={request.note} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button size="lg" onClick={onConfirm}>
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

// The error list, the replace sentence and the cart line. Plain markup, so a
// test can render it without the dialog around it.
export function MisfitDetails({
  errors,
  note,
}: Pick<MisfitRequest, "errors" | "note">) {
  return (
    <>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {errors.map((issue) => (
          <li key={issue.rule}>{issue.message}</li>
        ))}
      </ul>
      {note && <p>{note}</p>}
      <p className="text-muted-foreground">
        You can still add it, but you can&apos;t add the build to your cart
        until this is fixed.
      </p>
    </>
  )
}
