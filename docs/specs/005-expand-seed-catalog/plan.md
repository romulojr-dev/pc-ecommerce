# 005 — Plan: expand the seed catalog

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #18

## Context

Category pages, filters and pagination (Catalog epic) need a realistic catalog. The 23-part fixture set from spec 001 grows to 60 parts. Category slugs will be top-level URLs (`/gpu/...`), so they must never clash with a route; the seed gains a reserved-slug check backed by one shared list. Production is re-seeded after merge.

## Summary

- **No schema change, no migration.** The fields used here already exist: `salePrice`, `stock`, `lowStockAt` and `sourceUrl` in [prisma/seed/part-schema.ts](../../../prisma/seed/part-schema.ts). Every enum value needed (AM4/LGA1851, zen-3/arrow-lake, `DRIVE_3_5`, `INTEL` GPUs, 420 mm radiators) is already in [lib/specs/enums.ts](../../../lib/specs/enums.ts).
- **Data files only grow.** The 23 existing entries keep their values. The only edit to existing text is the header comment wording ("approximate" → "sample PH retail prices").
- **Reserved slugs in `lib/`, checked in `prisma/seed.ts`.** Category rows come from `builderCategories` (`upsertCategories` in [prisma/seed/write.ts](../../../prisma/seed/write.ts)), not from the data files. So the check runs on the registry's slugs, before `validateSeed` and before any database access.
- **Two new test files, one per concern**, both pure (no database, no env).

## Files

```
lib/reserved-slugs.ts                 RESERVED_SLUGS, isReservedSlug()
lib/reserved-slugs.test.ts            list behaviour + "every app/ top-level route is reserved"
prisma/seed/validate.ts               findReservedCategorySlugs() → error messages
prisma/seed/validate.test.ts          tests for it (cart rejected; real registry passes)
prisma/seed.ts                        call it before validateSeed; exit 1 on a clash
prisma/seed/data/*.ts                 37 new parts (8 files)
prisma/seed/data/coverage.test.ts     catalog minimums from the spec
prisma/seed/write.ts                  comment only: "~50 sequential writes" → "~100"
CLAUDE.md                             db:seed line mentions the reserved-slug check
docs/prd.md                           open question "which brands / how many SKUs" → answered for the MVP seed, link spec 005
```

## `lib/reserved-slugs.ts`

```ts
// Top-level route names. Category pages live at /<category-slug> (PRD:
// /gpu/rtx-5070-12gb), so a category may not take one of these. Add a name
// here before adding a top-level route; reserved-slugs.test.ts checks app/.
export const RESERVED_SLUGS = [
  // planned
  "cart", "builder", "account", "admin", "checkout", "search", "api",
  // current
  "products", "login", "signup", "sidebar",
  // likely, reserved early
  "build", "builds", "orders", "brands", "deals", "compare", "wishlist",
  "auth", "logout", "about", "contact", "help",
] as const

const reserved: ReadonlySet<string> = new Set(RESERVED_SLUGS)

export function isReservedSlug(slug: string): boolean
```

Client-safe (the admin form will import it). Exact match only.

## Seed check

In [prisma/seed/validate.ts](../../../prisma/seed/validate.ts):

```ts
// Category slugs that clash with a top-level route (spec 005)
export function findReservedCategorySlugs(slugs: readonly string[]): string[]
// → ['Category slug "cart" is reserved for a top-level route (lib/reserved-slugs.ts)']
```

[prisma/seed.ts](../../../prisma/seed.ts): after the missing-files check and before `validateSeed`, call it with `Object.keys(builderCategories)`, print the messages and `return 1`. Nothing is written, and the database is never touched.

## Tests

**`lib/reserved-slugs.test.ts`**
- `isReservedSlug("cart")` → true; `"cart-accessories"`, `"gpu"` → false.
- No duplicates in `RESERVED_SLUGS`; every entry matches the slug regex.
- Routes are reserved: walk `app/` with `node:fs` (`readdirSync(…, { withFileTypes: true })`). Look inside `(group)` folders; skip `[dynamic]`, `_private` and `@slot` folders; collect the other directory names (today: `products`, `login`, `signup`, `sidebar`). Expect each one to be in `RESERVED_SLUGS`, and name the missing ones in the failure message.

**`prisma/seed/validate.test.ts`** (new `describe`)
- `findReservedCategorySlugs(["gpu", "cart"])` → one message naming `cart`.
- `findReservedCategorySlugs(Object.keys(builderCategories))` → `[]`.

