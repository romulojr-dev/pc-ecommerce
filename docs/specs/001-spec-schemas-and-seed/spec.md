# 001 — Spec schemas and seed catalog

Status: **Draft** · Issue: #8 · PRD refs: FR-5, PC Builder → Compatibility rules (MVP), Data model, Risks

## Summary

Every builder part has a typed spec schema. The schema says which spec fields a part has, the type and unit of each field, and which fields are required. A seed command loads a fixture set of 23 real parts from TypeScript data files. It validates every part against its category's schema and writes nothing if any part is invalid. The fixture set is chosen so that every compatibility rule in the PRD has a passing and a failing build. Story 3 does not build the rules engine, the filter UI or the admin forms. It provides the data contract they all depend on.

## Goals

1. One schema per builder category: CPU, motherboard, memory, GPU, storage, PSU, case, CPU cooler.
2. Every field that a PRD compatibility rule reads is **required**. A part without it cannot be seeded, and later cannot be published.
3. The FR-5 filter fields exist as typed spec fields.
4. `pnpm db:seed` is an idempotent upsert. It never overwrites stock or price on existing products, and it rejects invalid data with a message that names the file, the part and the field.
5. The seeded parts allow a compatible build and an incompatible build for every rule.

## Naming and units

These conventions apply to every spec field, now and in later categories.

- **camelCase**, with the unit as a suffix whenever the value has a unit: `tdpW`, `lengthMm`, `capacityGb`, `speedMts`, `boostClockMhz`.
- **One base unit per dimension.** Values are always stored in that unit and never converted at read time:

  | Dimension | Base unit | Suffix | Example |
  | --- | --- | --- | --- |
  | Length | millimetre | `Mm` | `lengthMm: 304` |
  | Power | watt | `W` | `tdpW: 88` |
  | Data capacity | gigabyte (decimal, 1 TB = 1000 GB) | `Gb` | `capacityGb: 2000` |
  | Memory speed | megatransfers per second | `Mts` | `speedMts: 6000` (shown as "DDR5-6000") |
  | Clock speed | megahertz | `Mhz` | `boostClockMhz: 5100` (shown as "5.1 GHz") |
  | Money (product fields, not specs) | centavo | — | `price: 1299900` |

  `Gb` means gigabytes in this codebase, never gigabits, even though `GB` would be the usual symbol. The suffix is lowercase to keep camelCase consistent. The display layer turns base units into friendly units ("2 TB", "5.1 GHz").
- **Integers only.** Every numeric spec is a positive integer. Manufacturer values with decimals are rounded **toward the safe side** for compatibility. Part dimensions (GPU length, cooler height) are rounded **up**. Case limits (max GPU length, max cooler height) are rounded **down**. Example: a 227.2 mm GPU is stored as `228`, and a case's 180.5 mm cooler clearance is stored as `180`.
- **Worst-case power.** Power fields used by the PSU wattage rule hold the part's worst-case draw, not a marketing headline (see the CPU `tdpW` note).
- **Counts** carry no unit suffix: `cores`, `memorySlots`, `m2Slots`, `moduleCount`.
- **Booleans** start with `has`/`is`: `hasIntegratedGraphics`, `hasWifi`.
- **Lists** are plural and must not be empty unless the table says they can be: `supportedSockets`, `psuFormFactors`. Duplicate entries are rejected.
- **Enum values** are stable identifiers. Where an industry token exists, that token is the value (`AM5`, `DDR5`, `ATX`). Other fixed sets use SCREAMING_SNAKE. CPU generations use kebab-case slugs (`raptor-lake-refresh`). Display labels such as "Micro-ATX" or "Raptor Lake Refresh" live in field metadata, not in the stored value.

## Shared enums

| Enum | Values |
| --- | --- |
| `Socket` | `AM4`, `AM5`, `LGA1700`, `LGA1851` |
| `CpuGeneration` (→ socket) | `zen-3` (AM4), `zen-4` (AM5), `zen-5` (AM5), `alder-lake` (LGA1700), `raptor-lake` (LGA1700), `raptor-lake-refresh` (LGA1700), `arrow-lake` (LGA1851) |
| `MemoryType` | `DDR4`, `DDR5` |
| `MotherboardFormFactor` | `E_ATX`, `ATX`, `MICRO_ATX`, `MINI_ITX` |
| `PsuFormFactor` | `ATX`, `SFX`, `SFX_L` |
| `RadiatorSizeMm` | `120`, `140`, `240`, `280`, `360`, `420` |
| `StorageInterface` | `NVME`, `SATA` |
| `StorageFormFactor` | `M2_2230`, `M2_2242`, `M2_2280`, `DRIVE_2_5`, `DRIVE_3_5` |
| `CoolerType` | `AIR`, `AIO` |
| `GpuChipsetBrand` | `NVIDIA`, `AMD`, `INTEL` |
| `EfficiencyRating` | `WHITE`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `TITANIUM` |
| `Modularity` | `FULL`, `SEMI`, `NONE` |

