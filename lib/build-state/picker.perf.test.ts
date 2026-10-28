import { expect, test } from "vitest"

import { seedCandidates } from "@/test-support/seed-candidates"
import { buildA } from "@/test-support/seed-parts"

import { pickerList } from "./picker"

// The builder's 100 ms feedback budget (PRD, Non-functional requirements),
// checked in CI (docs/specs/021-slot-picker, E39 and D9). The picker's whole
// re-check for one build change, on the largest category (30 graphics cards)
// against a full build, must take under half the budget: the other half is
// React's render. It measures under 1 ms, so the limit only catches a real
// regression. The warm-up keeps JIT compilation out of the timing, and the
// median ignores a run slowed by a busy CI machine.

const WARM_UP_RUNS = 5
const TIMED_RUNS = 20
const LIMIT_MS = 50

test("the picker re-checks the largest category within the budget (E39)", () => {
  const build = buildA()
  const candidates = seedCandidates("gpu")
  expect(candidates).toHaveLength(30)
  const run = () => pickerList(build, "gpu", candidates, { showAll: true })

  for (let i = 0; i < WARM_UP_RUNS; i++) run()
  const times = Array.from({ length: TIMED_RUNS }, () => {
    const start = performance.now()
    run()
    return performance.now() - start
  }).sort((a, b) => a - b)
  const median = (times[TIMED_RUNS / 2 - 1] + times[TIMED_RUNS / 2]) / 2

  expect(median).toBeLessThan(LIMIT_MS)
})
