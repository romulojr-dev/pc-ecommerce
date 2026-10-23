# ADR 0001 — Store product specs as JSONB

Status: **Accepted** · Date: 2026-10-23 · Story: #8 · Spec: [001-spec-schemas-and-seed](../specs/001-spec-schemas-and-seed/spec.md)

## Context

Every product category has different specs. A CPU has a socket, cores and power draw. A case has GPU and cooler clearances and lists of supported form factors. A cooler is either an air cooler with a height or an AIO with a radiator size. Later stories need to do three things with these specs:

- **Filter on them** in catalog pages (FR-5), for example socket = AM5, or GPU length ≤ 300 mm.
- **Read them in the PC Builder rules engine**, which compares fields across parts.
- **Edit them in the admin panel** (AD-2), per category.

There are 8 builder categories now, more later (monitors, peripherals), and a few hundred products at most.

## Options

| Option | How it works | For | Against |
| --- | --- | --- | --- |
| Table per category | `CpuSpecs`, `CaseSpecs`, … each with typed columns, one-to-one with `Product` | Database enforces types and NOT NULL; ordinary indexes on every column | A migration for every new field or category; 8+ tables and joins; list fields (supported sockets) need child tables; generic catalog and admin code must special-case every table |
| EAV rows | `ProductSpec(productId, key, value)` | Fully flexible, no migrations | Values are untyped strings; one row per field makes reads and multi-field filters slow and awkward; rules engine has to reassemble objects; no shape checking at all |
| **JSONB column** | `Product.specs` holds one JSON object per product, validated in code | One table; new fields need no migration; lists and nested values are natural; reads return the whole spec object the rules engine needs; Postgres can index it | The database does not check the shape; range filters don't use the GIN index |

## Decision

Store specs in **`Product.specs` as `JSONB`**, with a **GIN index using `jsonb_path_ops`**. The shape of each category's specs is enforced in code by Zod schemas (see [ADR 0002](0002-spec-schemas-in-code.md)), not by the database.

`jsonb_path_ops` was chosen over the default `jsonb_ops` because spec filters are equality and containment checks (`specs @> '{"socket": "AM5"}'`, or a case whose `motherboardFormFactors` contains `MINI_ITX`). That operator class supports exactly those, and its index is smaller and faster.

## Consequences

- **Every write of `Product.specs` must go through `validateSpecs()`** (or the seed's part schema, which uses the same category schemas). The database will accept any JSON, so code is the only guard. Today the seed is the only writer; the admin product form (AD-2) must use the same function.
- **Equality and containment filters use the index.** Range filters such as `lengthMm ≤ 300` or `cores ≥ 8` cannot use a GIN index and scan the category's products. At a catalog of a few hundred products this is negligible. If it ever matters, add expression indexes on the specific fields, e.g. `((specs->>'lengthMm')::int)`.
- **Prisma types `specs` as `JsonValue`.** Code that reads specs should parse them with the category schema or type them as `Specs<C>` from `@/lib/specs`, rather than casting by hand.
- **Changing a schema can leave existing rows invalid.** A story that adds a required field must ship a data migration or a default value for existing products.
- **No migration is needed** for new spec fields or new categories, only a code change.
