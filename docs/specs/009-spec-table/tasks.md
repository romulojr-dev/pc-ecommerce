# 009 — Tasks: spec table from the schemas

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #23

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. The story ships as one commit (T5).

- [x] **T1. Docs.** `plan.md` and `tasks.md`.

- [x] **T2. Metadata.** `SpecGroup`, `group` and `largeUnit` on `FieldMeta`; reorder the maps, group the motherboard, relabel `nativeCpuGenerations`, set `largeUnit`; `lib/specs/fields.test.ts`.
  - Verify: `pnpm test`; delete a `gpuFields` entry → `pnpm typecheck` fails; delete `options` from `psuFields.modularity` → `fields.test.ts` fails. Revert both.

- [x] **T3. Formatting.** `lib/specs/format.ts` (`formatSpecValue`, `getSpecRows`), exported from `lib/specs/index.ts`; `lib/specs/format.test.ts`.
  - Verify: `pnpm test` with `.env.local` moved aside; `pnpm typecheck`.

- [x] **T4. Component.** `components/product/spec-table.tsx`; `vitest.config.ts` includes `**/*.test.tsx`; `components/product/spec-table.test.tsx`.
  - Verify: `pnpm test`; temporarily render it in `pnpm dev` for a motherboard and an AIO cooler, light and dark, keyboard, axe; revert.

- [x] **T5. Build and wrap-up.** `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; tick the spec's acceptance criteria and set its status; commit the story and push.