Each `CpuGeneration` belongs to exactly one socket. The schemas use that mapping for cross-field checks. `E_ATX` is in the enum, but no E-ATX board is stocked yet. Cases that support E-ATX list it, so an E-ATX board added later needs no data changes to cases. Adding an enum value is a code change and needs review, by design (see Decision D1).

## Category schemas

Column key. **Req**: the field is required. **Filter**: the field appears as an FR-5 facet. **Rule**: the PRD compatibility rule(s) that read the field. Brand, price and "in stock only" are `Product` columns and are filterable on every category, so they are not listed here.

All schemas are **strict**: an unknown key (for example a typo such as `lenghtMm`) is a validation error, not silently stored.

### CPU — slug `cpu`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `socket` | `Socket` | — | ✔ | ✔ | Socket match, Cooler socket, BIOS update |
| `generation` | `CpuGeneration`, must belong to `socket` | — | ✔ | ✔ | BIOS update |
| `cores` | int ≥ 1 | count | ✔ | ✔ | — |
| `threads` | int ≥ `cores` | count | ✔ | | — |
| `baseClockMhz` | int | MHz | ✔ | | — |
| `boostClockMhz` | int ≥ `baseClockMhz` | MHz | ✔ | ✔ | — |
| `tdpW` | int | W | ✔ | ✔ | PSU wattage |
| `hasIntegratedGraphics` | boolean | — | ✔ | ✔ | Integrated graphics |

**`tdpW` is worst-case package power at full boost**, because it feeds the PSU wattage estimate. It means the same thing for every CPU:

- **Intel:** Maximum Turbo Power (i5-14400F: 148 W, not its 65 W base power).
- **AMD:** PPT (Package Power Tracking), the socket power limit at full boost, which is 1.35 × the rated TDP on standard parts (Ryzen 5 7600: 88 W, not 65 W; Ryzen 7 9800X3D: 162 W, not 120 W).

The field keeps the name `tdpW` because "TDP" is the filter shoppers expect (FR-5). Its label is "Max power". Intel hybrid CPUs store total cores (P + E).

### Motherboard — slug `motherboard`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `socket` | `Socket` | — | ✔ | ✔ | Socket match, BIOS update |
| `chipset` | string, e.g. `"B650"` | — | ✔ | ✔ | — |
| `nativeCpuGenerations` | `CpuGeneration[]`, non-empty, all belong to `socket` | — | ✔ | | BIOS update |
| `formFactor` | `MotherboardFormFactor` | — | ✔ | ✔ | Form factor |
| `memoryType` | `MemoryType` | — | ✔ | ✔ | Memory type |
| `memorySlots` | int ≥ 1 | count | ✔ | | Memory slots |
| `maxMemoryGb` | int | GB | ✔ | | Memory capacity |
| `m2Slots` | int ≥ 0 | count | ✔ | ✔ | M.2 slots |
| `hasWifi` | boolean | — | ✔ | ✔ | — |

`nativeCpuGenerations` lists the CPU generations that the board's **launch BIOS** supports. A CPU on the right socket whose generation is not in this list may need a BIOS update before it will boot. Whether a BIOS update is needed depends on the board and CPU together, so the data lives on the board, not the CPU. The same CPU can be native on a newer board and need an update on an older one.

### Memory — slug `memory`

A product is one retail **kit**. Capacity is the kit total.

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `memoryType` | `MemoryType` | — | ✔ | ✔ | Memory type |
| `capacityGb` | int, kit total | GB | ✔ | ✔ | Memory capacity |
| `moduleCount` | int ≥ 1 | count | ✔ | ✔ | Memory slots |
| `speedMts` | int | MT/s | ✔ | ✔ | — |
| `casLatency` | int | cycles | ✔ | | — |

The builder computes sticks as `moduleCount × quantity` and total memory as `capacityGb × quantity`.

