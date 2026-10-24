# 003 — Plan: test tooling and CI

Status: **Approved** · Spec: [spec.md](spec.md) (approved) · Tasks: [tasks.md](tasks.md) · Issue: #11

This plan explains how the approved spec is built: which files are added, how they fit together, and why. Behavior (what each test checks, CI step order, env values) is defined in the spec and not repeated here.

## Context

Story 4 of the Foundations milestone. The repo has lint and typecheck but no test runner and no CI, so nothing stops a broken PR from merging. This story adds Vitest and Playwright, the first real tests (seed catalog and home page smoke test), and a GitHub Actions workflow that branch protection can require.

## Summary

- **Vitest 5** for unit tests, in Node (no jsdom, no React plugin: there are no component tests yet). Unit tests are `*.test.ts`, colocated with the code they test.
- **Playwright** for E2E, Chromium only. E2E tests are `e2e/*.spec.ts`. The different suffixes keep the two runners from picking up each other's files.
- **The seed tests reuse `validateSeed()`** ([prisma/seed/validate.ts](../../../prisma/seed/validate.ts)) and `seedFiles` ([prisma/seed/data/index.ts](../../../prisma/seed/data/index.ts)). Rule-critical fields come from `builderCategories[slug].fields[*].rules` ([lib/specs/registry.ts](../../../lib/specs/registry.ts)). No new production code.
- **One workflow, one job** (`.github/workflows/ci.yml`). Steps run in the spec's order in one job, because each one needs the install and the generated Prisma client. Parallel jobs would each repeat the install for little gain at this size.
- **Every check runs locally first**, with CI-equivalent env against a throwaway Docker Postgres, before the workflow is written.
- **No Prisma schema change, no migration, no app code change.**

## Files

```
package.json                   packageManager, scripts, dev deps, @types/node ^24
vitest.config.ts               Node env, tsconfig paths, include/exclude
playwright.config.ts           Chromium, 1280×800, webServer, baseURL
prisma/seed/validate.test.ts   seed validation + rule-critical field cases
e2e/home.spec.ts               home page smoke test
.github/workflows/ci.yml       the CI job
.gitignore                     test-results/, playwright-report/, blob-report/
CLAUDE.md, README.md           commands and how to run tests
```

## Dependencies and package.json

