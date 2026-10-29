"use client"

import { useRouter } from "next/navigation"
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
import type { SharedBuildView } from "@/lib/build-state/shared"
import { buildStore } from "@/lib/build-state/store"
import { canonicalText } from "@/lib/builder"

// What the dialog says about the build it would replace
export function replaceBody(count: number): string {
  return `Opening this build replaces the ${count} ${count === 1 ? "part" : "parts"} in your builder.`
}

// Open in builder (docs/specs/022-share-build, Behavior 20–26). The shared
// items were already parsed and assembled on the server (`plan`); this saves
// them as the shopper's build and goes to /builder by client navigation, so
// the in-memory notice about parts left out survives. It does nothing until
// the saved build has been read, and its label never depends on it, so the
// server and the first client render match.
export function OpenInBuilder({ plan }: { plan: SharedBuildView["openPlan"] }) {
  const router = useRouter()
  // Reads the saved build after mounting; the count in the dialog follows it
  const savedCount = useBuild((state) => state.items.length)
  const button = useRef<HTMLButtonElement>(null)
  const [asking, setAsking] = useState(false)

  function open() {
    // The store as it is now: another tab may have changed it
    const { hydrated, items } = buildStore.getState()
    if (!hydrated) return
    if (items.length === 0) return replace()
    // Already the build that was shared: nothing to replace (D6). /builder
    // loads it as usual, and drops any part that is gone.
    if (canonicalText(items) === canonicalText(plan.snapshotItems)) {
      return router.push("/builder")
    }
    setAsking(true)
  }

  function replace() {
    buildStore.getState().load(plan.items, plan.changes)
    setAsking(false)
    router.push("/builder")
  }

  return (
    <>
      <Button ref={button} size="lg" className="h-10 text-sm" onClick={open}>
        Open in builder
      </Button>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent finalFocus={button} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="text-base">
              Replace your current build?
            </DialogTitle>
            <DialogDescription className="text-sm">
              {replaceBody(savedCount)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" />}>
              Cancel
            </DialogClose>
            <Button size="lg" onClick={replace}>
              Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
