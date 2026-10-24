# 003 — Test tooling and CI

Status: **Draft** · Issue: #11 · PRD refs: Development approach → Testing strategy, CI/CD and environments; Non-functional → Quality

## Summary

Every pull request and every push to `main` is linted, type-checked, migrated against a throwaway Postgres, unit-tested, built and smoke-tested in a browser by GitHub Actions. Branch protection on `main` requires that run to pass. This story adds the tooling and the first real tests. It does not add tests for features that don't exist yet.

## Unit tests (Vitest)

- Vitest runs tests matching `**/*.test.ts` (excluding `e2e/`, `node_modules/`, `.next/`, `generated/`). It resolves the `@/` path aliases from `tsconfig.json`, so tests import code the same way the app does.
- Unit tests are pure: no database, no network and no env vars. They must pass with no `.env.local` present.
- First tests, for the seed catalog (`prisma/seed/data/`, validated by `validateSeed()`):

| Test | Expectation |
| --- | --- |
| Every seed data file validates | `validateSeed(seedFiles)` returns `ok: true`. On failure the test output lists the errors (file, part, path, message), not just `false`. |
| Every rule-critical field is required | One test case per category and rule-critical field (see below). Removing that field from a copy of a valid seed part makes `validateSeed()` return `ok: false`, with an error naming that part and the field's path (e.g. a CPU without `specs.socket` → path `specs.socket`). |

- **Rule-critical fields** are the spec fields whose metadata in `lib/specs` lists at least one compatibility rule (`FieldMeta.rules` is non-empty). The test reads them from `builderCategories[slug].fields`; there is no hand-written list. A field gains test coverage as soon as it is tagged with a rule.
- The base part for each case is the first seed part of that category that **has** the field. Some schemas are unions (an air cooler has no radiator fields, an AIO has no height), so not every part carries every field.
- If no seed part of a category has a given rule-critical field, the test fails with a message naming the category and field. The fixture set must exercise every rule (spec 001), so this signals a gap in the seed data.
- Test names read like `cpu: rejects a part without specs.socket (socket-match, cooler-socket, bios-update)`, so a failure shows what broke.
- The seed data files are TypeScript modules, not JSON. "Every seed file" means every entry in `seedFiles`, so a new data file is covered as soon as it is registered there.

## End-to-end tests (Playwright)

- Playwright tests live in `e2e/` and run in **Chromium only** for now, at a 1280 × 800 viewport (desktop-first MVP).
- Playwright starts the app itself (`webServer`): the production server (`pnpm start`) in CI after `pnpm build`, the dev server locally if one isn't already running.
- First test, the home page smoke test. On `/`:
  - the response is successful and the page has the title "PC Silicon";
  - the header is visible and contains the "PC Silicon home" logo link with the wordmark, and the search box (found by its label);
  - the "Skip to content" link is the first element reached by pressing Tab.
- Locators use roles and accessible names, not CSS classes, so restyling doesn't break tests.
- Playwright output (`test-results/`, `playwright-report/`) is gitignored.

## CI (GitHub Actions)

One workflow, `.github/workflows/ci.yml`, triggered on `pull_request` (any target branch) and `push` to `main`. A newer push to the same PR cancels the run in progress.

One job on `ubuntu-latest`, steps in this order. A failing step stops the job.

1. Check out, set up pnpm (version from `packageManager` in `package.json`) and Node 24, with the pnpm store cached.
2. `pnpm install --frozen-lockfile` (runs `prisma generate` through `postinstall`).
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm db:deploy` against the Postgres service container. A migration that fails to apply fails CI.
6. `pnpm test`
7. `pnpm build`
8. Install Chromium for Playwright (with its OS dependencies), then `pnpm test:e2e`.
9. On failure, upload the Playwright report as a workflow artifact.

**Postgres service:** the official `postgres` image at the major version Neon uses (17), with a health check so the job waits until it accepts connections. It lives only for the job; no data is kept.

**Env:** set at job level, no GitHub secrets needed.

| Variable | CI value |
| --- | --- |
| `DATABASE_URL` | the service container, e.g. `postgresql://postgres:postgres@localhost:5432/pcsilicon` |
| `DATABASE_URL_UNPOOLED` | same URL (there is no pooler in CI) |
| `NEXT_PUBLIC_SITE_URL` | placeholder `http://localhost:3000` |

`SKIP_ENV_VALIDATION` is **not** set, so CI also proves the env schema accepts a complete configuration.

**Branch protection:** `main` requires the CI job to pass before merging. This is a repository setting, configured by hand once the workflow has run at least once; the PR notes that it was done.

## package.json

- Scripts: `test` (Vitest, run once), `test:watch` (Vitest, watch mode), `test:e2e` (Playwright). `typecheck` already exists (`tsc --noEmit`) and is kept.
- Add `"packageManager": "pnpm@11.24.0"` (the version in use), so local and CI pnpm match.
- New dev dependencies: `vitest`, `vite-tsconfig-paths` (or Vitest's built-in alias support if it covers `tsconfig` paths), `@playwright/test`.
- CLAUDE.md "Commands" lists the new scripts and drops "There is no test runner configured yet"; the README says how to run tests.

## Acceptance criteria

- [ ] `pnpm test` passes locally with no `.env.local`, running the seed validation test and one rejection case per rule-critical field in every builder category.
- [ ] Removing `socket` from one CPU in `prisma/seed/data/cpus.ts` makes `pnpm test` fail with a message naming that part and field (checked by hand, then reverted).
- [ ] Making a rule-critical field optional in its Zod schema (e.g. `.optional()` on CPU `socket`) makes that field's rejection case fail (checked by hand, then reverted).
- [ ] `pnpm test:e2e` passes locally against the home page.
- [ ] Breaking the header (e.g. removing the skip link) makes `pnpm test:e2e` fail (checked by hand, then reverted).
- [ ] The CI workflow runs on this story's PR and every step passes.
- [ ] Branch protection on `main` requires the CI job.
- [ ] `pnpm lint` and `pnpm typecheck` pass, including on the new test and config files.

## Out of scope

- Database integration tests (Vitest + Postgres). They come with the first DB-backed feature; the Postgres service added here is reused then.
- Firefox, WebKit and mobile viewports in Playwright.
- Coverage reports and thresholds.
- Accessibility (axe) checks in E2E.
- Running seed in CI, and deploys (Vercel already handles previews and production).
- Tests for code that doesn't exist yet (rules engine, pricing, checkout).

## Resolved questions

| # | Question | Decision |
| --- | --- | --- |
| R1 | Should the rejection test cover only one example field, or every rule-critical field in every category? | Every one, driven by the `rules` in the field metadata, so new rule fields are covered automatically. |

## Open questions

None.
