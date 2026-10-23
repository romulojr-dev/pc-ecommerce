# 001 — Plan: spec schemas and seed catalog

Status: **Draft** · Spec: [spec.md](spec.md) (approved) · Issue: #8

This plan explains how the approved spec is built: where the code lives, how its parts fit together, and why each choice was made. Behavior (field lists, error wording, which fields a re-seed keeps) is defined in the spec and not repeated here.

## Summary

- The Zod spec schemas and their field metadata live in **`lib/specs/`**, one file per category, plus a registry that maps each category slug to its schema.
- A category row in the database is linked to its schema **by its slug** (`cpu` ↔ `builderCategories.cpu`). No new column is needed.
- The seed lives in **`prisma/`**: `prisma/seed.ts` is the entry point, part data is in `prisma/seed/data/*.ts`, and validation and writing are separate modules so validation can be unit-tested without a database.
- **No Prisma schema change and no migration.** The database already has everything the seed needs.
- **No test runner in this story.** Vitest arrives in story 4, and the spec schemas become its first real tests. This story keeps validation in pure functions so those tests need no database, and verifies behavior by hand for now.
- **Dev database only.** The seed runs only against the local Neon dev branch. Getting the products into production is part of story 6.
- Docs: ADR 0001 (specs as JSONB), ADR 0002 (spec schemas in code), PRD check (already updated in this branch), and command updates in CLAUDE.md.

## Files

```
lib/
  slug.ts                      slugify(), shared by seed and (later) admin
  specs/
    enums.ts                   Socket, CpuGeneration (+ socket map), MemoryType, …
    helpers.ts                 int/positive helpers, uniqueList(), FieldMeta type
    categories/
      cpu.ts                   cpuSpecs schema + cpuFields metadata
      motherboard.ts
      memory.ts
      gpu.ts
      storage.ts
      psu.ts
      case.ts
      cpu-cooler.ts
    registry.ts                builderCategories: slug → { name, sortOrder, schema, fields }
    index.ts                   public API: types, registry, validateSpecs()
prisma/
  seed.ts                      entry point: load env, validate, write, report
  seed/
    load-env.ts                loads .env.local before anything reads env
    part-schema.ts             product-level fields (sku, price, …) + specs
    validate.ts                validateSeed(): pure, returns data or errors
    format-errors.ts           turns errors into the spec's message format
    write.ts                   writeSeed(): transaction, upserts, optional reset
    data/
      index.ts                 list of { file, category, parts }
      cpus.ts  motherboards.ts  memory.ts  gpus.ts
      storage.ts  psus.ts  cases.ts  cpu-coolers.ts
docs/adr/
  0001-store-specs-as-jsonb.md
  0002-spec-schemas-in-code.md
```

## 1. Where the Zod schemas live: `lib/specs/`

**Choice:** `lib/specs/`, with one file per category.

**Why:** the schemas are used in four places: the seed, the PC Builder rules engine (in the browser and on the server), the catalog filters, and later the admin forms. `lib/` is where shared, framework-neutral code goes, and the `@/lib` alias already exists. One file per category keeps each schema short enough to compare against a manufacturer spec sheet.

**Rule:** nothing in `lib/specs/` may import server-only code (`@/lib/db`, `@/lib/env`, Node APIs). The rules engine will import these schemas into the browser bundle, so they have to stay plain TypeScript plus Zod.

### What a category file looks like

Each file exports two things: the Zod schema and the field metadata.

```ts
// lib/specs/categories/cpu.ts (sketch)
export const cpuSpecs = z
  .strictObject({
    socket: socket,
    generation: cpuGeneration,
    cores: positiveInt(),
    threads: positiveInt(),
    baseClockMhz: positiveInt(),
    boostClockMhz: positiveInt(),
    tdpW: positiveInt(),
    hasIntegratedGraphics: z.boolean(),
  })
  .check(/* threads ≥ cores, boost ≥ base, generation belongs to socket */)

export const cpuFields = {
  socket: { label: "Socket", filterable: true, rules: ["socket-match", "cooler-socket", "bios-update"] },
  tdpW: { label: "Max power", unit: "W", filterable: true, rules: ["psu-wattage"] },
  // … every field
} satisfies FieldMetaMap<typeof cpuSpecs>
```

The choices behind it, in plain terms:

