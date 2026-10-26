# 009 — Spec table from the schemas

Status: **Approved** · Issue: #23 · PRD refs: FR-9 (full spec table from structured data), FR-5 (filters reuse the labels and units), NFR Accessibility (WCAG 2.1 AA)

## Summary

A product's specs render as a readable table ("Length: 228 mm", not `lengthMm: 228`), generated from its category's schema and field metadata. The metadata is defined once, next to each schema, and the type checker plus a test make sure every spec field has it. The formatting is a pure function in `lib/specs`, so Sprint 3's filters and the browser-side builder can use it too. This story builds the formatting and a `SpecTable` component; the product page that shows it is the next story.

## Starting point

Spec 001 already added display metadata: each `lib/specs/categories/*.ts` exports `<category>Fields` next to its schema, typed `satisfies FieldMetaMap<typeof schema>`. `FieldMeta` has `label`, `unit`, `filterable`, `rules` and `options` (enum value labels), and `FieldMetaMap` requires exactly one entry per field, including the fields of both cooler union branches. A missing or stale entry is already a type error. This story extends that map rather than adding a second source.

## Where the metadata lives

| | Zod `.meta()` on each field | **Typed map next to the schema** (current) |
| --- | --- | --- |
| Co-location | On the field itself | Same file, just below the schema |
| Missing metadata | Not a type error: `.meta()` is optional, so only a runtime test catches it | **Type error** through `FieldMetaMap`, plus the test below |
| Typing | Needs a module augmentation of Zod's global registry; one shape for every schema in the app | `FieldMeta` is our own type |
| Reading it | Walk the schema, unwrapping `optional`, arrays and union options, and know which wrapper holds the meta (`.meta()` returns a new instance) | `builderCategories[c].fields`, a plain object, in display order |
| Unions | Shared fields (`supportedSockets`) declared in each branch | One entry per key |
| JSON Schema export | Included for free | Not needed (no API consumers) |

**Recommendation: keep the typed map.** It is the only option where a missing label fails `pnpm typecheck`, it is the easiest to read for filters and the table, and it is what spec 001 chose. The test below backs it up at runtime and covers what types can't easily check (enum options, unit suffixes).

## Metadata changes

`FieldMeta` gains two optional fields:

- **`group?: SpecGroup`**: the section a row appears under. `SpecGroup` is a string union in `helpers.ts` (`"Processor" | "Memory" | "Size and connectivity"` for now, extended when a category needs a new group), so a typo is a type error.
- **`largeUnit?: { unit: string; per: number }`**: a friendlier unit for large values, as spec 001 promised ("2 TB", "5.1 GHz"). Used when the value is `≥ per`. Only set on storage `capacityGb` (`{ unit: "TB", per: 1000 }`) and CPU `baseClockMhz` / `boostClockMhz` (`{ unit: "GHz", per: 1000 }`). Motherboard `maxMemoryGb` stays in GB.

**Display order is the key order of the fields map**, not a numeric `order` field. JavaScript keeps string-key insertion order, the map is already reviewed as a list, and numbers would need renumbering on every insert. Fields can be reordered in the map without touching the schema.

### Grouping and order rule

For every category:

1. **Group only when the category has more than 8 fields.** Below that, a single list scans faster than sections.
2. **Groups are all or none** in a category, and **every group has at least 2 fields**.
3. **Order fields as a shopper reads a spec sheet:** (1) what the product is, (2) whether it fits, meaning compatibility-critical fields (those with `rules`, which the PC Builder checks), (3) everything else. A field can be both 1 and 2 (CPU socket); it goes with 1. With groups, this applies to the order of the groups and to the rows inside each group.
4. **A group's fields are contiguous** in the map. Groups render in the order of their first field.

### Resulting order per category

Only the motherboard (9 fields) is grouped. Tiers: **1** what it is, **2** whether it fits, **3** the rest.

| Category | Fields | Order (tier) |
| --- | --- | --- |
| Motherboard | 9 | **Processor:** Socket (1, 2), Chipset (1), Works without BIOS update (2) · **Memory:** Memory type (2), Memory slots (2), Max memory (2) · **Size and connectivity:** Form factor (1, 2), M.2 slots (2), Wi-Fi (3) |
| CPU | 8 | Socket (1, 2), Generation (1, 2), Cores (1), Threads (1), Base clock (1), Boost clock (1), Integrated graphics (2), Max power (2) |
| Memory | 5 | Memory type (1, 2), Capacity (1, 2), Modules (1, 2), Speed (1), CAS latency (3) |
| GPU | 5 | Chipset brand (1), Chipset (1), VRAM (1), Length (2), Board power (2) |
| Case | 5 | Motherboard support (1, 2), Max GPU length (2), Max CPU cooler height (2), Radiator support (2), PSU support (2) |
| PSU | 4 | Wattage (1, 2), Efficiency (1), Form factor (2), Modularity (3) |
| CPU cooler | 4 | Type (1, 2), Radiator size (1, 2; AIO only), Socket support (2), Height (2; air only) |
| Storage | 3 | Capacity (1), Form factor (2), Interface (3) |

- **Map changes:** motherboard (form factor moves into the last group), CPU (integrated graphics before max power), PSU, CPU cooler and storage are reordered. Memory, GPU and case keep their current order.
- **"Works without BIOS update"** replaces the label "Supported out of the box" for `nativeCpuGenerations`: the CPU generations the board's launch BIOS supports. A CPU on the same socket from a newer generation may need a BIOS update before it boots (the builder's `bios-update` warning). Boards in stock may already ship with a newer BIOS, so the list is conservative. Example: "Works without BIOS update: Zen 4 (Ryzen 7000)".