- Dev deps: `vitest`, `@playwright/test` (latest at install time).
- Bump `@types/node` from `^20` to `^24`: it matches `engines.node` (24.x) and Vitest 5's peer range (`^22 || >=24`), which `^20` violates.
- `"packageManager": "pnpm@11.24.0"`. `pnpm/action-setup` reads it, so CI needs no version input.
- Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`. `typecheck` is unchanged.
- No new entries in `pnpm-workspace.yaml` `allowBuilds` expected (Playwright browsers are installed by an explicit command, not a postinstall). If pnpm asks to approve a build script, decide then.

## Vitest

`vitest.config.ts` (ESM, since `package.json` has `"type": "module"`):

- `resolve.tsconfigPaths: true` (built into Vite 8, which Vitest 5 uses) resolves `@/…`. Fallback if it doesn't cover our `paths`: the `vite-tsconfig-paths` plugin, as in the Next.js Vitest guide.
- `test.environment: "node"`, `test.include: ["**/*.test.ts"]`, exclude `node_modules`, `.next`, `generated`, `e2e`.

**Why the tests need no env:** the import chain `validate.ts → part-schema.ts → lib/specs, lib/slug, @/generated/prisma/enums` never reaches `lib/env` or `lib/db`. `generated/prisma/enums.ts` is plain `const` objects. It exists after `pnpm install` (postinstall runs `prisma generate`), which is true locally and in CI.

### `prisma/seed/validate.test.ts`

1. **All seed files validate.** `validateSeed(seedFiles)`. On failure, the assertion message is `formatErrors(result.errors)` ([prisma/seed/format-errors.ts](../../../prisma/seed/format-errors.ts)), so the test output reads like the seed command's report.
2. **Every rule-critical field is required.** Cases are built at collection time:
   - for each `[slug, { fields }]` of `builderCategories`, each field with `rules?.length`;
   - base part = first part in that category's `seedFiles` entry whose `specs` has the field (`Object.hasOwn`);
   - `test.each` over the cases, named `"<slug>: rejects a part without specs.<field> (<rules>)"`.
   - Each case deep-clones the base part (`structuredClone`), deletes `specs[field]`, and runs `validateSeed([{ file, category, parts: [part] }])`. A one-part file avoids duplicate-SKU noise. It expects `ok: false` and an error with `index: 0`, the part's `sku`, and `path: ["specs", field]`.
   - A field with no base part becomes a case that fails with `"<slug>.<field>: no seed part has this field"`, so coverage gaps can't pass silently.

Edge to confirm while implementing: removing the cooler's discriminator `type` produces an `invalid_union` issue. It must still be reported at `specs.type`. If Zod reports it at `specs` instead, the test is right to fail, and the fix belongs in `describeIssue`, not in the test.

## Playwright

`playwright.config.ts`:

- `testDir: "e2e"`, one project `chromium` (`devices["Desktop Chrome"]`, viewport 1280×800).
- `use.baseURL: "http://localhost:3000"`, `trace: "on-first-retry"`.
- `forbidOnly` and `retries: 2` only on CI; `reporter` `"html"` (plus `"github"` on CI) with `open: "never"`.
- `webServer`: `command` = `pnpm start` when `process.env.CI`, else `pnpm dev`; `url` = baseURL; `reuseExistingServer: !process.env.CI`. CI runs `pnpm build` in an earlier step, so `pnpm start` serves that build.
- Reading `process.env.CI` here is fine: the "no direct `process.env`" rule is for app code, and this is test tooling that `lib/env` doesn't cover.

`e2e/home.spec.ts` uses role-based locators scoped to `page.getByRole("banner")` (the header; the footer has a second logo):

- `page.goto("/")` response `ok()`; `toHaveTitle("PC Silicon")`.
- link "PC Silicon home" visible, with text `pcsilicon` (the wordmark);
- `getByRole("searchbox", { name: "Search parts" })` visible;
- `page.keyboard.press("Tab")`, then the link "Skip to content" is focused (`toBeFocused()`).

The server needs valid env because `next.config.ts` imports `lib/env`. Locally it comes from `.env.local`, in CI from the job env.

## CI workflow

`.github/workflows/ci.yml`:

- `on: pull_request` and `push: branches: [main]`; `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`; `permissions: contents: read`.
- Job `ci` (the name branch protection will require) on `ubuntu-latest`, `timeout-minutes: 20`.
- `services.postgres`: `postgres:17`, `POSTGRES_USER/PASSWORD: postgres`, `POSTGRES_DB: pcsilicon`, port 5432, health check `pg_isready` (interval 5s, retries 10).
- Job `env`: the three variables from the spec's table.
- Steps: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (`node-version: 24`, `cache: pnpm`), then the spec's steps 2–8 as `pnpm …` commands, with `pnpm exec playwright install --with-deps chromium` before E2E, and `actions/upload-artifact` of `playwright-report/` `if: failure()`. Action majors are checked against their current releases when writing the file.

## Local verification before writing CI

Mirror CI on this machine against a throwaway Postgres, not Neon:

1. `docker run --rm -d --name pcsilicon-ci -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pcsilicon -p 5433:5432 postgres:17` (port 5433 avoids clashing with any local Postgres). Needs Docker Desktop running.
2. In one shell, export `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (both `postgresql://postgres:postgres@localhost:5433/pcsilicon`), `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and `CI=1`. Shell vars win over `.env.local` for both dotenv (Prisma config) and Next.js, so the Neon dev branch isn't touched.
3. Run `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `db:deploy`, `test`, `build`, `test:e2e`, in that order.
4. `docker stop pcsilicon-ci` (removed by `--rm`).

## Docs

- CLAUDE.md "Commands": add `pnpm test`, `pnpm test:watch`, `pnpm test:e2e` (plus the one-time `pnpm exec playwright install chromium`). Remove "There is no test runner configured yet" and note where unit and E2E tests live.
- README: a short "Testing" section with the same commands and what CI runs.

## Commit, PR, branch protection

- One commit for the story (`chore: add test tooling and CI`), `git push -u origin HEAD`, then open the PR closing #11 that includes the spec files. The workflow's first real run is on that PR.
- Branch protection on `main` requiring check `ci`: set by the user in repo settings after the first run (or by me via `gh api` if asked), and noted in the PR.

## Verification

- `pnpm test`: all seed and rule-field cases pass with `.env.local` temporarily renamed.
- Manual mutations, each reverted: remove `socket` from a CPU (test 1 fails naming part and path); `.optional()` on CPU `socket` (that field's case fails); remove `<SkipLink />` (E2E fails).
- `pnpm test:e2e` passes locally (dev server) and in the CI dry run (production server).
- The local CI dry run passes end to end; then the workflow passes on the PR.
