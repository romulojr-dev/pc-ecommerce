# Plan: spec 045 — Admin products: create and edit with validated specs (#112)

Spec: [spec.md](spec.md) (reviewed). Checklist: [tasks.md](tasks.md). Example (E), Rule (R), Behavior (B) and Decision (D) numbers are the spec's. Branch: `112-products-create-and-edit-with-validated-specs`, from `main`. One commit per task, subject line only, no trailer (the user's git preferences).

## Context

Reused as it is: `adminAction`, `adminTransaction`, `recordAudit` (`lib/admin/guard.ts`, `lib/admin/audit.ts`); `can()` with `products.view` and `products.write` already in the table; `requireAdminAccess` and `NoAccess`; the list-page pattern of specs 041 and 042 (pure params module, canonical redirect, `loading.tsx`, `error.tsx`, plain GET filter form); `validateSpecs`, `builderCategories`, `fieldSchemas` and `FieldMeta` (`lib/specs`); `slugify` (`lib/slug`); `manilaToday` (`lib/orders/time.ts`); `formatPeso`; the guard-enumeration tests, which pick up a new admin `actions.ts` by reading its `"use server"` directive; `guardTransactions` (`test-support/release.ts`).

Does not exist yet: the Products admin routes and components, `Product.editVersion`, the money parser, the specs form-field derivation, the product save functions and actions, `lib/admin/queries/products.ts`.

## Findings that shape the plan

- **`updatedAt` can't be the edit token.** Prisma sets `@updatedAt` on every client update and the stock statements set it by hand (`place-order.ts`, `release.ts`). `Product.editVersion` is incremented only by the product save (D5); no existing statement changes.
- **Updates are one `updateMany` with `editVersion` in the `WHERE`** and `editVersion: { increment: 1 }` in the data, inside `adminTransaction`. A unique clash (SKU, slug) makes Postgres abort the transaction, so the clash is found by a pre-check inside the transaction (SKU case-insensitive, slug exact, own row excluded) and, for the race, by catching the rolled-back transaction's `P2002` **outside** `adminTransaction` and re-checking which field is taken (R9). Never a catch inside the transaction.
- **Form generation needs more than `FieldMeta`.** It has label, unit, options and group but not the kind or whether a field is required; both come from the Zod schema (`fieldSchemas` already unwraps optional and skips `z.never`). The cooler union is the only case where fields differ by a discriminator.
- **Category change on a draft** means the save validates the new category's specs and writes `categoryId` and `specs` together in the one `updateMany`; the search-vector trigger already fires on `categoryId`/`specs` changes.
- **`updateTag` is called in the server action**, after the handler has the committed result, never in `lib/` code reached from a route handler. Tests mock `next/cache`.
- **Seed create-only** empties `CATALOG_FIELDS`; categories and brands switch from `upsert` to `createMany({ skipDuplicates })`. Existing seed tests that assert a refresh are rewritten.
- **Pages and components may not import the database** (`no-db-in-pages.test.ts`), so all reads go through `lib/admin/queries/products.ts`.
- **The money parser has no float step**, and a test reads the module's source for `Number(`, `parseFloat`, `parseInt` (R5).
- **No product images in the list** (that is #114); the list is text only.

## Risks to settle early

1. **Form generation covers every category** (task 2): a test over all eight schemas and a round trip for every seed part (specs → form values → specs) before any UI exists.
2. **The conditional update with `editVersion`, category change and clashes together** (task 5): write the db tests first, including the concurrent-sale case (E18).
3. **Seed behaviour change** (task 7): the summary line and existing tests change; run `pnpm db:seed` against the local database to see the text.

## Steps

0. Housekeeping: commit spec, plan, tasks.
1. Pure rules: `lib/admin/money.ts` (`pesosToCentavos`, `centavosToPesos`), `lib/admin/product-input.ts` (schemas, locked-field rule, pre-order rule), `lib/admin/products-params.ts`, `lib/admin/products-view.ts`.
2. `lib/specs/form-fields.ts`: `specFormFields(category)` and `specsFromForm(category, values)`.
3. Schema: `Product.editVersion` and its migration.
4. Queries: `lib/admin/queries/products.ts`.
5. Save: `lib/admin/products/save.ts` (`createProduct`, `updateProduct`) with audit, clashes, stale, no-op.
6. Actions: `app/admin/(shell)/products/actions.ts`, `updateTag`, permission / enumeration / cache / transaction tests.
7. Seed create-only, tests, CLAUDE.md and spec 001 note.
8. UI, list: nav item, copy, page, filters, table, `loading.tsx`, `error.tsx`.
9. UI, forms: category step, new and edit pages, `ProductForm` (client) with generated spec controls.
10. E2E, docs (CLAUDE.md Admin products bullet, spec "What changed while building"), final checks, push and PR.