### GPU — slug `gpu`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `chipsetBrand` | `GpuChipsetBrand` | — | ✔ | ✔ | — |
| `chipset` | string, e.g. `"GeForce RTX 5070"` | — | ✔ | ✔ | — |
| `vramGb` | int | GB | ✔ | ✔ | — |
| `lengthMm` | int (rounded up) | mm | ✔ | ✔ | GPU length |
| `boardPowerW` | int (TBP / TGP) | W | ✔ | | PSU wattage |

### Storage — slug `storage`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `interface` | `StorageInterface` | — | ✔ | ✔ | — |
| `formFactor` | `StorageFormFactor` | — | ✔ | ✔ | M.2 slots |
| `capacityGb` | int | GB | ✔ | ✔ | — |

Cross-field checks: `NVME` requires an `M2_*` form factor. `DRIVE_2_5` and `DRIVE_3_5` require `SATA`. M.2 SATA is allowed. The M.2 slots rule counts **every** drive whose `formFactor` is `M2_*`, whatever its interface, because an M.2 SATA drive still occupies a physical M.2 slot.

### PSU — slug `psu`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `formFactor` | `PsuFormFactor` | — | ✔ | ✔ | PSU form factor |
| `wattageW` | int | W | ✔ | ✔ | PSU wattage |
| `efficiencyRating` | `EfficiencyRating` | — | ✔ | ✔ | — |
| `modularity` | `Modularity` | — | ✔ | ✔ | — |

### Case — slug `case`

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `motherboardFormFactors` | `MotherboardFormFactor[]`, non-empty | — | ✔ | ✔ | Form factor |
| `maxGpuLengthMm` | int (rounded down) | mm | ✔ | ✔ | GPU length |
| `maxCoolerHeightMm` | int (rounded down) | mm | ✔ | ✔ | Cooler height |
| `radiatorSizesMm` | `RadiatorSizeMm[]`, **may be empty** | mm | ✔ | | Radiator fit |
| `psuFormFactors` | `PsuFormFactor[]`, non-empty | — | ✔ | | PSU form factor |

`maxGpuLengthMm` is the manufacturer's maximum with no front radiator fitted. `radiatorSizesMm` is the union of supported sizes across all mounting positions. An empty list means the case takes no AIO.

### CPU cooler — slug `cpu-cooler`

A discriminated union on `type`:

| Field | Type | Unit | Req | Filter | Rule |
| --- | --- | --- | --- | --- | --- |
| `type` | `CoolerType` | — | ✔ | ✔ | Cooler height / Radiator fit (selects which applies) |
| `supportedSockets` | `Socket[]`, non-empty | — | ✔ | ✔ | Cooler socket |
| `heightMm` | int (rounded up) | mm | ✔ if `AIR`, **forbidden** if `AIO` | | Cooler height |
| `radiatorSizeMm` | `RadiatorSizeMm` | mm | ✔ if `AIO`, **forbidden** if `AIR` | ✔ | Radiator fit |

### Field metadata

Each field also carries metadata in code, next to its Zod definition: `label` (e.g. "Max GPU length"), `unit` for display, `filterable`, the `rules` that use it, and enum display labels. FR-5 filters, the FR-9 spec table and the AD-2 admin form all read this metadata, so field names and labels exist in one place only.

## Rule → field coverage

Every row of the PRD rules table, with the fields it reads. All of them are required (✔ above).

| Rule | Fields |
| --- | --- |
| Socket match | `cpu.socket`, `motherboard.socket` |
| Memory type | `memory.memoryType`, `motherboard.memoryType` |
| Memory slots | `memory.moduleCount` (× qty), `motherboard.memorySlots` |
| Memory capacity | `memory.capacityGb` (× qty), `motherboard.maxMemoryGb` |
| Form factor | `motherboard.formFactor`, `case.motherboardFormFactors` |
| GPU length | `gpu.lengthMm`, `case.maxGpuLengthMm` |
| Cooler height | `cooler.type = AIR`, `cooler.heightMm`, `case.maxCoolerHeightMm` |
| Cooler socket | `cooler.supportedSockets`, `cpu.socket` |
| Radiator fit | `cooler.type = AIO`, `cooler.radiatorSizeMm`, `case.radiatorSizesMm` |
| PSU wattage | `cpu.tdpW`, `gpu.boardPowerW`, `psu.wattageW` |
| PSU form factor | `psu.formFactor`, `case.psuFormFactors` |
| M.2 slots | `storage.formFactor` (all `M2_*`, × qty), `motherboard.m2Slots` |
| Integrated graphics | `cpu.hasIntegratedGraphics` (+ GPU slot empty) |
| BIOS update | `cpu.socket`, `cpu.generation`, `motherboard.socket`, `motherboard.nativeCpuGenerations`. Warning when the sockets match and the generation is not native. Never blocks the build. When the sockets differ, only Socket match fires |

