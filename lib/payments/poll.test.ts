import { describe, expect, it } from "vitest"

import { isSlow, pollDelay } from "./poll"

// docs/specs/031-pay-with-xendit: T1

describe("pollDelay", () => {
  it("polls every 3 s for a minute, then every 15 s until 10 minutes", () => {
    const polls: number[] = []
    let elapsed = 0
    for (let delay = pollDelay(elapsed); delay !== null;) {
      elapsed += delay
      polls.push(elapsed / 1000)
      delay = pollDelay(elapsed)
    }
    expect(polls.slice(0, 20)).toEqual(
      Array.from({ length: 20 }, (_, i) => (i + 1) * 3)
    )
    expect(polls[20]).toBe(75)
    expect(polls.at(-1)).toBe(600)
    expect(polls).toHaveLength(56)
  })

  it("says Still confirming from 60 s", () => {
    expect(isSlow(59_999)).toBe(false)
    expect(isSlow(60_000)).toBe(true)
  })
})
