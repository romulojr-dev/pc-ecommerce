"use client"

import { useRef, useState } from "react"

import { addBuildToCartAction } from "@/app/(store)/cart/actions"
import type { WarningsRequest } from "@/components/builder/warnings-dialog"
import { useBuild } from "@/hooks/use-build"
import { acknowledgedKeys } from "@/lib/build-state/warnings"
import { buildStore } from "@/lib/build-state/store"
import type { Issue } from "@/lib/builder"
import {
  type BuildResultView,
  buildResultView,
  FAILED_VIEW,
  reloadsParts,
} from "@/lib/cart/build-result"
import { cartCountStore } from "@/lib/cart/count-store"

// Add build to cart on /builder (docs/specs/026-add-build-to-cart, Behavior
// 3–8): a click on a build with warnings opens the dialog first; confirming
// sends the items and the keys of the warnings it showed. The server decides
// again, and may send back warnings the shopper hasn't seen, which reopen the
// dialog. The saved build is never changed by adding it.
export function useAddBuildToCart({
  warnings,
  reload,
  nameOf,
}: {
  // The client's own warnings for the build as it is now
  warnings: readonly Issue[]
  // Loads the build's parts again (D14)
  reload: () => void
  // A loaded part's name from its id, for the quantity message
  nameOf: (productId: string) => string | undefined
}) {
  const items = useBuild((state) => state.items)
  const [sending, setSending] = useState(false)
  const [dialog, setDialog] = useState<WarningsRequest | null>(null)
  // A result belongs to the build it was made for: once the items change, it
  // no longer describes this build and is not shown
  const [stored, setStored] = useState<{
    items: typeof items
    view: BuildResultView
  } | null>(null)
  const result = stored && stored.items === items ? stored.view : null
  // A second click while a request is out is ignored even before React has
  // rendered the disabled button
  const inFlight = useRef(false)

  async function send(acknowledged: string[]) {
    if (inFlight.current) return
    inFlight.current = true
    setSending(true)
    // The items as they are at this moment, read from the store
    const sent = buildStore.getState().items
    try {
      const response = await addBuildToCartAction({
        items: sent,
        acknowledgedWarnings: acknowledged,
      })
      if (response.ok) cartCountStore.getState().fromAction(response.count)
      if (reloadsParts(response)) reload()
      const view = buildResultView(response, nameOf)
      if (view.kind === "confirm") {
        setStored(null)
        setDialog({ warnings: view.warnings, changed: true })
      } else {
        setStored({ items: sent, view })
      }
    } catch {
      setStored({ items: sent, view: FAILED_VIEW })
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return {
    sending,
    result,
    dialog,
    click() {
      if (inFlight.current) return
      const own = warnings.filter((warning) => warning.severity === "warning")
      if (own.length > 0) {
        setStored(null)
        setDialog({ warnings: own, changed: false })
      } else {
        void send([])
      }
    },
    confirm() {
      if (!dialog) return
      const keys = acknowledgedKeys(dialog.warnings)
      setDialog(null)
      void send(keys)
    },
    closeDialog: () => setDialog(null),
  }
}