How each rule behaves (messages, thresholds, any power allowance for parts other than the CPU and GPU) belongs to the PC Builder spec. This story guarantees only that the data exists and is valid.

## Seed behavior

### Command and files

```
prisma/
  schema.prisma
  seed.ts                 entry point
  seed/
    data/
      cpus.ts
      motherboards.ts
      memory.ts
      gpus.ts
      storage.ts
      psus.ts
      cases.ts
      cpu-coolers.ts
```

- `prisma/seed.ts` is registered as the Prisma seed command (`migrations.seed` in [prisma7.config.ts](../../../prisma7.config.ts)). `pnpm db:seed` runs it against `DATABASE_URL` from `.env.local`. It is never run automatically by `pnpm build` or on Vercel.
- `pnpm db:seed --reset` empties the catalog tables first (see Reset).
- Each data file exports one array of parts for one category. The arrays are typed with the category schema's input type, so most mistakes show up in the editor. The **runtime** validation below is still authoritative: `tsx` does not type-check, and cross-file checks cannot be expressed in types.
- The categories themselves (name, slug, `sortOrder` in builder order: CPU → Motherboard → Memory → Storage → GPU → Case → PSU → CPU Cooler) come from the code registry, not from the data files.

### Part record

```ts
{
  sku: "100-100001015BOX",
  name: "AMD Ryzen 5 7600",
  brand: "AMD",
  price: 1149500,
  stock: 12,
  weightGrams: 400,
  warrantyMonths: 36,
  sourceUrl: "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html",
  specs: {
    socket: "AM5",
    generation: "zen-4",
    cores: 6,
    threads: 12,
    baseClockMhz: 3800,
    boostClockMhz: 5100,
    tdpW: 88, // AMD PPT, not the 65 W rated TDP
    hasIntegratedGraphics: true,
  },
}
```

- Required: `sku`, `name`, `brand`, `price` (integer centavos > 0), `stock` (int ≥ 0), `weightGrams` (int > 0), `sourceUrl` (URL of the manufacturer spec page used), `specs`.
- Optional: `slug` (default: slugified `name`), `salePrice` (must be < `price`), `lowStockAt` (default 5), `warrantyMonths` (default 12), `status` (default `ACTIVE` for seed data), `description`.
- `brand` is a brand name. Brands are upserted by slug, so `"AMD"` and `"amd"` resolve to the same brand.
- `sourceUrl` is for review and traceability only and is not stored on `Product`.

### Validation (all-or-nothing)

Validation is a pure function that takes `{ file, parts }[]` and returns a list of errors. The seed uses it, and tests can call it with invalid fixtures directly.

1. Validate every part's product fields and its `specs` against its category schema.
2. Check across files: `sku` and `slug` must be unique across the whole seed set.
3. If **anything** fails, print **every** error (not just the first), write nothing, and exit with code 1. This happens before `--reset` truncates anything, so invalid data never wipes the database.
4. Each error names the file, the part's position and identity, the field path, and the reason:

```
Seed failed: 2 problems in 2 parts. Nothing was written.

prisma/seed/data/gpus.ts › #3 "ASUS ROG Astral GeForce RTX 5090 OC" (sku ROG-ASTRAL-RTX5090-O32G-GAMING)
  specs.lengthMm: required

prisma/seed/data/cpu-coolers.ts › #2 "Arctic Liquid Freezer III 360" (sku ACFRE00136A)
  specs.heightMm: not allowed when type is "AIO"
```

When a part has no usable `name` or `sku`, the error identifies it by position only (`#3`). If a data file fails to import (a syntax error, for example), the seed names that file, shows the import error and writes nothing.

### Writes (upsert keyed on SKU)

All writes run in one transaction. A failure partway through leaves the database unchanged. Categories and brands are upserted by `slug`. Products are upserted by `sku`. An existing row is **updated in place**, so its `id` never changes and carts, builds and orders that reference it stay valid.

