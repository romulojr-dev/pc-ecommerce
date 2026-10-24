# 003 — Tasks: test tooling and CI

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #11

Work top to bottom, one task at a time. Each task leaves `pnpm lint` and `pnpm typecheck` passing. The story ships as one commit (task 6).

- [x] **T1. Vitest and seed tests.** Add `vitest`, bump `@types/node` to `^24`, set `packageManager`, add `test` / `test:watch`, `vitest.config.ts`, and `prisma/seed/validate.test.ts` (all seed files validate; one case per rule-critical field).
  - Verify: `pnpm test` passes with `.env.local` renamed. Remove `socket` from a CPU → test fails naming the part and `specs.socket`. Make CPU `socket` `.optional()` → that case fails. Revert both.

- [x] **T2. Playwright and home smoke test.** Add `@playwright/test`, `test:e2e`, `playwright.config.ts`, gitignore entries, `e2e/home.spec.ts`; install Chromium.
  - Verify: `pnpm test:e2e` passes against the dev server. Remove `<SkipLink />` → it fails. Revert.

- [x] **T3. Local CI dry run.** Throwaway `postgres:17` in Docker, CI env vars in the shell, then install, lint, typecheck, `db:deploy`, test, build, `test:e2e` in CI order.
  - Verify: every step passes; the Neon dev branch is untouched; container stopped.

- [x] **T4. CI workflow.** Write `.github/workflows/ci.yml` (job `ci`) with the Postgres service, env and steps from the plan.
  - Verify: steps and env match the T3 run exactly; `pnpm lint` and `pnpm typecheck` still pass.

- [x] **T5. Docs.** CLAUDE.md commands and test locations; README "Testing" section.
  - Verify: every command listed works as written.

- [ ] **T6. Ship.** One commit, `git push -u origin HEAD`, PR closing #11 with the spec files; branch protection on `main` requires `ci`.
  - Verify: CI passes on the PR; branch protection shows `ci` as required.
