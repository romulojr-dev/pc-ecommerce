# Tasks: spec 045 — Admin products: create and edit with validated specs (#112)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only, no trailer.

## 0. Housekeeping
- [x] Spec reviewed (Q1–Q3 settled; D1, D3, D5 changed); [#137](https://github.com/romulojr-dev/pc-ecommerce/issues/137) created; #114 gets the seed-images criterion
- [ ] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. Pure rules
- [ ] `lib/admin/money.ts`: `pesosToCentavos` (B19, R5; no float step), `centavosToPesos`; tests E12–E12h and float traps; source-reading test
- [ ] `lib/admin/product-input.ts`: field schemas (R17), sale below price (E13, E14), pre-order date rule (E14a–E14c), locked-field rule (R8)
- [ ] `lib/admin/products-params.ts` (E3, E4) and `lib/admin/products-view.ts`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Generated spec form fields
- [ ] `lib/specs/form-fields.ts`: `specFormFields`, `specsFromForm`; cooler union handled
- [ ] Tests: all eight categories, kinds, required flags, units; every seed part round-trips through the form values and `validateSpecs`
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. Schema
- [ ] `Product.editVersion Int @default(0)` in `schema.prisma` and a migration
- [ ] `pnpm db:drift`, `pnpm test:db` pass

## 4. Queries
- [ ] `lib/admin/queries/products.ts`: `listProducts`, `getProductForEdit`, option lists; named fields, role check
- [ ] Integration tests: filters, search, drafts included, paging (E1–E4), unknown id

## 5. Save
- [ ] `createProduct` / `updateProduct`: validate, clash pre-check and race, conditional update on `editVersion`, category change, no-op, audit in the transaction (E7–E11, E15–E23c, E31)
- [ ] Integration tests, including E18–E18b (a real `placeOrder` in between) and `guardTransactions` (E32)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Actions and cache
- [ ] `actions.ts`: `adminAction("products.write", …)` for create and update; `updateTag(PRODUCTS_TAG)` after a saved result
- [ ] Tests: `updateTag` once on create/edit, never on invalid/stale/forbidden/unchanged (R11); Demo/Staff/foreign-origin refusals; enumeration test lists both; no delete export (R14)

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
