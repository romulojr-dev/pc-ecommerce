import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { startStatusPoller } from "./status-poller"

// docs/specs/031-pay-with-xendit: T1–T4, with fake timers

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-01T07:00:00Z"))
})
afterEach(() => vi.useRealTimers())

function setup(answers: (string | null | Error)[] = []) {
  let hidden = false
  const calls: number[] = []
  const start = Date.now()
  const onSettled = vi.fn()
  const onSlow = vi.fn()
  const poller = startStatusPoller({
    fetchStatus: async () => {
      calls.push((Date.now() - start) / 1000)
      const answer = answers.shift() ?? "PENDING_PAYMENT"
      if (answer instanceof Error) throw answer
      return answer
    },
    onSettled,
    onSlow,
    isHidden: () => hidden,
  })
  const setHidden = (value: boolean) => {
    hidden = value
    poller.visibilityChanged()
  }
  return { calls, onSettled, onSlow, setHidden, poller }
}

describe("startStatusPoller", () => {
  it("polls on the schedule and stops after 10 minutes (T1)", async () => {
    const { calls, onSlow, onSettled } = setup()

    await vi.advanceTimersByTimeAsync(59_000)
    expect(onSlow).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(calls).toHaveLength(20)
    expect(onSlow).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(calls.slice(0, 3)).toEqual([3, 6, 9])
    expect(calls[20]).toBe(75)
    expect(calls.at(-1)).toBe(600)
    expect(calls).toHaveLength(56)
    expect(onSettled).not.toHaveBeenCalled()
  })

  it("stops at the first status that isn't pending (T2)", async () => {
    const { calls, onSettled } = setup([
      "PENDING_PAYMENT",
      "PENDING_PAYMENT",
      "PAID",
    ])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(onSettled).toHaveBeenCalledWith("PAID")
    expect(onSettled).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(3)
  })

  it("tries again after a failed request (T3)", async () => {
    const { calls, onSettled } = setup([new Error("offline"), null, "PAID"])
    await vi.advanceTimersByTimeAsync(9_000)
    expect(calls).toEqual([3, 6, 9])
    expect(onSettled).toHaveBeenCalledWith("PAID")
  })

  it("pauses while hidden and asks once on return (T4)", async () => {
    const { calls, setHidden } = setup()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toEqual([3, 6, 9])

    setHidden(true)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(calls).toHaveLength(3)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toEqual([3, 6, 9, 40])
    await vi.advanceTimersByTimeAsync(3_000)
    expect(calls.at(-1)).toBe(43)
  })

  it("counts the limit from the start, hidden time included (T4)", async () => {
    const { calls, setHidden } = setup()
    setHidden(true)
    await vi.advanceTimersByTimeAsync(700_000)
    setHidden(false)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toEqual([])
  })

  it("does nothing after stop", async () => {
    const { calls, poller } = setup()
    poller.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toEqual([])
  })
})
