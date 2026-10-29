"use client"

import { useMemo } from "react"

import { useBuildParts } from "@/hooks/use-build-parts"
import { type Fit, fitOf, type FitPart } from "@/lib/build-state/fit"

// How each product sits in the saved build, for the "Fits your build" hints
// (docs/specs/023-fits-your-build-hints, Behavior 13–17). One parts request
// for the whole page, whatever the number of cards, made read-only so these
// pages never change the saved build (D13). `null` until the saved build has
// been read and its parts loaded, and when that load fails: the first client
// render then matches the server's, and a failure shows no hint.
export function useFits(parts: readonly FitPart[]): Fit[] | null {
  const { status, build } = useBuildParts({ readOnly: true })

  return useMemo(
    () => (status === "ready" ? parts.map((part) => fitOf(build, part)) : null),
    [status, build, parts]
  )
}
