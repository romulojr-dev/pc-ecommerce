# 028 — Tasks: Shipping data and fee rules

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom and stop after each task. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each one with a subject-only Conventional Commit; the PR is squash-merged.

- [x] **T0. Docs.** Spec 028 (approved with the review changes), this plan and task list.
- [x] **T1. Preview proof (first, D20).**
  - Stub dataset by hand at the final paths: `manifest.json`, `regions.json` (NCR only), `provinces/1300000000.json`, `cities/1300000000.json` (Quezon City with 2 barangays).
  - `lib/psgc/{version,types,files}.ts`, `lib/shipping/zones.ts` (the full map), `lib/psgc/address.ts` (first version: the chain check and the zone, no independent cities), the data route, the proof route, `outputFileTracingIncludes` in `next.config.ts`.
  - Unit tests: `parsePsgcPath` (R4, R5 shapes), `resolveAddress` on the stub (V1, V3, V5, V6).
  - *Verify locally:* `pnpm build`; the `.nft.json` of both routes lists the stub files; `pnpm start` and `curl -i` show 200 with the immutable header and a 404 with `no-store`.
  - *Verify on Vercel:* push the branch; on the preview URL, `/api/psgc/2026Q3/regions.json` and `/api/psgc-proof` both succeed. If either fails, stop, fix tracing (or change the layout), and update spec D12 and D20 before continuing.
- [x] **T2. Converter and dataset.**
  - Commit `data/psgc/2026Q3.xlsx`; add the devDependency and `pnpm psgc:convert`.
  - `scripts/psgc/transform.ts`, test-first on fixture rows: C1 (Manila districts), C2 (trailing spaces), C3 (`"City of Lucenaa/"`; `"Tondo I/II"` untouched), C4–C8. `lib/psgc/independent-cities.ts` (17 pairs).
  - Run the converter on the real workbook, replace the stub, commit the JSON. Report counts, the largest file (raw and gzip) and the cleaned names.
  - Integrity tests on the committed files: A1–A10, A12–A17 (City of Manila 897, the size ceiling).
  - *Verify:* run the converter twice; `git status` is clean (A11).
- [x] **T3. Address validation and zones.** Full `resolveAddress` (independent cities, V9–V11), `zipSchema` (V7, V8), zone-map coverage tests against `regions.json` (Z1–Z6), V1–V11.
- [x] **T4. Weight and fee, test-first.** `lib/shipping/weight.ts` and `fee.ts`: W1–W6, F1–F17.
- [x] **T5. Tables and seed.**
  - Schema and `pnpm db:migrate --name shipping` with the appended `CHECK`s; a second `migrate dev --create-only` is empty (delete it); `pnpm db:drift` exits 0.
  - `prisma/seed/data/shipping.ts`, `validate-shipping.ts` and its unit test (S7, S8), the `writeSeed` steps and reset names, `resetCatalog()`, the seed output lines, `lib/shipping/config.ts`.
  - DB tests: S1–S6, the `getShippingConfig` mapping; `reset-catalog.db.test.ts` and `write.db.test.ts` updated.
- [x] **T6. Data route E2E.** `e2e/psgc.spec.ts`: R1–R6.
- [ ] **T7. Docs and cleanup.** ADR 0008; CLAUDE.md shipping and PSGC bullet, `db:seed` and scripts lines; README (seed notes, `psgc:convert`); delete the proof route and its tracing key; spec 028 status to Implemented.
- [ ] **T8. PR.** Open the PR from the repo template; wait for `ci`; on the final preview URL request R1 again (Definition of done).
