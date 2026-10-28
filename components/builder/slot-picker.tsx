"use client"

import { useMemo, useRef, useState } from "react"

import { PickerBody } from "@/components/builder/picker-body"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCandidates } from "@/hooks/use-candidates"
import type { BuilderCandidate } from "@/lib/build-state/candidates"
import {
  type PickerEntry,
  pickerList,
  pickerTitle,
} from "@/lib/build-state/picker"
import type { Build, Slot } from "@/lib/builder"

// What opened the picker: a slot, and for a storage "Change" the drive
export type PickerTarget = {
  slot: Slot
  replace?: string
  // A new number for every opening, so each one asks for fresh candidates
  opening: number
  // The button that opened it, where focus returns on Escape or Close
  trigger: HTMLElement | null
}

type SlotPickerProps = {
  open: boolean
  // Kept after closing, so the dialog can close (and return focus) with
  // its content in place
  target: PickerTarget | null
  build: Build
  onClose: () => void
  // `replace` is the drive being replaced when the picker is changing one
  onPick: (candidate: BuilderCandidate, replace: string | null) => void
}

// The slot picker (docs/specs/021-slot-picker): a modal over /builder that
// lists the slot's parts, checked against the build in the browser. Only
// the list scrolls; the title, toggle, count, notes and banner stay in view.
export function SlotPicker({
  open,
  target,
  build,
  onClose,
  onPick,
}: SlotPickerProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {target && (
        <PickerDialog
          // A fresh state (toggle off) for every opening
          key={target.opening}
          target={target}
          build={build}
          onPick={onPick}
        />
      )}
    </Dialog>
  )
}

function PickerDialog({
  target,
  build,
  onPick,
}: {
  target: PickerTarget
  build: Build
  onPick: SlotPickerProps["onPick"]
}) {
  const { slot } = target
  const { status, candidates, today, retry } = useCandidates(
    slot,
    target.opening
  )
  const [showAll, setShowAll] = useState(false)
  // A pick closes the picker and moves focus to the slot itself
  const picked = useRef(false)
  // "Add anyway": the entry waiting for confirmation, and its button
  const [confirming, setConfirming] = useState<PickerEntry | null>(null)
  const confirmButton = useRef<HTMLButtonElement | null>(null)

  const list = useMemo(
    () =>
      pickerList(build, slot, candidates, {
        replace: target.replace,
        showAll,
      }),
    [build, slot, candidates, target.replace, showAll]
  )
  const replacedName =
    list.replace === null
      ? null
      : ((build.storage ?? []).find((entry) => entry.part.id === list.replace)
          ?.part.name ?? null)

  function pick(entry: PickerEntry) {
    picked.current = true
    onPick(entry.candidate, list.replace)
  }

  function add(entry: PickerEntry, button: HTMLButtonElement) {
    if (entry.action.kind === "add") pick(entry)
    if (entry.action.kind === "add-anyway") {
      confirmButton.current = button
      setConfirming(entry)
    }
  }

  return (
    <DialogContent
      className="flex max-h-[85vh] flex-col gap-4 p-5 text-sm sm:max-w-3xl"
      finalFocus={() => (picked.current ? false : target.trigger)}
    >
      <DialogHeader className="shrink-0 pr-8">
        <DialogTitle className="text-lg font-semibold">
          {pickerTitle(slot, list.mode, replacedName)}
        </DialogTitle>
      </DialogHeader>

      {!(status === "ready" && list.empty === "no-products") && (
        <label className="flex w-fit shrink-0 items-center gap-2 font-medium">
          <Checkbox
            checked={showAll}
            disabled={status !== "ready"}
            onCheckedChange={(checked) => setShowAll(checked === true)}
          />
          Show all
        </label>
      )}

      <PickerBody
        slot={slot}
        status={status}
        list={list}
        showAll={showAll}
        today={today ?? ""}
        onAdd={add}
        onRetry={retry}
      />

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        {confirming && (
          <DialogContent
            showCloseButton={false}
            className="text-sm"
            finalFocus={confirmButton}
          >
            <DialogHeader>
              <DialogTitle className="text-base">
                Add a part that doesn&apos;t fit?
              </DialogTitle>
              <DialogDescription className="flex flex-col gap-2 text-sm text-foreground">
                <span>
                  The {confirming.candidate.data.part.name} doesn&apos;t fit
                  your build:
                </span>
              </DialogDescription>
            </DialogHeader>
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {confirming.errors.map((issue) => (
                <li key={issue.rule}>{issue.message}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              You can still add it, but you can&apos;t add the build to your
              cart until this is fixed.
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" size="lg" />}>
                Cancel
              </DialogClose>
              <Button size="lg" onClick={() => pick(confirming)}>
                Add anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </DialogContent>
  )
}
