# 007 — Category menu in the header

Status: **Approved** · Issue: #20 · PRD refs: FR-1 (category menu), NFR Accessibility (WCAG 2.1 AA, keyboard navigation), NFR Responsiveness (desktop-first), NFR Performance (LCP < 2.5 s)

## Summary

The header gets a "Categories" button that opens a dropdown listing the store's categories from the database, ordered by `sortOrder`. Each item links to `/<category-slug>`. The menu is on every store page, so its query is cached and refreshed by tag, not run on every request. It is built with our existing shadcn `DropdownMenu` (Base UI `Menu`), works fully from the keyboard, and marks the category the shopper is in.

FR-1 describes a mega-menu across 13 categories. Today the database holds only the 8 builder categories, so this story ships a single-column list. It grows into a mega-menu when non-builder categories arrive.

## Menu

- **Placement:** the header's left column, before the search field: `[Categories ▾] [Search parts…]`. The trigger is a ghost button with a `LayoutGrid` icon, the label "Categories" and a `ChevronDown` that rotates while open.
- **Contents:** top-level categories (`parentId: null`), ordered by `sortOrder`, then `name` as a tie-breaker. Today these are the 8 builder categories: CPU, Motherboard, Memory, Storage, Graphics Card, Case, Power Supply, CPU Cooler.
- **Items:** one link per category, labelled with `Category.name`, `href` from the existing `categoryHref(slug)` in `lib/site.ts` (`/<slug>`). The links 404 until the category pages story ships.
- **No categories:** if the query returns none, the trigger isn't rendered (no empty menu).
- **Components and the client boundary:** only the code that needs `usePathname()` is ours and marked `"use client"`. `SiteHeader` stays a server component.
  - `components/layout/category-menu.tsx`: an async **server** component. It loads the categories and renders `DropdownMenu`, `DropdownMenuTrigger` and `DropdownMenuContent` from `components/ui/dropdown-menu.tsx` (already client components from shadcn, which a server component can render), then one `CategoryMenuLink` per category. `SiteHeader` renders it.
  - `components/layout/category-menu-link.tsx` (`"use client"`): one menu item. It takes `{ name, slug }` as plain props, reads the path with `usePathname()` and sets the current-category marker. It renders Base UI's `Menu.LinkItem` as a Next `Link`, so it is a real `<a href>` link that navigates client-side. It is rendered inside the menu's tree, so it gets the menu's context.
  - If the shadcn wrapper lacks a link item, we add a small `DropdownMenuLinkItem` to it, styled like `DropdownMenuItem`.
  - Items set `closeOnClick` (Base UI defaults it to `false` for link items). Client navigation keeps the layout mounted, so otherwise the menu would stay open on the new page.
  - The popup is at least 14rem wide (it defaults to the trigger's width) and uses theme tokens only.
- **Desktop-first:** designed for 1280 px and up, usable at 1024 px. No mobile variant (see Out of scope).

## Data loading

The menu sits in the `(store)` layout, so its data is needed on every store page. Categories change rarely: only through the seed today, and through the Admin epic later.

| Option | How | Trade-offs |
| --- | --- | --- |
| **A. Query on every request** | `await connection()` in the menu, then `db.category.findMany` | Always fresh, no invalidation code. But every store page, including home, becomes dynamic: a server render and a database round trip per request. Neon scales to zero, so a cold start adds latency to every page's TTFB, which works against the LCP target. |
| **B. Cached query with tags** (recommended) | `unstable_cache` around the query, tag `categories`, `revalidate: 3600` | One query per hour instead of one per request. Pages that don't read request data stay static. Changes need an explicit invalidation (below). In Next 16 the docs say `unstable_cache` has been replaced by `use cache`, but it is the supported API when Cache Components is off, which is our setup (`next.config.ts` is empty). |
| **C. Cache Components** | `cacheComponents: true`, then `"use cache"` + `cacheTag("categories")` + `cacheLife("hours")` | Next 16's recommended model. But it is a project-wide switch: it changes how every route renders (uncached data must sit under `<Suspense>`, route segment configs like `dynamic` stop applying). Too big for this story; it deserves its own ADR. |

**Decision: B**, recorded in [ADR 0003](../../adr/0003-cache-shared-data-with-tags.md). It keeps pages fast without committing the project to Cache Components here.

- `getMenuCategories()` in `lib/categories.ts` (server-only) returns `{ name, slug }[]`, wrapped in `unstable_cache` with key `["menu-categories"]`, `tags: ["categories"]`, `revalidate: 3600`. The tag name is exported as a constant so writers use the same string.
- Errors are not cached: a failed query throws and is retried on the next request.
- **Build:** a static page that renders the header runs this query at build time, so `pnpm build` needs a reachable database. Vercel and CI already have one (both run `db:deploy` before the build). If that turns out to break a build, falling back to option A for the menu alone is a one-line change.
- CLAUDE.md's rule "pages that read the database call `await connection()`" now points to ADR 0003: shared, rarely changing data like the menu uses a tagged cache instead.
- The README explains the refresh delay after a seed or manual edit, and how to check it.

**Refreshing when categories change:**

- **Admin epic:** every server action that creates, renames, reorders or deletes a category calls `updateTag("categories")` (the admin sees the change on the next render) or `revalidateTag("categories", "max")` (stale-while-revalidate, from route handlers too).
- **Out-of-band changes** (`pnpm db:seed`, edits in the Neon console) run outside Next and can't invalidate the tag. They show up within the hour through `revalidate: 3600`.
- **Moving to Cache Components later:** swap `unstable_cache` for `"use cache"` + `cacheTag("categories")`. The tag stays the same, so admin code doesn't change.

## Accessibility

Base UI's `Menu` implements the WAI-ARIA menu button pattern. We rely on its behavior and test it:

- **Mouse:** click the trigger to open; click outside or on the trigger to close. No open-on-hover.
- **Keyboard:** Enter, Space or ArrowDown on the trigger opens the menu with focus on the first item (ArrowUp: last item). ArrowDown and ArrowUp move between items, Home and End jump to the first and last, typing a letter jumps to the matching item. Enter follows the focused link.
- **Escape** closes the menu and returns focus to the trigger. Tab closes it and moves on.
- **Roles:** the trigger is a `button` with `aria-haspopup="menu"` and `aria-expanded`; the popup is a `menu` with an accessible name ("Categories"); items are `menuitem` links.
- **Current category:** when the first path segment equals an item's slug (`/gpu` and later `/gpu/rtx-5070-12gb`), that item gets `aria-current="page"` and a visible marker that isn't color alone: a `Check` icon (`aria-hidden`) and medium font weight. `CategoryMenuLink` reads the path with `usePathname()`, since layouts don't re-render with `params`. The matching logic is a small pure function, `isCurrentCategory(pathname, slug)`.
- Focus rings use the shared `focusRing`; contrast comes from the theme tokens in light and dark.
- A `menu` role for site navigation is a deliberate choice: the story asks for arrow-key navigation, which the menu pattern provides.

## Tests

- **Unit** (Vitest): `isCurrentCategory` matches `/cpu` and `/cpu/some-product` for `cpu`, and doesn't match `/`, `/cpu-cooler` or `/products`.
- **E2E** (`e2e/category-menu.spec.ts`, role-based locators):
  - On `/`, clicking the "Categories" button in the header opens a menu whose `menuitem`s are the seeded categories in `sortOrder`. The expected list comes from `builderCategories` in `lib/specs/registry.ts` (the seed's source), so it isn't hard-coded twice. The "CPU" item's `href` is `/cpu`.
  - Keyboard: focus the trigger, press Enter → the menu is open and the first item is focused; ArrowDown → the second item is focused; Escape → the menu is gone and the trigger is focused.
  - The current-category marker gets an E2E test in the category pages story, when `/cpu` exists (now it 404s outside the store layout).
- **By hand:** light and dark themes; 1280 px and 1024 px widths; axe in DevTools shows no violations with the menu open.

## Acceptance criteria

- [x] A "Categories" menu in the header lists the categories from the database, ordered by `sortOrder`.
- [x] Each item links to `/<category-slug>`; clicking one navigates and closes the menu.
- [x] Opens with mouse and keyboard; arrow keys move between items; Escape closes it and returns focus to the trigger.
- [ ] The current category is marked with `aria-current="page"` and a non-color indicator.
- [x] The query is cached with the `categories` tag and a 1-hour revalidate; store pages without request data stay static.
- [x] `SiteHeader` and `CategoryMenu` are server components; only `CategoryMenuLink` is a client component of ours.
- [x] ADR 0003 written; CLAUDE.md and the README updated.
- [x] Unit and E2E tests pass; `pnpm lint`, `pnpm typecheck` and `pnpm build` pass.

## Out of scope

- Non-builder categories (Case Fans, Monitor, Peripherals, Networking, Prebuilt PCs) and the multi-column mega-menu layout.
- Subcategories and nested menus.
- The mobile menu (Phase 2).
- Category pages at `/<category-slug>` (next story).
- Admin category management and its invalidation calls (Admin epic; this spec only fixes the tag they use).
- Adopting Cache Components.

## Open questions

None.
