# 002 — Plan: layout shell

Status: **Draft** · Spec: [spec.md](spec.md) (approved) · Issue: #9

## Context

Story 5 (issue #9) gives every store page the same header, footer and page container, copied from the approved light and dark mockups. The spec ([spec.md](spec.md)) defines the behavior. This plan says which files and components build it. 

## Summary

- **Server components only.** Nothing in the shell has state or handlers. The search box and Subscribe button do nothing, so they need no `"use client"`.
- **Reuse shadcn:** `Button` / `buttonVariants`, `Input`, `Label` and `Separator` from `components/ui/`. No new shadcn components are needed. Links styled as buttons use `buttonVariants()` on `next/link`. This avoids Base UI's `render` / `nativeButton` handling for anchors.
- **lucide icons:** `Search`, `Wrench`, `ShoppingCart`, `CircleUser`, `Mail`. GitHub, LinkedIn and the logo mark are hand-written inline SVGs that use `currentColor`.
- **Colors use tokens only.** The existing neutral `:root` / `.dark` tokens already match the mockups, so `globals.css` needs no color changes.
- No new dependencies, no env vars, no database work.

## Files

```
app/
  layout.tsx                 edit: metadata (title template), body flex column, tidy formatting
  (store)/
    layout.tsx               new: SkipLink + SiteHeader + <main> + SiteFooter
    page.tsx                 moved from app/page.tsx (template content kept for now)
components/
  layout/
    container.tsx            max-w-7xl mx-auto w-full px-6 wrapper (className passthrough)
    skip-link.tsx            "Skip to content" → #main-content
    logo.tsx                 LogoMark (svg) + Logo (mark + "pc"/"silicon" wordmark)
    site-header.tsx          grid header: search | logo | actions
    header-search.tsx        role="search" div, sr-only Label, Input with Search icon
    site-footer.tsx          brand block + link columns + bottom bar
    newsletter-form.tsx      "Get deal alerts" label, Input, Button type="button"
    social-icons.tsx         GitHubIcon, LinkedInIcon (inline svg)
lib/
  site.ts                    siteConfig: name, tagline, contact email, social URLs, footer link groups
docs/specs/002-layout-shell/
  plan.md                    this plan
```

`components/layout/` keeps shell parts separate from the shadcn sample components in `components/`, which are still demo code.

## Key decisions

1. **Route group `(store)`.** `app/(store)/layout.tsx` wraps store pages. The root layout keeps `<html>`, `<body>`, fonts, `ThemeProvider` and metadata. `/login`, `/signup` and `/sidebar` stay outside the group and are unchanged. Moving `app/page.tsx` into the group keeps the URL `/`.
2. **Data in `lib/site.ts`.** Footer link groups (Shop/Build/Support with the spec's routes), email, GitHub `https://github.com/romulojr-dev` and LinkedIn `https://www.linkedin.com/in/romulo-dev/` live here once. The footer maps over the link groups. The Shop hrefs reuse slugs from `builderCategories` in `lib/specs/registry.ts` where possible (`/cpu`, `/gpu`, …).
3. **Header layout:** `grid grid-cols-[1fr_auto_1fr] items-center h-20 px-6 border-b`. The search column holds `w-full max-w-65` (260 px). The actions column is `justify-self-end flex gap-*`. The header is full width, not inside the container, to match the mockup.
4. **Footer layout:** `Container` with `grid grid-cols-[minmax(0,1fr)_auto] gap-x-16`. Link groups are a `grid grid-cols-3 gap-x-*` of `<nav aria-labelledby>` blocks. The bottom bar is a `flex justify-between items-center` after a `Separator`. The year comes from `new Date().getFullYear()`. That is safe because `cacheComponents` is off.
5. **Search and newsletter look:** shadcn `Input` with class overrides for the mockup's filled style (`h-9 rounded-xl border-transparent bg-muted pl-9`). The icon is absolutely positioned inside a `relative` wrapper. Labels are `<Label className="sr-only">`, except "Get deal alerts", which is the visible label of the email input.
6. **Focus:** shadcn's default ring is `ring-ring/30`, which is faint. Shell links and icon links add `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none`. This is a shared `focusRing` class string exported from `lib/utils.ts`. Buttons keep the shadcn style plus this ring.
7. **Skip link:** `sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50`, styled with `buttonVariants()`, placed first inside `(store)/layout.tsx`. `<main id="main-content" tabIndex={-1} className="flex-1 outline-none">`.
8. **Root layout:** add `export const metadata: Metadata = { title: { template: "%s | PC Silicon", default: "PC Silicon" }, description: … }`. `body` gets `flex min-h-svh flex-col`. Keep the Geist / Geist Mono `next/font` setup and only reformat it to Prettier style.
9. **Logo SVG:** a circle with two vertical and two horizontal lines (a globe grid) and a small filled square in the centre cell, drawn on a 24×24 viewBox with `stroke="currentColor"`. The wordmark is text: `<span className="font-bold">pc</span>silicon`, at about `text-3xl tracking-tight`.

## Steps

1. Save this plan as `docs/specs/002-layout-shell/plan.md`.
2. `lib/site.ts`, plus `focusRing` in `lib/utils.ts`.
3. `components/layout/*` (container, logo, social icons, skip link, header search, header, newsletter, footer).
4. `app/(store)/layout.tsx`, then move `app/page.tsx` into `app/(store)/`.
5. Root `app/layout.tsx`: metadata and body classes.
6. `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.

## Verification

- `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.
- `pnpm dev`, then open `/` at 1280 px and 1024 px in light and dark (press `d` to toggle). Compare with the mockups, check for no horizontal scroll, check that the logo is centred and that the footer columns don't overlap.
- Keyboard: from page load, Tab → skip link appears → Enter moves focus to main. Tab order: search → logo → PC Builder → cart → account. A visible ring on every stop.
- `<title>` on `/` is "PC Silicon". Add a temporary page `metadata.title = "Test"` to see "Test | PC Silicon", then remove it.
- Change `--primary` in DevTools: the PC Builder and email pills recolor.
- axe DevTools (browser extension) on `/` in both themes: no violations.
- `/login` and `/signup` still render without the shell.
