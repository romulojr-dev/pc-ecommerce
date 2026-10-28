# 019 — Plan: Count, capacity and power rules with a wattage estimate

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #52 · Spec amended: [018](../018-compatibility-rules/spec.md) (`checkCandidate`)

## Context

Spec 018 (#51) shipped the pure rules engine in `lib/builder/` with nine part-to-part rules. #52 adds the last five PRD rules: memory slots, memory capacity, PSU wattage, M.2 slots and integrated graphics. It also adds `estimateWattage(build)` for #53's summary, and changes `checkCandidate` to "issues new or more severe than in the baseline", so a problem the build already has (e.g. an overloaded PSU) isn't blamed on every candidate. There is no UI, database, schema or dependency change. `lib/specs` metadata already tags every field the new rules read (E76).

## Reuse

- `Rule`, `Finding`, `one()`, `checkRule()`: [lib/builder/rules/rule.ts](../../../lib/builder/rules/rule.ts). New rules follow [memory-type.ts](../../../lib/builder/rules/memory-type.ts) and [bios-update.ts](../../../lib/builder/rules/bios-update.ts).
- `specValue` / `specList` / `joinList`: [lib/builder/format.ts](../../../lib/builder/format.ts). Watts use `specValue("psu", "wattageW", n)` and GB use `specValue("motherboard", "maxMemoryGb", n)`, so values match the spec table: non-breaking space, and en-PH grouping ("1,076 W").
- `assertValidBuild`, `InvalidBuildError`: [lib/builder/limits.ts](../../../lib/builder/limits.ts).
- `checkBuild` / `buildStatus` ([check.ts](../../../lib/builder/check.ts)) are unchanged. `applyCandidate` ([candidate.ts](../../../lib/builder/candidate.ts)) is unchanged and already throws for an unknown `replace`.
- `seedPart`, `seed`, `buildA/B/C`, `buildOf`, `swap`, `fixturePart`: [test-support/seed-parts.ts](../../../test-support/seed-parts.ts).

## Files

```
lib/builder/power.ts (+ power.test.ts)     PowerEstimate, estimateWattage, PSU_HEADROOM_TENTHS=13,
                                           OTHER_PARTS_ALLOWANCE_W=0, PSU_WARNING_PERCENT=80,
                                           internal powerOf(build) shared with the rule
lib/builder/format.ts                      + plural(n, singular, plural?) → "1 M.2 slot" / "2 M.2 slots"
lib/builder/rules/memory-slots.ts (+test)
lib/builder/rules/memory-capacity.ts (+test)
lib/builder/rules/psu-wattage.ts (+test)
lib/builder/rules/m2-slots.ts (+test)
lib/builder/rules/integrated-graphics.ts (+test)
lib/builder/rules/index.ts                 RULES in full PRD order (14)
lib/builder/candidate.ts (+test)           baseline + severity comparison
lib/builder/check.test.ts                  E10 (A/B/C still pass), E37, E49
lib/builder/check.bench.ts                 re-measure; add a CPU-candidates bench (now two checkBuilds per call)
lib/builder/index.ts                       export estimateWattage, PowerEstimate, the constants
test-support/seed-parts.ts                 new seed parts (spec §7 list) + nb("958 W") helper
docs/specs/018-…/spec.md                   checkCandidate definition amended (done with the spec)
CLAUDE.md                                  lib/builder line: estimateWattage, constants, new checkCandidate wording
```

## Design

- **Power (whole numbers only).**
  - `powerOf(build)`: `sum = (cpu?.tdpW ?? 0) + (gpu?.boardPowerW ?? 0) + OTHER_PARTS_ALLOWANCE_W`, then `watts = Math.floor((sum * 13 + 5) / 10)` (half up).
  - With a PSU: `loadPercent = Math.ceil((watts * 100) / psuW)`. Multiplying first keeps it exact; the float trap is `watts / psuW * 100`, as in E24–E26.
  - `estimateWattage` calls `assertValidBuild` first, then returns `{ watts, psuWatts, loadPercent }`, with nulls when there's no PSU.
- **psu-wattage rule.** Silent without a PSU, or without both a CPU and a GPU.
  - Error when `watts > psuW`; warning when `watts * 100 > psuW * PSU_WARNING_PERCENT`.
  - `parts`: [cpu?, gpu?, psu].
  - Message `{loads}`: "the {cpu} and the {gpu} need", or "the {x} needs". Watts and the PSU's wattage go through `specValue`.
- **memory-slots / memory-capacity.** Read `build.memory[0]` for the kit and its quantity. Messages branch on quantity 1 vs more than 1. Totals go through `specValue`.
- **m2-slots.** Collect storage entries whose `formFactor` starts with `M2_` and sum their quantities. Silent with no board or no M.2 drive.
  - `parts`: board, then the M.2 drives in storage order.
  - When `m2Slots === 0`, use the "has no M.2 slots" message.
  - `extra = count − slots`, written with `plural`.
- **integrated-graphics.** CPU picked, GPU slot empty or `[]`, and `!hasIntegratedGraphics`. `parts`: [cpu].
- **checkCandidate.**
  - `after = checkBuild(applyCandidate(…))`. Build `baseline` from the input: storage without `replace` → the build as given; storage with `replace` → storage without that id; any other slot → `{ ...build, [slot]: [] }`.
  - `before = Map(rule → severity)` from `checkBuild(baseline)`.
  - Keep the `after` issues where `rank(severity) > rank(before.get(rule))`, with none 0 < warning 1 < error 2.
  - `applyCandidate` runs first, so category and `replace` errors still throw.
- **Tests.**
  - Every rule test goes through `checkRule(rule, build)`, like today.
  - Expected messages use plain spaces, except formatted values wrapped in a new `nb("958 W")` helper (non-breaking space before the unit). `nbsp()` can't be used on whole messages, because memory names contain " GB".
  - Fixtures, via `fixturePart`: PSUs at 329, 263 and 900 W, a 64 GB-max DDR5 board, and a board with 0 M.2 slots.

## Verification

- `pnpm test`: each example E1–E76 maps to a test (the spec's §7 table). The spec 018 suites pass with their expectations unchanged.
- `pnpm lint`: the purity rule covers the new files (only `zod`, `@/lib/specs` and local imports).
- `pnpm typecheck`: rules read typed specs through `one()`, with no casts beyond the existing ones.
- `pnpm exec vitest bench --run --reporter=verbose`: `checkCandidate` cost is about 2× today's (around 40 µs for 30 GPUs, per spec 018 T8). It stays far under #54's 100 ms budget.
- `pnpm build`: the module bundles. There's no UI to check on the preview URL until #53, as spec 019 §7 notes.