Which product fields the seed writes:

| Field | On create | On update |
| --- | --- | --- |
| `name`, `description`, `specs`, `categoryId`, `brandId`, `weightGrams`, `warrantyMonths`, images (when a later story seeds them) | ✔ | ✔ refreshed (catalog data) |
| `price`, `salePrice` | ✔ | ✘ kept (managed in admin) |
| `stock`, `lowStockAt` | ✔ | ✘ kept (changes with orders and admin adjustments) |
| `status` | ✔ | ✘ kept (admin publish toggle) |
| `slug` | ✔ | ✘ kept (product URLs stay stable when a name changes) |

Once the store is running, stock moves with orders and prices are edited in the admin panel. A re-seed must never wipe that data. Products in the database that are not in the data files are left untouched and are not deleted.

On success the seed prints a summary, for example `Seeded 8 categories, 17 brands, 23 products (23 created, 0 updated).` A second run prints `(0 created, 23 updated; stock, price and status kept)` and leaves row counts unchanged.

### Reset (development only)

`pnpm db:seed --reset` gives a clean slate:

1. Validate first, exactly as above. If validation fails, nothing is truncated.
2. Print the target database host.
3. In the same transaction as the writes, truncate `ProductImage`, `Product`, `Brand` and `Category` (with `CASCADE`, so later tables such as cart and build items that reference products are emptied too).
4. Seed. Every row is created, so stock and price come from the data files.

`--reset` refuses to run when `NODE_ENV` is `production`. Without `--reset`, the seed never deletes anything.

## Seed parts list (fixture set)

23 real parts. They are a fixture set chosen to trigger every rule, not the full catalog. The values below come from manufacturer pages and **must be re-checked against `sourceUrl` while writing the data files**. That includes `nativeCpuGenerations`, which is the generation list of each board's launch BIOS in the manufacturer's CPU support list. If a checked value changes which scenario a part covers, swap the part, not the scenario. Prices are realistic PH retail, set in the data files.

| # | Category | Part | Key specs | Why it is here |
| --- | --- | --- | --- | --- |
| 1 | CPU | AMD Ryzen 5 7600 | AM5, zen-4, 6C/12T, 88 W PPT, iGPU | Baseline AM5 with iGPU |
| 2 | CPU | AMD Ryzen 7 9800X3D | AM5, **zen-5**, 8C/16T, 162 W PPT, iGPU | High power, BIOS warning on B650 |
| 3 | CPU | Intel Core i5-14400F | LGA1700, **raptor-lake-refresh**, 10C/16T, **148 W** max turbo, **no iGPU** | Socket mismatch, iGPU warning, BIOS warning |
| 4 | Motherboard | ASUS ROG Strix B650-A Gaming WiFi | AM5, B650, native [zen-4], ATX, DDR5, 4 DIMM, 3× M.2 | Full-size AM5 board |
| 5 | Motherboard | ASRock B650I Lightning WiFi | AM5, B650, native [zen-4], Mini-ITX, DDR5, **2 DIMM**, **2× M.2** | Memory slots, M.2 slots, SFF |
| 6 | Motherboard | MSI PRO B760M-A WiFi DDR4 | LGA1700, B760, native [alder-lake, raptor-lake], Micro-ATX, **DDR4**, 4 DIMM, 2× M.2 | DDR type, early-B760 BIOS warning |
| 7 | Memory | Corsair Vengeance DDR5-6000 32 GB (2×16) CL30 | DDR5, 2 modules | DDR5 kit |
| 8 | Memory | Kingston FURY Beast DDR4-3200 16 GB (2×8) CL16 | DDR4, 2 modules | DDR4 kit |
| 9 | GPU | ASUS Dual GeForce RTX 4060 OC 8 GB | 228 mm, 115 W | Short, low power |
| 10 | GPU | Gigabyte GeForce RTX 5070 Windforce OC SFF 12 GB | 282 mm, 250 W | Mid-range, fits SFF |
| 11 | GPU | ASUS ROG Astral GeForce RTX 5090 OC 32 GB | 358 mm, 575 W, **stock 0** | GPU length, PSU wattage, out-of-stock |
| 12 | Storage | Samsung 990 PRO 1 TB | NVMe, M2_2280 | M.2 drive |
| 13 | Storage | WD_BLACK SN850X 2 TB | NVMe, M2_2280 | M.2 drive |
| 14 | Storage | Crucial MX500 1 TB | SATA, DRIVE_2_5 | Does not use an M.2 slot |
| 15 | PSU | Cooler Master MWE 550 Bronze V2 | ATX, 550 W, Bronze, non-modular | Low wattage |
| 16 | PSU | Corsair RM850e | ATX, 850 W, Gold, full modular | High wattage, ATX |
| 17 | PSU | Corsair SF750 | **SFX**, 750 W, Platinum, full modular | PSU form factor |
| 18 | CPU cooler | Thermalright Peerless Assassin 120 SE | AIR, 155 mm, AM4/AM5/LGA1700/LGA1851 | Cooler height |
| 19 | CPU cooler | Noctua NH-L9a-AM5 | AIR, 37 mm, **AM5 only** | Low profile, cooler socket |
| 20 | CPU cooler | Arctic Liquid Freezer III 360 | AIO, 360 mm, AM4/AM5/LGA1700/LGA1851 | Radiator fit |
| 21 | Case | Lian Li LANCOOL 216 | E-ATX/ATX/mATX/ITX, GPU 392, cooler 180, rad 240/280/360, ATX PSU | Fits everything |
| 22 | Case | Cooler Master MasterBox Q300L | mATX/ITX, GPU 360, cooler 157, rad 120/140/240, ATX PSU | Rejects ATX boards, tight GPU fit |
| 23 | Case | Fractal Design Ridge | ITX only, GPU 335, **cooler 70**, **rad 120/280 only**, **SFX/SFX-L only** | Cooler height, radiator, PSU form factor |

