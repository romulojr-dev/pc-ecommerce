# Tasks: spec 047 — Admin audit log view (#119)

Approach: [plan.md](plan.md). Behavior and example IDs: [spec.md](spec.md). One commit per task.

## 0. Housekeeping
- [ ] Commit `spec.md`, `plan.md`, `tasks.md`

## 1. Pure rules
- [ ] `lib/admin/audit-keys.ts`: two-rule registry; `mask.ts` reads it; unknown key hidden for Demo (B12, R9, E24b)
- [ ] `audit-diff.ts`, `audit-labels.ts` (labels, link table), `audit-params.ts`, Manila-day range (E3–E11, E7b, E12–E15, E19, E20)
- [ ] Unit tests for all; `pnpm lint`, `pnpm typecheck`, `pnpm test` pass

## 2. Schema
- [ ] Migration: `(createdAt DESC, id DESC)` and `(entity, createdAt DESC)`; `schema.prisma`; `pnpm db:drift`, `pnpm test:db` pass

## 3. Query
- [ ] `listAuditPage` replaces `listAuditEntries`; existing callers and tests move
- [ ] Integration tests: order and tiebreak, filters, Manila bounds, role gate, batched lookups, Demo masking (E1–E11, E16–E18, E21, E23, E24)

## 4. Mutation coverage
- [ ] `test-support/admin-audit-fixtures.ts` and the coverage test (E26, E27, R11, R12, E28)
- [ ] Key-rule test over the collected keys (R9, E24c)
- [ ] Append-only and no-write tests (E25, R13)

## 5. UI
- [ ] Copy, nav item, `/admin/audit` page, filters, list with diff disclosure, `loading.tsx`, `error.tsx`
- [ ] Markup tests; Demo page test with `expectNoRawValues`; Staff no-access

## 6. E2E
- [ ] `e2e/admin-audit.spec.ts`: real stock adjustment shows up; Staff blocked; Demo masked (HTML and RSC)

## 7. Docs and PR
- [ ] CLAUDE.md bullet, README, spec 040 note, PRD pointer
- [ ] Full checks: lint, typecheck, test, test:db, build; push; PR with "Closes #119"