## Value formatting

`formatSpecValue(meta, value): string | null` in `lib/specs/format.ts`. The format comes from the value's type plus the metadata, so there is no separate "format" field to keep in sync with the schema.

| Value | Rule | Example |
| --- | --- | --- |
| `undefined` | `null`: the row is left out | AIO cooler has no `heightMm` |
| number | `en-PH` grouping, then `unit` after a non-breaking space; no unit for counts | `1000` W → "1,000 W"; `8` cores → "8" |
| number with `largeUnit`, `≥ per` | Divided, up to 2 decimals, trailing zeros dropped | `2000` GB → "2 TB"; `5100` MHz → "5.1 GHz"; `500` GB → "500 GB" |
| boolean | "Yes" / "No" | Wi-Fi → "Yes" |
| enum value | `options[value]` | `MICRO_ATX` → "Micro-ATX" |
| string | As is | "GeForce RTX 5070" |
| list | Items formatted as above (without unit), joined with ", ", unit once at the end | "AM4, AM5"; "120, 240, 360 mm" |
| empty list | "None" | Case with `radiatorSizesMm: []` |

`getSpecRows(category, specs)` returns `{ group?: SpecGroup; rows: { key, label, value }[] }[]`: fields in map order, `null` values dropped, keys without metadata ignored. It takes parsed `Specs<C>`. Validating `Product.specs` from the database (`validateSpecs`) is the caller's job, so the product page story decides what an invalid row shows.

Both live in `lib/specs` and stay browser-safe (no server-only imports).

## Reuse by filters (Sprint 3)

Filters read the same `builderCategories[c].fields`: `filterable` picks the facets, `label` names them, `options` labels checkbox values, `unit` and `largeUnit` label slider ends, and `formatSpecValue` formats active-filter chips. The filter kind (range vs checklist) can be derived from the schema type (number vs enum/boolean/string), so this story adds no filter-only fields. If Sprint 3 needs one (e.g. a slider step), it adds it to `FieldMeta` then.

## SpecTable component

`components/product/spec-table.tsx`, a server-compatible component (no `"use client"`), built on `components/ui/table.tsx`.

- **Props:** `category: C`, `specs: Specs<C>`, `caption` (default "Specifications"), `captionHidden` (default `true`; the product page will have a visible heading).
- **Markup:** one `<table>` with a `<caption>` (`sr-only` when hidden). Each row: `<th scope="row">` label, `<td>` value. Each group is its own `<tbody>` whose first row is `<th scope="rowgroup" colSpan={2}>` with the group name. No `<thead>`: a two-column label/value table doesn't need column headers.
- **Look:** labels muted, values in the foreground color with tabular numbers, row borders from the table primitive. Readable in light and dark themes; no meaning carried by color.
- Missing optional values produce no row. Nothing is rendered as "—" or "N/A".

## Tests

Unit tests (Vitest, Node, pure):

- **`lib/specs/format.test.ts`:** each row of the formatting table: number with unit, thousands grouping, count without unit, `largeUnit` above, at and below `per` (999 / 1000 / 2000 GB; 5100 and 5750 MHz), Yes/No, enum label, enum list, number list with the unit once, empty list → "None", string, `undefined` → `null`. `getSpecRows`: map order, groups in first-appearance order, an AIO and an air cooler each leave out the other type's field.
- **`lib/specs/fields.test.ts`** ("every schema field has metadata"), for every builder category:
  - The schema's field keys (object shape; for the cooler union, both branches) equal the metadata keys. This backs up `FieldMetaMap` if a `satisfies` is ever removed.
  - Every enum field (or list of enums) has `options` with exactly the enum's values.
  - Every numeric field whose name ends in a unit suffix (`Mm`, `W`, `Gb`, `Mhz`, `Mts`) has a `unit`.
  - Grouping rule: only categories with more than 8 fields have groups; groups are all or none; each group has at least 2 fields, and its fields are contiguous. Field order (rule 3) is checked in review, not tested: "what the product is" is a judgment, not something a test can read from the metadata.
  - Labels are unique within a category.
- **Rendering:** one test renders `SpecTable` with `renderToStaticMarkup` (no DOM needed) for a seeded motherboard and checks the caption, `th scope="row"`, the group headers and a formatted value ("192 GB"). The file is `.test.tsx`, so `vitest.config.ts` `include` gains `**/*.test.tsx`.
- **By hand:** temporarily delete a `gpuFields` entry and confirm `pnpm typecheck` fails; remove an `options` and confirm `fields.test.ts` fails. Revert.

No E2E test in this story: nothing routes to the table yet. The product page story adds one.

## Acceptance criteria

- [x] `FieldMeta` has `group` and `largeUnit`; every category's map follows "Resulting order per category".
- [x] `formatSpecValue` and `getSpecRows` in `lib/specs/format.ts` follow the formatting table.
- [x] `SpecTable` renders a product's specs as an accessible table, leaving out missing optional values.
- [x] A spec field without metadata fails `pnpm typecheck`, and `fields.test.ts` fails on missing metadata or enum options.
- [x] Unit tests pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- The product page (FR-8–FR-11): route, gallery, overview text, warranty, what's in the box, and where the table sits. Next story.
- Filters (FR-5, Sprint 3) and admin forms (AD-2), beyond keeping the metadata usable for them.
- Derived rows such as "2 × 16 GB" for memory kits, spec comparison between products, product-level fields (weight, warranty) in the table.

## Open questions

None.
