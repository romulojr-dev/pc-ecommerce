"use client"

import { LoaderCircleIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useEffectEvent, useRef, useState } from "react"

import { MisfitDialog } from "@/components/builder/misfit-dialog"
import { useProductFit } from "@/components/product/product-fit"
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
import {
  decideAdd,
  type LoadStatus,
  replaceNote,
} from "@/lib/build-state/add-decision"
import { planAdd } from "@/lib/build-state/plan-add"
import { SLOT_COPY } from "@/lib/build-state/slots"
import { buildStore } from "@/lib/build-state/store"
import type { Issue, Slot } from "@/lib/builder"
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
  // The click is waiting for the build's parts (no link: nothing happened yet)
  | { kind: "checking" }

const OUTCOME_TEXT = {
  added: () => "Added to your build.",
  already: () => "Already in your build.",
  "at-stock": (stock: number) =>
    `Your build already has all ${stock} we have in stock.`,
  full: () =>
    "Your build has the most parts it can hold. Remove a drive to add another.",
  checking: () => "Checking your build…",
}

// The part doesn't fit and the shopper has been asked: the errors to show,
// and for a part that also replaces another, the quantity it keeps
type Misfit = { errors: Issue[]; replaces: { quantity: number } | null }

// Add to build on the product page (docs/specs/020-builder-page, Behavior
// 18–23; docs/specs/024-add-anyway-product-page). Always one unit. A part the
// page says doesn't fit asks first, with the picker's confirmation, and a part
// that would replace another asks once. A click while the build's parts are
// loading waits for them. It renders the same on the server and the client,
// and does nothing until the saved build has been read, so it can't overwrite
// it.
export function AddToBuild({ productId, name, slot, stock }: AddToBuildProps) {
  // Reads the saved build after mounting
  const hydrated = useBuild((state) => state.hydrated)
  const { status: loaded, fit } = useProductFit()
  const status: LoadStatus = hydrated ? loaded : "loading"
  const button = useRef<HTMLButtonElement>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [replace, setReplace] = useState<{ quantity: number } | null>(null)
  const [misfit, setMisfit] = useState<Misfit | null>(null)
  const [pending, setPending] = useState(false)

  // Spec 020's table: add, raise, or ask before replacing
  function apply() {
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

  // The click, or the click that was waiting: plan from the saved build as it
  // is now, then decide with what the page knows about the fit
  function resolve() {
    const plan = planAdd(buildStore.getState().items, {
      slot,
      productId,
      stock,
    })
    const decision = decideAdd({ status, fit, plan })
    switch (decision.kind) {
      case "wait":
        setPending(true)
        setOutcome({ kind: "checking" })
        break
      case "ask":
        setOutcome(null)
        setMisfit({ errors: decision.errors, replaces: decision.replaces })
        break
      case "apply":
        apply()
    }
  }

  // Reads the latest status and fit when the load ends, without making the
  // effect depend on them
  const resolveNow = useEffectEvent(resolve)
  useEffect(() => {
    if (!pending || status === "loading") return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the load ending is the event; this hands the held click on
    setPending(false)
    resolveNow()
  }, [pending, status])

  function confirmReplace() {
    if (!replace) return
    buildStore.getState().replace(slot, productId, replace.quantity)
    setReplace(null)
    setOutcome({ kind: "added" })
  }

  function confirmMisfit() {
    if (!misfit) return
    if (misfit.replaces) {
      buildStore.getState().replace(slot, productId, misfit.replaces.quantity)
      setOutcome({ kind: "added" })
    } else {
      apply()
    }
    setMisfit(null)
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
        className="h-10 px-6 text-sm data-disabled:opacity-50"
        onClick={resolve}
        // Disabled while it waits, but still focusable and read as busy
        disabled={pending}
        focusableWhenDisabled
        aria-busy={pending || undefined}
      >
        {pending && (
          <LoaderCircleIcon
            aria-hidden="true"
            className="animate-spin motion-reduce:animate-none"
          />
        )}
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

      <MisfitDialog
        request={
          misfit && {
            partName: name,
            errors: misfit.errors,
            note: misfit.replaces
              ? replaceNote(slot, misfit.replaces.quantity)
              : undefined,
          }
        }
        onOpenChange={(open) => {
          if (!open) setMisfit(null)
        }}
        onConfirm={confirmMisfit}
        finalFocus={button}
      />

      {/* Always mounted, so a new line is announced */}
      <p role="status" className="basis-full text-sm">
        {outcome && (
          <>
            {outcome.kind === "at-stock"
              ? OUTCOME_TEXT["at-stock"](outcome.stock)
              : OUTCOME_TEXT[outcome.kind]()}
            {outcome.kind !== "checking" && (
              <>
                {" "}
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
          </>
        )}
      </p>
    </>
  )
}
