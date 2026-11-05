# Tasks: spec 040 — admin roles, permission guard, audit log and customer-data masking (#105)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task, subject line only.

## 0. Housekeeping
- [x] Spec approved (Staff wording confirmed; D3 kept); issue #105 reworded; PRD AD-11 and spec 039 note edited
- [x] Plan approved
- [x] Commit `spec.md`, `plan.md`, `tasks.md` and the spec 039 / PRD edits

## 1. Prove the enumeration test setup (gate: stop and report if importing is impractical)
- [x] `test-support/admin-guard-scan.ts`: `findUnguarded(paths)` imports modules and lists exported functions without the marker
- [x] Fixtures in `test-support/admin-fixtures/`: unguarded "use server" module, unguarded route with `POST`, guarded module (marker set by hand)
- [x] Under Vitest, import one **real** "use server" module (`app/(store)/cart/actions.ts`) and the unguarded fixture with no `next/headers`, db client or env validation failing at import; the test shows the fixtures (and the real unguarded module) reported and the guarded fixture passing
- [x] Directive detection reads the first statement, not the text (`lib/auth/auth.ts` has the words in a comment)
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass
- [ ] **Report to the user: which import approach worked (mocks / lazy session import / separate project) or the options if none did. Do not start task 2 until they answer**

## 2. Permissions (pure)
- [ ] `lib/admin/permissions.ts`: `AdminRole`, `AdminAction` (24), table, `can()`, `ADMIN_ACTIONS`, read-action list
- [ ] ESLint import limits cover `permissions.ts` and `mask.ts`; fixture lint test
- [ ] Role mapper in `lib/admin/session.ts`; `AdminSession` gains `role`
- [ ] T2 (E1–E3, every cell, every action in the table, unknown role/action false)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 3. The wrappers
- [ ] `lib/admin/guard.ts`: `adminAction`, `adminRoute`, marker, messages ("This account is read-only", "Only owners can do this"), origin check on write methods only, denial answers, name-and-code logging
- [ ] Order of operations proven with spies: denied request does no query beyond the session and never reads the body (T3, E5, E6)
- [ ] T14: own origin runs; sibling subdomain, foreign and missing origin refused; GET not checked (E20–E22)
- [ ] Invalid input answers `invalid` only for a permitted role (E8)
- [ ] A wrapped export builds under `pnpm build` in Next 16.4 (risk 2); fallback shape chosen if not
- [ ] T4 integration (E5–E7) with real sessions: nothing written, nothing audited, disabled user refused
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` pass

## 4. Page-level guard and shell
- [ ] `requireAdminAccess(action)`, no-access page and copy, nav filtered by `can()`, Demo notice, disabled-control helper
- [ ] `admin-pages.test.ts` accepts `requireAdminAccess`; T10
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 5. Enumeration test on the real folders, placement and lint
- [ ] Unit: discovery, fixtures caught (E17), unknown action in marker (E18), zero-modules guard
- [ ] db: every marked function called as Demo with empty input leaves every table's row count unchanged
- [ ] Placement test with the named allowlist (R9b, E23)
- [ ] ESLint: admin "use server" only in `actions.ts`; `adminAction` / `adminRoute` imports only from admin `actions.ts` / `route.ts`; fixture lint tests
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 6. Audit
- [ ] Migration: `AuditLog`, update/delete-refusing trigger, `StockMovement.actorId` FK (`Restrict`); `schema.prisma` comment replaced; `pnpm db:drift` clean
- [ ] `adminTransaction`, branded `AuditTx`, `recordAudit` (redaction, size cap, closed unions); `@ts-expect-error` test that `db` is rejected
- [ ] `resetCatalog()`, `--reset` and `test-support/db.ts` name `AuditLog`; `User` rows survive
- [ ] Tests T6, T7 (UPDATE/DELETE refused, TRUNCATE works, FKs), T8 (E4, E9, E10, E16, E19)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 7. Masking and the query layer
- [ ] `lib/admin/mask.ts` and the Demo DTO types; `lib/admin/queries/` (order contact and address, customers, audit entries, order search refusing a customer term for Demo)
- [ ] `expectNoRawValues` helper; import-ban test for `app/admin` and `components/admin` (T12)
- [ ] Tests T9, T11 (E11–E15)
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` pass

## 8. E2E, docs and preview
- [ ] E2E T13: three roles land on Orders; Demo notice; Staff no-access page
- [ ] CLAUDE.md, README, ADR 0012, PRD `AuditLog` row, `docs/setup/admin-accounts.md`
- [ ] `pnpm build`, `pnpm test:e2e`, `pnpm db:drift`
- [ ] Acceptance criteria checked on the preview URL
