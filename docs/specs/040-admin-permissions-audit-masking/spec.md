# 040 — Admin roles, permission guard, audit log and customer-data masking

Status: implemented in code (2026-11-05), waiting for the preview check; see "What changed while building" at the end. Issue: [#105](https://github.com/romulojr-dev/pc-ecommerce/issues/105) (parent epic [#5](https://github.com/romulojr-dev/pc-ecommerce/issues/5), Admin, Sprint 8). PRD: AD-11 (roles), AD-10 (audit log), NFR Security (role checks on every admin route and server action). Part 2 of 2: sign-in and the shell are [spec 039](../039-staff-sign-in-admin-shell/spec.md) (#104, implemented). [ADR 0012](../../adr/0012-staff-auth-on-better-auth.md).

## 1. Summary

#104 let three kinds of staff sign in to an empty shell; every signed-in role is equal there. This story makes the roles real: a pure permission table (`can(role, action)`), a wrapper every admin mutation must be built with (`adminAction` / `adminRoute`) that authorizes before it reads anything, an append-only `AuditLog` written in the same transaction as each change, and a masking step so the Demo role never receives a customer's name, email, mobile, street or free text. It delivers the **foundation** the Admin screens build on; it adds no screen of its own. A test that hunts for **unguarded** entry points, not for guarded ones, keeps a future mutation from skipping the guard.

## 2. Behavior

### Who can do what

1. Three roles (`owner`, `staff`, `demo`) and 24 actions, fixed by the issue's table (§6). `can(role, action)` is the only place that table exists. In plain terms: **Demo can open every screen Owner can open, can't perform any action, and can't search by customer.** (The table also withholds `payments.review` and `refunds.record` from Demo; those are actions, not screens.)
2. The UI uses the same `can()` to show or disable controls. A control is **hidden** when the whole feature is unavailable to the role (a nav item, a section) and **disabled with the role's reason** when the feature is visible but the action isn't (Demo sees Cancel greyed with "This account is read-only"). The UI check is a convenience; the server check is the rule.
3. A person who opens an admin page whose view action their role lacks (Staff typing `/admin/products`) sees a "You don't have access to this page" page inside the shell, with a link back to Orders. No data is read.
4. Everyone lands on Orders after sign-in, as in spec 039, until the Dashboard story (it then redirects Owner and Demo to the dashboard). The nav lists only items the role can open (today only Orders, which all roles can).

### Mutations (server actions and route handlers)

5. Every admin mutation is created with `adminAction(action, schema, handler)` (server action) or `adminRoute(action, handler)` (route handler). The wrapper, in this order, **before parsing the input or reading any data**: (a) for a route handler with a write method (POST, PUT, PATCH, DELETE), checks the request's `Origin` header against the trusted-origins list from spec 039 (`trustedOriginsFor`) and refuses a missing or foreign origin; (b) finds the session (the #104 `loadAdminSession`: a disabled user is refused and the session deleted); (c) checks `can(role, action)`; (d) only then parses the input with the schema; (e) calls the handler with the actor (`{ id, name, role }`) and the parsed input.
6. **A denied request reads nothing beyond the session and never parses the body.** It writes nothing, runs no handler, and is **not audited** (refusals are not changes; audit stays a record of what changed). A route handler answers a plain 403 with the text "This account is read-only" for Demo; a server action answers `{ ok: false, error: "forbidden", message }` with the same text. Other answers: 401 / `unauthenticated` (no session), 403 for a foreign or missing origin, 400 / `invalid` (schema failure, only for a permitted role). Every answer is `no-store` and says nothing about which actions exist or what the role could do instead.
7. The function the wrapper returns carries a marker, `Symbol.for("pcs.adminAction")`, holding the action name. Tests find unguarded functions by the marker's absence (R8).
8. **GET admin routes never mutate.** Reads of admin data (pages, `GET` routes) check the role's view action through the page-level guard or `adminRoute`, and read through the masking layer. The Origin check applies to write methods only.

### Audit

9. A mutation that changes something Admin owns records one `AuditLog` row **in the same database transaction as the change**: who (a staff `User`), what entity and id, what action, and the `before` / `after` values. If the change rolls back, so does the row; if the row can't be written, the change doesn't happen.
10. Audit rows are append-only: the database refuses any `UPDATE` or `DELETE`, even from app code or a script, while `TRUNCATE` (used by `resetCatalog()` and `--reset`) still works. `AuditLog.actorId → User` is `Restrict` because staff are **disabled, never deleted** (`staff:disable`, spec 039); a user with audit rows can't be removed.
11. An audit row holds the changed fields only (a price from 129900 to 119900 centavos), never a secret (password, token, key, hash, cookie, signed link) and customer details only when the change itself is about them.
12. System changes no staff member made (an unpaid order released by the sweep, a webhook marking an order Paid, a customer placing an order) are **not** audit rows: AD-10 is "who changed". They keep their own records (`StockMovement`, `PaymentEvent`, the order's timestamps).

### Masking

13. For **Demo**, anything about a customer is masked in the query layer, before it reaches a page, a client component, or the RSC payload: name, email, mobile, street/ZIP/barangay/city/province and **free text**. Owner and Staff see real values.
14. Masked formats are fixed-length so they leak neither real length nor address: name `A••• R•••` and email `a•••@••••.•••` (first letters plus fixed bullets; the domain is hidden); mobile `+63` followed by fixed bullets (everything else hidden); an address shows only its **region** (or its shipping **zone** where a screen shows zones) for delivery, or "Store pickup"; free text (order notes, refund notes, free text in audit `before` / `after`) becomes "Hidden in demo".
15. The masking layer is the **only** way an admin page or component reads customer fields. It takes the viewer's role and returns a typed DTO; for Demo the DTO type has no field that could hold the real value. Order lists, order detail, packing slip, customers, audit entries and the dashboard's recent orders all go through it.
16. **Search by customer** (`orders.search-customer`) is refused for Demo at the query layer, not just hidden: a request carrying a customer search term (name, email, mobile) as Demo gets the read-only answer and runs no query. Searching by order number stays allowed.
17. Audit entries for Demo: `before` / `after` JSON goes through the masker (known customer keys masked, free-text keys "Hidden in demo", other keys kept); the actor shows as name and role, never email.

### States

18. Empty: a role with no allowed view action sees the "no access" page; an allowed list with nothing in it keeps the Admin screen story's own empty state. Loading: unchanged from #104. Error: an unexpected failure in a wrapped action answers `{ ok: false, error: "failed" }` / 500 with no detail, and logs the action name and an error code only (no input, no customer data).

## 3. Examples

| # | Input | Result |
| --- | --- | --- |
| E1 | `can("demo", "orders.cancel")` | `false` |
| E2 | `can("staff", "dashboard.view")` | `false` (the dashboard is Owner and Demo only) |
| E3 | `can("demo", "orders.search-customer")` | `false`, though `can("demo", "orders.view")` is `true` |
| E4 | Staff calls a wrapped `inventory.adjust` action with `{ sku: "CPU-AMD-7600X", delta: 5 }` | handler runs with the staff actor; stock, one `StockMovement` (with `actorId`) and one `AuditLog` row (`entity "product"`, before stock 12, after 17) commit together |
| E5 | Demo calls the same action with a valid payload | `{ ok: false, error: "forbidden", message: "This account is read-only" }`; no row in any table changed (audit included); the schema never ran (an invalid payload gives the same `forbidden`, not `invalid`); no query ran besides the session lookup |
| E6 | No cookie calls a wrapped route handler | 401 `{ "error": "unauthenticated" }`, nothing read |
| E7 | A staff user disabled a minute ago calls any wrapped function with their old cookie | `unauthenticated`; their session row is deleted (#104) |
| E8 | Owner calls `products.write` with a negative price | `{ ok: false, error: "invalid" }`, nothing written |
| E9 | The change throws after `recordAudit` inside the transaction | both roll back; no audit row |
| E10 | `UPDATE "AuditLog" …` and `DELETE FROM "AuditLog"` from app code | both fail at the database; `TRUNCATE "AuditLog"` (as `resetCatalog()` runs it) still succeeds |
| E11 | Order with contact "Ana Reyes", `ana.reyes@example.com`, `+639171234567`, street "12 Mabini St", region NCR, as Owner / as Demo | Owner: real values. Demo: `A••• R•••`, `a•••@••••.•••`, `+63•••••••••`, no street, region "National Capital Region" |
| E12 | Pickup order as Demo | address shows "Store pickup"; name, email, mobile masked as in E11 |
| E13 | Demo searches orders for "ana.reyes@example.com" | read-only answer, no query; searching `PCS-7K3M9Q2X` works |
| E14 | A fixture order (name, email, mobile, street, an order note "Call before delivery, gate 4") through the real query layer as Demo, serialized | none of the fixture values appears anywhere in the serialized DTO; the note reads "Hidden in demo" |
| E15 | Audit row whose `after` is `{ "contactMobile": "+639171234567", "note": "Leave with guard", "status": "PROCESSING" }`, viewed as Demo | mobile masked, note "Hidden in demo", status kept |
| E16 | `recordAudit` is given `{ after: { status: "PAID", sessionToken: "abc" } }` | the token key is stored as `"[redacted]"` |
| E17 | `unguarded-actions.ts` (a "use server" fixture exporting an async function without `adminAction`) and `unguarded-route.ts` (a fixture exporting `POST` without `adminRoute`) fed to the enumeration check | the check reports both by file and export name; the real test is green only because the check demonstrably catches them |
| E18 | An action built with `adminAction("orders.refund", …)` (not in the table) | a type error, and the marker-names-a-known-action check fails if one slips through |
| E19 | `pnpm db:seed --reset` after staff exist | catalog, orders, stock movements and audit rows are gone; every `User`, `Session` and `Account` row survives |
| E20 | `POST` to a wrapped `images.write` route as Owner with `Origin: https://evil.pcsilicon.tech` (a sibling subdomain) | 403, nothing parsed or written, even though the cookie is sent |
| E21 | The same `POST` with the app's own `Origin`; and with no `Origin` header | own origin: runs. No origin: 403 |
| E22 | `GET` on a wrapped read route with a foreign `Origin` | not refused by the origin rule (GET never mutates); still needs the view action |
| E23 | A new `"use server"` file at `app/(store)/admin-tools/actions.ts` that calls `adminAction`, or a new admin-named mutation outside the admin folders | the placement check fails (R9) |

### Acceptance criteria → examples and rules

| Criterion | Covered by |
| --- | --- |
| `permissions.ts` pure, same import limits as `lib/builder` | R1; T1 |
| Unit test asserts every table cell and that the table lists every `AdminAction` | E1–E3; R2; T2 |
| UI shows or disables with the same `can()` | Behavior 2, 4; R3; T10 |
| Every mutation built with `adminAction` / `adminRoute`; authorizes before parsing/reading; rejects without writing; marker | Behavior 5–7; E4–E6, E8; R4–R7; T3, T4 |
| Enumeration test finds **unguarded** entry points (every exported function of every admin "use server" module; every POST/PUT/PATCH/DELETE export under `app/api/admin/**`) and a marker naming an action missing from the table; demo gets false and writes nothing | E5, E17, E18; R8; T5 |
| Admin mutations may live only in the admin action folders (test or lint) *(changed in review)* | E23; R9; T1, T5 |
| ESLint keeps admin `"use server"` in `actions.ts` | R9; T1 |
| `AuditLog` model, `recordAudit(tx, …)` same transaction; calling it outside a transaction doesn't compile *(changed in review)* | Behavior 9; E4, E9; R10–R12; D12; T6 |
| Trigger refuses UPDATE / DELETE with a test; TRUNCATE still works *(changed in review)* | Behavior 10; E10; R13; T7, T8 |
| `AuditLog.actorId → User` Restrict because staff are disabled, never deleted *(new)* | Behavior 10; R10; T7 |
| `resetCatalog()` / `--reset` name `AuditLog`; `User` rows survive | E19; R13; T8 |
| `StockMovement.actorId` FK to `User` (`Restrict`); its comment points at the staff `User` table and this spec *(changed in review)* | R14; T7 |
| `recordAudit` never stores secrets; customer details only where needed | Behavior 11; E16; R11 |
| A denied request: no DB read beyond the session, no body parsing, plain 403 "This account is read-only", same text in the UI, not audited *(new)* | Behavior 2, 6; E5; R6; T3, T4, T10 |
| `adminRoute` refuses write requests with an untrusted Origin; GET never mutates *(new)* | Behavior 5, 8; E20–E22; R7a; T14 |
| Masking pure DTO in the query layer; unmasked never reaches output or RSC; free text "Hidden in demo", phone, names, emails, address as region or zone *(changed in review)* | Behavior 13–17; E11–E15; R15–R19; T9, T11 |
| Test with fixture customer data: serialize the DTO and assert no raw fixture value; shared helper reused by each screen story on the RSC payload; no test-only route *(changed in review)* | E14; R19; T11; D8 |
| Same DTO functions are the only way pages read customer fields | Behavior 15; R19; T12 |
| Role-aware nav and landing on Orders; spec 039 note | Behavior 4; R20; T10, T13 |

## 4. Rules and edge cases

**Permissions and the guard**

- R1. `lib/admin/permissions.ts` and `lib/admin/mask.ts` import no database, env, generated client, `next` or `react`; the ESLint block that protects `lib/builder/**` also covers them.
- R2. `AdminAction` is a string union; the table is a `Record<AdminAction, …>` so a missing action is a type error, and a test checks every cell for every role against the issue's table written out in the test.
- R3. An unknown role or action given to `can()` is `false`.
- R4. `UserRole` (`OWNER`…) maps to the pure role (`owner`…) in one function in the session layer; an unmapped value means no access.
- R5. The role is read from the `User` row on every request (#104 does this); nothing from the request decides it.
- R6. A denied request (no session, wrong role, bad origin) does no database read beyond the session lookup, does not read or parse the body (even a malformed or huge one), writes nothing and is not audited.
- R7. The handler receives the actor and the parsed input and nothing from the request that could carry a role or user id. The wrapper does not open the transaction: the handler does and calls `recordAudit` inside it.
- R7a. **Origin:** for POST, PUT, PATCH and DELETE, `adminRoute` requires an `Origin` header equal to an entry of `trustedOriginsFor` (exact origin, spec 039); a missing header is refused. Cookies are `SameSite=Lax`, but every `*.pcsilicon.tech` subdomain is same-site, so the cookie alone doesn't stop a sibling subdomain, and the upload route accepts file bodies. Server actions keep Next's own origin check. GET and HEAD are never checked and never mutate.
- R8. **Enumeration test (finds unguarded entry points).** It lists, by scanning the repository, (i) every module with a `"use server"` directive in the admin action folders (`app/admin/**`), and (ii) every `route.ts` under `app/api/admin/**`. It imports each and fails for: any exported function of a "use server" module without the marker; any exported `POST`, `PUT`, `PATCH` or `DELETE` of an admin route without the marker (a `GET` without the marker also fails, since reads need their view action, D3). Non-function exports are ignored. It then checks each marker names an action in the table; that `can("demo", action)` is false for every action whose name is not a `.view` / `.packing-slip` read; and calls each marked function as Demo with empty input, asserting every table's row count is unchanged. The check itself is a function over a list of module paths, so the test can also run it on **deliberately unguarded fixtures** (`test-support/admin-fixtures/`, never imported by the app) and must see them reported (E17). It fails if it discovers zero modules while the folders have files.
- R9. **Admin mutations live only in the admin folders.** (a) ESLint: a file with `"use server"` under `app/admin/**`, `components/admin/**` or `lib/admin/**` must be named `actions.ts`, and `adminAction` / `adminRoute` can be imported only from `actions.ts` / `route.ts` files in the admin folders. (b) The enumeration test also lists every `"use server"` file and every mutating `route.ts` in the repository; each must be in the admin folders or on a named allowlist with a reason (store cart, checkout and order actions under `app/(store)`, the Better Auth route, webhooks, cron). A new file in neither place fails, so an admin mutation cannot hide elsewhere.

**Audit**

- R10. `AuditLog`: `id`, `actorId` (FK `User`, **Restrict**, required; staff are disabled, never deleted), `entity`, `entityId`, `action`, `before` (JSON, null for a create), `after` (JSON, null for a delete), `createdAt` (the database's `now()`), indexed by `(entity, entityId)` and `createdAt`. `entity` and `action` are values of closed unions that each Admin story extends.
- R11. `recordAudit` redacts any key whose name suggests a secret (password, token, secret, key, hash, cookie, authorization, signature, sig) at any depth, caps `before` / `after` at 16 KB (over the cap is an error that rolls back), and stores only JSON-safe values (centavos as integers, dates as ISO text).
- R12. `recordAudit` takes a **transaction client in its type**: calling it with the plain `db` client, or with no client, does not compile (D12). It writes the row and nothing else.
- R13. The trigger fires per row on `UPDATE` and `DELETE`, not on `TRUNCATE`. `resetCatalog()` and `--reset` add `AuditLog` to both TRUNCATE lists. Test helpers that truncate `"User" CASCADE` will now also empty `StockMovement` and `AuditLog`; expected.
- R14. `StockMovement.actorId` becomes an FK to `User` with `Restrict`. Existing rows are null; order placement, release and webhooks keep writing null. Its schema comment ("waits for the User table (Accounts, #65)") is replaced by one pointing at the staff `User` table and this spec; customer accounts will not be actors.

**Masking**

- R15. Masking functions are pure `(role, value)`; Owner and Staff pass through, Demo masks. The Demo DTO type omits the raw fields rather than overwriting them.
- R16. Masked fields: `guestEmail`, `contactName`, `contactMobile`, `street`, `zip`, barangay, city and province names and codes, and free text. Kept: region name, zone, order number, status, items, totals, timestamps, voucher code.
- R17. The Customers view (a customer is a distinct guest email on orders; there is no customer table) groups by the real email in the query but never returns it to Demo; Demo's rows carry no key a client could use to learn the email.
- R18. Masking applies to everything that serializes: page props, `generateMetadata` titles, error messages and URLs.
- R19. Admin pages and components read data only through query functions in `lib/admin/queries/` that take the viewer's role; a test fails when a file under `app/admin/**` or `components/admin/**` imports `@/lib/db`. A shared test helper (`expectNoRawValues`) serializes a DTO and asserts no fixture value appears; each screen story reuses it on its page's RSC payload. There is no test-only route.
- R20. Role-aware shell: nav items filtered by `can()`; a Demo notice next to the role. Spec 039 gets a "Changed by spec 040 (#105)" note for its landing page (D3) and nav (Rule 19) statements.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| No-access page title | "You don't have access to this page" |
| No-access page body | "Your role can't open this area. Ask an owner if you think that's a mistake." |
| No-access link | "Back to orders" |
| Demo denial (403 body, action error message, disabled control reason) | "This account is read-only" |
| Staff denial of an owner-only action (control reason and error message) | "Only owners can do this" |
| Foreign or missing origin | "This request can't be accepted." |
| Demo notice in the shell header | "Demo: customer details are hidden" |
| `unauthenticated` | "Your session ended. Sign in again." |
| `invalid` | "Check the form and try again." |
| `failed` | "Something went wrong. Try again." |
| Masked name / email / mobile | `A••• R•••` / `a•••@••••.•••` / `+63•••••••••` |
| Masked free text | "Hidden in demo" |
| Masked address | "Store pickup", or the region name (zone where zones are shown) |

## 6. Data and interfaces

- **Types:** `AdminRole`, `AdminAction` (24), `can(role, action): boolean`, `ADMIN_ACTIONS`.
- **Permission table** (the contract; a test repeats it row by row):

| Action | Owner | Staff | Demo |
| --- | --- | --- | --- |
| `dashboard.view` | yes | no | yes |
| `orders.view` | yes | yes | yes (masked) |
| `orders.search-customer` | yes | yes | no |
| `orders.packing-slip` | yes | yes | yes (masked) |
| `orders.transition` (Processing, Shipped, Ready, Delivered, Picked up; also courier + tracking number and cash paid on delivery) | yes | yes | no |
| `orders.cancel` | yes | yes | no |
| `customers.view` | yes | yes | yes (masked) |
| `refunds.record` | yes | no | no |
| `payments.review` | yes | no | no |
| `products.view` | yes | no | yes |
| `products.write` | yes | no | no |
| `images.write` | yes | no | no |
| `categories.view`, `brands.view` | yes | no | yes |
| `categories.write`, `brands.write` | yes | no | no |
| `inventory.view` | yes | yes | yes |
| `inventory.adjust` | yes | yes | no |
| `settings.view`, `vouchers.view` | yes | no | yes |
| `settings.write`, `rates.write`, `vouchers.write` | yes | no | no |
| `audit.view` | yes | no | yes (masked) |

- **`adminAction(action, schema, handler)`:** async server action with the marker; result `{ ok: true, data } | { ok: false, error, message? }`.
- **`adminRoute(action, handler)`:** route handler with the marker, Origin check on write methods, `no-store`.
- **Page-level guard:** `requireAdminAccess(action)`; `requireAdminSession()` stays for the shell.
- **`recordAudit(tx, { actorId, entity, entityId, action, before?, after? })`**, `tx` typed so only a transaction callback's client fits; the `AuditLog` table and trigger migration; the `StockMovement.actorId` FK migration.
- **Masking:** `maskCustomer`, `maskAddress`, `maskFreeText`, `maskAuditEntry` (pure, `lib/admin/mask.ts`); query functions in `lib/admin/queries/`; test helper `expectNoRawValues`.
- **Enumeration check:** a function over module paths plus the fixtures in `test-support/admin-fixtures/`.
- **Docs to update:** CLAUDE.md (staff bullet), PRD (AD-11 wording below, `AuditLog` row), ADR 0012 note, README, spec 039 note.

## 7. Test plan

| # | Level | What |
| --- | --- | --- |
| T1 | Lint | import limits for `permissions.ts` / `mask.ts`; admin `"use server"` only in `actions.ts`; `adminAction` / `adminRoute` imports only in admin folders (a fixture proves each rule fires) |
| T2 | Unit | every cell for every role (E1–E3); every `AdminAction` is in the table; unknown role/action false |
| T3 | Unit | wrapper order of operations with a fake session: a schema spy and a query spy are never called for a denied request; 401/403/400 answers; marker set; handler gets the actor only |
| T4 | Integration | E5–E8 with real sessions; denied writes nothing and is not audited; disabled user refused and session deleted |
| T5 | Unit | the enumeration check (R8, R9b) on the real folders **and** on the unguarded fixtures (E17); marker-names-unknown-action fixture; zero-modules guard; placement check (E23) |
| T6 | Integration | `recordAudit` commits and rolls back with the change (E4, E9); redaction (E16); size cap; a `@ts-expect-error` type test that the plain `db` client is rejected (runs in `pnpm typecheck`) |
| T7 | Integration | trigger refuses UPDATE and DELETE; TRUNCATE succeeds (E10); `AuditLog.actorId` and `StockMovement.actorId` FKs reject an unknown user and a user delete while referenced |
| T8 | Integration | `resetCatalog()` empties `AuditLog` and keeps `User` rows (E19); extend `reset-catalog.db.test.ts` |
| T9 | Unit | masking per field, role pass-through, fixed lengths, free text (E11, E12, E14, E15) |
| T10 | Unit | shell nav and disabled controls follow `can()`; same denial text as the server (Behavior 2, 4) |
| T11 | Unit/integration | fixture order through the real query layer for Demo, serialized, `expectNoRawValues` (E14) |
| T12 | Unit | no file under `app/admin` or `components/admin` imports `@/lib/db` (R19) |
| T13 | E2E | Demo, Staff and Owner sign in: all land on Orders; Demo sees the notice; Staff opening a view it lacks sees the no-access page; Owner sees everything |
| T14 | Unit/integration | Origin rule on a wrapped write route: own origin runs, sibling subdomain / foreign / missing refused with nothing parsed or written (E20, E21); GET unaffected (E22) |

## 8. Out of scope

- The admin screens themselves: each has its own story and reuses these functions and `expectNoRawValues`.
- A role-editing UI (roles are set by scripts, spec 039); per-field permissions beyond the table.
- Customer accounts and a customer-facing audit (Phase 2, #65).
- Audit rows for system changes (Behavior 12) and for denied attempts (Behavior 6).
- Rate limiting of admin mutations.
- The resend-email action (#101): it gets its own table row then.

## 9. Decisions

| # | Decision | Reason | Rejected |
| --- | --- | --- | --- |
| D1 | `AdminRole` is lowercase and separate from `UserRole`; one mapper | the issue writes `can("demo", …)`, and the pure file can't import the generated client | importing the enum |
| D2 | Denial text comes first; a denied role never gets `invalid` | answering `invalid` would reveal the schema and break "authorize before parsing" | one generic error |
| D3 | Admin `GET` routes are wrapped too (view action), and the enumeration test requires the marker on them | one rule for every export in an admin `route.ts`; reads still need their role | exempting GET (the review's wording only requires the write methods; this is stricter and easy to relax) |
| D4 | The handler owns the transaction and calls `recordAudit`; the wrapper doesn't open one | change shapes differ (stock locks, order locks); each mutation story's db test proves its audit row | the wrapper opening the transaction |
| D5 | System changes and denied attempts are not audit rows | AD-10 is "who changed"; `actorId` is required | a "system" user; logging refusals |
| D6 | Redact secret-looking keys instead of throwing | a wrong key name shouldn't roll back a real change | throwing |
| D7 | Fixed-length masks with first letters (review: "first letters plus fixed bullets") | no length or domain leak | real initials of the last name, last four digits, a generic "Customer" |
| D8 | The "demo page" criterion is met with a fixture through the real query layer and a shared helper (review: no test-only route) | no admin page reads customer data yet | a throwaway page |
| D9 | Admin pages read data only through `lib/admin/queries/`, checked by a test | "the only way" needs a mechanism | a convention |
| D10 | No-access is a page, not a redirect | the person learns why | silent redirect |
| D11 | Origin allow-list check on admin write routes (review) | same-site sibling subdomains get the cookie; the upload route takes bodies | relying on `SameSite=Lax` |
| D12 | `recordAudit`'s client type must be a **branded** transaction client | Prisma's `TransactionClient` is a structural subset of `PrismaClient`, so the plain `db` would still compile against it; a brand that only the admin transaction helper hands out makes misuse a type error | typing the parameter as Prisma's `TransactionClient` alone |
| D13 | The enumeration test hunts for unguarded exports and checks placement (review) | a test that lists guarded functions passes when a new unguarded one is added | listing the guarded ones |
| D14 | Demo gets "This account is read-only"; a Staff user denied an owner-only action gets "Only owners can do this" | the review's text is true only for Demo; showing it to Staff would mislead | one text for everyone |
| D15 | Audit `entity` / `action` are closed unions, extended per story | typos can't create unqueryable rows | free text |

**Conflicts, resolved in review.** (a) The PRD and issue said Demo "can view everything Owner can view"; the table withholds more, so AD-11 and the issue now read "Demo can open every screen Owner can open, can't perform any action, and can't search by customer". The PRD line is edited with this spec; the issue text is for you to change (proposed wording is in my message). (b) Spec 039 D3 and Rule 19 get a "Changed by spec 040 (#105)" note (R20). (c) The `StockMovement.actorId` comment is replaced (R14).

## 10. Open questions

All seven earlier questions are settled by the review (accepted, changed or confirmed as written above). Two small ones remain:

1. **Staff-denial wording (D14).** The review's single message "This account is read-only" fits Demo only. Recommendation: Staff sees "Only owners can do this" for owner-only actions. Confirm, or say to use the read-only text for everyone.
2. **GET handlers and the marker (D3).** Recommendation: keep requiring the marker on admin `GET` routes, so every export in an admin `route.ts` is wrapped. Say if you want only the write methods checked.

## 11. What changed while building

- **Wording.** A role that is neither Demo nor a Staff user denied an owner-only action (an unknown role) hears "You can't do this." (`CANNOT_MESSAGE`); the spec had no text for it. The no-access page uses the spec's strings.
- **The role on the session.** `AdminSession.user` gained `adminRole` (the table's lower-case role) beside `role` (the database's `UserRole`); `adminRoleOf` in `lib/admin/permissions.ts` is the one mapper (pure, so it is tested there).
- **Import approach for the enumeration test (task 1).** Mocks of `@/lib/env` and `@/lib/db` are enough; `next/headers` and `next/cache` import as they are. The guard itself loads its session and origins lazily, so a module that only declares actions needs nothing at import.
- **A wrapped export builds.** `export const x = adminAction(...)` inside a `"use server"` file passed `pnpm build` on Next 16.4.
- **`adminRoute` GET.** GET handlers must carry the marker (D3) but are not origin-checked.
- **No-access E2E.** No Admin screen needs a view action Staff lacks yet, so there is no route to open; the no-access page is covered by a render test, and the E2E (`e2e/admin-roles.spec.ts`) covers landing, nav and the Demo notice for the three roles.
- **Customers.** Demo rows are keyed `c1`, `c2`, … by position.
- **Changed by [spec 041](../041-admin-orders-list-detail/spec.md) (#106).** `searchOrders` and `getOrderPerson` are replaced by `listOrders` and `getOrderDetail`; the masking and the Demo refusal before any query are kept and tested in the new functions.
- **Changed by [spec 047](../047-admin-audit-log-view/spec.md) (#119).** `listAuditEntries` is replaced by the paginated `listAuditPage`, and Behavior 17's "other keys kept" is now "other keys hidden": every audit key has a format rule and a Demo rule in `lib/admin/audit-keys.ts`, and a key with no rule is hidden for Demo. `auditEntryView` is gone; the query returns the changes as text.
