"use client"

import { useMemo } from "react"

import { BuildNotice } from "@/components/builder/build-notice"
import { BuildSummary } from "@/components/builder/build-summary"
import { type SlotEntry, SlotSection } from "@/components/builder/slot-section"
import { useBuild } from "@/hooks/use-build"
import { useBuildParts } from "@/hooks/use-build-parts"
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
// skeletons, as the server rendered them.
export function Builder() {
  const { status, build, loaded, retry } = useBuildParts()
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
        />
      </div>
    </div>
  )
}
