# 001 — Tasks: spec schemas and seed catalog

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #8

Work top to bottom. Each task is one small commit (Conventional Commits) and leaves `pnpm typecheck` and `pnpm lint` passing. **Verify** says how to confirm that task on its own. "Quick check" means a throwaway `tsx` snippet run from the repo root and not committed. There is no test runner until story 4.

Database tasks run against the **Neon dev branch only** (`.env.local`).

## Phase A — Spec schemas (`lib/specs/`)

- [ ] **A1. Slug helper.** Add `lib/slug.ts` with `slugify(text)`: lowercase, ASCII, words joined by `-`, no leading or trailing `-`.
  - Verify: quick check that `"WD_BLACK SN850X 2 TB"` → `wd-black-sn850x-2-tb`, `"AMD"` → `amd`, and `"Core i5-14400F"` → `core-i5-14400f`.

- [ ] **A2. Shared enums.** Add `lib/specs/enums.ts` with every enum from the spec's "Shared enums" table as a `const` array plus `z.enum`. Include `E_ATX`, `CPU_GENERATION_SOCKET: Record<CpuGeneration, Socket>`, and display labels for enum values.
  - Verify: `pnpm typecheck`. Temporarily delete one generation from `CPU_GENERATION_SOCKET` and confirm the type check fails. Revert.

- [ ] **A3. Schema helpers and metadata type.** Add `lib/specs/helpers.ts` with `positiveInt()`, `nonNegativeInt()`, `uniqueList(item, { nonEmpty })`, the `RuleId` union (one ID per PRD rule), `FieldMeta`, and `FieldMetaMap<S>`. `FieldMetaMap` requires exactly one entry per field, including fields from every branch of a union.
  - Verify: quick check that `uniqueList` rejects `["AM5", "AM5"]` and, when `nonEmpty`, rejects `[]`. Also check that `positiveInt` rejects `227.2`, `0` and `"335"`.

- [ ] **A4. CPU schema.** Add `lib/specs/categories/cpu.ts` with `cpuSpecs` (strict) and `cpuFields`. Checks: `threads ≥ cores`, `boostClockMhz ≥ baseClockMhz`, and `generation` belongs to `socket`.
  - Verify: quick check that the Ryzen 5 7600 specs from the spec pass. Each of these must fail on the named path: no `socket` → `socket`; `zen-4` on `LGA1700` → `generation`; `threads: 4, cores: 6` → `threads`; extra key `tdp` → unrecognized key. Temporarily delete a `cpuFields` entry and confirm the type check fails. Revert.

- [ ] **A5. Motherboard schema.** Add `categories/motherboard.ts`. `nativeCpuGenerations` must be non-empty and unique, and every generation must belong to `socket`. `formFactor` accepts `E_ATX`.
  - Verify: quick check that a valid AM5 board passes. These must fail: `nativeCpuGenerations: []`, an AM5 board listing `raptor-lake`, and a missing `m2Slots`.

- [ ] **A6. Memory schema.** Add `categories/memory.ts`.
  - Verify: quick check that the Vengeance kit passes and that a kit without `moduleCount` fails on `moduleCount`.

- [ ] **A7. GPU schema.** Add `categories/gpu.ts`.
  - Verify: quick check that the RTX 4060 passes. These must fail: no `lengthMm`, `lengthMm: 227.2`, and `chipsetBrand: "nvidia"`.