- **`z.strictObject`** rejects unknown keys, so a typo such as `lenghtMm` fails instead of being stored quietly.
- **Cross-field checks** (threads ≥ cores, NVMe ⇒ M.2, generation ⇒ socket, board generations ⇒ board socket) are added to the object schema with `.check()`. Each check reports its error on the specific field, so the message points at the field to fix.
- **The cooler** is a `z.discriminatedUnion("type", [air, aio])`. The AIO branch declares `heightMm` as `z.never(...).optional()` with the custom message `not allowed when type is "AIO"`, and the air branch does the same for `radiatorSizeMm`. That gives the spec's error wording instead of a generic "unrecognized key".
- **Lists** use a `uniqueList(item)` helper that rejects duplicates. `nonEmpty` is added where the spec says so.
- **Integers:** `positiveInt()` wraps `z.int().positive()`, and `nonNegativeInt()` covers `m2Slots`. Nothing coerces strings to numbers.

### Field metadata, and why it is a separate object

`FieldMetaMap<S>` is a TypeScript type that requires **exactly one entry for every field** of schema `S`, including fields that appear in only one branch of the cooler union. Forgetting a label, or keeping metadata for a field that was renamed, is then a type error. Zod 4 can also attach metadata to a schema with `.meta()`. A separate object was chosen because it is simpler to read and to iterate for filters and spec tables, and because TypeScript enforces that it is complete.

Each entry holds `label`, optional `unit`, `filterable`, `rules` (the rule IDs that read the field), and optional `options` (enum value → display label, e.g. `MICRO_ATX` → "Micro-ATX").

### Enums

`enums.ts` defines every shared enum once, as a `const` array plus `z.enum()`. Examples are `SOCKETS = ["AM4", "AM5", "LGA1700", "LGA1851"] as const`, with `export const socket = z.enum(SOCKETS)`. `CPU_GENERATION_SOCKET: Record<CpuGeneration, Socket>` maps each generation to its socket. Both the CPU and motherboard checks use this map, and the rules engine will use it later. Display labels for enum values live here too, so every category reuses the same "Micro-ATX" label.

### Public API (`lib/specs/index.ts`)

```ts
export { builderCategories, type BuilderCategorySlug } from "./registry"
export type Specs<C extends BuilderCategorySlug> = z.infer<(typeof builderCategories)[C]["schema"]>
export function isBuilderCategory(slug: string): slug is BuilderCategorySlug
export function validateSpecs<C extends BuilderCategorySlug>(category: C, input: unknown)
// → Zod safeParse result; used by the seed now, by admin forms and server actions later
```

`Specs<"cpu">` is the type the rules engine will use. When it reads `cpu.socket`, it gets `"AM4" | "AM5" | …`, not `unknown`.

## 2. How a category is linked to its schema

**Choice:** by slug. `lib/specs/registry.ts` exports:

```ts
export const builderCategories = {
  cpu:           { name: "CPU",          sortOrder: 1, schema: cpuSpecs,         fields: cpuFields },
  motherboard:   { name: "Motherboard",  sortOrder: 2, schema: motherboardSpecs, fields: motherboardFields },
  memory:        { name: "Memory",       sortOrder: 3, … },
  storage:       { name: "Storage",      sortOrder: 4, … },
  gpu:           { name: "Graphics Card", sortOrder: 5, … },
  case:          { name: "Case",         sortOrder: 6, … },
  psu:           { name: "Power Supply", sortOrder: 7, … },
  "cpu-cooler":  { name: "CPU Cooler",   sortOrder: 8, … },
} as const
```

To validate a product's specs, code loads the product's category, reads its `slug`, and looks up `builderCategories[slug]`. Categories that are not builder categories (monitors, peripherals later) have no entry, and `isBuilderCategory()` returns false for them.

**Why slug, in plain terms:** the slug is already unique in the database, it is stable, and it is human-readable in URLs (`/gpu/…`). Linking by slug therefore needs no new column and no migration. The seed creates the category rows **from this registry**, so the database and the code cannot disagree about names or order.

**What we gave up:** if someone later renamed the `gpu` slug in the database, for example for SEO, its products would lose their schema. Two guards apply. The admin category screen (AD-3) must not allow renaming the slug of a builder category. If URL slugs ever need to change, we would add a separate `schemaKey` column at that point, which is a small migration. We don't pay for that column now.

## 3. Seed data files

**Choice:** TypeScript files in `prisma/seed/data/`, one per category, each exporting a typed array.

```ts
// prisma/seed/data/cpus.ts (sketch)
export const cpus = [
  {
    sku: "100-100001015BOX",
    name: "AMD Ryzen 5 7600",
    brand: "AMD",
    price: 1149500,
    stock: 12,
    weightGrams: 400,
    warrantyMonths: 36,
    sourceUrl: "https://www.amd.com/…",
    specs: { socket: "AM5", generation: "zen-4", tdpW: 88 /* PPT */, … },
  },
] satisfies SeedPart<"cpu">[]
```

