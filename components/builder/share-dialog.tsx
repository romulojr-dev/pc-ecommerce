"use client"

import { useEffect, useRef, useState } from "react"

import { shareBuildAction } from "@/app/(store)/builder/actions"
import {
  type CopyState,
  ShareDialogBody,
  type SharePhase,
} from "@/components/builder/share-dialog-body"
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
import type { ShareResult } from "@/lib/build-state/share"
import {
  SHARE_ERROR_GENERIC,
  shareErrorText,
} from "@/lib/build-state/share-copy"
import { buildStore } from "@/lib/build-state/store"

type Props = {
  open: boolean
  // Changes each time Share build is clicked, so each opening asks again
  opening: number
  onClose: () => void
  // A loaded part's name from its id, for the quantity message
  nameOf: (productId: string) => string | undefined
}

type Result = { key: string; phase: SharePhase }

// Share build's dialog: sends the saved build's items to the server action as
// soon as it opens, then shows the link (docs/specs/022-share-build,
// Behavior 3–9). A response that arrives after the dialog closed, or after
// another opening, is ignored.
export function ShareDialog({ open, opening, onClose, nameOf }: Props) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState<{ key: string; state: CopyState }>()
  const input = useRef<HTMLInputElement>(null)
  const names = useRef(nameOf)
  useEffect(() => {
    names.current = nameOf
  })

  const key = open ? `${opening}:${attempt}` : null

  useEffect(() => {
    if (key === null) return
    let current = true
    // The items as they are at this moment, read from the store
    const items = buildStore.getState().items
    shareBuildAction(items)
      .then((response: ShareResult) => {
        if (!current) return
        setResult({
          key,
          phase: response.ok
            ? {
                kind: "created",
                url: `${window.location.origin}/builds/${response.slug}`,
              }
            : {
                kind: "error",
                message: shareErrorText(response, (id) => names.current(id)),
              },
        })
      })
      .catch(() => {
        if (current) {
          setResult({
            key,
            phase: { kind: "error", message: SHARE_ERROR_GENERIC },
          })
        }
      })
    return () => {
      current = false
    }
  }, [key])

  const phase: SharePhase =
    result !== null && result.key === key ? result.phase : { kind: "creating" }
  const copyState: CopyState =
    copied !== undefined && copied.key === key ? copied.state : "idle"

  // The link is selected, so Ctrl+C works even where Copy link can't
  const created = phase.kind === "created"
  useEffect(() => {
    if (created) {
      input.current?.focus()
      input.current?.select()
    }
  }, [created, key])

  async function copy() {
    if (phase.kind !== "created" || key === null) return
    try {
      await navigator.clipboard.writeText(phase.url)
      setCopied({ key, state: "copied" })
    } catch {
      setCopied({ key, state: "failed" })
      input.current?.select()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Share your build</DialogTitle>
          <DialogDescription className="sr-only">
            Anyone with the link can see these parts and open them in their own
            builder.
          </DialogDescription>
        </DialogHeader>
        <ShareDialogBody
          phase={phase}
          copy={copyState}
          onCopy={copy}
          onRetry={() => setAttempt((n) => n + 1)}
          inputRef={input}
        />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="lg" />}>
            Close
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
