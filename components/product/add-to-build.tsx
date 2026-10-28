"use client"

import Link from "next/link"
import { useRef, useState } from "react"

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
import { useBuild } from "@/hooks/use-build"
import { SLOT_COPY } from "@/lib/build-state/slots"
import { buildStore } from "@/lib/build-state/store"
import type { Slot } from "@/lib/builder"
import { cn, focusRing } from "@/lib/utils"

type AddToBuildProps = {
  productId: string
  name: string
  slot: Slot
  // Units in stock now; the page renders this only for a buyable part
  stock: number
}

// What the line under the buttons says after a click
type Outcome =
  | { kind: "added" }
  | { kind: "already" }
  | { kind: "at-stock"; stock: number }
  | { kind: "full" }

const OUTCOME_TEXT = {
  added: () => "Added to your build.",
  already: () => "Already in your build.",
  "at-stock": (stock: number) =>
    `Your build already has all ${stock} we have in stock.`,
  full: () =>
    "Your build has the most parts it can hold. Remove a drive to add another.",
}

// Add to build on the product page (docs/specs/020-builder-page, Behavior
// 18–23). Always one unit. Replacing a part asks first. It renders the same
// on the server and the client, and does nothing until the saved build has
// been read, so it can't overwrite it.
export function AddToBuild({ productId, name, slot, stock }: AddToBuildProps) {
  // Reads the saved build after mounting
  useBuild((state) => state.hydrated)
  const button = useRef<HTMLButtonElement>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [replace, setReplace] = useState<{ quantity: number } | null>(null)

  function add() {
    const plan = buildStore.getState().add(slot, productId, stock)
    if (plan === null) return
    switch (plan.kind) {
      case "add":
      case "raise":
        setOutcome({ kind: "added" })
        break
      case "confirm-replace":
        setReplace({ quantity: plan.quantity })
        break
      case "at-stock":
        setOutcome({ kind: "at-stock", stock: plan.stock })
        break
      default:
        setOutcome({ kind: plan.kind })
    }
  }

  function confirmReplace() {
    if (!replace) return
    buildStore.getState().replace(slot, productId, replace.quantity)
    setReplace(null)
    setOutcome({ kind: "added" })
  }

  const { noun } = SLOT_COPY[slot]
  const keeping =
    slot === "memory" && replace && replace.quantity > 1
      ? `, keeping ${replace.quantity} kits`
      : ""

  return (
    <>
      <Button
        ref={button}
        size="lg"
        variant="outline"
        className="h-10 px-6 text-sm"
        onClick={add}
      >
        Add to build
      </Button>

      <Dialog
        open={replace !== null}
        onOpenChange={(open) => {
          if (!open) setReplace(null)
        }}
      >
        <DialogContent finalFocus={button} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-base">
              Replace the {noun} in your build?
            </DialogTitle>
            <DialogDescription className="text-sm">
              This replaces the {noun} you picked with the {name}
              {keeping}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button size="lg" onClick={confirmReplace}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Always mounted, so a new line is announced */}
      <p role="status" className="basis-full text-sm">
        {outcome && (
          <>
            {outcome.kind === "at-stock"
              ? OUTCOME_TEXT["at-stock"](outcome.stock)
              : OUTCOME_TEXT[outcome.kind]()}{" "}
            <Link
              href="/builder"
              className={cn(
                "font-medium underline underline-offset-4",
                focusRing
              )}
            >
              View build
            </Link>
          </>
        )}
      </p>
    </>
  )
}
