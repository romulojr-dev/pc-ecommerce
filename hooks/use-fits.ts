"use client"

import { useMemo } from "react"

import { type PartsStatus, useBuildParts } from "@/hooks/use-build-parts"
import { type Fit, fitOf, type FitPart } from "@/lib/build-state/fit"

// How each product sits in the saved build, for the "Fits your build" hints
// (docs/specs/023-fits-your-build-hints, Behavior 13–17). One parts request
// for the whole page, whatever the number of cards, made read-only so these
// pages never change the saved build (D13). `fits` is `null` until the saved
// build has been read and its parts loaded, and when that load fails: the
// first client render then matches the server's, and a failure shows no hint.
// `status` tells those apart, for what waits on the verdict (Add to build,
// docs/specs/024-add-anyway-product-page).
export function useFitsStatus(parts: readonly FitPart[]): {
  status: PartsStatus
  fits: Fit[] | null
} {
  const { status, build } = useBuildParts({ readOnly: true })

  const fits = useMemo(
    () => (status === "ready" ? parts.map((part) => fitOf(build, part)) : null),
    [status, build, parts]
  )
  return { status, fits }
}

export function useFits(parts: readonly FitPart[]): Fit[] | null {
  return useFitsStatus(parts).fits
}
