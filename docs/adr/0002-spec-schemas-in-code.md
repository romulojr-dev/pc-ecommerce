# ADR 0002 — Define spec schemas in code, not in the database

Status: **Accepted** · Date: 2026-10-23 · Story: #8 · Spec: [001-spec-schemas-and-seed](../specs/001-spec-schemas-and-seed/spec.md) (Decision D1)

## Context

Product specs are stored as JSONB ([ADR 0001](0001-store-specs-as-jsonb.md)), so something else must define which fields each category has, their types and units, and which are required.

The PRD originally planned a `Category.specSchema` JSON column (fields, types, units, filterable, builderKey) and an admin screen to edit it (AD-3), so the shop owner could add spec fields without a developer.

But the PC Builder's compatibility rules are TypeScript code that reads spec fields by name: `cpu.socket`, `case.maxGpuLengthMm`, `motherboard.nativeCpuGenerations`. The PRD also requires every field a rule reads to be mandatory, so an incomplete part cannot be published.

## Options

| | Zod schemas in code | `Category.specSchema` column | Hybrid |
| --- | --- | --- | --- |
| Type safety | `z.infer` gives the rules engine, filters, admin forms and seed data real types. Renaming a field breaks the build | Specs are `unknown` at compile time; rules need casts or a runtime interpreter | Typed for builder categories only |
| Expressiveness | Discriminated unions (air vs AIO cooler), cross-field checks (CPU generation belongs to socket, NVMe ⇒ M.2), integers, strict keys | Needs a home-made schema language or JSON Schema; cross-field rules are hard | Both systems to build |
| Shared validation | One import validates in the browser, server actions and the seed | Each runtime loads the schema from the database, then interprets it | Two code paths |
| Change control | Reviewed in a PR, versioned in git, checked by CI | Live edits with no review, only the audit log | Mixed |
| Consistency with rules | Schema sits next to the code that reads it | An admin can rename `socket` and silently break the builder | Safe for builder categories |
| Admin flexibility | **Lost:** a new field or category needs a deploy | Admin adds fields and categories alone | Kept for non-builder categories |

## Decision

Spec schemas live **in code, as Zod schemas in `lib/specs/`**, one file per category, each with field metadata (label, unit, filterable, the rules that read it, enum labels). There is no `Category.specSchema` column.

A category row is linked to its schema **by its slug**: `lib/specs/registry.ts` maps `cpu`, `motherboard`, … to their schemas, and `validateSpecs(slug, specs)` looks the schema up. The seed creates the builder category rows from this registry, so names and order always match the code.

The deciding argument: for builder categories, admin-editable schemas would be misleading. The rules engine is code, so any field it reads cannot really change without a deploy anyway. Admins still edit spec **values** through forms generated from the schemas and their metadata (AD-2).

## Consequences

- **Adding or changing a spec field is a code change** with review. The PRD's AD-3 now covers category name, slug, parent and order only.
- **Builder category slugs must not be renamed in the admin panel** (AD-3), because the slug is the link to the schema. If URL slugs ever need to change, add a separate `schemaKey` column then; it is a small migration we don't need now.
- **`lib/specs/` must stay free of server-only imports** (`@/lib/db`, `@/lib/env`, Node APIs), because the builder will run the same schemas in the browser.
- **Non-builder categories** (monitors, peripherals) have no schema yet. If admin-defined fields matter for them later, a database-defined schema for those categories only (the hybrid) can be added without touching the builder.
- **If a JSON Schema is ever needed** (a generic form renderer, an API), Zod 4's `z.toJSONSchema()` can generate it from these schemas.