```ts
// prisma/seed/data/index.ts
export const seedFiles = [
  { file: "prisma/seed/data/cpus.ts", category: "cpu", parts: cpus },
  { file: "prisma/seed/data/motherboards.ts", category: "motherboard", parts: motherboards },
  // … one entry per category
] as const
```

**Why TypeScript instead of JSON:** `satisfies SeedPart<"cpu">[]` makes the editor flag a wrong enum value or a misspelled field while you type, before the seed runs. TypeScript also allows comments, such as `// PPT, not rated TDP` or a note on why a value was rounded.

**Why the file path is written out in `index.ts`:** error messages must name the file. Writing the path next to the import is the simplest reliable way to know it. At startup, `seed.ts` checks that each listed path exists, so a renamed file can't produce misleading messages.

**Why `satisfies` and not a type annotation:** `satisfies` checks the data without widening its type. The runtime validator still receives exactly what is in the file.

## 4. The seed script

### Flow of `prisma/seed.ts`

```
1. import "./seed/load-env"        → loads .env.local (must be the first import)
2. parse args                      → only "--reset" is allowed; anything else exits with usage text
   check every path in seedFiles exists
3. validateSeed(seedFiles)         → pure function, no database
     errors? → print formatErrors(errors), exit code 1, stop. (Nothing truncated, nothing written.)
4. --reset and NODE_ENV=production → refuse, exit code 1
5. --reset                         → print "Resetting catalog on <db host>"
6. writeSeed(db, data, { reset })  → one transaction
7. print the summary, disconnect, exit 0
```

**Why `load-env.ts` must be imported first:** `lib/env` checks the environment variables as soon as it is imported. Next.js loads `.env.local` automatically, but a plain `tsx` script does not. ES modules run their imports in order, so a tiny module that calls `dotenv.config({ path: ".env.local" })` and is imported first makes the variables available before `@/lib/db` loads. This is the same approach `prisma7.config.ts` already uses.

**Why the seed uses `@/lib/db`:** it is the same client and adapter setup as the app, so the seed exercises the real configuration. `tsx` understands the `@/` path alias from `tsconfig.json`.

### Validation: `prisma/seed/validate.ts`

`validateSeed(files)` returns either `{ ok: true, data }` or `{ ok: false, errors }`. It never touches the database, so story 4 can unit-test it with invalid fixtures and no database.

1. **Per part:** build the part schema for the file's category. That is the product fields from `part-schema.ts` (sku, name, brand, price, stock, …, all strict) plus `specs: builderCategories[category].schema`. Run `safeParse(part, { reportInput: true })`. `reportInput` makes Zod include the bad value in each issue, which the message formatter needs to tell "required" (value missing) apart from "wrong type".
2. **Fill defaults:** `slug` defaults to `slugify(name)`, `status` to `ACTIVE`, `lowStockAt` to 5 and `warrantyMonths` to 12. Brand slug is `slugify(brand)`.
3. **Across parts:** duplicate `sku` or `slug` across all files is reported once per duplicate, naming every location.
4. **Collect everything.** Validation never stops at the first error, so one run shows the full list.

Each error is `{ file, index, name?, sku?, path, message }`. The part's `name` and `sku` are taken from the raw input when they are strings, so the part can be identified even when those fields are themselves invalid.

### Error messages: `prisma/seed/format-errors.ts`

Zod's default messages are written for developers ("Invalid input: expected number, received undefined"). One small function maps Zod issue codes to the spec's wording:

| Zod issue | Message |
| --- | --- |
| `invalid_type` with missing input | `required` |
| `invalid_type` otherwise | `expected number, received string` |
| `invalid_value` (enum) | `expected one of AM4, AM5, LGA1700, LGA1851` |
| `unrecognized_keys` | `unrecognized key "memorySlot"` |
| custom (from `.check()` or `z.never`) | the custom message, e.g. `not allowed when type is "AIO"` |
| anything else | Zod's message |

The output is grouped per part under a header line, in the format the spec shows.

### Writing: `prisma/seed/write.ts`

`writeSeed(db, data, { reset })` runs everything inside **one interactive transaction** (`db.$transaction(async (tx) => …, { timeout: 60_000 })`). Prisma's default timeout is 5 seconds. Around 30 sequential writes to a remote Neon database can exceed that, so the timeout is raised.

