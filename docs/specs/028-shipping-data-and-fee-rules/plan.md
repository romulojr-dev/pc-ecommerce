# 028 — Plan: Shipping data and fee rules

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #76

## Context

Checkout (#77, #78) needs, before it can show a fee: a correct fee rule, rates and store settings in the database, a PH address dataset (PSGC 2026Q3) it can serve to the form and validate on the server, and the region → zone map. Nothing in this story has a screen. The review fixed how the dataset is served: JSON outside `public/`, one shared loader, a route handler that sets the immutable header, `outputFileTracingIncludes`, and a preview-deploy proof as the **first** task, because file tracing is the one thing local runs can't show.

Checked while planning:
- Next 16.4.1 docs (`next.config.js › output`): `outputFileTracingIncludes` is a top-level option; keys are route paths (brackets escaped, e.g. `'/api/login/\\[\\[\\.\\.\\.slug\\]\\]'`) and globs like `'/api/*'`, values are project-relative globs. It only affects routes that produce a server trace. After `pnpm build`, each route's `*.nft.json` under `.next/server/app/` lists the traced files, so tracing can be checked locally.
- `server-only` isn't used in this repo's `lib/`, so the loader is a plain Node module (`node:fs`) that no client component imports. Pure modules stay free of `fs`.
- `/api` is already in `RESERVED_SLUGS`; the repo has no `.xlsx` reader dependency.

## Reuse

- Route handler style: `app/api/builder/parts/route.ts` (headers constant, `Response.json`).
- Migration with raw `CHECK`s appended: `prisma/migrations/20261030130000_cart`; partial unique index via the `partialIndexes` preview feature (already on).
- Reset `TRUNCATE` in `prisma/seed/write.ts` and `test-support/db.ts`; production guard `assertResetAllowed` (`lib/reset-guard.ts`).
- Seed validation before any write (`prisma/seed.ts`, `prisma/seed/validate.ts`).
- Tests: `resetCatalog`, `db` (`test-support/db.ts`); seed parts in `test-support/seed-parts.ts` (`buildA`, `seed.ryzen5_7600`, `seed.lancool216`) for the weight and fee examples; `*.db.test.ts` on the Docker Postgres; Playwright `test`/`expect` from `e2e/test.ts`.

## Files

```
lib/psgc/
  version.ts            PSGC_VERSION = "2026Q3"
  types.ts              Region, Province (kind), City (full or independent short entry), Barangay, Manifest
  files.ts              node:fs loader, the one reader of data/psgc/json/{version}/:
                        parsePsgcPath(version, segments) -> { kind, code? } | null  (pure, tested)
                        readPsgcFile(...) -> string | null  (ENOENT -> null); parsed JSON cached in memory
  independent-cities.ts independentCityProvinces (17 pairs), pure
  address.ts            resolveAddress(codes) -> { region, province, city, barangay, zone } | null
  zip.ts                zipSchema
lib/shipping/
  zones.ts              ShippingZone, zoneOfRegion (map keyed by the 2-digit region code)
  weight.ts             orderWeightGrams
  fee.ts                shippingFee (result object; no-rate is checked before free shipping)
  config.ts             getShippingConfig() -> { rates, settings }, fresh per call; maps the Prisma enum to the zone
                        strings; throws when the single settings row is missing (a setup error, not a shopper state)
app/api/psgc/[version]/[...file]/route.ts   GET only; known file -> 200 + immutable header; every miss -> 404 + no-store
app/api/psgc-proof/route.ts                 TEMPORARY: one resolveAddress call; deleted in T7
scripts/psgc/transform.ts                   pure rows -> dataset (no fs), unit-tested on fixture rows
scripts/convert-psgc.ts                     reads the workbook, writes data/psgc/json/{version}/, prints counts, the
                                            largest file (raw and gzip) and cleaned names; `pnpm psgc:convert`
data/psgc/2026Q3.xlsx                       committed; data/psgc/json/2026Q3/** generated and committed
prisma/seed/data/shipping.ts                demo store and the 20 demo rates, with a "demo values" comment
prisma/seed/validate-shipping.ts            Zod + tier rules; runs in seed.ts before any write
```

Edited: `next.config.ts` (tracing includes), `prisma/schema.prisma` + a migration, `prisma/seed/write.ts` (steps; `TRUNCATE` names `"ShippingRate"` and `"StoreSettings"`; `SeedCounts` gains shipping counts), `prisma/seed.ts` (validate, print the shipping lines), `test-support/db.ts`, `package.json` (`psgc:convert`, one devDependency), `CLAUDE.md`, `README.md`.

## Design choices the plan commits to

- **Tracing keys:** the data route and the proof route now; #77 and #78 add their checkout routes. If the glob key doesn't match the catch-all route, fall back to the escaped literal path (`'/api/psgc/\\[version\\]/\\[\\.\\.\\.file\\]'`); the local `.nft.json` check decides.
- **The loader never builds a path from request text.** `parsePsgcPath` accepts only `regions.json`, `manifest.json`, `provinces/{10 digits}.json`, `cities/{10 digits}.json`, and `version === PSGC_VERSION`.
- **Prisma:** `enum ShippingZone`; `ShippingRate` with `@@unique([zone, maxWeightGrams])` and `@@unique([zone], where: { maxWeightGrams: null })`; `StoreSettings` with `id Int @id @default(1)`. The `CHECK`s (`id = 1`, `maxWeightGrams > 0`, `fee >= 0`, `freeShippingThreshold > 0`, `orderExpiryHours >= 1`) are migration-only, as in the cart migration; `db:drift` doesn't compare them (S5, S6 cover them).
- **Seed:** the settings row with `INSERT … ON CONFLICT DO NOTHING`; the rates only when `ShippingRate` is empty; both inside `writeSeed`'s transaction, after the reset `TRUNCATE`.
- **Workbook reader:** `read-excel-file` as a devDependency (small, Node entry). Fallback if it can't read the 43,769-row sheet cleanly: `exceljs`.
- **Independent cities:** the converter writes each as its own pseudo-province file (`cities/{cityCode}.json`) and as a short `{ code, name, independent: true }` entry in the geographic province's file. `resolveAddress` accepts a city that is in the province's file or whose `independentCityProvinces` entry is that province.
- **Output format:** compact `JSON.stringify`, one trailing `\n`, entries in code order, so reruns are byte-identical (A11) and `.gitattributes` LF holds.

## Verification

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` after every task; `pnpm test:db` after T5 (Docker Postgres with an inline `TEST_DATABASE_URL`, never `.env.local`).
2. `pnpm db:migrate`, then `pnpm db:drift` exits 0; `pnpm db:seed` twice (the second prints "kept"); change one rate by hand and re-seed: unchanged.
3. `pnpm psgc:convert` twice: no diff; counts match the manifest (18 / 102 / 1,642 / 42,010).
4. `pnpm build && pnpm start`, then `pnpm test:e2e` (`e2e/psgc.spec.ts`); the data route's `.nft.json` lists `data/psgc/json/**`.
5. Vercel preview: R1 returns 200 with the immutable header; until T7 the proof route's `resolveAddress` call succeeds; after T7 it is gone and R1 still passes.

## Risks

- **Tracing key syntax for a catch-all route** is the main unknown; T1 settles it before anything else is built. A different layout would change the spec first.
- **Vercel deployment protection** may block `curl` against the preview; use the browser or a bypass token.
- The 120,000-byte file-size ceiling (A17) is a choice, about 60% above today's largest file.
