# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

Package manager is pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`).

- `pnpm dev` — start Next.js dev server
- `pnpm build` / `pnpm start` — production build / serve
- `pnpm lint` — ESLint (flat config, `eslint.config.mjs`)
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm format` — Prettier on all `ts`/`tsx`

There is no test runner configured yet.

## Project

"PC Silicon": a Philippine PC-parts store whose differentiator is a guided PC Builder that blocks incompatible parts before checkout. Portfolio/capstone project; payments run in gateway sandbox mode only. The product requirements (personas, features, payment methods such as GCash/Maya/COD, admin panel, development-approach change rules) are in [docs/prd.md](docs/prd.md) — read it before building features. The MVP is desktop-first.

## Stack and architecture

- Next.js 16.4 App Router (`app/`), React 19, TypeScript, Tailwind CSS v4 (configured via `app/globals.css`, no tailwind config file). Next.js here has breaking changes versus common knowledge — consult `node_modules/next/dist/docs/` before writing Next-specific code (see AGENTS.md).
- UI is shadcn/ui with the `base-mira` style on **Base UI** (`@base-ui/react`), not Radix. Generated primitives live in `components/ui/`; add more with `pnpm dlx shadcn@latest add <component>`. Icons are `lucide-react`. Config in `components.json`.
- Path aliases: `@/components`, `@/lib`, `@/hooks`, `@/components/ui`. Use `cn()` from `@/lib/utils` for class merging.
- Database: Neon Postgres via Prisma 7 with `@prisma/adapter-pg`. Schema in [prisma/schema.prisma](prisma/schema.prisma), config in [prisma7.config.ts](prisma7.config.ts), client generated to `generated/prisma` (gitignored). The app uses the pooled `DATABASE_URL`; migrations use `DATABASE_URL_UNPOOLED`. Prices are integer centavos. Local env lives in `.env.local`, never `.env`.
- Import the Prisma client as `db` from `@/lib/db` and env vars as `env` from `@/lib/env` (validated with `@t3-oss/env-nextjs` + Zod at startup). Never read `process.env` directly in app code; add new variables to the schema in [lib/env.ts](lib/env.ts) and to `.env.example`.
- Root layout ([app/layout.tsx](app/layout.tsx)) wraps everything in `ThemeProvider` (next-themes) and loads Geist / Geist Mono as `--font-sans` / `--font-mono`.
- Current state is early scaffolding: `app/page.tsx` is still the template page; `app/login`, `app/signup` and `app/sidebar` are shadcn block pages (login/signup forms, sidebar shell) built from `components/login-form.tsx`, `signup-form.tsx` and `app-sidebar.tsx` / `nav-*.tsx` / `team-switcher.tsx`, which still contain shadcn sample data (Acme teams, placeholder user) to be replaced with real data.

## Formatting

Prettier: no semicolons, double quotes, 2-space indent, 80 cols, `es5` trailing commas, LF endings; Tailwind classes are auto-sorted (including inside `cn` and `cva`).
