# 022 — Tasks: Share a build by link

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T1. Docs.** Spec 022 (approved with the review changes), this plan and task list, ADR 0007.
- [x] **T2. Pure logic, test-first.**
  - `lib/builder/canonical.ts`: `canonicalItems` and the canonical text (E3, E57–E60). Export from `lib/builder/index.ts`.
  - `lib/build-share-hash.ts`: `contentHashOf`, pinned to E57's hash. Split from `lib/build-share.ts` so it tests without a database.
  - `lib/build-state/severity.ts`: `worstSeverity` moved out of `slot-section.tsx`, which re-exports it.
  - `lib/build-state/share.ts`: `MAX_SHARE_QUANTITY` and `shareInput` (E9–E14, E18).
  - `lib/build-share-slug.ts`: `randomSlug`, `isShareSlug` (E1, E35).
  - `lib/build-state/shared.ts`: `sharedBuildView` with `openPlan` (E24–E33, E30a, E30b).
  - `lib/build-state/share-copy.ts`: `shareErrorText`.
  - `lib/build-state/summary.ts`: `buildNotice` gains the shared-build lines.
- [x] **T3. Schema and `shareBuild`.**
  - `Build` and `BuildItem` in `prisma/schema.prisma`, `pnpm db:migrate --name share_builds`; commit the migration. The migration also adds `CHECK (quantity >= 1)`, which Prisma can't express.
  - `test-support/build-fixtures.ts` (seed parts in the test database) and `resetCatalog()` truncating `Build` (the guard follows in T4).
  - `lib/build-share.ts`: `shareBuild` with P2002 handling and an injectable slug generator.
  - `lib/build-share.db.test.ts`: E1–E8, E10, E15–E17, E19–E22, E5 (ten at once), **E61 (two in parallel)**, E62.
  - *Verify:* `pnpm test:db`. The pg adapter does report unique violations as `P2002` (E61, E62 prove it).
- [x] **T4. Production safety.**
  - `lib/db-url.ts` extracted from `test-support/db-guard.ts`; its tests stay green.
  - `lib/reset-guard.ts` and its tests (E63–E67). `PRODUCTION_DATABASE_HOST` in `lib/env.ts` and `.env.example`.
  - `prisma/seed.ts` uses the guard in place of the `NODE_ENV` check. `prisma/seed/write.ts` and `resetCatalog()` truncate `Build` too and call the guard first (E23, E69).
  - `prisma/seed/reset-cli.test.ts` (E68, runs the real script as a child process) and `prisma/seed/write.db.test.ts` (E70, E23). `test-support/reset-catalog.db.test.ts` covers E69.
  - *Verify:* `pnpm test`, `pnpm test:db`.
- [x] **T5. Share UI.**
  - `app/(store)/builder/actions.ts`: the server action.
  - `components/builder/share-dialog.tsx` (the dialog and its request) and `share-dialog-body.tsx` (its contents, split out so unit tests don't load the server action and the env), the Share build button in `build-summary.tsx`, and the wiring in `builder.tsx`, with markup tests (E39, E40–E46).
  - `e2e/share-build.spec.ts` started: E39, E40, E41, E43, E45 against `pnpm dev`. T8 extends it.
  - The `part-summary` extraction from `slot-section.tsx` moves to T6, where the shared page's rows need it.
- [x] **T6. Shared page.**
  - `components/builder/part-summary.tsx` (`PartInfo`, `PartPrice`, `SeverityMarker`) and `summary-parts.tsx` (`PowerLine`, `StatusLine`, `IssueList`, with the "Incomplete" status) extracted from the builder's components; the `/builder` markup tests stay green.
  - `lib/shared-build.ts` and `lib/shared-build.db.test.ts` (E24, E26–E29, E31–E34, E36).
  - `app/(store)/builds/[slug]/page.tsx` and `components/builds/shared-build.tsx`, with markup tests (E24–E30b, E32, E33) and metadata (E37). `test-support/shared-snapshot.ts` holds the snapshot fixtures both view and component tests use.
  - E2E: the page for another visitor, 404s, noindex, canonical and link preview, and no `/builds` in the sitemap (E24, E25, E34, E35, E37, E38).
  - The Open in builder button comes with T7; until then the summary ends with the status and issues.
- [ ] **T7. Open in builder.**
  - Store `load` action with its tests (E49, E52–E55).
  - `components/builds/open-in-builder.tsx`: same-contents shortcut, replace dialog, notice (E50, E51, E51a, E51b, E56).
- [ ] **T8. E2E and wrap-up.**
  - `e2e/share-build.spec.ts`: the acceptance flow in a fresh browser context (E49), copy confirmation with clipboard permission (E41), the replace dialog (E50), a 404 (E34). `seo.spec.ts`: noindex, canonical, no `/builds` in the sitemap (E37, E38).
  - Docs: `CLAUDE.md` (a sharing bullet; the `db:seed` reset rule; `PRODUCTION_DATABASE_HOST`). Tick the issue's acceptance criteria.
  - Checks: `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, E2E (dev, then `CI=1` against `pnpm build && pnpm start`).
  - Manual check at 1024 and 1280 px (plan › Verification).
  - PR: push with `git push -u origin HEAD`, then open the PR per the repo template.
