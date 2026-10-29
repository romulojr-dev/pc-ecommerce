import { expect, test } from "vitest"

import { PAGE_SIZE } from "@/lib/listing-params"
import { ruleSpecsOf } from "@/lib/specs"
import { buildA, seedParts } from "@/test-support/seed-parts"

import { fitOf, type FitPart } from "./fit"

// A listing page's hints must not slow the page down
// (docs/specs/023-fits-your-build-hints, Rules › The verdict): 24 verdicts,
// a page of cards (PAGE_SIZE), against a full build, in under 50 ms, the
// picker's budget (docs/specs/021-slot-picker, D9). It measures under 1 ms,
// so the limit only catches a real regression. The warm-up keeps JIT
// compilation out of the timing, and the median ignores a run slowed by a
// busy CI machine.

const WARM_UP_RUNS = 5
const TIMED_RUNS = 20
const LIMIT_MS = 50

test("a page of 24 verdicts against a full build is well inside the budget", () => {
  const build = buildA()
  const parts: FitPart[] = seedParts("gpu")
    .slice(0, PAGE_SIZE)
    .map((part) => ({
      id: part.id,
      slot: part.category,
      name: part.name,
      ruleSpecs: ruleSpecsOf(part.category, part.specs),
    }))
  expect(parts).toHaveLength(PAGE_SIZE)
  const run = () => parts.map((part) => fitOf(build, part))

  for (let i = 0; i < WARM_UP_RUNS; i++) run()
  const times = Array.from({ length: TIMED_RUNS }, () => {
    const start = performance.now()
    run()
    return performance.now() - start
  }).sort((a, b) => a - b)
  const median = (times[TIMED_RUNS / 2 - 1] + times[TIMED_RUNS / 2]) / 2

  expect(median).toBeLessThan(LIMIT_MS)
})
