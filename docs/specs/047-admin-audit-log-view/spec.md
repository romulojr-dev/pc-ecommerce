# 047 — Admin audit log view

Status: approved with the changes folded in below (two rules per audit key, the open questions settled, two indexes up front, "to" stated as before 00:00 of the next Manila day, no SQL-inserted E2E fixtures). Issue: [#119](https://github.com/romulojr-dev/pc-ecommerce/issues/119) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8). PRD: AD-10 (audit log), AD-11 (roles; Demo masked). Builds on [spec 040](../040-admin-permissions-audit-masking/spec.md) (#105: `AuditLog`, `recordAudit`, `audit.view`, masking, the guard enumeration) and the screens of specs 041 to 046.

## 1. Summary

The owner (and the Demo account, masked) gets an **Audit log** screen at `/admin/audit`: every recorded change newest first, 25 per page, filterable by entity, actor and Asia/Manila day range, each entry expandable to a readable before → after diff with a link to the thing that changed. The screen is strictly read-only. Two tests close the loop on the foundation of spec 040: one proves the table is still append-only from this story's side, and one lists every registered admin mutation and proves each writes an audit entry, so a future mutation that forgets `recordAudit` fails CI.

Short form not used: this adds a screen, a query module, a masking rule for diffs and a cross-cutting test.

## 2. Behavior

### Who sees what

1. `audit.view` is Owner and Demo (spec 040's table, unchanged; no new `can()` action). **Staff cannot**: the nav item is not shown, and a direct visit to `/admin/audit` renders `<NoAccess />` (the usual "no access" page, no audit read). The nav gains **Audit log** after Customers, via `navItemsFor`.
2. Demo opens the screen and sees the same rows with customer fields masked **by key**, at any depth of `before` and `after` (spec 040, Behavior 17). The actor shows as name and role, never email, for both roles.
3. There is **no mutation anywhere under `/admin/audit`**: no server action, no route handler, no form that posts. Filters are a `GET` form.

### The list (`/admin/audit`)

4. One row per `AuditLog` entry, **newest first** (`createdAt` desc, then `id` desc, so order is stable across pages), 25 per page. A row shows: when (Asia/Manila, `dateTimeText`), **who** (actor name and role), **what** ("Product · Updated", from the entity and action labels), **which** (the entity's readable name, linked when it can be, see 8), and a **Show changes** disclosure.
5. **Filters**, in the URL, parsed and written only by a pure `audit-params` module (`entity`, `actor`, `from`, `to`, `page`); bad values fall back to defaults, and a non-canonical URL redirects, exactly as the orders and inventory lists do:
   - **Entity**: All, or one of the closed `AUDIT_ENTITIES`. Unknown value → All.
   - **Actor**: All, or one user who has at least one audit row (name and role in the select; disabled users stay listed, since their history stays). Unknown id → All.
   - **From** and **To**: Asia/Manila calendar days, `YYYY-MM-DD`, **both inclusive**. From keeps entries at or after 00:00 Asia/Manila of that day. **To keeps entries strictly before 00:00 Asia/Manila of the next day** (a half-open upper bound, never "23:59:59.999"), so an entry at 23:59:59 on the To day is in and one at 00:00:00 the next day is out. Either may be empty (open-ended). A value that isn't a real calendar date is dropped. If From is after To both are dropped and the page says "The start date was after the end date, so the dates were cleared." (D4).
   - A page past the last redirects to the last; a filter with zero results renders page 1 with the empty state and no redirect.
   - A "Clear filters" link shows whenever any filter is active.
6. **Loading**: skeleton rows (`loading.tsx` in a `(list)` group). **Empty**: "No changes recorded yet." with no filter, "No changes match these filters." with Clear filters. **Error**: `error.tsx`: "Couldn't load the audit log. Try again." with a retry. A page, an entity link target or a name lookup that fails never shows a raw error.
7. The page is per request (`connection()`), `noindex`, `no-store`, `no-referrer` (already true of `/admin/*`), not in the sitemap.

### An entry's detail

8. **Which**, per entity: `order` shows the **order number** (looked up for the page's rows in one query, not the cuid) linked to `/admin/orders/{number}`; `product` shows the product's current name and SKU linked to `/admin/products/{id}` (Owner and Demo both hold `products.view`); an entity whose screen doesn't exist yet or whose row is gone (`image`, `category`, `brand`, `refund`, `payment`, `voucher`, `shipping-rate`, `store-settings` until their stories ship) shows its id as plain text and **no link**. A link is rendered only when the viewer can open the target (`can(role, <view action>)`); the link table is one pure module so a later story adds one line (D6).
9. **Show changes** expands the entry (native `<details>`, works without JavaScript) to a **diff table**: one row per changed field, columns **Field**, **Before**, **After**.
   - `before` and `after` hold the changed fields only (spec 040, Behavior 11). The table lists the **union of their keys**; a key only in `after` has Before "—" (a create has every field new; a null `before` means every row reads "—"), and a key only in `before` has After "—".
   - Nested objects (a product's `specs`) are flattened to dotted paths (`specs.socket`, `specs.cores`) and **only leaves that differ are shown**. Arrays are compared whole and shown as a comma-separated list.
   - Field names are humanized from the key ("salePrice" → "Sale price"). **Every key has two rules** in one pure registry (`lib/admin/audit-keys.ts`, Behavior 12): a **format rule** (how Owner reads the value) and a **Demo rule** (how Demo reads it). Format rules: `pesos` (centavos shown with `formatPeso`), `status` (the label of an enum), `date` (ISO text in Asia/Manila), `plain` (the value as text; booleans "Yes"/"No", arrays comma-separated). Demo rules: `shown`, `masked` (as customer data, with its kind: name, email, mobile, tracking, address) or `hidden` ("Hidden in demo").
   - An entry with no `before` and no `after` (a delete, or an action with nothing to compare) says "No field changes were recorded."
   - A value over 300 characters is cut with "…" and the full value is in the cell's `title`, never in a layout-breaking row.
10. The raw JSON is not shown, anywhere, to anyone.

### Demo

11. For Demo, every `before` / `after` goes through `maskAuditJson` **before** it leaves the query module: customer name, email, mobile, tracking number and address keys masked; free-text keys (`note`, `message`, …) "Hidden in demo"; other keys kept. The diff is computed from the **raw** values on the server and only then masked, so a name change `Ana Reyes → Ben Cruz` still reads as a changed row (both masked values would otherwise be the same string `A••• R•••` and the row would vanish): the row shows the masked before and after and the badge "Changed" (R7). The page's RSC payload carries no raw value for Demo (spec 040's `expectNoRawValues`).

12. **A key with no rule** (a writer added a key and nobody classified it) is shown to Owner as plain text and is **hidden for Demo**: the safe default for the role that must never see customer data. This changes spec 040 Behavior 17 ("other keys kept") to "other keys hidden"; keys that spec 040 kept (`status`, `stock`, `price`, …) get an explicit `shown` rule, so E15 of spec 040 still holds (D13). A test makes the default unreachable for the real writers: it runs every audited mutation through the fixture registry (R12), collects every key (at any depth, as the same dotted paths the diff uses) of every row written, and fails when any key lacks its format rule or its Demo rule (R9).

## 3. Examples

Seed parts as in specs 045/046: `CPU-AMD-7600X` (SKU), orders from `test-support/orders.ts` (`PCS-…` numbers).

| # | Input | Expected |
|---|---|---|
| E1 | Owner opens `/admin/audit` with 60 entries | page 1 shows the 25 newest, newest first; "Page 1 of 3" and next link |
| E2 | Two entries with the same `createdAt` | order is by `id` desc on every page; no entry appears twice or is skipped across pages 1 and 2 |
| E3 | `/admin/audit?entity=order` | only `order` entries; the select shows Order; Clear filters shown |
| E4 | `?entity=widget` | treated as All; URL redirects to `/admin/audit` |
| E5 | `?actor={id of Staff user "Mara"}` | only Mara's entries; list of actors includes a disabled user who has rows |
| E6 | `?from=2026-11-05&to=2026-11-05`, an entry at 2026-11-05 23:30 Manila (15:30 UTC) and one at 2026-11-06 00:10 Manila (2026-11-05 16:10 UTC) | only the first (Manila day, not UTC day); both bounds inclusive |
| E7 | An entry at exactly 2026-11-05 00:00:00.000 Manila, `from=2026-11-05` | included; the one at 2026-11-04 23:59:59.999 Manila is not |
| E7b | `to=2026-11-05`; entries at 2026-11-05 23:59:59 Manila, 2026-11-05 23:59:59.999 Manila and 2026-11-06 00:00:00.000 Manila | the first two are in; the third is out (the range ends before 00:00 Manila on the next day) |
| E8 | `?from=2026-11-09&to=2026-11-01` | both dropped, notice shown, all entries listed |
| E9 | `?from=2026-02-30` | dropped, URL redirects without it |
| E10 | `?page=99` with 3 pages | redirects to `page=3` (canonical: `page=1` omitted) |
| E11 | Filters match nothing | "No changes match these filters." page 1, no redirect |
| E12 | Product update by Owner: `before { price: 1299900, stock: … }` → `after { price: 1199900 }` | row "Product · Updated", name linked to `/admin/products/{id}`, diff: Price ₱12,999.00 → ₱11,999.00 |
| E13 | Specs change `{specs:{cores:6,socket:"AM5"}} → {specs:{cores:8,socket:"AM5"}}` | one diff row `specs.cores` 6 → 8; `specs.socket` not listed |
| E14 | Stock adjust entry (`stock-adjusted`, before stock 12, after 17) | "Product · Stock adjusted"; Stock 12 → 17 |
| E15 | Order status entry, entityId = order cuid | shows `PCS-…` linked to `/admin/orders/PCS-…`; diff Status Paid → Processing (labels) |
| E16 | Cancel with note "Leave with guard" (Other reason) | Owner sees the note; Demo sees "Hidden in demo" in that row |
| E17 | Tracking `JT1234567890` in `after` | Owner sees it whole; Demo sees `••••7890` form per `maskTracking` |
| E18 | Name change `Ana Reyes → Ben Cruz` in a customer-related entry, viewed as Demo | one row, Before and After both `A••• R•••` / `B••• C•••` style masked, badge "Changed"; as Owner the real names |
| E19 | Entry for a `voucher` (no screen yet) | id as plain text, no link, no error |
| E20 | Product was later retired/renamed | link text is the product's current name; a hard-missing product row falls back to the id as text |
| E21 | Staff visits `/admin/audit` | no-access page; no `AuditLog` query ran; nav has no Audit log item |
| E22 | Signed-out visit | redirect to login (proxy + `requireAdminSession`) |
| E23 | Demo opens the screen | all rows, masked; no email anywhere; RSC payload passes `expectNoRawValues` |
| E24b | A key `couponNote2` that no writer registered, in a row's `after`, viewed as Owner and as Demo | Owner sees the plain text; Demo sees "Hidden in demo" (Behavior 12) |
| E24c | A new audited mutation writes `{ shippingNote: "x" }` and no rule exists for `shippingNote` | the key test fails and names the key and the missing rule |
| E24 | An entry whose `after` was stored `{ sessionToken: "[redacted]" }` | diff shows "[redacted]", never a token |
| E25 | `UPDATE "AuditLog" SET action='x'` and `DELETE FROM "AuditLog"` | both fail at the database |
| E26 | Every registered admin mutation called by an Owner with its fixture input | each writes ≥ 1 `AuditLog` row with the Owner as actor, in the same transaction as its change |
| E27 | A new marked admin action with no fixture in the registry | the test fails, naming the action |
| E28 | `setLowStockAtAction` with the value it already has | "No changes to save." and **no** audit row (R11) |

## 4. Rules and edge cases

- R1. The query module `lib/admin/queries/audit.ts` is the only reader. It takes the role, calls `assertCan(role, "audit.view")` first, and selects **named fields only**. It returns `AuditEntryView`-shaped DTOs plus the diff rows; Demo's DTO has no field that can hold a raw value.
- R2. Pagination is `skip`/`take` with the `id` tiebreak, a separate `count` for the page total. Both use the same `where`.
- R3. Date bounds are converted once in a pure helper: a Manila day → `[start, nextDayStart)` instants (UTC+8, no DST), so To is inclusive because the upper bound is "before 00:00 Asia/Manila on the next day", never by subtracting a millisecond (E7b).
- R4. The entity and actor filters are validated against the closed list and the known actor ids (a stale id → All). Values reach SQL only as bound parameters.
- R5. **Order numbers and product names are resolved per page** with two batched reads (ids from the page's rows), never one query per row. A missing target is not an error.
- R6. The diff is a pure function `auditDiff(before, after)` (sorted by field path) with its own label/format layer; it never throws on any JSON (arrays, nulls, deep nesting, a key with a dot in it, a string where an object was). Depth is capped at 6; below that the subtree is compared and shown as text.
- R7. For Demo the diff runs on raw values, then each side is masked; "Changed" is a flag computed before masking.
- R8. Defense in depth: although `recordAudit` redacts secret-looking keys on write (spec 040 R11), the reader redacts them again with `isSecretKey` for every role, so a row written by a script, a restored backup or an older writer still can't show one. The check is by key, at any depth.
- R9. **The two-rule key test.** `lib/admin/audit-keys.ts` is one registry: for each audit key (its leaf name; a dotted path falls back to its leaf, and `specs.*` has one wildcard rule) a `format` (`pesos` | `status` | `date` | `plain`) and a `demo` rule (`shown` | `masked:<kind>` | `hidden`). The registry replaces the key sets in `lib/admin/mask.ts`, which now reads it. A test (`audit-keys.db.test.ts`) runs the fixture registry (R12), collects every key from every `AuditLog` row the writers produced and fails, naming the key and the writer, when a key has no format rule or no Demo rule. A unit test fails when a `masked` kind has no masker or a `status` format has no label table. The entity and action labels are tested for completeness against `AUDIT_ENTITIES` / `AUDIT_ACTIONS`.
- R10. The screen shows the 25 rows on the page only; no row cap on the table. A very large `before`/`after` is already capped at 16 KB on write.
- R11. A mutation that changes nothing (stale, "No changes to save", a refused request) writes **no** audit row, and the mutation test checks that the audit count did not change for a refused call (denied Demo call, stale order move). Audit is a record of what changed.
- R12. The mutation-coverage test (E26/E27): it uses the same scan as the guard enumeration (`scanModules` over every admin `"use server"` module and every non-`GET` `adminRoute` under `app/api/admin/**`) to list the **marked** functions, and requires a fixture for each in a registry `test-support/admin-audit-fixtures.ts` (`{ file, export, action, input, setup }`). A marked function without a fixture, or a fixture whose function no longer exists, fails. Read-only (`*.view`) routes are exempt by `isReadAction`. For each fixture: run as Owner, assert ≥ 1 new `AuditLog` row with `actorId` = the Owner, an entity and action from the closed lists, and that the row and the change share a transaction (the existing rollback test pattern: force a throw after `recordAudit`, expect neither).
- R13. No-write guarantee: a test reads the files under `app/admin/(shell)/audit` and fails if any contains `"use server"`, a `route.ts`, or imports `adminAction`/`adminRoute`; `no-db-in-pages.test.ts` already covers database imports. The append-only trigger is covered here again (E25) by calling the real `recordAudit` to make a row and then trying `UPDATE`/`DELETE` through Prisma and raw SQL, and `TRUNCATE` still succeeding.
- R14. Timezone: dates print through `lib/orders/time.ts`; the filter inputs are labelled "(Philippine time)".
- R15. Accessibility: the filters are a labelled `GET` form; the disclosure is a real `<details>`/`<summary>`; the diff is a `<table>` with header cells; a masked or redacted value is plain text, not colour-only.
- R16. Desktop-first (1024 px and up). Below that the table scrolls horizontally rather than hiding columns.

## 5. Messages and copy

| Where | Text |
|---|---|
| Nav item, page title | Audit log |
| Page intro | A record of who changed what, and when. It can't be edited. |
| Demo note | Customer details are hidden in the demo. |
| Filters | Entity · Actor · From (Philippine time) · To (Philippine time) · Apply · Clear filters |
| Select all options | All entities · All people |
| Row actions | Show changes |
| Diff headers | Field · Before · After |
| Empty value | — |
| Changed badge (Demo) | Changed |
| No fields | No field changes were recorded. |
| Empty (none) | No changes recorded yet. |
| Empty (filtered) | No changes match these filters. |
| Bad date range | The start date was after the end date, so the dates were cleared. |
| Error page | Couldn't load the audit log. Try again. |
| Retry | Try again |
| Pager | Page {n} of {m} · Previous · Next |
| Entity labels | Product · Image · Category · Brand · Order · Refund · Payment · Voucher · Shipping rate · Store settings |
| Action labels | Created · Updated · Deleted · Published · Retired · Status changed · Cancelled · Stock adjusted · Refund recorded · Payment reviewed |
| Redacted value | [redacted] |
| Masked free text | Hidden in demo |

## 6. Data and interfaces

- **Routes:** `/admin/audit` (a `(list)` route group with `loading.tsx` and `error.tsx`, as orders and inventory). No detail route, no action, no API route.
- **Pure modules** (no database imports):
  - `lib/admin/audit-keys.ts`: the two-rule registry (R9); `formatRuleOf(path)`, `demoRuleOf(path)`; value formatting and the Demo masker read it.
  - `lib/admin/audit-params.ts`: `parseAuditParams(raw)`, `auditHref(params)`, `isCanonical`; `AUDIT_PAGE_SIZE = 25`.
  - `lib/admin/manila-day.ts` (or beside `lib/orders/time.ts`): `manilaDayRange(from?, to?)` → `{ gte?: Date, lt?: Date }`.
  - `lib/admin/audit-diff.ts`: `auditDiff(before, after)` → `{ path, before, after }[]`.
  - `lib/admin/audit-labels.ts`: entity/action labels, `fieldLabel(key)`, `auditTargetHref(role, entity, key)` (the link table, D6).
  - nav: `navItemsFor` gains `audit` (`audit.view`); `ADMIN_COPY.shell.auditNav`.
  - `lib/admin/mask.ts`: `maskAuditJson` now reads the registry; an unclassified key is `hidden` (Behavior 12).
- **Query module** `lib/admin/queries/audit.ts`, replacing today's `listAuditEntries(role, filter)` (spec 040, a thin first cut capped at 200 rows, no pagination): `listAuditPage(role, params)` → `{ entries, total, page, pageCount, actors }`, and `AuditEntryView` extended with `target` (`{ label, href: string | null }`) and `changes` (`{ field, before, after, changed }[]`). The old function's callers (spec 040's tests) move to the new one.
- **Schema:** one small migration adds two indexes up front: `(createdAt DESC, id DESC)` for the unfiltered list and the date filter, and `(entity, createdAt DESC)` for the entity filter (the column is `entity`). No new actor index; the existing `(actorId)` index from #105 stays, and so does the old `(createdAt)` index (the migration only adds). No data, trigger or constraint changes.
- **Components:** `components/admin/audit-list.tsx` (table + disclosure + diff), `audit-filters.tsx` (GET form). Presentational; data from the page.
- **Test support:** `test-support/admin-audit-fixtures.ts` (the mutation registry of R12), reusing `makeStaffUser`, `signInCookie` and the order/product builders.
- **Docs:** CLAUDE.md (an "Admin audit log view" bullet; the staff-nav sentence), README roles paragraph, spec 040 "What changed" note that `listAuditEntries` became `listAuditPage`, PRD AD-10 gets a pointer to this spec.

## 7. Test plan

| Level | Covers |
|---|---|
| Unit | `audit-params` (E3 to E11 parse/canonical); `manilaDayRange` (E6, E7, month/year ends, leap day); `auditDiff` (E12 to E14, nested/array/null/deep/dotted-key, no-throw property over odd JSON); labels and value formatting incl. R9 against every writer's keys; `auditTargetHref` (E15, E19, E20); `navItemsFor` per role (E21); mask-then-diff for Demo (E17, E18, R7); redaction at read (E24, R8) |
| Component (markup) | `audit-list`: row, disclosure, diff table, empty/filtered/error states, no link for unlinked entities, Demo "Changed" badge, `[redacted]` rendering |
| Integration (`*.db.test.ts`) | `listAuditPage`: ordering and id tiebreak across pages (E1, E2), each filter and their combination, Manila bounds (E6, E7), role gate (Staff throws before any query, E21), batched lookups (query count does not grow with page rows), Demo masking of nested keys and no raw value in the DTO (E16 to E18, E23); **trigger test** (E25, R13); **mutation coverage** (E26, E27, R11, R12, plus the rollback pairing); `demo-audit-pages.db.test.ts` renders the page as Demo with `expectNoRawValues`; no-write scan (R13) |
| E2E (`e2e/admin-audit.spec.ts`, admin project) | Owner: perform a stock adjustment in the UI, open the log, see it first with the right diff and a working link; filter by entity and by today's date; Staff: no nav item and the no-access page on a direct visit; Demo: masked view, fetched as HTML **and as RSC payload**. No SQL-inserted fixtures: the journey goes through a real stock adjustment (and a real threshold save for a second entry). The filters are covered in integration tests that insert rows directly (INSERT is allowed on `AuditLog`) |

Every acceptance criterion maps below; the checks on the preview URL stay manual per the issue's definition of done.

| Acceptance criterion | Where it is covered |
|---|---|
| Newest first, paginated, filterable by entity, actor and date (Manila days) | Behavior 4, 5; E1 to E11; R2 to R4 |
| Readable before/after diff with links to the entity | Behavior 8, 9; E12 to E15, E19, E20; R5, R6 |
| Read-only; append-only trigger covered here | Behavior 3; E25; R13 |
| Test lists every registered admin mutation and asserts each writes an entry | E26, E27; R11, R12 |
| Owner and Demo can view; Staff can't (`audit.view`) | Behavior 1; E21, E22 |
| Demo: customer fields masked by key, including inside before/after | Behavior 2, 11; E16 to E18, E23; R7 |
| Entries never contain secrets | E24; R8; spec 040's E16 (write side) |

## 8. Out of scope

- Sign-in events, export (CSV or otherwise), retention rules: named out of scope in the issue.
- Free-text search over the log, a per-entity "History" panel on the product and order pages, live updates: not asked; a follow-up if wanted.
- Audit rows for system changes (release, webhooks, placing orders) and for denied attempts: spec 040 D5.
- Editing, deleting or annotating entries, ever.
- Audit coverage for the mutations of stories that haven't shipped (#110 refunds, #111 payment review, #113 to #115, #117, #118): each adds its fixture to the registry (R12) in its own PR; the log already labels their entities and actions.
- Backfilling rows for changes made before #105; the log starts when it started.
- Linking to entity screens that don't exist yet (images, categories, brands, vouchers, settings): plain id text. **Each later story that adds such a screen also adds its line to the link table, which turns that entity's plain ids in the audit log into links** (with a test for the link); that is part of that story's definition of done.

## 9. Decisions

| # | Decision | Reason | Rejected |
|---|---|---|---|
| D1 | No new `can()` action; the screen uses `audit.view` | Spec 040's table is the contract and already matches the issue | A separate "audit.search" action |
| D2 | Offset pagination (`page=`), like orders and inventory | Consistent URL state and a page total; log volume is small for this project | Cursor pagination |
| D3 | Diff shows the union of changed keys, nested objects flattened to changed leaves | `before`/`after` already hold changed fields only; whole `specs` objects would bury the change | Raw JSON view; side-by-side JSON |
| D4 | From after To clears both and says so | Never silently swap or show a confusing empty page | Swapping the bounds; an empty result |
| D5 | Dates are half-open internally, inclusive to the person | Avoids millisecond arithmetic at the end of the day | `<= 23:59:59.999` |
| D6 | One pure link table, entity → (view action, URL), a link only when the viewer may open it and the screen exists | Each later screen story adds its line and so turns its plain ids into links; Staff never gets a link into a screen they can't open | Linking everything and letting the target 404 |
| D7 | Diff computed on raw values, then masked, with a "Changed" flag for Demo | Masked formats are fixed-length, so two different names would compare equal | Diffing masked values |
| D8 | Redact secret-looking keys again when reading | `recordAudit` is not the only way a row could get in (scripts, restore); cheap defense in depth | Trusting the write side alone |
| D9 | Order shown by number, looked up per page in one query | The cuid means nothing to an owner | Showing `entityId` |
| D10 | Mutation coverage uses a fixture registry, and a marked action without a fixture fails | Same "hunt for the unguarded one" idea as spec 040's enumeration; a future mutation can't slip in | A list of mutations that need auditing (passes when a new one is missed) |
| D11 | The old `listAuditEntries` is replaced, not kept beside the new function | It has no pagination and a hidden 200-row cap | Keeping both |
| D12 | A no-op mutation writes no audit row | Audit is "what changed" | A row for every attempt |
| D13 | Every audit key has a format rule and a Demo rule in one registry; an unclassified key is hidden for Demo and plain for Owner; a test over the real writers' keys fails on a missing rule | A new writer's key can't leak customer data to Demo or render as raw centavos unnoticed; replaces spec 040's "other keys kept", which fails open | Keeping unknown keys visible for Demo |
| D14 | Two indexes up front: `(createdAt DESC, id DESC)` and `(entity, createdAt DESC)`; no new actor index | The two list orderings are known now; the actor filter reuses the existing `actorId` index | Waiting for a slow plan |
| D15 | The actor list holds users with at least one audit row, disabled users included | Their history stays; a user with no rows would filter to nothing | All staff |
| D16 | The "Changed" badge stays for Demo; products link for Demo | A masked pair can look identical; Demo holds `products.view` | Hiding equal-looking rows; no links for Demo |

## 10. Open questions

None. The six questions of the first draft were settled at review: actor list with users who have audit rows (D15); both indexes added up front, no actor index (D14); known keys formatted and every key needing both rules (D13, R9); the "Changed" badge kept (D16); products linked for Demo (D16); no SQL-inserted E2E fixtures (test plan).

## 11. What changed while building

- **The column is `entity`.** The review said `(entityType, createdAt DESC)`; the `AuditLog` column is `entity`, so the index is `(entity, createdAt DESC)`. The existing `(actorId)` index stays (no new actor index, as asked) and so does the old `(createdAt)` index.
- **From after To keeps its URL.** Redirecting to the canonical URL (Behavior 5) would lose the notice, so a cleared range renders with its original URL and the notice; an impossible date or an unknown entity still redirects. An actor id that has no audit rows redirects without it.
- **Changes are text in the DTO.** `AuditEntryView` carries `changes` (text rows) and no `before` / `after`; spec 040's `auditEntryView`, `RawAuditEntry` and the old `listAuditEntries` are gone, and `maskAuditJson` now reads the key registry, so unknown keys are hidden for Demo (spec 040 Behavior 17 changed; noted there).
- **The "Changed" badge** shows only on a Demo row whose masked sides read the same, not on every Demo row.
- **Container keys need no rule.** Only leaves are classified; a container (`specs`, a nested object) is decided by its leaves, and `specs.*` has one prefix rule.
- **The mutation test runs the real actions** as the Owner (mocked `next/headers`, `next/cache`) and pairs each with a refused call and a forced throw after `recordAudit` (the change and its row must both roll back, checked by table fingerprints). The registry covers server actions only; an `app/api/admin` route handler fails the test until the registry learns routes.
- **Audit rows from the E2E stay** (the log refuses deletes). The E2E makes one through a real stock adjustment and removes only its throwaway product and movement.
