# 045 — Admin products: create and edit with validated specs

Status: reviewed. Q1–Q3 are settled and the review's changes are folded in: a `Product.editVersion` column as the edit token, category editable while a product is a draft, the pre-order date included, label-based messages deferred to [#137](https://github.com/romulojr-dev/pc-ecommerce/issues/137), Staff's lack of Products access confirmed as intended, and a stricter peso parser. Issue: [#112](https://github.com/romulojr-dev/pc-ecommerce/issues/112) (Admin, Sprint 8; part 1 of 2, publish / retire / SEO / slug locking are [#113](https://github.com/romulojr-dev/pc-ecommerce/issues/113)). PRD: AD-2 (products), AD-10 (audit), AD-11 (roles); [ADR 0001](../../adr/0001-store-specs-as-jsonb.md), [ADR 0002](../../adr/0002-spec-schemas-in-code.md), [ADR 0003](../../adr/0003-cache-shared-data-with-tags.md), [ADR 0004](../../adr/0004-effective-price-column-kept-by-trigger.md), [ADR 0005](../../adr/0005-search-vector-kept-by-trigger.md). Depends on [spec 040](../040-admin-permissions-audit-masking/spec.md) (`adminAction`, `recordAudit`, `can()`, merged) and builds on [spec 001](../001-spec-schemas-and-seed/spec.md) (spec schemas, the seed's field table). Number 045 because 044 (cancel an order, #109) is on its own unmerged branch.

## 1. Summary

The owner can list every product (drafts included), create a new one as a draft and edit any product, with the specs form generated from each category's `FieldMeta` and every save checked on the server by `validateSpecs()` so an invalid product is never stored, not even as a draft. Prices are typed in pesos and stored as centavos, a sale price must be below the price, a new product starts at stock 0, and two owners can't silently overwrite each other (a new `Product.editVersion` column that only product saves change). Price changes go to the audit log with before and after, every write invalidates `PRODUCTS_TAG` with `updateTag`, and the seed stops overwriting what the admin edits (catalog fields, categories and brands become create-only). The only schema change is the `editVersion` column.

## 2. Behavior

### Who sees and does what

1. **Roles** (spec 040's table, unchanged): `products.view` is Owner and Demo; `products.write` is Owner only. Staff has no Products item and `/admin/products` shows `NoAccess`, as intended by AD-11 (D1). Demo opens the list and every form read-only: every control is disabled, the save button is hidden, and the page says "This account is read-only." Products hold no customer data, so there is nothing to mask and Demo may search them.
2. The admin nav gains **Products** (first item), shown when `can(role, "products.view")`.
3. **No delete anywhere.** There is no delete action, button, route or form field. A product that should disappear is retired in #113.

### The list (`/admin/products`)

4. One row per product, any status, 25 per page, most recently changed first (`updatedAt` descending, `id` tiebreak). Columns: name (link to its edit page), SKU, category, brand, status badge (**Draft** or **Active**), price (the sale price with the regular price struck through when there is one), stock, and a **Featured** badge. A draft is marked, not hidden.
5. **Search** (name, SKU and brand name, case-insensitive substring, 2 or more characters after trimming) with **Category** (every category that has a spec schema; `All categories` by default) and **Status** (`All`, `Draft`, `Active`) filters. State lives in the URL and is parsed and written only by a pure `products-params` module (`q`, `category`, `status`, `page`); bad values fall back to defaults, a non-canonical URL redirects, a page past the last redirects to the last, and a filter with no results renders page 1 with the empty state and no redirect (same rules as specs 041 and 042).
6. **New product** button (Owner only; Demo sees it disabled) opens `/admin/products/new`.
7. **Loading**: a skeleton table (`loading.tsx`). **Empty**: "No products yet." with the New product button; "No products match" with a Clear filters link when a filter or search is active. **Error**: `error.tsx` with "Couldn't load products. Try again." and a retry.

### Creating a product (`/admin/products/new`)

8. **Step 1, category.** `/admin/products/new` asks for the category first, because the spec fields depend on it: the eight builder categories as buttons or a list, in builder order. `?category=gpu` with a valid slug goes straight to the form; an unknown or non-builder slug redirects to the category step. Non-builder categories are not offered (out of scope). The category stays changeable while the product is a draft (B15).
9. **Step 2, the form** for that category. The page is a server render of the same form component the edit page uses, empty. Sections, in order:
   - **Basics**: Name\*, SKU\*, Slug\*, Category\* (on create: fixed by step 1 and shown as text with a Change link back to the step; on edit of a draft: a select, see B15), Brand\* (a select of existing brands), Featured (checkbox, hint: "Featured products show on the home page once the product is active.").
   - **Pricing**: Price\* and Sale price, in pesos (₱ prefix, up to 2 decimals), with the hint "Leave sale price empty when the product is not on sale."
   - **Details**: Description (multi-line), Weight\* (grams), Warranty\* (months, default 12), Box contents (one item per line), Pre-order ship date (date, empty = not a pre-order; today or later in Manila, R17).
   - **Specifications**: one control per field of the category's `FieldMeta`, in metadata order, grouped by `FieldMeta.group` when the category has groups. Required fields carry a visible "required" marker (an asterisk plus the text "required" for assistive tech); the unit is shown beside the control ("Length (mm)"; the control holds the base-unit integer, as the schema does). Controls follow the field's kind: a number input for an integer, a checkbox for a boolean, a select for an enum (labels from `FieldMeta.options`), checkboxes for an enum list (supported sockets, form factors, generations, radiator sizes), a text input for free text (a GPU's chipset). The **CPU cooler** form asks for **Type** first (Air or AIO) and shows only the fields of that type (Height for Air, Radiator size for AIO); switching type drops the other type's value.
   - **Stock** is not on the form: a read-only line says "Stock: 0. Stock changes through Inventory." (D4).
10. **Slug** is filled from the name (`slugify`) until the person edits it by hand, then follows no more. **SKU** has no suggestion.
11. **Save draft** sends the form. The server validates every field, **including the specs through `validateSpecs()`**, and writes only when everything is valid (R1). There are no partial drafts: a form with any error saves nothing.
12. **On success**: the product exists as `DRAFT` with stock 0, the person lands on its edit page with the line "Draft saved." (`aria-live`), and the list shows it.
13. **On failure** the form stays as typed, every error shows under its field and in a summary at the top ("Fix N problems to save." with links to each field), and focus moves to the summary. Spec errors from `validateSpecs()` show under the field named by the issue's path; an error with no field (a whole-object issue) shows in the summary only.

### Editing a product (`/admin/products/[id]`)

14. The same form, filled from the database, with the product's **status badge** and "Last saved {time}" at the top. The page is per request; an unknown or malformed id is the usual 404 with no `loading.tsx`, so the status code is kept. A "View on store" link shows for an **Active** product only (a draft has no public page).
15. **What can change.** Name, brand, featured, price, sale price, description, weight, warranty, box contents, pre-order date and every spec field can change on any product, draft or active. **SKU, slug and category are editable while the product is a draft** (D2, D3); on an Active product they are shown as plain text with "Locked while the product is on sale." **Changing the category of a draft** switches the Specifications section to the new category's fields, **empty**, with the note "Changing the category clears the specifications you entered." (values are not carried over, since the same key can mean something else in another category). The save then has to pass the **new** category's `validateSpecs()`; the old specs are never stored under the new category. Category and slug lock at the first publish (#113's `firstPublishedAt`; until then "locked" means "Active").
16. **Save changes** (labelled "Save draft" on a draft) validates exactly as create does. When nothing changed it says "No changes to save." and writes nothing.
17. **A concurrent edit is refused.** The form carries the product's `editVersion` it was loaded with. The save succeeds only if the row still has that value, and it adds 1 to it in the same statement; otherwise nothing is written and the form shows "This product was changed by someone else since you opened it. Reload to see their changes; what you typed is kept below for you to copy." with a **Reload** button (D5).
18. **Saved** shows "Changes saved." and the page now carries the new `editVersion`, so a second save from the same tab works. **A sale, a release or any stock change while the form is open does not make the save stale**: only another product save moves `editVersion`.

### Prices

19. Typed in pesos. After trimming, the text must be digits with an optional decimal part of one or two digits (`1299`, `1299.5`, `1299.50`), where commas are accepted only as thousands separators in groups of three (`1,299`, `1,299.50`, `12,999`). Refused with "Enter a price in pesos, like 1,299.50.": a blank price, **more than two decimals** (`1299.505`), a **negative** or signed number (`-5`, `+5`), an exponent (`1e3`), a trailing or lone dot (`1299.`, `.5`), misplaced commas (`1,29`, `12,99,9`, `,100`), spaces inside, a currency sign and anything else that isn't digits. A blank **sale** price is not an error: it means no sale. The text is converted by splitting its digits (peso digits × 100 plus the centavo digits); **no float, `Number()`, `parseFloat` or `parseInt` step touches the text**, and the stored value is `Product.price` in centavos (`1,299.50` → `129950`).
20. **Price** is at least ₱0.01 and at most ₱5,000,000.00 (D6). **Sale price**, when given, is at least ₱0.01 and **strictly below the price**; equal or higher is refused on the sale price field ("Sale price must be lower than the price."). Changing the price on a product that has a sale price re-checks the pair.
21. `effectivePrice`, `searchVector` and `stock` are never in any write this story makes (R7): the database trigger sets the first two; stock is 0 on create and untouched on edit.

### Audit

22. **Creating** writes an audit row (`product` / `created`) with the new product's name, SKU, category, brand, price and sale price. **Every edit that changes something** writes `product` / `updated` with `before` and `after` holding only the fields that changed (price and sale price as centavo integers, a category change as the old and new category slugs, spec changes as the changed spec keys with their old and new values). A price or sale price change is therefore always recorded with before and after. The row is written in the **same transaction** as the change, through `adminTransaction` and `recordAudit`. A denied or invalid request writes nothing and is not audited. A stale-refused or no-change save writes no row.
23. Demo sees the audit rows on the Audit screen masked as spec 040 defines; nothing here adds a masked field (a product's name, price and specs are public).

### Cache

24. After the transaction commits, the server action calls `updateTag(PRODUCTS_TAG)`. It runs on every successful write (create or edit), a draft included, because the tag is what the home page, sitemap and menus read and a draft edit is cheap to over-invalidate (D7). No cache call runs inside the transaction. A refused or failed save does not call it.

### The seed stops overwriting the admin

25. `db:seed` creates missing categories, brands and products, and **never changes an existing one**: categories and brands are create-only (name, sort order and logo of an existing row are kept), and the product catalog fields `isFeatured`, `name`, `description`, `specs`, `categoryId`, `brandId`, `weightGrams`, `warrantyMonths`, `boxContents` become create-only like price, stock, status and slug already are (`CATALOG_FIELDS` is emptied, D8). The seed's summary line stops saying "updated": a re-run reports existing rows as "left as they are". Images keep today's rule in this story; making them create-only is on [#114](https://github.com/romulojr-dev/pc-ecommerce/issues/114)'s acceptance list. *Changed by [spec 049](../049-product-images-upload/spec.md) (#114): the seed now writes no images at all, because the placeholder is derived from the category.* The `db:seed` paragraph of CLAUDE.md and spec 001's "Which product fields the seed writes" table are updated.

## 3. Examples

Real seed parts are used where they exist; amounts for new products are invented. IDs `E…` become tests.

| # | Input | Result |
| --- | --- | --- |
| E1 | Owner opens `/admin/products` | Every seeded product listed, 25 per page, newest edit first; a draft shows the Draft badge |
| E2 | Search `ryzen` | Rows whose name, SKU or brand contains "ryzen", e.g. AMD Ryzen 5 7600 |
| E3 | Search `r` (1 character) | Ignored: URL redirects to the list without `q`; no query runs |
| E4 | Category `gpu`, status `Draft` | Only draft graphics cards; with none, "No products match" and Clear filters |
| E5 | Demo opens the list and the edit page of Arctic Liquid Freezer III 360 | Pages render; New product, Save and every field are disabled; no write is possible (E26) |
| E6 | Staff opens `/admin/products` | `NoAccess`; no Products nav item |
| E7 | Owner: category `psu`, name "Corsair RM1000e", SKU "RM1000E-TEST", slug auto "corsair-rm1000e", brand Corsair, price `9,499.5`, sale price empty, weight 2100, warranty 120, specs formFactor ATX, wattageW 1000, efficiencyRating GOLD, modularity FULL | Saved as `DRAFT`, `price` 949950, `salePrice` null, `stock` 0, `effectivePrice` 949950 (trigger), searchable once active; audit `created`; `updateTag("products")` called once; lands on edit page, "Draft saved." |
| E8 | Same form with wattageW empty | Nothing saved; "Wattage: required" under the field and in the summary; no audit row; no `updateTag` |
| E9 | CPU form: Ryzen-like values with threads 4, cores 6 | `threads` error "must be at least cores (6)"; nothing saved |
| E10 | CPU form: socket AM5 with generation `raptor-lake-refresh` | `generation` error from the schema's cross-field check; nothing saved |
| E11 | CPU cooler form, type AIR | Height shown, Radiator size hidden; switching to AIO hides Height, shows Radiator size and drops the typed height; saving an AIO cooler sends no `heightMm` |
| E12 | Price `1299` | Accepted: 129900 centavos |
| E12a | Price `1,299` | Accepted: 129900 |
| E12b | Price `1,299.50` | Accepted: 129950 |
| E12c | Price `1299.5` | Accepted: 129950 |
| E12d | Price `1299.505` (three decimals) | "Enter a price in pesos, like 1,299.50." |
| E12e | Price `-5`, `+5`, blank, `1e3`, `1299.`, `.5`, `1,29`, `12,99,9`, `₱1299`, `12 99` | Each refused with the same message |
| E12f | Sale price blank | No sale: `salePrice` null; no error |
| E12g | Price `0` or `0.00` | Refused: at least ₱0.01 (R5) |
| E12h | Price `5,000,000.01` | Refused: over the maximum (R5) |
| E13 | Price `1000`, sale price `1000` | Sale price error "Sale price must be lower than the price." |
| E14 | Product with price ₱20,000 and sale ₱15,000: owner changes price to ₱14,000 | Sale price error; nothing saved |
| E14a | Pre-order ship date: today in Manila (even when UTC is still yesterday), then yesterday in Manila | Today accepted; yesterday refused: "The ship date can't be in the past." |
| E14b | An existing pre-order whose ship date has passed; owner edits only the description | Saved; the date isn't re-checked because it didn't change |
| E14c | Same product; owner changes the date to another past date | Refused; a future date or an empty date: accepted |
| E15 | Edit AMD Ryzen 5 7600: price ₱14,500 → ₱13,900 | Saved; audit `updated` with `before: { price: 1450000 }`, `after: { price: 1390000 }`; `effectivePrice` 1390000 (or the sale price when one is set); `updateTag` called |
| E16 | Edit the same product, change only the description | Saved; audit before/after hold only `description`; price not in the row |
| E17 | Open the edit page twice (tabs A and B); save A; then save B | B is refused with the changed-by-someone-else message, nothing written, no audit row, no `updateTag`; Reload shows A's values; `editVersion` went up by exactly 1 |
| E18 | Edit page open on Gigabyte GeForce RTX 5070 Windforce OC SFF 12 GB; meanwhile an order for it is placed (stock down, `updatedAt` bumped); then Save a price change | **Saved**: no conflict, because a sale doesn't change `editVersion`; the order's stock change is kept |
| E18a | Same page; meanwhile another owner saves a description change; then Save | **Refused** as stale (`editVersion` moved) |
| E18b | Same page; meanwhile stock or `lowStockAt` is written by a statement that sets `updatedAt` | Saved: `updatedAt` plays no part in the check |
| E19 | New product with SKU "ACFRE00136A" (Arctic Liquid Freezer III 360's SKU) | SKU field error "This SKU is already used by another product."; no crash, nothing saved |
| E20 | New product with SKU "acfre00136a" | Same SKU error (case-insensitive check) |
| E21 | New product with slug of an existing product | Slug field error "This slug is already used by another product." |
| E22 | Two requests create the same SKU at once | One saves; the other gets the SKU field error (the unique index decides, never a crash) |
| E23 | Edit an Active product | SKU, slug and category are plain text and locked; the same fields posted by hand are refused (R8) |
| E23a | Edit a Draft CPU product: change its category to Motherboard | The form shows the Motherboard fields, empty, with the clearing note; saving valid motherboard specs stores category `motherboard` and the new specs; audit holds the old and new category slugs |
| E23b | Same, posting the CPU's old specs by hand with the Motherboard category | Refused by `validateSpecs("motherboard", …)`; the draft keeps its CPU category and specs |
| E23c | A draft edited by hand to an unknown or non-builder category | Refused: "Choose a category." |
| E24 | Edit Gigabyte GeForce RTX 5070 Windforce OC SFF 12 GB: set Featured | Saved; `isFeatured` true; the home page (after revalidation) lists it among Featured products; audit `updated` with `isFeatured` |
| E25 | Hand-made POST to the create action with `stock: 50`, `effectivePrice: 1`, `searchVector: "x"` | Fields are not part of the input schema: rejected as invalid, or ignored if the schema strips unknown keys (D10); the row has stock 0 |
| E26 | Demo calls the create and update actions directly | Refused ("This account is read-only"), no table changed (the enumeration `.db` test covers both actions) |
| E27 | Foreign `Origin` on the create action | 403, nothing read or written |
| E28 | Re-seed (`pnpm db:seed`) after the owner renamed Arctic Liquid Freezer III 360, changed its brand and specs, and renamed the CPU category | Those rows keep the owner's values; no row is created or changed; summary says rows were left as they are |
| E29 | Re-seed on an empty database | Everything created exactly as before, including `isFeatured`, boxContents, categories and brands |
| E30 | Re-seed after the data file gained a new part | Only the new part (and any new brand) is created |
| E31 | Create fails after the audit row would be written (forced error) | Whole transaction rolls back: no product, no audit row |
| E32 | A gateway/email/other network call anywhere in the save | None exists; `guardTransactions` finds no call in a transaction |

### Acceptance criteria → examples and rules

| Issue criterion | Covered by |
| --- | --- |
| `/admin/products` list with search, category and status filters, drafts included; Demo can view it | B1–B7; E1–E6; R12 |
| Create and edit as a draft; form generated from `FieldMeta`, units shown, required fields marked | B8–B16; E7, E11, E23a; R2, R3 |
| Every specs write through `validateSpecs()` on the server, drafts included; no partial drafts | B11, B13; E8–E10; R1, R4 |
| Prices in pesos, stored as integer centavos; sale price below the price | B19–B20; E7, E12–E14; R5 |
| (review) Pre-order date today or later, checked only when changed | B9; E14a–E14c; R17 |
| (review) Category editable on a draft with the new category's `validateSpecs()` | B15; E23a–E23c; R8, D3 |
| `effectivePrice`, `searchVector`, `stock` never written; new product at stock 0 | B9, B21; E7, E25; R7 |
| SKU and slug clashes show as field errors, not a crash | E19–E22; R9 |
| Concurrent edit refused (by `editVersion`, replacing the issue's `updatedAt`, D5) | B17–B18; E17, E18–E18b; R6, D5 |
| No delete action exists | B3; R14 |
| Price changes written to the audit log with before and after | B22; E15, E16, E31; R10 |
| Every write invalidates `PRODUCTS_TAG` with `updateTag`, and a test proves it | B24; E7, E15; R11 |
| Seed catalog fields, categories and brands create-only; CLAUDE.md and seed spec updated | B25; E28–E30; R13, D8 |
| `isFeatured` editable | B9, B15; E24 |
| `adminAction`, audit in the same transaction, `can()` action in the table, demo-rejection enumeration | B1, B22; E5, E26, E27, E31; R10, R12 |
| No network call inside a database transaction | E32; R15 |
| (DoD) empty, loading and error states; desktop 1024 px and up | B7, B13; R16 |

## 4. Rules and edge cases

- **R1 — A product saves only when valid.** The server runs one pure `productInputSchema` (common fields) and then `validateSpecs(category, specs)`; any issue from either returns all of them and writes nothing. The browser runs the same schemas for instant messages, but only the server's answer decides. Create and edit are the same on this point, drafts included.
- **R2 — The form is generated, never hand-written per category.** A pure function in `lib/specs/` (no server imports) derives, from each category's Zod schema plus `FieldMeta`, a list of form fields: key, label, unit, group, kind (integer, boolean, enum with options, enum list, text), required (not wrapped in `optional`), and for the cooler union which fields belong to which type. A test fails when a field of any category has no form field, when a kind is unsupported, or when a required field isn't marked. Adding a spec field is still a code change (ADR 0002) and appears in the form with no admin code.
- **R3 — Units and base values.** Spec numbers are whole numbers in base units, as in the schema; the unit is only a label. `FieldMeta.largeUnit` is not used for input in this story (a 2 TB drive is typed as `2000`, GB). Decimals in an integer spec field are refused with the schema's own message.
- **R4 — Spec messages come from the schema.** A few messages name the key ("must be at least cores (6)", "baseClockMhz"); the form shows them as they come, under the field they are about (Q3). Unknown keys can't be typed because the form only has the schema's fields; the server still rejects them (`strictObject`).
- **R5 — Money.** Peso text → centavos by splitting the digits (B19) with no float step anywhere; a unit test feeds values a float would round (`0.1`, `1.005`, `19.99`, `4294967.29`). The stored integer fits Postgres `int` (max ₱5,000,000.00 = 500,000,000 centavos, D6). Sale price blank means `null`. `formatPeso` is used for every price shown.
- **R6 — Concurrency.** `Product.editVersion` (integer, default 0) is changed **only by the product save action**. The update is one conditional statement, `UPDATE … SET …, editVersion = editVersion + 1 WHERE id = … AND editVersion = {loaded}`; no row changed is `stale` and nothing else runs (no audit row, no `updateTag`). `updatedAt` plays no part: Prisma's `@updatedAt` is set on every Prisma Client update, and the stock statements set it by hand, so stock, `lowStockAt` and other writes would bump it; no stock statement or `updatedAt` behaviour changes anywhere (D5). Two saves from the same load: one wins, the other is stale. The seed and every other writer leave `editVersion` alone, so a row the seed creates starts at 0.
- **R7 — Never-written columns.** The create and update inputs have no `effectivePrice`, `searchVector`, `stock`, `lowStockAt`, `status`, `createdAt` or `updatedAt`; `editVersion` is only incremented by the save statement, never set from the request. `status` is `DRAFT` on create (the column default) and untouched on edit; publish and retire are #113. A test inspects the data each action hands to the database.
- **R8 — Locked fields are enforced on the server.** For a non-draft product a changed SKU, slug or category is refused with the field message "Locked while the product is on sale." even if a hand-made request sends it (nothing is silently ignored). For a draft, a changed category must be a builder category and the specs must pass **that** category's `validateSpecs()`; the stored `categoryId` and `specs` always change together or not at all. The lock test is the product's status today; #113 replaces it with `firstPublishedAt` for slug and category (SKU stays editable on drafts only).
- **R9 — Unique clashes.** SKU and slug are checked before the write (SKU case-insensitively, slug exactly, the product's own row excluded) and the database's unique indexes remain the backstop for a race; a clash found by either way is the same field error. A raw unique error never reaches the person and no P2002 is caught inside a transaction (the rolled-back transaction is caught outside it, and the field is found by re-checking).
- **R10 — Audit.** `recordAudit` runs in `adminTransaction` with the change; the audit row is written only when the conditional update changed a row. Entity `product`; actions `created` and `updated` (existing values in `AUDIT_ACTIONS`). Secret-looking keys are not an issue here (no secret field). `before`/`after` are capped at 16 KB by `recordAudit`; a description is limited to 5,000 characters, so a row stays under the cap.
- **R11 — Cache.** `updateTag(PRODUCTS_TAG)` is called by the server action itself after the transaction commits (it is only allowed in a server action, not in a route handler or `lib/` helper called from one). A test mocks `next/cache` and asserts one call on create and edit, none on invalid, stale, forbidden or unchanged saves, and none inside the transaction.
- **R12 — Guard.** Both mutations are `adminAction("products.write", schema, handler)`; `products.view` and `products.write` already exist in the permissions table, so no table row is added, but their `permissions.test.ts` rows stay. Page access: `requireAdminAccess("products.view")` with `NoAccess`. The guard enumeration test covers the two new exported actions. Reads go through `lib/admin/queries/products.ts` (named fields, no spread row), and `no-db-in-pages.test.ts` keeps pages and components free of the database.
- **R13 — Seed.** `CATALOG_FIELDS` becomes empty (the constant and its `pick` call go); categories and brands use create-only writes. The slug-conflict check for new parts stays. `--reset` is unchanged. Seed tests that assert a refresh (`write.db.test.ts`) change to assert "kept".
- **R14 — No delete.** No exported function, action or route deletes a product; a test greps the action module's exports.
- **R15 — No network in a transaction.** This story calls no outside service at all; the transaction holds only the product write and the audit insert.
- **R16 — Desktop first.** 1024 px and up; forms are a single column of sections with a sticky save bar; the specs grid may use two columns at 1024 px.
- **R17 — Text fields.** Name 3–150 characters trimmed; SKU 1–64 characters trimmed, no control characters, stored as typed (existing SKUs contain lower case and spaces); slug 3–120 characters of `a-z`, `0-9` and single hyphens, not starting or ending with a hyphen; description up to 5,000; weight a whole number of grams from 1 to 100,000 (the cart sums these); warranty 0 to 120 months; box contents up to 30 lines of up to 120 characters, blank lines dropped; pre-order date a valid calendar date that is **today or later in Asia/Manila** (the `manilaToday` approach, `lib/orders/time.ts`), **checked only when the submitted date differs from the stored one**, so an existing pre-order whose date has passed (spec 010: a passed date already ends the pre-order) can still be saved with other changes, and clearing the date is always allowed.
- **R18 — Brand.** Must be an existing brand. New brands are the Brands story ([#115](https://github.com/romulojr-dev/pc-ecommerce/issues/115)); until then the select offers the brands in the database.
- **R19 — No-op save.** Compared on the normalized values (centavos, trimmed text; box contents compare in order, since order is the display order). Equal means no write, no audit, no `updateTag`, no `updatedAt` bump.
- **R20 — Featured on a draft** is stored as chosen and has no storefront effect until the product is active (the home page already filters on ACTIVE).

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Nav / page title | Products |
| Heading | Products |
| New button | New product |
| Search placeholder / label | Search name, SKU or brand |
| Filters | Category (All categories); Status (All, Draft, Active) |
| Empty | No products yet. / No products match your search. Clear filters |
| List error | Couldn't load products. Try again. |
| Badges | Draft; Active; Featured |
| Category step heading | Choose a category |
| Category step hint | The specifications depend on the category, so choose it first. You can change it while the product is a draft. |
| Category change note | Changing the category clears the specifications you entered. |
| Form sections | Basics; Pricing; Details; Specifications |
| Basics labels | Name; SKU; Slug; Brand; Featured |
| Featured hint | Featured products show on the home page once the product is active. |
| Pricing labels | Price (₱); Sale price (₱) |
| Sale hint | Leave sale price empty when the product is not on sale. |
| Details labels | Description; Weight (g); Warranty (months); Box contents; Pre-order ship date |
| Box hint | One item per line. |
| Required marker | required |
| Stock line | Stock: {n}. Stock changes through Inventory. |
| Locked line | Locked while the product is on sale. |
| Buttons | Save draft; Save changes; Reload |
| Success | Draft saved. / Changes saved. |
| No change | No changes to save. |
| Summary | Fix {n} problems to save. (singular: Fix 1 problem to save.) |
| Field errors | Enter a price in pesos, like 1,299.50.; The ship date can't be in the past.; Choose a category.; Locked while the product is on sale.; Sale price must be lower than the price.; This SKU is already used by another product.; This slug is already used by another product.; Choose a brand.; {field}: required (from the schema) |
| Stale | This product was changed by someone else since you opened it. Reload to see their changes; what you typed is kept below for you to copy. |
| Server refusals | This account is read-only (Demo); Only owners can do this (Staff) — spec 040's `denial.ts`; Couldn't save the product. Try again. (unexpected failure) |
| Read-only (Demo) | This account is read-only. |
| Seed summary | `… (3 created, 147 left as they are)` replaces `(0 created, 150 updated; stock, price and status kept)` |

## 6. Data and interfaces

- **One schema change:** `Product.editVersion Int @default(0)` (a migration; existing rows get 0; `db:drift` stays clean). Every other column used already exists. `AUDIT_ENTITIES` and `AUDIT_ACTIONS` already contain `product`, `created`, `updated`. `getProductForEdit` returns `editVersion`; the form posts it back; `updateProduct` takes it as `expectedVersion`.
- **Routes.** `/admin/products` (route group `(list)` with `loading.tsx`, `error.tsx`), `/admin/products/new` (category step, then form via `?category=`), `/admin/products/[id]`. The edit and new pages have no `loading.tsx` (status codes). All per request (`connection()`), `noindex`, `no-store`, under the existing admin layout.
- **Pure modules (no server imports):** `lib/admin/products-params.ts` (parse, serialize, canonical check); `lib/specs/form-fields.ts` (R2: `specFormFields(category)` → ordered form-field descriptors, and `specsFromForm(category, values)` → the object `validateSpecs` takes); `lib/admin/product-input.ts` (`productInputSchema`, `pesosToCentavos`, `centavosToPesos`, the sale-below-price check, the locked-field rule for non-drafts); `lib/admin/products-view.ts` (labels, badges).
- **Server:** `lib/admin/queries/products.ts` — `listProducts(role, params)`, `getProductForEdit(role, id)` (named fields, `editVersion`), `listBrandOptions(role)`. `lib/admin/products/save.ts` — `createProduct(actor, input)` and `updateProduct(actor, input)` returning `{ kind: "saved", id, editVersion } | { kind: "invalid", errors } | { kind: "clash", field } | { kind: "stale" } | { kind: "unchanged" }`. Actions in `app/admin/(shell)/products/actions.ts` (`"use server"`): `createProductAction` and `updateProductAction`, both `adminAction("products.write", …)`, each calling `updateTag(PRODUCTS_TAG)` after a `saved` result.
- **Permissions:** existing `products.view`, `products.write`. **Nav:** `NavItem.key` gains `"products"`.
- **Seed:** `prisma/seed/write.ts` (`CATALOG_FIELDS` removed, category and brand writes create-only, `SeedCounts.updated` becomes the number of existing rows left as they are), `prisma/seed.ts` summary text. Docs: CLAUDE.md `db:seed` bullet and the Admin products bullet, spec 001's field table (with a "changed by spec 045" note), spec 011 / 005 only if they restate the table.

## 7. Test plan

- **Unit (pure):** `pesosToCentavos` / `centavosToPesos` over E12–E12h, the boundaries (0.01, 5,000,000.00) and float-trap values (`0.1`, `1.005`, `19.99`), plus a test that reads the module and fails if it calls `Number`, `parseFloat` or `parseInt` on the text; sale-below-price (E13, E14); `productInputSchema` per field (R17); `specFormFields` for all eight categories (every schema key has a form field, kinds, required flags, units, the cooler union's two shapes; E11); `specsFromForm` round trip through `validateSpecs` for every seed part (a seed part → form values → specs equals the original); `products-params` canonicalization (E3, E4); locked-field rule (E23); view labels.
- **Integration (`*.db.test.ts`, Docker Postgres):** create a draft with audit row in one transaction (E7, E31 rollback by a forced failure); every spec invalid case writes nothing (E8–E10); update with before/after price audit (E15, E16) and `effectivePrice` set by the trigger; `stock` 0 on create and unchanged on edit; stale update refused with nothing written (E17), two concurrent saves with one winner; a concurrent sale (a real `placeOrder`), a `lowStockAt` write and a stock `UPDATE` that sets `updatedAt` leave a save fresh, while a second product save makes it stale (E17, E18–E18b), and `editVersion` rises by exactly 1 per save and not at all on a refused, invalid or no-op save; a category change on a draft with valid and invalid new specs (E23a–E23c; the stored category and specs never half-change); pre-order date cases (E14a–E14c); SKU and slug clashes sequential and racing (E19–E22), no crash; no-op save writes nothing (R19); locked fields on an Active product (E23); `listProducts` filters, search, drafts, paging and `EXPLAIN`-free correctness; **cache**: with `next/cache` mocked, `updateTag("products")` is called once after create and after edit and never on invalid / stale / forbidden / unchanged, and the call happens after the commit; **guard**: Demo and Staff calling both actions are refused with no table changed (the enumeration `.db` test lists both), foreign origin refused; `guardTransactions` over both saves (E32); seed: re-seed keeps an edited name, brand, specs, category name, `isFeatured` and `boxContents` (E28), fresh seed creates everything (E29), a new part is the only creation (E30), `--reset` unchanged; the existing refresh assertions in `write.db.test.ts` are rewritten.
- **E2E (`admin` project, `e2e/admin-products.spec.ts`, throwaway products with a unique prefix, removed by the fixture through the database):** Owner creates a PSU and a CPU cooler (AIO) draft, sees the generated fields and required markers, hits a spec error and a sale-price error and fixes them, saves, and sees the draft in the list with its filters; edits a price and sees the audit row on the Audit screen; two tabs produce the stale message and Reload; SKU clash shows a field error; Demo sees the list and an edit page with everything disabled (HTML and RSC payloads); Staff sees `NoAccess`. Lint, typecheck and `db:drift` pass. Preview check: the acceptance list on the preview URL at 1024 px and 1280 px.

## 8. Out of scope

- Publish, unpublish, retire, `RETIRED` status, SEO title and description, `firstPublishedAt` and moving the slug / category lock from "Active" to "first published": [#113](https://github.com/romulojr-dev/pc-ecommerce/issues/113). Until then products created here stay drafts and only a re-seed or SQL activates one.
- Images: [#114](https://github.com/romulojr-dev/pc-ecommerce/issues/114). Stock and `lowStockAt`: [#116](https://github.com/romulojr-dev/pc-ecommerce/issues/116). Categories and brands admin (edit, logo, create): [#115](https://github.com/romulojr-dev/pc-ecommerce/issues/115).
- Bulk edit, CSV, adding spec fields (a code change, ADR 0002), non-builder category products, delete, a draft preview page, slug redirects, scheduled publishing, an audit "history" tab on the product page (the Audit screen already lists the rows).
- Label-based spec messages: [#137](https://github.com/romulojr-dev/pc-ecommerce/issues/137) (the form shows schema messages as they come, R4).
- Changing the cache design: `unstable_cache` and the existing tags stay; only the invalidation call is added.

## 9. Decisions

- **D1 — Staff has no access to Products (intended, AD-11).** Spec 040's table gives `products.view` to Owner and Demo only. #116's issue gives inventory its own `/admin/inventory` with `inventory.view` for everyone and adjusting for Owner and Staff, so Staff never need `products.view`; no edit to #116 is needed. One note for that story: a link from an inventory row to a product's edit page must show only when `can(role, "products.view")`. Rejected: widening `products.view` for Staff.
- **D2 — SKU is editable on drafts only; slug and category on drafts today and until first publish after #113.** Until #113 adds `firstPublishedAt`, "a draft" is the closest safe test for "never published", and locking Active products protects URLs, carts and the seed (which upserts by SKU). Cost: a retired-then-draft state doesn't exist yet, so nothing more is needed here. Rejected: editable everywhere (breaks links, and a changed SKU makes the next re-seed insert the original again and fail on its slug).
- **D3 — Category is editable while the product is a draft, and the specs restart empty.** There is no delete and a draft can't be retired, so a wrong-category draft could otherwise never be fixed. The form switches to the new category's fields with a note; the save must pass the new category's `validateSpecs()`. Category and slug lock at first publish (#113). Rejected: fixed at create (a mistake is permanent); carrying values over by key (`capacityGb` or `chipset` exist in several categories with different meanings).
- **D4 — Stock is a read-only line on the form.** The issue says stock changes through #116; showing it avoids a form that looks like it forgot the field. Rejected: omitting it (confusing), an editable field (breaks the rule).
- **D5 — The edit token is a new `Product.editVersion` column, not `updatedAt` (changes the issue's wording).** Prisma's `@updatedAt` is set on every Prisma Client update and the stock statements set it by hand; with `updatedAt` as the token, a sale, a release or a later `lowStockAt` write would refuse an unrelated edit. `editVersion` is incremented only by the product save, so only a concurrent product save conflicts, and no stock statement or `updatedAt` behaviour changes. The stale refusal keeps what was typed so the person can copy it; only Reload replaces it. Rejected: `updatedAt` (false conflicts); removing `updatedAt` from stock statements (touches other stories and wouldn't cover `lowStockAt`); auto-merge (needs a field-level conflict model).
- **D6 — Price range ₱0.01–₱5,000,000.00.** Fits Postgres `int` with margin, covers the most expensive PC part, and keeps the gateway's 15-digit limit far away. The ₱20.00 online minimum is the voucher/checkout rule's job (spec 037), not a catalog rule. Rejected: a higher cap (nothing sells for more); a ₱20 floor (it would block cheap accessories and the checkout already copes).
- **D7 — Every successful write invalidates `PRODUCTS_TAG`, drafts included.** The issue says "every write"; a draft is invisible, so the invalidation is a cheap no-op in effect. Rejected: invalidating only when the product is Active (a status change in #113 would need the same call anyway, and a rule that depends on status is easy to get wrong).
- **D8 — `CATALOG_FIELDS` is emptied and categories and brands become create-only.** Follows the issue. Consequences to accept: editing a seed data file no longer changes existing rows (use `--reset` on dev, edit in Admin on production), `Category.sortOrder` changes in code don't propagate, and `isFeatured` picks are owned by Admin. Rejected: keep refreshing `specs` because it is "catalog data" (an admin-corrected spec would silently revert, and a wrong spec breaks the builder).
- **D10 — Input schemas reject unknown keys.** `effectivePrice`, `stock`, `searchVector` in a request are an invalid request, not silently dropped, so a test can prove they can never get through. Rejected: `strip` (hides client bugs).
- **D11 — Audit every create and every changing edit, not only price changes.** The issue requires price changes; recording all edits costs one row each and answers "who changed this?" for any field. Rejected: price only (inconsistent with AD-10's "who changed … and when" for a catalog this size, and a name change can matter as much).
- **D12 — The category step comes first, then the form.** Spec fields depend on it and the form is generated. Rejected: one form with a category select that rebuilds the specs section (loses typed specs on a mis-click).
- **D13 — Product creation and edit are server actions, with `updateTag`.** `updateTag` is allowed only in server actions (Next docs) and expires the tag at once, the read-your-own-writes case that ADR 0003 describes for app writes: the owner sees their edit on the next load, not a stale copy. Rejected: a route handler with `revalidateTag(…, "max")`.
- **Flag, convention differs:** CLAUDE.md and the existing code invalidate with `revalidateTag(PRODUCTS_TAG, "max")` (stale-while-revalidate, safe from `after()` and route handlers). This issue asks for `updateTag` (immediate expiry, server actions only) for admin writes, so the owner sees their edit at once. Both stay; the CLAUDE.md note names which to use where.
- **Flag, issue wording:** the issue says "using `updatedAt`"; D5 replaces it with `editVersion` for the reason given there. The intent (a concurrent edit can't silently overwrite) is unchanged.
- **Flag, PRD vs issue:** AD-2 lists "images upload, SEO title/description, publish/draft toggle" with create/edit; the issue splits them into #114 and #113. The PRD wins on scope overall, so this story is a part and AD-2 is complete only after #113 and #114.

## 10. Open questions

None. Q1 (edit token), Q2 (pre-order date) and Q3 (schema messages, backlog [#137](https://github.com/romulojr-dev/pc-ecommerce/issues/137)) were settled in review; see D5, R17 and R4.

## 11. What changed while building

- **E18 / E18b** are tested with the statement `placeOrder` runs on stock (`UPDATE … "updatedAt" = now()`) and a `lowStockAt` write, not a full `placeOrder`: the check only depends on `editVersion`, and `placeOrder` has its own tests.
- **E27 (foreign origin)** does not apply to the two actions: `adminAction` does not check the origin (Next.js checks it for server actions); only `adminRoute` does. The Demo, Staff and signed-out refusals are tested instead.
- **E32** holds by construction (the save calls no outside service), so there is no `guardTransactions` test.
- **`pg` `LIKE` wildcards:** Prisma's `contains` does not escape `%` and `_`, so the product search escapes them by hand (a test pins it).
- **Edit saves** redirect to `?saved=changes`, so the page re-renders with the new `editVersion` and the form remounts; "Changes saved." comes from that URL value, which only picks a message and changes no data.
- **E2E ran against the Docker Postgres** (the dev server with `DATABASE_URL` set to it); all 68 admin-project tests pass.
