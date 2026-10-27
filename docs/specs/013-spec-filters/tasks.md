# 013 — Tasks: spec filters per category

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing (`pnpm test:db` too from T3). Commit after each task (short Conventional Commit subject); the PR is squash-merged.

- [x] **T1. Filter kinds in the metadata.** `FieldMeta.filter?: SpecFilterKind` replaces `filterable`; kinds per the spec's table in every category file; `lib/specs/fields.ts` with `fieldSchemas` (moved from the test) and `isTextField`; kind-fits-field test; `format.test.ts` and the seed coverage test read `filter`.
  - Verify: `pnpm test`, `pnpm typecheck`.
- [x] **T2. Pure spec filters and per-category URL state.** `lib/listing-filters/spec.ts` (one factory per kind), `listingFilters(slug)`, helpers take the list, `FilterValues` widened, `FilterOption.count`; `parseListingParams`/`listingQuery`/`isCanonicalQuery` take the slug; callers updated so the page still works; unit tests per kind, key collisions, round trip.
  - Verify: `pnpm test`; `/cpu?socket=AM5` in `pnpm dev` keeps the param (no filtering yet), `/cpu?threads=8` redirects to `/cpu`.
- [x] **T3. Queries and counts.** Spec `where` per kind in `server.ts`; facet queries with `countFacets` (pure, unit-tested); brand options with counts; `getFilterOptions`/`getCategoryProducts` take slug and filters; `insertSpecFixtures`; `spec-filters.db.test.ts` with every case in the spec, the parameter check and the injection case; `server.db.test.ts` updated.
  - Verify: `pnpm test:db`.
- [x] **T4. Sidebar.** Collapsible sections in order, spec sections per kind, counts via `aria-describedby`, disabled options, `RangeForm` shared with price, units in titles; chips from the category's list; page wiring with normalization.
  - Verify in `pnpm dev`: `/gpu`, `/memory`, `/case`, `/cpu-cooler`: filters apply, counts change with other filters, zero options disabled, chips and Clear all, sections toggle by keyboard.
- [x] **T5. E2E.** `e2e/epic-browse.spec.ts` (menu → Memory → DDR5 → product); spec-filter scenarios in `e2e/category-filters.spec.ts` (range, disabled option, ignored field, keyboard).
  - Verify: `pnpm test:e2e`, all specs.
- [x] **T6. Docs.** CLAUDE.md (per-category filter list, spec filters, counts, `FieldMeta.filter`), spec 012's superseded line, tick the spec's acceptance criteria.
- [x] **T7. Build and wrap-up.** `pnpm build`, `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:e2e`; browser check (themes, 1280/1024 px, keyboard, axe); push and open the PR.
