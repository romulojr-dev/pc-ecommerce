# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).

- `pnpm dev` — start Next.js dev server
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` — ESLint (flat config, `eslint.config.mjs`)
- `pnpm typecheck` — `next typegen && tsc --noEmit`; typegen writes the global route types (`PageProps`, `LayoutProps`) that a fresh checkout, like CI, does not have yet
- `pnpm format` — Prettier on all `ts`/`tsx`
- `pnpm db:migrate` — create and apply a migration on the local (Neon dev branch) database (`prisma migrate dev`)
- `pnpm db:deploy` — apply pending migrations (`prisma migrate deploy`); runs before `pnpm build` on Vercel via [vercel.json](vercel.json)
- `pnpm db:generate` — regenerate the Prisma client (also runs on `postinstall` and at the start of `pnpm build`, since Vercel may restore cached dependencies without running `postinstall`)
- `pnpm db:seed` — validate and upsert the catalog parts (about 150, see [spec 011](docs/specs/011-seed-150/spec.md); the first 60 are from [spec 005](docs/specs/005-expand-seed-catalog/spec.md)) into the local (Neon dev branch) database; keeps stock, price and status of existing products. Adds each part's images (default: its category placeholder) only to products that have none, so it never changes existing images. Rejects a category slug that is a reserved top-level route ([lib/reserved-slugs.ts](lib/reserved-slugs.ts); add new top-level routes there). `pnpm db:seed --reset` truncates the catalog tables first (refused when `NODE_ENV=production`). Prints the target host before writing. Runs on the dev database, in CI (before E2E), and once by hand on production (see [spec 004](docs/specs/004-product-list/spec.md), "Seeding production"); never part of a build or deploy
- `pnpm images:placeholders` — regenerate the placeholder product images in `public/images/placeholders/` from lucide icons ([scripts/generate-placeholders.tsx](scripts/generate-placeholders.tsx)). The output is committed; run it only to change the artwork

- `pnpm test` / `pnpm test:watch` — Vitest unit tests, once / in watch mode. Pure: no database or env vars needed
- `pnpm test:db` — Vitest database integration tests (`*.db.test.ts`, helpers in `test-support/`), run against `TEST_DATABASE_URL` only (a local Docker Postgres from [docker-compose.yml](docker-compose.yml): `pnpm test:db:up` / `pnpm test:db:down`, `pnpm test:db:migrate`), never `DATABASE_URL`. The setup applies the migrations, prints the host it uses, and refuses to run when the URL is missing or on the app's host ([test-support/db-guard.ts](test-support/db-guard.ts)). The Postgres major version (18) is the same in Neon, `docker-compose.yml` and CI. CI creates `pcsilicon_test` in its throwaway Postgres
- `pnpm test:e2e` — Playwright E2E tests (Chromium only); starts `pnpm dev`, or reuses a running dev server. With `CI` set it serves the production build with `pnpm start`, so run `pnpm build` first. One-time setup: `pnpm exec playwright install chromium`

Unit tests are `*.test.ts`, colocated with the code they test (e.g. [prisma/seed/validate.test.ts](prisma/seed/validate.test.ts)). E2E tests are `e2e/*.spec.ts`; use role-based locators. CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs install, lint, typecheck, `db:deploy` and `db:seed` against a throwaway Postgres, unit tests, build and E2E on every PR and push to `main`; branch protection requires its `ci` job.

## Project

"PC Silicon": a Philippine PC-parts store whose differentiator is a guided PC Builder that blocks incompatible parts before checkout. Portfolio/capstone project; payments run in gateway sandbox mode only. The product requirements (personas, features, payment methods such as GCash/Maya/COD, admin panel, development-approach change rules) are in [docs/prd.md](docs/prd.md) — read it before building features. The MVP is desktop-first.

## Stack and architecture

- Next.js 16.4 App Router (`app/`), React 19, TypeScript, Tailwind CSS v4 (configured via `app/globals.css`, no tailwind config file). Next.js here has breaking changes versus common knowledge — consult `node_modules/next/dist/docs/` before writing Next-specific code (see AGENTS.md).
- UI is shadcn/ui with the `base-mira` style on **Base UI** (`@base-ui/react`), not Radix. Generated primitives live in `components/ui/`; add more with `pnpm dlx shadcn@latest add <component>`. Icons are `lucide-react`. Config in `components.json`.
- Path aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`. Use `cn()` from `@/lib/utils` for class merging.
- Database: Neon Postgres via Prisma 7 with `@prisma/adapter-pg`. Schema in [prisma/schema.prisma](prisma/schema.prisma), config in [prisma7.config.ts](prisma7.config.ts), client generated to `generated/prisma` (gitignored). The app uses the pooled `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`. Prices are integer centavos. `Product.effectivePrice` (the price the shopper pays, `COALESCE(salePrice, price)`) is kept by a database trigger: filter and sort by it, and **never write it from app code** ([ADR 0004](docs/adr/0004-effective-price-column-kept-by-trigger.md)). Display prices with `formatPeso()` from `@/lib/format`, and stock with `getStockStatus()` / `stockStatusLabel` from `@/lib/stock`. Render product images with `ProductImage` from `@/components/product/product-image` (`next/image` in a square `bg-muted` box, with a labelled fallback when a product has none); always pass `sizes` with the rendered width. `ProductImage.url` holds a site path or an `https://` URL, so real images only change data ([spec 006](docs/specs/006-product-images/spec.md)). Show products in lists (category, search, related) with `ProductCard` from `@/components/product/product-card`, loaded with `productCardSelect` and mapped with `toProductCardData` from `@/lib/products`. Listing URL state (sort, page, filters) is parsed and serialized only in [lib/listing-params.ts](lib/listing-params.ts): build links with `listingHref`, change a filter with `withFilter` (it goes back to page 1) or `clearFilters`, and non-canonical URLs redirect to it ([spec 008](docs/specs/008-category-listing/spec.md)). Each listing filter (brand, price, in stock) is a pure object in `lib/listing-filters/` (`parse`, `serialize`, `chips`, optional `normalize`; no database imports, since client components use it) plus its database condition and options in `lib/listing-filters/server.ts`, both keyed in the `commonFilters` list; adding one is a new file, an entry in each, and a group in the sidebar ([spec 012](docs/specs/012-common-filters/spec.md)). Price filters take whole pesos in the URL and compare against `effectivePrice`; cards show the sale price, the one filters and price sorts use. Per-request data (stock, prices, product lists): the page calls `await connection()` (from `next/server`) so it renders per request, not at build time. Shared, rarely changing data (the category menu): a function in `lib/` wrapped in `unstable_cache` with a named tag and a `revalidate` backstop, and every app write invalidates that tag ([ADR 0003](docs/adr/0003-cache-shared-data-with-tags.md)). Local env lives in `.env.local`, never `.env`.
- Import the Prisma client as `db` from `@/lib/db` and env vars as `env` from `@/lib/env` (validated with `@t3-oss/env-nextjs` + Zod at startup). Never read `process.env` directly in app code; add new variables to the schema in [lib/env.ts](lib/env.ts) and to `.env.example`.
- Product specs are JSONB (`Product.specs`), shaped by Zod schemas in [lib/specs/](lib/specs/), one file per builder category, linked to `Category` rows by slug through `builderCategories` in `lib/specs/registry.ts` ([ADR 0001](docs/adr/0001-store-specs-as-jsonb.md), [ADR 0002](docs/adr/0002-spec-schemas-in-code.md)). Validate every specs write with `validateSpecs()`; type reads with `Specs<C>`. Spec field names carry their unit (`tdpW`, `lengthMm`, `capacityGb`) and hold integers in base units. `lib/specs` must not import server-only code (the builder runs it in the browser). Seed data lives in `prisma/seed/data/` (entry point `prisma/seed.ts`).
- Root layout ([app/layout.tsx](app/layout.tsx)) wraps everything in `ThemeProvider` (next-themes) and loads Geist / Geist Mono as `--font-sans` / `--font-mono`.
- Current state is early scaffolding: store pages live in the `app/(store)` route group (shared header/footer layout). `app/(store)/page.tsx` is still the template page; `app/(store)/[category]` is the category listing with a filter sidebar (`/cpu`, [spec 008](docs/specs/008-category-listing/spec.md), [spec 012](docs/specs/012-common-filters/spec.md)); `app/login`, `app/signup` and `app/sidebar` are shadcn block pages (login/signup forms, sidebar shell) built from `components/login-form.tsx`, `signup-form.tsx` and `app-sidebar.tsx` / `nav-*.tsx` / `team-switcher.tsx`, which still contain shadcn sample data (Acme teams, placeholder user) to be replaced with real data.

## Working rules

- Ask before creating git worktrees, symlinks or junctions, or changing anything in `node_modules`. Turbopack can't follow a linked `node_modules`, and removing a link carelessly can delete the real dependencies.

## Formatting

Prettier: no semicolons, double quotes, 2-space indent, 80 cols, `es5` trailing commas, LF endings; Tailwind classes are auto-sorted (including inside `cn` and `cva`).

## Learning notes
Playbook folder name: PC Silicon