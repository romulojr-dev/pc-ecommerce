# 007 — Tasks: category menu in the header

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md) · Issue: #20

Work top to bottom, one task at a time. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. The story ships as one commit (T5).

- [x] **T1. Data and helpers.** `categoryHref` exported for any slug, `isCurrentCategory` and its tests in `lib/site.ts` / `lib/site.test.ts`; `lib/categories.ts` with the cached `getMenuCategories()`.
  - Verify: `pnpm test` with `.env.local` moved aside; `pnpm typecheck`.

- [x] **T2. Menu UI.** `DropdownMenuLinkItem`, `CategoryMenu`, `CategoryMenuLink`; the header renders the menu.
  - Verify in `pnpm dev`:
    - mouse and keyboard work (Enter, arrows, Home/End, Escape returns focus);
    - a link navigates to `/<slug>` (404 for now) and the menu closes;
    - light and dark themes at 1280 and 1024 px;
    - axe shows no violations with the menu open.

- [x] **T3. E2E.** `e2e/category-menu.spec.ts`.
  - Verify: `pnpm test:e2e` passes, including `home.spec.ts`.

- [x] **T4. Build check.** `pnpm build` passes.
  - Verify: the route table lists `/` as static with a 1h revalidate and `/products` as `ƒ`.

- [x] **T5. Wrap-up.** `pnpm format`, `pnpm lint`, `pnpm typecheck`; tick the spec's acceptance criteria; commit the story (code, spec, ADR 0003, CLAUDE.md, README) and push.