1. **Reset (only with `--reset`):** run `TRUNCATE "ProductImage", "Product", "Brand", "Category" CASCADE`. It runs inside the transaction, so a failure later in the seed rolls the truncate back too. `CASCADE` also empties future tables that reference products, such as cart and build items. That is what a clean slate means.
2. **Categories:** upsert each registry entry by `slug`. Create and update both set `name` and `sortOrder`. This builds a `slug → id` map.
3. **Brands:** upsert each distinct brand by `slug`, creating it with its name. On update the name is refreshed. This builds a `slug → id` map.
4. **Products:**
   - First, one query: `findMany({ where: { sku: { in: allSkus } }, select: { sku: true } })`. This tells us which parts already exist, so we can count "created" and "updated" accurately and choose the right field set.
   - Also check that no **new** part's slug is already used by a different product in the database. If one is, fail with a message naming both SKUs instead of a raw unique-constraint error.
   - **New SKU → `create`** with every field.
   - **Existing SKU → `update`** with catalog fields only: `name`, `description`, `specs`, `categoryId`, `brandId`, `weightGrams`, `warrantyMonths`.
   - These two field lists are defined once, as constants at the top of `write.ts`. The "keep stock, price, status, slug" rule then lives in one visible place.
5. Return `{ categories, brands, created, updated }` for the summary line.

**Why separate `create`/`update` instead of Prisma's `upsert`:** `upsert` doesn't say whether it created or updated a row, and the spec's summary needs both counts. Since we look up existing SKUs first anyway, explicit `create`/`update` calls are clearer to read.

**Why `NODE_ENV` is read directly for the production guard:** the seed is a tool, not app code, and `lib/db.ts` already reads `process.env.NODE_ENV` the same way. Adding `NODE_ENV` to the validated env schema just for this would be heavier than the check itself.

## 5. Commands and configuration

**package.json** gets one script:

```json
"db:seed": "tsx prisma/seed.ts"
```

**prisma7.config.ts** registers the same entry point as Prisma's seed command:

```ts
migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
```

**Why the npm script calls `tsx` directly instead of `prisma db seed`:** both run the same file. Calling `tsx` directly means `pnpm db:seed --reset` passes `--reset` straight to the script. Going through `prisma db seed` would require `pnpm db:seed -- --reset`, which is easy to get wrong. Registering it in the Prisma config as well means `prisma db seed`, and any Prisma command that triggers seeding, uses the same script.

**Dependencies:** none added. `tsx`, `dotenv` and `zod` are already installed.

**Which database:** `pnpm db:seed` runs against `DATABASE_URL` from `.env.local`, which is the Neon dev branch. Nothing in this story seeds production or preview databases, and the seed is not part of `pnpm build` or the Vercel build. Getting the products into production is part of story 6 ("live on the production URL"). Preview databases are branched from main, so once production has the data, every preview gets it too.

## 6. Database schema and migrations

**No migration.** The existing `init` migration already has everything this story needs:

- `Product.specs` is `JSONB NOT NULL` with a GIN index.
- `Category` has no `specSchema` column, so there is nothing to remove after D1.
- `Product.sku`, `Product.slug`, `Brand.slug` and `Category.slug` are already unique, which the upserts rely on.

The only edit to `prisma/schema.prisma` is the comment on `specs`, from "validated by the category's Zod schema (story 3)" to "validated by lib/specs (see ADR 0002)". Comments don't change the database, so `prisma migrate dev` will report no changes.

## 7. Tests

**No automated tests in this story.** Vitest is set up in story 4. Until then, the type checker covers the data files (through `satisfies`) and the field metadata (through `FieldMetaMap`), and behavior is checked by hand (see Verification).

What this story does to make story 4 easy:

- `validateSpecs()` and `validateSeed()` are pure functions with no database or env access, so tests can call them directly with inline fixtures.
- The 23 seed parts are exported arrays, so tests can import them as known-valid fixtures.

**Handoff to story 4:** the spec schemas become Vitest's first real tests, instead of a placeholder test. At minimum:

- For each category, a valid part (one of the seeded parts) passes `validateSpecs`.
- For each category, a part missing a compatibility-rule field fails, and the error points at that field. Examples: a CPU without `socket`, a GPU without `lengthMm`, a case without `maxCoolerHeightMm`.