**`prisma/seed/data/coverage.test.ts`** runs on `validateSeed(seedFiles)` output, so `lowStockAt` defaults are filled. It uses `getStockStatus` from [lib/stock.ts](../../../lib/stock.ts).
- Each category has ≥ 6 parts; the total is 55–65.
- Each category has ≥ 3 distinct `brandSlug`s (≥ 2 for `cpu`).
- ≥ 3 parts are out of stock, and ≥ 5 are low stock.
- 4–8 parts have a `salePrice`.
- At least one PSU has `wattageW ≥ 1000`.
- The 23 fixture SKUs are still present (a listed constant). This guards spec 001's scenarios against an accidental removal.

## Data

Every new part:

- Is checked against its manufacturer spec page before it is written; `sourceUrl` points to that page. Pages are fetched during each data task.
- Follows spec 001's naming, unit and rounding rules and the category's schema in [lib/specs/categories/](../../../lib/specs/categories/).
- Has a sample PHP price in centavos, with a `// budget` / `// mid` / `// high` comment.

If a candidate's page lacks a required field, swap it for a part of the same tier and role.

| Category | New (candidates) | Total | Roles / brands added |
| --- | --- | --- | --- |
| CPU | Ryzen 5 5600 (AM4), Core i3-14100F, Core Ultra 5 245K, Core Ultra 7 265K, Ryzen 9 9950X | 8 | AM4 and LGA1851 platforms, budget tier |
| Motherboard | ASUS TUF Gaming B550-PLUS WiFi II (AM4), ASRock B650M-HDV/M.2, Gigabyte B760 Gaming X AX (DDR5), MSI PRO B860M-A WiFi (LGA1851), Gigabyte X870E AORUS ELITE WiFi7 | 8 | Gigabyte; AM4/LGA1851 boards; DDR5 on LGA1700 |
| Memory | Corsair Vengeance LPX DDR4-3200 16 GB, Kingston FURY Beast DDR5-5600 16 GB, G.Skill Flare X5 DDR5-6000 32 GB, TeamGroup T-Force Delta RGB DDR5-6000 32 GB, G.Skill Trident Z5 RGB DDR5-6400 64 GB | 7 | G.Skill, TeamGroup; 64 GB kit |
| Storage | Kingston NV3 1 TB, Crucial T705 2 TB (Gen5), Samsung 870 EVO 500 GB, Seagate BarraCuda 2 TB 3.5" | 7 | Kingston, Seagate; HDD (`DRIVE_3_5`) |
| GPU | Gigabyte RTX 3050 6 GB OC Low Profile, Intel Arc B580 Limited Edition, Sapphire PULSE RX 7600, MSI RTX 5060 Ti 16G Ventus 2X, Sapphire PULSE RX 9070 XT, ASUS TUF RTX 5080 | 9 | AMD and Intel chipsets; Sapphire, MSI, Intel |
| Case | Montech AIR 100 ARGB, Corsair 4000D Airflow, NZXT H5 Flow (2024), Lian Li O11 Dynamic EVO | 7 | Montech, Corsair, NZXT |
| PSU | MSI MAG A650BN, Seasonic FOCUS GX-1000, be quiet! Pure Power 12 M 750 W, Lian Li SP850 (SFX) | 7 | ≥ 1000 W PSU; second SFX |
| CPU cooler | ID-COOLING SE-224-XT, DeepCool AK400, Noctua NH-D15 G2, NZXT Kraken 240 | 7 | Budget air, tall air (168 mm), 240 mm AIO |

60 parts in total, 37 new.

**Stock and sale mix.** Each data task places some of the targets, so the totals are met before T6:

- Out of stock: the RTX 5090 already is. Add RTX 5080, Trident Z5 64 GB and X870E AORUS.
- Low stock (≤ 5): the 9800X3D, the Ridge and one PSU already are. Add at least 3 more.
- Sale prices: about 6, at least one in each data task, across tiers.

**New scenarios this enables:**
- 5090 + Seasonic GX-1000 passes PSU wattage.
- An AM4 board with DDR5 memory fails the memory type check.
- An NH-D15 G2 (168 mm) in the Q300L (157 mm) fails cooler height.
- A Core Ultra on an LGA1700 board fails the socket check.

None of these is required; they are only noted in the data comments.

## Verification

- `pnpm test` (all unit tests, `.env.local` renamed to prove there are no env reads), `pnpm lint`, `pnpm typecheck`.
- Reserved check by hand: temporarily rename a registry key to `cart` → `pnpm db:seed` prints the reserved message and exits 1 without printing "Seeding …". Add a fake `app/deals2/` folder → the routes test fails. Revert both.
- `pnpm db:seed` on the Neon dev branch: first run `(37 created, 23 updated; …)`; second run `(0 created, 60 updated; …)` with the same row counts. Note how long the transaction takes against the 60 s timeout.
- `git diff prisma/seed/data` shows only additions, apart from the header comments.
- `pnpm dev` → `/products` lists 60 rows; `pnpm test:e2e` passes.
- CI passes on the PR. After merge, production is re-seeded per spec 004 "Seeding production", and `/products` shows 60 parts.