- [ ] **A8. Storage schema.** Add `categories/storage.ts` with these checks: `NVME` ⇒ `M2_*`, and `DRIVE_*` ⇒ `SATA`.
  - Verify: quick check that the 990 PRO (NVMe M.2) and MX500 (SATA 2.5") pass, and so does an M.2 SATA drive. `NVME` + `DRIVE_2_5` must fail.

- [ ] **A9. PSU schema.** Add `categories/psu.ts`.
  - Verify: quick check that the SF750 passes and that a PSU without `formFactor` fails.

- [ ] **A10. Case schema.** Add `categories/case.ts`. `radiatorSizesMm` may be empty but must be present. `motherboardFormFactors` and `psuFormFactors` must be non-empty.
  - Verify: quick check that the Fractal Ridge passes with `radiatorSizesMm: []`. These must fail: a missing `radiatorSizesMm`, `psuFormFactors: []`, and `maxGpuLengthMm: "335"`.

- [ ] **A11. CPU cooler schema.** Add `categories/cpu-cooler.ts` as a discriminated union on `type`. AIR requires `heightMm` and forbids `radiatorSizeMm`. AIO is the reverse. The forbidden-field message is `not allowed when type is "AIO"` (or `"AIR"`).
  - Verify: quick check that the Peerless Assassin (AIR) and Liquid Freezer III 360 (AIO) pass. These must fail: AIO with `heightMm` (with the exact message), AIR without `heightMm`, and `supportedSockets: []`.

- [ ] **A12. Registry and public API.** Add `lib/specs/registry.ts` (`builderCategories`: slug → name, sortOrder, schema, fields, in builder order) and `lib/specs/index.ts` (`validateSpecs`, `Specs<C>`, `BuilderCategorySlug`, `isBuilderCategory`).
  - Verify: quick check that `validateSpecs("cpu", …)` passes for the 7600 and `isBuilderCategory("monitor")` is false. In the editor, `Specs<"cpu">["socket"]` shows the socket union. Search `lib/specs/` for imports of `@/lib/db`, `@/lib/env`, `node:` or `fs`, and confirm there are none.

- [ ] **A13. Seed part schema.** Add `prisma/seed/part-schema.ts` with the strict product-level fields from the spec (required, optional and defaults), a `seedPartSchema(category)` that adds `specs`, and the `SeedPart<C>` input type.
  - Verify: quick check that the spec's example part record passes and gets its defaults filled. These must fail: `salePrice ≥ price`, a non-integer `price`, a missing `sourceUrl`, and an unknown key.

## Phase B — Seed data (`prisma/seed/data/`)

For every part, check each value against its `sourceUrl` while writing it. Round dimensions in the safe direction (parts up, case limits down). If a checked value changes which scenario a part covers in the spec, swap the part and note it in the PR. Don't change the scenario. Every file ends with `satisfies SeedPart<"…">[]`.

- [ ] **B1. CPUs.** Add `cpus.ts` with parts #1–3. `tdpW` is worst-case: AMD PPT (88, 162) and Intel Maximum Turbo Power (148). Add a comment on each `tdpW` value.
  - Verify: `pnpm typecheck`. Temporarily set one `socket` to `"AM6"` and confirm the type check fails on that line. Revert.

- [ ] **B2. Motherboards.** Add `motherboards.ts` with parts #4–6. `nativeCpuGenerations` comes from each board's launch-BIOS entry in the manufacturer's CPU support list.
  - Verify: `pnpm typecheck`. Confirm the B760M-A list leaves out `raptor-lake-refresh` (needed for the BIOS-warning scenario). Confirm the B650I has 2 DIMM and 2 M.2 slots.

- [ ] **B3. Memory.** Add `memory.ts` with parts #7–8.
  - Verify: `pnpm typecheck`.

- [ ] **B4. GPUs.** Add `gpus.ts` with parts #9–11. The RTX 5090 has `stock: 0`.
  - Verify: `pnpm typecheck`. Confirm the 5090 length is > 335 and ≤ 360, and the 5070 SFF length is ≤ 335.

- [ ] **B5. Storage.** Add `storage.ts` with parts #12–14.
  - Verify: `pnpm typecheck`.

- [ ] **B6. PSUs.** Add `psus.ts` with parts #15–17.
  - Verify: `pnpm typecheck`.

- [ ] **B7. Cases.** Add `cases.ts` with parts #21–23. The LANCOOL 216 lists `E_ATX`, and the Ridge has `radiatorSizesMm: [120, 280]` and `psuFormFactors: ["SFX", "SFX_L"]`, per its spec sheet. A 360 mm radiator and an ATX PSU must not fit.
  - Verify: `pnpm typecheck`. Confirm the Ridge's cooler height (< 155) and the Q300L's GPU length (≥ 358) still support their scenarios.

- [ ] **B8. CPU coolers.** Add `cpu-coolers.ts` with parts #18–20.
  - Verify: `pnpm typecheck`. Confirm the Peerless Assassin height fits the Q300L and LANCOOL 216 and exceeds the Ridge, and the NH-L9a-AM5 does not list `LGA1700`.

- [ ] **B9. Data index.** Add `data/index.ts` with `seedFiles`: one `{ file, category, parts }` entry per category, with the file paths written out.
  - Verify: quick check that there are 8 entries and 23 parts in total, at least one part has `stock ≤ lowStockAt` (default 5), and one part has `stock: 0`.

- [ ] **B10. Scenario review.** Walk through the spec's "Compatible builds" and "One incompatible pair per rule" tables using the final values from B1–B8. Recompute the PSU loads.
  - Verify: every row still gives the stated result. If anything changed, update the spec's tables in the same commit.

## Phase C — Seed script (`prisma/seed.ts`, `prisma/seed/`)

- [ ] **C1. Validator.** Add `prisma/seed/validate.ts` with `validateSeed(files)`. It is pure: it runs `safeParse` with `reportInput: true` per part, fills defaults (slug, status, lowStockAt, warrantyMonths, brand slug), checks for duplicate `sku`/`slug` across files, and collects **all** errors as `{ file, index, name?, sku?, path, message }`.
  - Verify: quick check that `validateSeed(seedFiles)` returns `ok: true` with 23 parts. Then run it on a copy containing a GPU without `lengthMm` plus a duplicate SKU in another file, and confirm both errors come back from one call.

- [ ] **C2. Error formatter.** Add `prisma/seed/format-errors.ts`. It maps Zod issue codes to the spec's wording (`required`, `expected one of …`, `unrecognized key "…"`, custom messages) and groups errors per part under the `file › #n "name" (sku …)` header.
  - Verify: quick check that the formatted output for the C1 bad copy matches the spec's example block character for character (apart from the actual names). A part with no name or SKU is shown as `#n` only.

- [ ] **C3. Env loader.** Add `prisma/seed/load-env.ts`, which loads `.env.local` with `dotenv`.
  - Verify: quick check that importing it first, then `@/lib/env`, gives a defined `env.DATABASE_URL`.

- [ ] **C4. Writer.** Add `prisma/seed/write.ts` with `writeSeed(db, data, { reset })`. It runs one interactive transaction with a 60 s timeout. Optionally it truncates `ProductImage`, `Product`, `Brand` and `Category` with `CASCADE`. It upserts categories from the registry and brands by slug. It looks up existing SKUs, checks for slug conflicts, then runs `create` (all fields) or `update` (catalog fields only). The two field lists are named constants at the top of the file. It returns the counts.
  - Verify: `pnpm typecheck`. Read the update field list against the spec's "Which product fields the seed writes" table. Running it is checked in C6–C9.

- [ ] **C5. Entry point and command.** Add `prisma/seed.ts`. It imports `load-env` first, accepts only `--reset`, checks that every `seedFiles` path exists, validates (printing errors and exiting 1 on failure), refuses `--reset` when `NODE_ENV=production`, prints the database host on reset, writes, prints the summary, and disconnects in `finally`. Add `"db:seed": "tsx prisma/seed.ts"` to `package.json` and `seed: "tsx prisma/seed.ts"` under `migrations` in `prisma7.config.ts`.
  - Verify: `pnpm db:seed --foo` exits 1 with usage text and makes no database connection.

- [ ] **C6. First seed.** Run `pnpm db:seed` on the dev database (run `pnpm db:seed --reset` first if it already has catalog rows).
  - Verify: the output reads `Seeded 8 categories, 17 brands, 23 products (23 created, 0 updated).` In Prisma Studio, the categories are in builder order, prices are in centavos, and one part's `specs` match its data file exactly.

- [ ] **C7. Re-seed keeps live data.** In Studio, change one product's `stock` and `price` and note its `id`. Change that product's `name` in its data file. Run `pnpm db:seed`.
  - Verify: the output shows `0 created, 23 updated` with the "stock, price and status kept" note. The edited stock and price are unchanged, the name is refreshed, the `id` and `slug` are unchanged, and row counts are the same. Revert the name change.

- [ ] **C8. Invalid data is rejected.** Temporarily, in one edit, remove a GPU's `lengthMm`, give a CPU `generation: "zen-4"` on `LGA1700`, and duplicate a SKU in another file. Run `pnpm db:seed`.
  - Verify: exit code 1, all three problems reported in one run in the spec's format, and Studio shows no change. Revert.

- [ ] **C9. Reset.** With one invalid edit in place, run `pnpm db:seed --reset`. Then revert it and run `pnpm db:seed --reset` again. Finally run `NODE_ENV=production pnpm db:seed --reset`.
  - Verify: the first run is refused before truncating, and the C7 stock edit is still there. The second run prints the host and `23 created`, and the C7 stock edit is gone. The third run is refused. `pnpm prisma db seed` also runs the same script.

## Phase D — Docs and wrap-up

- [ ] **D1. ADR 0001.** Write `docs/adr/0001-store-specs-as-jsonb.md` (context, options, decision, consequences, per plan §8).
  - Verify: it covers per-category tables, EAV and JSONB, and states the range-filter and "all writes go through `validateSpecs`" consequences.

- [ ] **D2. ADR 0002.** Write `docs/adr/0002-spec-schemas-in-code.md` (the D1 decision, the trade-off table, linking by slug, and the guard on renaming builder slugs).
  - Verify: it links to the spec, and its file name matches what the PRD and spec reference.

- [ ] **D3. PRD check.** Re-read the `Category` row, AD-3 and the M.2 row in `docs/prd.md`.
  - Verify: no `specSchema` remains, AD-3 references ADR 0002, and the M.2 row counts every M.2 drive.

- [ ] **D4. Prisma comment.** Change the `Product.specs` comment in `prisma/schema.prisma` to point at `lib/specs` and ADR 0002.
  - Verify: `pnpm db:migrate` reports the schema is in sync and creates no new migration folder.

- [ ] **D5. CLAUDE.md.** Add `pnpm db:seed` / `--reset` (dev database only) to Commands, and add a Stack line saying spec schemas live in `lib/specs/` and are linked to categories by slug. Leave the "no test runner" line.
  - Verify: the commands listed match `package.json`.

- [ ] **D6. Final check and PR.** Run `pnpm format`, `pnpm typecheck` and `pnpm lint`. Tick each acceptance criterion on issue #8 against the work. Open a PR that closes #8 and includes `spec.md`, `plan.md` and `tasks.md`, with the story 4 handoff (plan §7) in the description.
  - Verify: every acceptance criterion is checked, and nothing in the diff touches production data or adds a test runner.