Stock levels vary so that "in stock only" and the builder's in-stock default can be tested. #11 has 0 stock and at least one part sits at or below its `lowStockAt`.

## Examples

### Compatible builds (no errors)

| Build | Parts | PSU load (CPU+GPU × 1.3) | Result |
| --- | --- | --- | --- |
| A — AM5 ATX | Ryzen 5 7600, ROG Strix B650-A, Vengeance DDR5, 990 PRO, RTX 4060, LANCOOL 216, MWE 550, Peerless Assassin | 264 W / 550 W = 48% | OK |
| B — Intel DDR4 mATX | i5-14400F, B760M-A DDR4, FURY DDR4, MX500, RTX 5070 SFF, Q300L, RM850e, Peerless Assassin | 517 W / 850 W = 61% | 1 warning: BIOS update (a 14th-gen CPU on an early B760 board) |
| C — Small form factor | Ryzen 5 7600, B650I Lightning, Vengeance DDR5, SN850X, RTX 5070 SFF, Ridge, SF750, NH-L9a-AM5 | 439 W / 750 W = 59% | OK |

### One incompatible pair per rule

| Rule | Change from a compatible build | Result |
| --- | --- | --- |
| Socket match | A with i5-14400F | Error: LGA1700 CPU, AM5 board (no BIOS warning, since the sockets differ) |
| Memory type | A with FURY DDR4 | Error: DDR4 kit, DDR5 board |
| Memory slots | C with 2 × Vengeance kits | Error: 4 sticks, 2 slots |
| Form factor | Ridge or Q300L with ROG Strix B650-A | Error: ATX board |
| GPU length | C with RTX 5090 (358 > 335) | Error |
| GPU length (pass, tight) | B with RTX 5090 in Q300L (358 ≤ 360) | OK for length (PSU wattage still fails, see below) |
| Cooler height | C with Peerless Assassin (155 > 70) | Error |
| Cooler socket | B with NH-L9a-AM5 | Error: cooler has no LGA1700 support |
| Radiator fit | C with Liquid Freezer III 360 | Warning: Ridge takes 120 or 280 mm radiators, not 360 |
| PSU wattage (error) | Ryzen 7 9800X3D + RTX 5090 + RM850e: 958 / 850 | Error (113%) |
| PSU wattage (warning) | i5-14400F + RTX 5070 + MWE 550: 517 / 550 | Warning (94%). With base power (65 W) this would wrongly be OK (74%) |
| PSU form factor | C with RM850e | Error: Ridge takes SFX or SFX-L only |
| M.2 slots | C with 2 × 990 PRO + SN850X | Warning: 3 M.2 drives, 2 slots (adding the MX500 does not change this) |
| Integrated graphics | B without a GPU | Warning: i5-14400F has no iGPU |
| BIOS update | A with Ryzen 7 9800X3D (zen-5 not native on the B650-A) | Warning: may need a BIOS update. Build can still be added to cart |
| Memory capacity | — | Not reachable with this fixture set. Covered by rule unit tests with fixture parts |

