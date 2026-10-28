# 019 — Tasks: Count, capacity and power rules with a wattage estimate

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 019, the spec 018 `checkCandidate` amendment, this plan and task list.
- [x] **T2. Power, test-first.** `power.test.ts` (E1–E9, E19–E26) red, then `power.ts` (`estimateWattage`, the three constants, the shared calculation) green. `seed-parts.ts`: the new seed parts (spec §7) and the `nb("958 W")` helper. *Verify:* the exact-percentage tests (E24–E26) fail with `watts / psuW * 100` and pass with `watts * 100 / psuW`.
- [x] **T3. Memory rules, test-first.** `memory-slots`, `memory-capacity` (E27–E36) and `plural` in `format.ts`.
- [ ] **T4. PSU wattage, test-first.** E10–E23: spec 001/011 scenarios, the 80% and 100% boundaries, GPU only, no PSU.
- [ ] **T5. M.2 slots and integrated graphics, test-first.** E37–E48.
- [ ] **T6. Register the rules.** `RULES` in full PRD order (14). `check.test.ts`: builds A/B/C unchanged (E10), E37, E49. *Verify:* every spec 018 test passes with its expectations unchanged.
- [ ] **T7. checkCandidate, test-first.** E60–E75 in `candidate.test.ts` (red under the old filter), then the baseline comparison (green). Rename the E59 test to "gives the issues it adds".
- [ ] **T8. Wrap-up.**
  - Code: `index.ts` exports; `check.bench.ts` gains a CPU-candidates bench, re-run with the timings recorded here.
  - Docs: the CLAUDE.md `lib/builder` line (`estimateWattage`, constants, new `checkCandidate` wording); tick the spec's acceptance criteria.
  - Checks: `pnpm format`, `lint`, `typecheck`, `test`, `build`.
  - PR: push with `git push -u origin HEAD` and open the PR per the repo template.
