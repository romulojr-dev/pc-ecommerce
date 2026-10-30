"use client"

import { useEffect, useState } from "react"

import { PSGC_VERSION } from "@/lib/psgc/version"

// One PSGC address file for the checkout's dropdowns
// (docs/specs/029-checkout-steps, Behavior 12). The files never change for a
// version (the route sends them as immutable), so each is fetched once per
// page load; a failed request isn't kept, so Try again asks again.

const cache = new Map<string, Promise<unknown>>()

function load(path: string): Promise<unknown> {
  let request = cache.get(path)
  if (!request) {
    request = fetch(`/api/psgc/${PSGC_VERSION}/${path}`).then((response) => {
      if (!response.ok) throw new Error(`PSGC ${path}: ${response.status}`)
      return response.json()
    })
    cache.set(path, request)
    request.catch(() => cache.delete(path))
  }
  return request
}

export type PsgcList<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: T }

// `path` is the file under the version ("regions.json",
// "provinces/{code}.json", "cities/{code}.json"); null means nothing to load
// yet (the parent isn't chosen)
export function usePsgcList<T>(path: string | null): PsgcList<T> {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    key: string
    data?: T
    failed?: boolean
  } | null>(null)
  const key = path === null ? null : `${path}#${attempt}`

  useEffect(() => {
    if (path === null || key === null) return
    let live = true
    load(path)
      .then((data) => live && setResult({ key, data: data as T }))
      .catch(() => live && setResult({ key, failed: true }))
    return () => {
      live = false
    }
  }, [path, key])

  if (key === null) return { status: "idle" }
  if (result?.key !== key) return { status: "loading" }
  if (result.failed) {
    return { status: "error", retry: () => setAttempt((n) => n + 1) }
  }
  return { status: "ready", data: result.data as T }
}
