"use client"

import { useEffect, useMemo, useState } from "react"

import { useBuild } from "@/hooks/use-build"
import {
  assembleLoaded,
  goneChanges,
  partsRequest,
  unreturnedIds,
} from "@/lib/build-state/loader"
import type { BuilderPartData } from "@/lib/build-state/parts"
import { buildStore } from "@/lib/build-state/store"

export type PartsStatus = "loading" | "ready" | "error"

async function fetchParts(ids: string): Promise<BuilderPartData[]> {
  const response = await fetch(
    `/api/builder/parts?ids=${encodeURIComponent(ids)}`,
    { cache: "no-store" }
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return ((await response.json()) as { parts: BuilderPartData[] }).parts
}

// The saved build with its parts, loaded fresh from the server
// (docs/specs/020-builder-page, Behavior 5–8). A request is made only when
// an id isn't loaded yet; an older response is ignored once a newer request
// starts. Parts are dropped from the saved build only after a successful
// response, never on an error.
//
// `readOnly` is for pages that can't show a notice (docs/specs/023-fits-your-
// build-hints, D13): only a page that can show one may change the saved build.
// There a part the server doesn't return is remembered and left out of the
// build and of later requests, and never dropped, so the status still reaches
// "ready" and /builder removes the part later, with its notice.
export function useBuildParts({ readOnly = false } = {}) {
  const items = useBuild((state) => state.items)
  const hydrated = useBuild((state) => state.hydrated)
  const [loaded, setLoaded] = useState<ReadonlyMap<string, BuilderPartData>>(
    () => new Map()
  )
  // The request that failed, until Try again (or a change to the build)
  const [failed, setFailed] = useState<string | null>(null)
  // Read-only only: ids a response showed to be gone
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())

  const request = hydrated
    ? partsRequest(items, loaded, readOnly ? gone : undefined)
    : null

  useEffect(() => {
    if (request === null || request === failed) return
    let current = true
    fetchParts(request)
      .then((parts) => {
        if (!current) return
        const next = new Map(parts.map((data) => [data.part.id, data]))
        const requested = new Set(request.split(","))
        // Set together, so the render after this sees both
        setLoaded(next)
        if (readOnly) {
          setGone(
            (previous) =>
              new Set([...previous, ...unreturnedIds(requested, next)])
          )
        } else {
          buildStore
            .getState()
            .drop(goneChanges(buildStore.getState().items, next, requested))
        }
      })
      .catch(() => {
        if (current) setFailed(request)
      })
    return () => {
      current = false
    }
  }, [request, failed, readOnly])

  // A reload asks for every saved part again, though they are all loaded,
  // and swaps the answers in without leaving "ready" (docs/specs/026-add-
  // build-to-cart, D14). A failed reload changes nothing: the parts the
  // page already shows stay.
  const [reloads, setReloads] = useState(0)
  useEffect(() => {
    if (reloads === 0) return
    const ids = [
      ...new Set(buildStore.getState().items.map((item) => item.productId)),
    ]
    if (ids.length === 0) return
    let current = true
    fetchParts(ids.join(","))
      .then((parts) => {
        if (!current) return
        const next = new Map(parts.map((data) => [data.part.id, data]))
        const requested = new Set(ids)
        setLoaded((previous) => {
          const merged = new Map(previous)
          for (const id of requested) merged.delete(id)
          for (const [id, data] of next) merged.set(id, data)
          return merged
        })
        if (readOnly) {
          setGone(
            (previous) =>
              new Set([...previous, ...unreturnedIds(requested, next)])
          )
        } else {
          buildStore
            .getState()
            .drop(goneChanges(buildStore.getState().items, next, requested))
        }
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [reloads, readOnly])

  const build = useMemo(
    () => assembleLoaded(items, loaded).build,
    [items, loaded]
  )

  const status: PartsStatus = !hydrated
    ? "loading"
    : request === null
      ? "ready"
      : request === failed
        ? "error"
        : "loading"

  return {
    status,
    items,
    build,
    loaded,
    retry: () => setFailed(null),
    reload: () => setReloads((count) => count + 1),
    // A part the slot picker has just loaded fresh: call it before adding
    // the part to the store, so the slot shows it with no request
    // (docs/specs/021-slot-picker, D11)
    addLoaded: (data: BuilderPartData) =>
      setLoaded((previous) => new Map(previous).set(data.part.id, data)),
  }
}
