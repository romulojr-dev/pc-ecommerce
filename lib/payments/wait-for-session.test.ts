import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { StartResult } from "./start-payment"
import { OPENING_WAIT_MS, waitForSession } from "./wait-for-session"

// docs/specs/034-start-payment-outside-transaction, behavior 6 and 8, W1–W3

const opening: StartResult = { ok: false, reason: "opening" }
const opened: StartResult = { ok: true, url: "/test-payment/ps-1?key=k" }

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// Answers in turn, then the last one forever
function answers(...list: StartResult[]) {
  const times: number[] = []
  const start = vi.fn(async () => {
    times.push(Date.now())
    return list[Math.min(times.length - 1, list.length - 1)]
  })
  return { start, times }
}

describe("waitForSession", () => {
  it("returns the first answer that isn't opening", async () => {
    const { start } = answers(opened)
    await expect(waitForSession(start)).resolves.toEqual(opened)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it("asks again a second later while opening (W1)", async () => {
    const { start, times } = answers(opening, opened)
    const result = waitForSession(start)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toEqual(opened)
    expect(times.map((t) => t - times[0])).toEqual([0, 1_000])
  })

  it("gives up after 30 s with an error, 30 asks in all (W2)", async () => {
    const { start, times } = answers(opening)
    const result = waitForSession(start)
    await vi.advanceTimersByTimeAsync(OPENING_WAIT_MS)
    await expect(result).resolves.toEqual({ ok: false, reason: "error" })
    expect(start).toHaveBeenCalledTimes(30)
    expect(times.at(-1)! - times[0]).toBe(29_000)
  })

  it("stops on confirming (W3)", async () => {
    const confirming: StartResult = { ok: false, reason: "confirming" }
    const { start } = answers(opening, confirming)
    const result = waitForSession(start)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toEqual(confirming)
  })

  it("treats a failed ask as an error and stops", async () => {
    const start = vi
      .fn<() => Promise<StartResult>>()
      .mockResolvedValueOnce(opening)
      .mockRejectedValueOnce(new Error("offline"))
    const result = waitForSession(start)
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toEqual({ ok: false, reason: "error" })
    expect(start).toHaveBeenCalledTimes(2)
  })

  it("waits before the first ask when it was already made", async () => {
    const { start, times } = answers(opened)
    const began = Date.now()
    const result = waitForSession(start, { skipFirst: true })
    await vi.advanceTimersByTimeAsync(1_000)
    await expect(result).resolves.toEqual(opened)
    expect(times).toEqual([began + 1_000])
  })
})
