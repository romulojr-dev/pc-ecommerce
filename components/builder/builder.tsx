"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { BuildNotice } from "@/components/builder/build-notice"
import { BuildSummary } from "@/components/builder/build-summary"
import {
  changeFocusKey,
  type OpenPicker,
  type SlotEntry,
  SlotSection,
} from "@/components/builder/slot-section"
import { ShareDialog } from "@/components/builder/share-dialog"
import { type PickerTarget, SlotPicker } from "@/components/builder/slot-picker"
import { useBuild } from "@/hooks/use-build"
import { useBuildParts } from "@/hooks/use-build-parts"
import type { BuilderCandidate } from "@/lib/build-state/candidates"
import { buildStore } from "@/lib/build-state/store"
import {
  availabilityMessage,
  buildNotice,
  buildTotal,
  unavailableParts,
} from "@/lib/build-state/summary"
import { buildStatus, checkBuild, estimateWattage, SLOTS } from "@/lib/builder"

// The builder page's client side (docs/specs/020-builder-page): the saved
// build, its parts loaded fresh, the rules run in the browser. Until the
// saved build and its parts have loaded, the slots and the summary show
// skeletons, as the server rendered them. Each slot's buttons open the slot
// picker (docs/specs/021-slot-picker).
export function Builder() {
  const { status, build, loaded, retry, addLoaded } = useBuildParts()
  const noticeChanges = useBuild((state) => state.noticeChanges)
  const ready = status === "ready"

  const summary = useMemo(() => {
    const issues = checkBuild(build)
    return {
      issues,
      status: buildStatus(issues),
      power: estimateWattage(build),
      total: buildTotal(build, loaded),
      availability: availabilityMessage(unavailableParts(build, loaded)),
      isEmpty: SLOTS.every((slot) => (build[slot] ?? []).length === 0),
    }
  }, [build, loaded])

  const { remove, setQuantity, dismissNotice } = buildStore.getState()

  // Share build's dialog (docs/specs/022-share-build). `opening` changes on
  // each click, so each opening asks the server again.
  const [share, setShare] = useState({ open: false, opening: 0 })

  // The picker's last target is kept while it closes (SlotPicker)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picker, setPicker] = useState<PickerTarget | null>(null)
  // After a pick, the slot's Change button for the new part gets focus once
  // it has rendered (Behavior 14)
  const focusAfterPick = useRef<string | null>(null)
  useEffect(() => {
    const key = focusAfterPick.current
    if (key === null) return
    const button = document.querySelector<HTMLElement>(
      `[data-focus="${CSS.escape(key)}"]`
    )
    if (button) {
      focusAfterPick.current = null
      button.focus()
    }
  })

  const openPicker: OpenPicker = (slot, trigger, replace) => {
    setPicker((previous) => ({
      slot,
      replace,
      trigger,
      opening: (previous?.opening ?? 0) + 1,
    }))
    setPickerOpen(true)
  }

  // Adds or replaces at once: the shopper opened the picker to do it (D4).
  // The store decides on the build as it is now (Rules › Adding).
  function pick(candidate: BuilderCandidate, replace: string | null) {
    if (!picker) return
    const { slot } = picker
    const { part, stock } = candidate.data
    addLoaded(candidate.data)
    const store = buildStore.getState()
    if (replace !== null) {
      store.replaceDrive(replace, part.id, stock)
    } else {
      const plan = store.add(slot, part.id, stock)
      if (plan?.kind === "confirm-replace") {
        store.replace(slot, part.id, plan.quantity)
      }
    }
    focusAfterPick.current = changeFocusKey(slot, part.id)
    setPickerOpen(false)
  }

  return (
    <div className="flex flex-col gap-6">
      <BuildNotice
        lines={buildNotice(noticeChanges)}
        onDismiss={dismissNotice}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ol aria-label="Build slots" className="flex flex-col gap-4">
          {SLOTS.map((slot) => {
            const entries: SlotEntry[] = (build[slot] ?? []).flatMap(
              ({ part, quantity }) => {
                const data = loaded.get(part.id)
                return data ? [{ quantity, data }] : []
              }
            )
            return (
              <SlotSection
                key={slot}
                slot={slot}
                entries={entries}
                loading={!ready}
                issues={summary.issues}
                onRemove={(productId) => remove(slot, productId)}
                onQuantity={(productId, quantity) =>
                  setQuantity(slot, productId, quantity)
                }
                onOpenPicker={openPicker}
              />
            )
          })}
        </ol>
        <BuildSummary
          state={status}
          isEmpty={summary.isEmpty}
          total={summary.total}
          power={summary.power}
          status={summary.status}
          issues={summary.issues}
          availability={summary.availability}
          onRetry={retry}
          canShare={ready && !summary.isEmpty}
          onShare={() =>
            setShare((previous) => ({
              open: true,
              opening: previous.opening + 1,
            }))
          }
        />
      </div>
      <ShareDialog
        open={share.open}
        opening={share.opening}
        onClose={() => setShare((previous) => ({ ...previous, open: false }))}
        nameOf={(id) => loaded.get(id)?.part.name}
      />
      <SlotPicker
        open={pickerOpen}
        target={picker}
        build={build}
        onClose={() => setPickerOpen(false)}
        onPick={pick}
      />
    </div>
  )
}
