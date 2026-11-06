# Tasks: spec 045 — Admin products: create and edit with validated specs (#112)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec reviewed (Q1–Q3 settled; D1, D3, D5 changed); [#137](https://github.com/romulojr-dev/pc-ecommerce/issues/137) created; #114 gets the seed-images criterion
- [x] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. Pure rules
- [x] `lib/admin/money.ts`: `pesosToCentavos` (B19, R5; no float step), `centavosToPesos`; tests E12–E12h and float traps; source-reading test
- [x] `lib/admin/product-input.ts`: field schemas (R17), sale below price (E13, E14), pre-order date rule (E14a–E14c), locked-field rule (R8)
- [x] `lib/admin/products-params.ts` (E3, E4) and `lib/admin/products-view.ts`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Generated spec form fields
- [x] `lib/specs/form-fields.ts`: `specFormFields`, `specsFromForm`; cooler union handled
- [x] Tests: all eight categories, kinds, required flags, units; every seed part round-trips through the form values and `validateSpecs`
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. Schema
- [x] `Product.editVersion Int @default(0)` in `schema.prisma` and a migration
- [x] `pnpm db:drift`, `pnpm test:db` pass

## 4. Queries
- [x] `lib/admin/queries/products.ts`: `listProducts`, `getProductForEdit`, option lists; named fields, role check
- [x] Integration tests: filters, search, drafts included, paging (E1–E4), unknown id

## 5. Save
- [x] `createProduct` / `updateProduct`: validate, clash pre-check and race, conditional update on `editVersion`, category change, no-op, audit in the transaction (E7–E11, E15–E23c, E31)
- [x] Integration tests, including E18–E18b (the statement `placeOrder` runs, and a `lowStockAt` write, in between; a full `placeOrder` is covered by the stock statements' own tests). E32 holds by construction: the save calls no outside service, so there is no guard test
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Actions and cache
- [x] `actions.ts`: `adminAction("products.write", …)` for create and update; `updateTag(PRODUCTS_TAG)` after a saved result
- [x] Tests: `updateTag` once on create/edit, never on invalid/stale/forbidden/unchanged (R11); Demo/Staff refusals (a foreign origin is checked by `adminRoute` only; server actions rely on Next's own origin check, so E27 does not apply); enumeration test lists both; no delete export (R14)

## 7. Seed create-only
- [ ] `CATALOG_FIELDS` removed; categories and brands create-only; summary text
- [ ] Seed tests rewritten (E28–E30); CLAUDE.md `db:seed` and spec 001 table updated

## 8. UI: list
- [ ] Nav item, copy, `/admin/products` page, filter form, table, `loading.tsx`, `error.tsx`, Demo and Staff behavior

## 9. UI: forms
- [ ] `/admin/products/new` (category step, form), `/admin/products/[id]`, `ProductForm` with generated spec controls, errors summary, stale message, category change note, locked fields
- [ ] Component tests

## 10. E2E, docs, PR
- [ ] `e2e/admin-products.spec.ts`
- [ ] CLAUDE.md Admin products bullet; spec "What changed while building"
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm db:drift`, `pnpm build`
- [ ] Push (`git push -u origin HEAD`) and open the PR ("Closes #112") from the template
