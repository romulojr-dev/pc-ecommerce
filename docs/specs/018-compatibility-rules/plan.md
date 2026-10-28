# 018 — Plan: Compatibility rules engine (part-to-part rules)

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #51 · ADRs: [0001](../../adr/0001-store-specs-as-jsonb.md), [0002](../../adr/0002-spec-schemas-in-code.md)

## Context

The PC Builder epic (#3) needs one rules engine that the browser and the server both run. This story adds the pure `lib/builder/` module:
- the build shape and slot limits
- a parser for untrusted builds
- the nine part-to-part rules
- `checkBuild`, `checkCandidate` / `applyCandidate` and `buildStatus`

It also adds a coverage test for the spec metadata, an ESLint purity rule over `lib/builder` and `lib/specs`, one Intel-only cooler in the seed, and the PRD wording change. There is no UI, database, migration or new dependency. #52 adds the count, capacity and power rules to the same rule list. #53 and #54 consume the API.

## Reuse

- `builderCategories`, `BuilderCategorySlug`, `Specs<C>`, `RuleId`, `FieldMeta`, the enums and `*_LABELS`, and `fieldSchemas` (it unwraps optional fields and skips `z.never`), all from `@/lib/specs` ([lib/specs/index.ts](../../../lib/specs/index.ts), [fields.ts](../../../lib/specs/fields.ts)).
- `formatSpecValue` ([lib/specs/format.ts](../../../lib/specs/format.ts)) for every value in a message. `withUnit` (which uses a non-breaking space) gets exported so lists like "120 or 280 mm" match the spec table.
- `seedFiles` ([prisma/seed/data/index.ts](../../../prisma/seed/data/index.ts)) as the source of real parts for tests. The raw arrays are used, **not** `validateSeed`, because `part-schema.ts` imports `@/generated/prisma/enums`.
- The coverage test layout and `FIXTURE_SKUS` ([prisma/seed/data/coverage.test.ts](../../../prisma/seed/data/coverage.test.ts)), and the `describe.each(categories)` pattern in [lib/specs/fields.test.ts](../../../lib/specs/fields.test.ts).
- The existing `no-restricted-imports` block in [eslint.config.mjs](../../../eslint.config.mjs) (e2e) as the model for the purity block.

## Files

```
lib/specs/categories/motherboard.ts   socket gains "cooler-socket" tag
lib/specs/format.ts                   export withUnit
lib/specs/rules-coverage.test.ts      required rule fields; RuleId × PRD category table
eslint.config.mjs                     purity block for lib/builder/** and lib/specs/**
prisma/seed/data/cpu-coolers.ts       + Noctua NH-L9i-17xx
prisma/seed/data/coverage.test.ts     both socket families have a failing cooler
test-support/seed-parts.ts            seedPart(sku) → BuildPart (sku as id), fixture helpers
lib/builder/types.ts                  Slot, BuildPart, BuildEntry, Build, BuildItem, Issue, Severity, BuildStatus
lib/builder/limits.ts (+ build.test.ts)   SLOT_LIMITS, validateBuild, InvalidBuildError
lib/builder/parse.ts (+ parse.test.ts)    buildItemsSchema, parseBuild, assembleBuild, toBuildItems, BuildChange
lib/builder/format.ts                 value(category, field, value), joinList(items, "or"|"and"), enum-order sort
lib/builder/rules/<rule>.ts (+ test)  one per rule: socket-match, memory-type, form-factor, gpu-length,
                                      cooler-height, cooler-socket, radiator-fit, psu-form-factor, bios-update
lib/builder/rules/index.ts            RULES list in PRD table order
lib/builder/check.ts (+ check.test.ts)        checkBuild, buildStatus
lib/builder/candidate.ts (+ candidate.test.ts) applyCandidate, checkCandidate
lib/builder/check.bench.ts            vitest bench, not in CI
lib/builder/index.ts                  public API (re-exports RuleId)
docs/prd.md, CLAUDE.md                wording, lib/builder notes
```

## Design

- **Types.** `Build = { [S in Slot]?: BuildEntry<S>[] }`. A small accessor `one(build, slot)` returns the single `BuildPart<S>` or `undefined`, so each rule reads typed specs without casts.
- **Rule shape.** `{ id: RuleId; severity: Severity; check(build): Issue | null }`. Each rule picks its own parts and returns `null` when a part is missing or the check passes. `checkBuild` validates, runs `RULES` in PRD order, then sorts errors before warnings with a stable sort. #52 adds its rules to `RULES`.
- **Messages.** Each rule builds its string from the templates in spec §5:
  - Single values go through `formatSpecValue(builderCategories[c].fields[f], v)`, so labels and the `mm` unit match the spec table.
  - Lists are sorted by enum order (the `options` key order, or numeric order), formatted per item without the unit, and joined with "or" or "and" (commas for three or more). `withUnit` is applied once at the end.
- **Cooler socket.** It reads the CPU's socket when a CPU is picked, otherwise the board's. `parts` names whichever part was used.
- **validateBuild.** It checks the build against `SLOT_LIMITS`, part category against slot, and duplicate storage ids, and returns every problem. `checkBuild` and `checkCandidate` throw `InvalidBuildError(problems)` when the list is non-empty.
- **parseBuild.** It parses items one at a time with `buildItemsSchema.safeParse` (no coercion), then applies the repairs in spec order: reset → invalid/unknown slot/quantity → merge storage duplicates → keep the first entry → set quantity to 1. Output is in slot order. **assembleBuild** looks each id up in a `ReadonlyMap`, drops `not-found` and `wrong-category` items, and returns the `Build` and its changes. `toBuildItems` is the inverse.
- **applyCandidate.** It deep-copies only the slot it touches (inputs are never mutated):
  - Single-part slots: the candidate replaces the part. Memory keeps the slot's quantity.
  - Storage without `replace`: the candidate is appended, or an existing entry's quantity goes up by 1.
  - Storage with `replace`: the candidate swaps into that entry's place, keeping position and quantity, and merges if the candidate is already listed. An unknown `replace` id throws.
  - `checkCandidate` returns `checkBuild(applied)` filtered to the issues whose `parts` contain `{ slot, id }` of the candidate.
- **Coverage test (first task).** A pure `ruleFieldProblems(registry)` in the test file:
  1. Walks each schema's raw shape, per branch for the cooler union, and flags rule-tagged fields that are `ZodOptional`, `ZodNullable` or `ZodDefault` (`z.never` placeholders are skipped).
  2. Checks the PRD table (rule → categories) against the tags.
  3. Runs on today's registry and on two doctored copies (an optional `maxGpuLengthMm`, the `cooler-socket` tag removed from `cpu.socket`) to prove it can fail.
- **Lint purity.** Applies to `files: ["lib/builder/**", "lib/specs/**"]` with `no-restricted-imports` patterns for `@/lib/db`, `@/lib/env`, `**/generated/prisma*`, `server-only`, `next`, `next/*`, `react`, `react-dom` and `@/prisma/*`. Test files reach seed data through `@/test-support/seed-parts`, which sits outside the restricted folders. The check found that `lib/specs` already passes.
- **Seed part.** Noctua NH-L9i-17xx:
  - Specs: AIR, 37 mm, Intel sockets only.
  - Product data: mid-tier price ≈ ₱3,295, 72-month warranty, box contents.
  - The sockets, weight and box contents are checked against noctua.at during the task; if the page lists only LGA1700, store that.
  - It is not featured and not on sale, so the spec 011 brand, tier and featured rules still pass at 151 parts.

## Verification

- `pnpm test`: every example E1–E87 maps to a test (the spec's §7 table). Seed-based tests load parts by SKU from `seedFiles`.
- `pnpm lint`: the purity rule is active, and the deliberate bad import in T2 shows it fails.
- `pnpm typecheck`: `Build` and rule typing hold with no casts in the rules.
- `pnpm exec vitest bench --run`: a sanity check on timing, not run in CI.
- `pnpm build`: shows the module bundles. No UI exists yet; #53 and #54 exercise it in the browser.