Good follow-ups for the same story are the cross-field checks (`zen-4` on LGA1700, NVMe on a 2.5" drive, AIO with `heightMm`) and the rows of the spec's "Seed validation examples" table, asserting the formatted messages. An automated test of `writeSeed` against a real database belongs with the CI work that brings a throwaway Postgres.

## 8. Docs

- **`docs/adr/0001-store-specs-as-jsonb.md`:** context (each category has different specs, filters need to query them, and the admin panel edits them). Options: per-category tables, EAV rows, or a JSONB column. Decision: JSONB plus a GIN `jsonb_path_ops` index, validated in code. Consequences: equality and containment filters use the index, while range filters (`lengthMm ≤ 300`) scan, which is fine at catalog size. The database does not enforce shape, so all writes must go through `validateSpecs`.
- **`docs/adr/0002-spec-schemas-in-code.md`:** the D1 decision. Context: the PRD planned a `Category.specSchema` column. Options: a DB column, Zod in code, or a hybrid. Decision: Zod in `lib/specs`, linked by slug. Consequences: it uses the trade-off table from the spec, adds a new field via a reviewed code change, and lists the guard on renaming builder category slugs. The ADR links back to the spec.
- **`docs/prd.md`:** the data model (`Category` without `specSchema`), AD-3 (spec fields in code) and the M.2 row were **already updated** in this branch while the spec was written. The task here is to re-read those three places after ADR 0002 exists and make sure the PRD references "ADR 0002" by its final file name.
- **`CLAUDE.md`:** add `pnpm db:seed` (and `--reset`, dev database only) to Commands, and add a line under Stack and architecture: spec schemas live in `lib/specs/` and are linked to categories by slug. "There is no test runner configured yet" stays until story 4.

## 9. Order of work

Each step is small enough for one commit and leaves the repo building.

1. `lib/slug.ts`.
2. `lib/specs/enums.ts` and `helpers.ts` (including the `FieldMetaMap` type).
3. The eight category schemas with their metadata, one commit per few categories.
4. `lib/specs/registry.ts` and `index.ts` (`validateSpecs`, `Specs<C>`).
5. `prisma/seed/part-schema.ts`, `validate.ts` and `format-errors.ts`.
6. The eight data files with the 23 parts, each value checked against its `sourceUrl`.
7. `write.ts`, `load-env.ts`, `seed.ts`, the `db:seed` script and the Prisma config entry.
8. Manual verification against the Neon dev branch (below).
9. ADR 0001, ADR 0002, the PRD check, CLAUDE.md, and the `schema.prisma` comment.

`tasks.md` will break these into checkable tasks.

## 10. Verification

All of these run against the Neon dev branch only.

- `pnpm typecheck` and `pnpm lint` pass.
- Type check catches a bad data file: temporarily set a CPU's `socket` to `"AM6"` and confirm `pnpm typecheck` fails on that line. Revert.
- `pnpm db:seed` on an empty dev database → `23 created, 0 updated`. Spot-check rows in Prisma Studio: specs are stored as written, prices are in centavos, and categories are in builder order.
- Change one product's `stock` and `price` in Studio, then run `pnpm db:seed` again → `0 created, 23 updated`. The edited stock and price are unchanged, and the product's `id` is unchanged.
- Edit a data file to remove a GPU's `lengthMm`, then run the seed → exit code 1, the spec's message format, and the database unchanged. Revert the edit.
- Runtime checks that the type checker can't see: temporarily make two changes at once, a CPU with `generation: "zen-4"` on `LGA1700` and a duplicate `sku` in another file. Run the seed → both errors are reported in one run, worded as in the spec, and nothing is written. Revert.
- `pnpm db:seed --reset` with that same invalid edit → refused before truncating. With valid data → `23 created`, and the earlier stock edit is gone.
- `NODE_ENV=production pnpm db:seed --reset` → refused.

## Risks

| Risk | Mitigation |
| --- | --- |
| Manufacturer values are wrong or ambiguous (board M.2 counts, native CPU generations, case clearances) | `sourceUrl` on every part. Values are checked while writing step 7. If a value changes which scenario a part covers, swap the part, as the spec says |
| Transaction timeout on a slow connection | Timeout raised to 60 s. 23 parts is far below any realistic limit |
| `lib/specs` accidentally imports server code and breaks the client bundle later | Rule stated above. The rules-engine story will import it from a client component, which catches this immediately |
| Zod 4 issue codes change wording in a minor release | `format-errors.ts` maps codes, not message strings. Story 4's tests will assert the final messages |
| Validation regressions go unnoticed until story 4 | Story 4 is next, and its first tests target exactly these schemas. Until then, the manual checks above run before the PR |