With full-boost CPU power, the RTX 5090 fails PSU wattage in every build in this fixture set. Even with the lightest CPU and the largest PSU, the load is (88 + 575) × 1.3 = 862 W, which is more than the RM850e's 850 W. That is realistic, since the card needs a 1000 W class PSU. It is also intended: the 5090 is in the set for GPU length and as the out-of-stock part. A 1000 W PSU can be added in the full-catalog story.

### Seed validation examples

| Input | Outcome |
| --- | --- |
| GPU without `lengthMm` | Rejected: `specs.lengthMm: required` |
| CPU with `socket: "AM6"` | Rejected: `specs.socket: expected one of AM4, AM5, LGA1700, LGA1851` |
| CPU with `socket: "LGA1700"`, `generation: "zen-4"` | Rejected: zen-4 is an AM5 generation |
| AM5 board with `nativeCpuGenerations: ["raptor-lake"]` | Rejected: generation does not belong to AM5 |
| Case with `maxGpuLengthMm: "335"` (string) | Rejected: expected number. No coercion. This is also a type error in the editor |
| GPU with `lengthMm: 227.2` | Rejected: expected integer (round up to 228) |
| Motherboard with extra key `memorySlot: 4` | Rejected: unrecognized key `memorySlot` |
| AIO cooler with `heightMm` | Rejected: not allowed when type is AIO |
| Storage `NVME` + `DRIVE_2_5` | Rejected: NVMe drives must be M.2 |
| Two parts with the same `sku` in different files | Rejected: both locations named |
| `salePrice` ≥ `price` | Rejected |
| Valid data, run twice | Second run: 0 created, 23 updated, same row counts and IDs |
| Admin changed a seeded GPU's stock to 3, then re-seed | Stock stays 3. Name and specs are refreshed from the data file |
| `--reset` with one invalid part | Rejected before truncating. The database is unchanged |

## Edge cases

- **Boundary values are compatible.** A 155 mm cooler in a case with 155 mm clearance fits (`≤`, not `<`). The same holds for GPU length.
- **Rounding.** Decimal manufacturer values are rounded in the safe direction (see Naming). A part that "fits by 0.4 mm" on paper may be flagged. This is acceptable and errs toward caution.
- **Empty versus missing.** `radiatorSizesMm: []` is valid and means "no AIO support". A missing `radiatorSizesMm` is an error. `nativeCpuGenerations` may not be empty, because a board supports at least one generation at launch.
- **Duplicates in lists** (`["AM5", "AM5"]`) are rejected.
- **Case-sensitivity.** Enum values must match exactly (`"am5"` is rejected). Brand names are matched case-insensitively through their slug.
- **Boards that ship with a newer BIOS.** `nativeCpuGenerations` records the launch BIOS. If the shop's stock ships with a newer BIOS, the shop can add the generation to the list (later through the admin panel), and the warning disappears for that board.
- **Partial seed failure.** Validation runs before any write. A database error during writing rolls back the transaction, including a `--reset` truncate.
- **SKU changed in a data file.** The seed treats it as a new product (new SKU) and leaves the old row in place. This is visible in the summary as one extra "created".
- **Schema change with existing rows.** If a later story adds a required field, existing `Product.specs` rows become invalid. That story must ship a data migration or a default value. This story adds a `validateSpecs` helper that such a check can call.

## Out of scope

- The compatibility rules engine, its messages and power allowances (PC Builder story).
- The filter UI, URL filter state and JSONB filter queries (Catalog stories). Only the field metadata exists here.
- Admin product and category forms (AD-2, AD-3).
- Non-builder categories: case fans, monitors, peripherals, networking, prebuilt PCs.
- **The full catalog (PRD success metric of 150 parts).** This is a separate story, built on this story's schemas and seed script.
- Product images and descriptions.
- Stocking E-ATX boards (the enum value exists).
- M.2 slot details beyond the count: NVMe-only slots, and boards where an M.2 SATA drive disables a SATA port. These are a possible later warning.
- SFX-L-specific clearances, GPU power connectors, GPU clearance reduced by a front radiator, per-mount radiator positions, and specific BIOS versions.
- Deleting or archiving products that were removed from the data files.
- Automated tests. Vitest is set up in story 4, and the spec schemas become its first real tests.
- Seeding production or preview databases. The seed runs only against the dev database here. Production data is part of story 6, and preview databases are branched from main, so they get the data once production has it.

