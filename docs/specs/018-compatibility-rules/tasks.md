# 018 — Tasks: Compatibility rules engine (part-to-part rules)

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Spec data coverage.** `lib/specs/rules-coverage.test.ts` (E82–E85) and the `cooler-socket` tag on `motherboard.socket`. *Verify:* the test fails on both doctored copies and passes on the real registry.
- [x] **T2. Purity lint.** The ESLint block for both folders. *Verify:* `pnpm lint` passes, and a temporary `import { db } from "@/lib/db"` in a `lib/specs` file fails (then reverted) (E87).
- [x] **T3. Seed cooler.** NH-L9i-17xx plus the coverage check (E86). *Verify:* `pnpm test` passes (151 parts) and `pnpm db:seed` on the dev branch gives 1 created.
- [x] **T4. Types, limits, validateBuild.** `types.ts`, `limits.ts`, `build.test.ts` (E60–E68), written first.
- [x] **T5. parseBuild / assembleBuild.** `parse.ts`, `parse.test.ts` (E69–E81), written first. (`test-support/seed-parts.ts` landed in T4.)
- [ ] **T6. Rules, test-first.** `format.ts`, then each rule's test (red), then the rule (green), in PRD order (E5–E42). This can be one commit per rule or per pair of rules.
- [ ] **T7. checkBuild, buildStatus, candidates.** `check.ts`, `candidate.ts` and their tests (E1–E4, E43–E59), plus the `index.ts` API.
- [ ] **T8. Bench.** `check.bench.ts`. *Verify:* `pnpm exec vitest bench --run` prints timings, and `pnpm test` doesn't run it.
- [ ] **T9. Docs and wrap-up.**
  - Docs: the PRD intro and Flow step 2 wording; CLAUDE.md lines on `lib/builder` and the purity rule; tick the spec's acceptance criteria.
  - Data: check the NH-L9i-17xx (sockets, weight, box contents) against its `sourceUrl` by hand, then remove its TODO. T3 drafted it while noctua.at refused automated fetches.
  - Checks: `pnpm format`, `lint`, `typecheck`, `test`, `build`.
  - PR: push with `git push -u origin HEAD` and open the PR per the repo template.
  - After merge: update the online PRD doc to match.
