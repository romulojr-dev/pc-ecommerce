# 009 — Plan: spec table from the schemas

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #23 · ADRs: [0001](../../adr/0001-store-specs-as-jsonb.md), [0002](../../adr/0002-spec-schemas-in-code.md)

## Context

FR-9 asks for a full spec table from structured data, and FR-5's filters need the same labels and units. The approved spec keeps the typed `<category>Fields` maps that sit next to each schema (spec 001), adds `group` and `largeUnit` to `FieldMeta`, and reorders every map by its grouping and order rule. It adds pure formatting in `lib/specs`, a `SpecTable` component, and tests that fail when a field has no metadata. The product page is the next story.

## Summary

- **No schema, data or migration change, no new npm dependency.** Only metadata (labels, order, groups) changes in `lib/specs`.
- **Reuse:** `FieldMeta`, `FieldMetaMap` and `builderCategories[c].fields` ([lib/specs/helpers.ts](../../../lib/specs/helpers.ts), [lib/specs/registry.ts](../../../lib/specs/registry.ts)); `Specs<C>`; the shadcn `Table*` primitives ([components/ui/table.tsx](../../../components/ui/table.tsx)); the `en-PH` `Intl.NumberFormat` pattern from [lib/format.ts](../../../lib/format.ts).

## Files

```
lib/specs/helpers.ts                     FieldMeta + group, largeUnit; SpecGroup union
lib/specs/categories/*.ts                map order, motherboard groups, label rename, largeUnit
lib/specs/format.ts                      formatSpecValue(), getSpecRows()
lib/specs/index.ts                       exports the above and their types
lib/specs/format.test.ts                 formatting and rows
lib/specs/fields.test.ts                 every schema field has metadata; grouping rule
components/product/spec-table.tsx        SpecTable (server-compatible)
components/product/spec-table.test.tsx   static render check
vitest.config.ts                         include **/*.test.tsx
```

## Metadata

- `SpecGroup = "Processor" | "Memory" | "Size and connectivity"` in `helpers.ts`.
- `FieldMeta` adds `group?: SpecGroup` and `largeUnit?: { unit: string; per: number }`.
- `largeUnit` on storage `capacityGb` (`TB`, 1000) and CPU `baseClockMhz` / `boostClockMhz` (`GHz`, 1000).
- Map key order is the display order (spec, "Resulting order per category"). The motherboard map is reordered and grouped, and `nativeCpuGenerations` is relabelled "Works without BIOS update". The CPU map moves integrated graphics before max power, and the PSU, cooler and storage maps are reordered. Memory, GPU and case are unchanged. The schemas themselves keep their order.

## Formatting

`lib/specs/format.ts`, browser-safe (no server imports):

- `formatSpecValue(meta, value): string | null`. `undefined` → `null`; boolean → "Yes" / "No"; string → `options[value]`, else the string; number → `en-PH` grouping with at most 2 decimals, switched to `largeUnit` when `value >= per`, then a non-breaking space and the unit; list → items formatted without unit, joined with ", ", unit once at the end; `[]` → "None". Lists ignore `largeUnit` (no list field has one).
- `getSpecRows(category, specs): SpecRowGroup[]` walks `builderCategories[category].fields` in order, drops `null` values, and starts a new group whenever `group` changes. `SpecRowGroup = { group?: SpecGroup; rows: SpecRow[] }`, `SpecRow = { key, label, value }`.

## Component

`components/product/spec-table.tsx`, no `"use client"` (the table primitive is a client module, which a server component may render).

- Props: `category`, `specs: Specs<C>`, `caption = "Specifications"`, `captionHidden = true`.
- `Table` with a `TableCaption` (`sr-only` when hidden), one `TableBody` per group, a group row `<th scope="rowgroup" colSpan={2}>`, then rows of `<th scope="row">` (muted label) and `<td>` (value, `tabular-nums`, wraps). The primitive's row hover is turned off, since rows aren't interactive.

## Tests

- **`format.test.ts`:** every row of the spec's formatting table; `largeUnit` at 999 / 1000 / 2000 GB and 5100 / 5750 MHz; `getSpecRows` order and groups; air and AIO coolers each leave out the other type's field.
- **`fields.test.ts`:** introspects the Zod 4 schemas (`.shape`, the cooler union's `.options`, `.unwrap()` on optional, `.element` on arrays, `ZodEnum.options`, skipping the `z.never` placeholders). Checks that schema keys equal metadata keys; enum fields and enum lists have `options` with exactly the enum's values; numeric fields ending in `Mm`, `W`, `Gb`, `Mhz` or `Mts` have a `unit`; the grouping rule (groups only above 8 fields, all or none, at least 2 per group, contiguous); labels are unique per category.
- **`spec-table.test.tsx`:** `renderToStaticMarkup` of a seeded motherboard: hidden caption, row headers, the three group headers in order, "192 GB" and "Works without BIOS update".

## Verification

- `pnpm test` with `.env.local` moved aside (the tests are pure), `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- By hand: delete a `gpuFields` entry → `pnpm typecheck` fails; delete `options` from `psuFields.modularity` → `fields.test.ts` fails. Revert both.
- Visual: temporarily render `SpecTable` for a seeded motherboard and an AIO cooler on a page in `pnpm dev`; light and dark themes, keyboard, axe. Revert before committing.
