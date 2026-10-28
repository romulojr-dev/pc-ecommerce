"use client"

import { useEffect, useState } from "react"

import type {
  BuilderCandidate,
  BuilderCandidatesResponse,
} from "@/lib/build-state/candidates"
import type { Slot } from "@/lib/builder"

export type CandidatesStatus = "loading" | "error" | "ready"

type Result =
  | { key: string; ok: true; response: BuilderCandidatesResponse }
  | { key: string; ok: false }

const NO_CANDIDATES: readonly BuilderCandidate[] = []

// The slot picker's candidates (docs/specs/021-slot-picker, Behavior 4–7):
// one request each time the picker opens (`opening` changes) and on Try
// again, never cached. Nothing else asks again: the toggle and build changes
// only re-run the checks. A response for an earlier opening is ignored.
export function useCandidates(slot: Slot | null, opening: number) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const key = slot === null ? null : `${slot}:${opening}:${attempt}`

  useEffect(() => {
    if (slot === null || key === null) return
    let current = true
    fetch(`/api/builder/candidates?slot=${encodeURIComponent(slot)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return (await response.json()) as BuilderCandidatesResponse
      })
      .then((response) => {
        if (current) setResult({ key, ok: true, response })
      })
      .catch(() => {
        if (current) setResult({ key, ok: false })
      })
    return () => {
      current = false
    }
  }, [slot, key])

  const settled = result !== null && result.key === key ? result : null
  const status: CandidatesStatus =
    settled === null ? "loading" : settled.ok ? "ready" : "error"

  return {
    status,
    candidates: settled?.ok ? settled.response.candidates : NO_CANDIDATES,
    today: settled?.ok ? settled.response.today : null,
    retry: () => setAttempt((n) => n + 1),
  }
}
