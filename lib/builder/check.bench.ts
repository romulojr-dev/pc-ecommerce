import { test } from "vitest"

import { buildA, seedParts } from "@/test-support/seed-parts"

import { checkCandidate } from "./candidate"
import { checkBuild } from "./check"

// A sanity check on speed, run by hand with
// `pnpm exec vitest bench --run --reporter=verbose` (the verbose reporter
// prints the timings). `pnpm test` and CI don't run it
// (docs/specs/018-compatibility-rules, D17). The real budget, 100 ms per
// build change in the slot picker, is tested in the slot picker story (#54).

const build = buildA()
const gpus = seedParts("gpu")

test("rules engine", async ({ bench }) => {
  await bench.compare(
    bench("checkBuild on a full build", () => {
      checkBuild(build)
    }),
    bench(`checkCandidate for all ${gpus.length} GPUs`, () => {
      for (const gpu of gpus) checkCandidate(build, "gpu", gpu)
    })
  )
})