## Related deliverables

- `docs/adr/0001-store-specs-as-jsonb.md`, required by the issue. It explains why specs are a JSONB column with a GIN index rather than per-category tables or EAV.
- `docs/adr/0002-spec-schemas-in-code.md`, which records Decision D1.
- PRD updates (done in this branch): the M.2 slots row counts every M.2 drive, the `Category` data model has no `specSchema`, and AD-3 no longer defines spec fields in the admin panel.
- Issue #8 acceptance criteria updated to match this spec.

## Decision D1 — spec schemas in code (Zod), not `Category.specSchema` (accepted)

**Decision:** each category's schema is a Zod object in the codebase, with its field metadata. A registry maps category slug to schema. The `Category` table holds no schema. The current [schema.prisma](../../../prisma/schema.prisma) already follows this: `Category` has no `specSchema`, and `Product.specs` is commented as validated by Zod.

| | Zod in code | `Category.specSchema` JSON column (PRD) |
| --- | --- | --- |
| Type safety | `z.infer` gives TS types to the rules engine, filters, forms and the seed data files. A renamed field breaks the build | Specs are `unknown` at compile time. Rules need hand-written casts or a runtime interpreter |
| Expressiveness | Discriminated unions (cooler), cross-field checks (NVMe ⇒ M.2, generation ⇒ socket), integers, strict keys | Needs a custom mini-language or JSON Schema. Cross-field rules are hard to express |
| Shared validation | The same import validates in the browser, server actions and the seed (PRD Stack: "Zod … same schemas") | Each runtime must load the schema from the DB first, then interpret it |
| Change control | Schema changes are reviewed in a PR, versioned in git and testable in CI | Changes are live edits with no review or history, apart from the audit log |
| Consistency with rules | Rules are code that reads fields by name, so the schema belongs next to them | An admin can rename or delete `socket` and silently break the builder |
| Admin flexibility (AD-3) | **Lost.** A new field or category needs a deploy | Admin adds fields and categories without a developer |
| Data drift | Changing a schema can make stored rows invalid, so a migration is needed | Same problem, but with no migration tooling at all |
| PRD alignment | **Diverges** from the Data model and AD-3. Needs a PRD update | Matches the PRD |

**Why it was accepted:** for builder categories, admin-editable schemas would be misleading. The rules engine is code, so any field it reads cannot really be changed without a deploy. Admins still edit spec **values** through forms generated from the Zod schema and its metadata (AD-2), including list values such as `nativeCpuGenerations`. Zod 4's `z.toJSONSchema()` can produce a JSON Schema if one is ever needed for a generic form renderer or an API.

**What changed:**

- PRD → Data model: `Category` no longer has `specSchema`. Spec fields live in code.
- PRD → AD-3: admins manage categories (name, slug, parent, sort order). Spec fields are defined in code. Under the PRD change rules this is a scope change, so the PRD was updated before implementation.
- PRD → Risks "strict spec schemas" is unchanged and is strengthened by D1.
- Possible later hybrid: non-builder categories (monitors, peripherals) could get DB-defined schemas if admin flexibility matters there. This is not needed for the MVP.

## Resolved questions

| # | Question | Decision |
| --- | --- | --- |
| R1 | Should a re-seed overwrite stock and price? | No. Upsert on SKU. Create sets everything. Update refreshes catalog data only. `--reset` gives a clean slate in development |
| R2 | Intel power figure | Maximum Turbo Power, because the PSU estimate must cover full boost |
| R3 | M.2 slots: count all M.2 drives or only NVMe? | All M.2 drives. PRD updated |
| R4 | Where does BIOS-update data live? | On the board, as `nativeCpuGenerations`, matched against `cpu.generation`. Warning only |
| R5 | 150-part catalog | Separate story. This story ships a 23-part fixture set |
| R6 | E-ATX | Added to the enum now. No E-ATX products stocked |
| R7 | Seed location | `prisma/seed.ts` plus `prisma/seed/data/*.ts`, registered as the Prisma seed command |
| R8 | AMD power figure | PPT (full-boost draw), so `tdpW` means worst-case power for every CPU |
| R9 | D1: spec schemas in code | Accepted. PRD updated, ADR 0002 to be written |

## Open questions

None.
