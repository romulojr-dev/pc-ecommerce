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
import { BUILD_COPY, warningsLead } from "@/lib/cart/copy"

// The warnings the shopper is asked about. `changed` is for warnings the
// server found that the shopper hadn't seen (docs/specs/026-add-build-to-
// cart, Behavior 7).
export type WarningsRequest = {
  warnings: readonly Issue[]
  changed: boolean
}

// The confirmation before adding a build that has warnings (docs/specs/026-
// add-build-to-cart, Behavior 6). Open while there is a request. Cancel and
// Escape close it through `onOpenChange`; the caller sends the add on
// `onConfirm`.
export function WarningsDialog({
  request,
  onOpenChange,
  onConfirm,
  finalFocus,
}: {
  request: WarningsRequest | null
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
              {BUILD_COPY.dialogTitle}
            </DialogTitle>
            <DialogDescription className="text-sm text-foreground">
              {warningsLead(request.warnings.length, request.changed)}
            </DialogDescription>
          </DialogHeader>
          <WarningsList warnings={request.warnings} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button size="lg" onClick={onConfirm}>
              Add to cart
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

// The warning messages, in the engine's order. Plain markup, so a test can
// render it without the dialog around it.
export function WarningsList({ warnings }: { warnings: readonly Issue[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {warnings.map((warning) => (
        <li key={warning.rule}>{warning.message}</li>
      ))}
    </ul>
  )
}
