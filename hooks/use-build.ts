"use client"

import { useEffect } from "react"
import { useStore } from "zustand"

import {
  BUILD_STORAGE_KEY,
  buildStore,
  type BuildState,
} from "@/lib/build-state/store"

let started = false

// Reads the saved build once, after the first mount, and again whenever
// another tab changes it (docs/specs/020-builder-page, Behavior 3–4)
function start() {
  if (started) return
  started = true
  buildStore.persist.rehydrate()
  window.addEventListener("storage", (event) => {
    // key is null when another tab clears all of localStorage
    if (event.key === BUILD_STORAGE_KEY || event.key === null) {
      buildStore.persist.rehydrate()
    }
  })
}

// The saved build. The server render and the first client render both see
// the empty, unread store (zustand's server snapshot is the initial state),
// so there is no hydration mismatch; the read happens after mounting.
export function useBuild<T>(selector: (state: BuildState) => T): T {
  useEffect(start, [])
  return useStore(buildStore, selector)
}
