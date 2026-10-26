# 007 — Plan: category menu in the header

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #20 · ADR: [0003](../../adr/0003-cache-shared-data-with-tags.md)

## Context

FR-1 asks for a category menu in the header. The spec defines a "Categories" dropdown on every store page, read from the database, ordered by `sortOrder`, linking to `/<slug>`, keyboard accessible, and marking the current category. ADR 0003 decides the data loading: a tagged `unstable_cache` (`categories`, 1 hour), so store pages stay static. The client boundary stays small: `SiteHeader` and the menu are server components, and only the item that needs `usePathname()` is a client component of ours.

## Summary

- **No schema change, no migration.** `Category` already has `name`, `slug`, `sortOrder` and `parentId`.
- **No new dependency.** The menu is the existing shadcn `DropdownMenu` (Base UI `Menu`), plus a `DropdownMenuLinkItem` wrapper around Base UI's `Menu.LinkItem`.
- **Pure helpers stay testable without env:** `categoryHref` and `isCurrentCategory` live in `lib/site.ts`; the cached query lives in `lib/categories.ts`.

## Files

```
lib/site.ts                                export categoryHref (string slug); isCurrentCategory
lib/site.test.ts                           isCurrentCategory unit tests
lib/categories.ts                          getMenuCategories() and CATEGORIES_TAG
components/ui/dropdown-menu.tsx            DropdownMenuLinkItem
components/layout/category-menu.tsx        async server component
components/layout/category-menu-link.tsx   "use client" item with usePathname
components/layout/site-header.tsx          left column: CategoryMenu + HeaderSearch
e2e/category-menu.spec.ts                  opens and lists; keyboard
```

## Data

`lib/categories.ts` (server code, imports `db`):

```ts
export const CATEGORIES_TAG = "categories"
export type MenuCategory = { name: string; slug: string }
export const getMenuCategories = unstable_cache(
  async (): Promise<MenuCategory[]> =>
    db.category.findMany({
      where: { parentId: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { name: true, slug: true },
    }),
  ["menu-categories"],
  { tags: [CATEGORIES_TAG], revalidate: 3600 }
)
```

`lib/site.ts`:

- `categoryHref(slug: string)` is exported. Before, it was typed to builder slugs and private, but database slugs are plain strings.
- `isCurrentCategory(pathname, slug)` compares the first path segment, so `/cpu` and `/cpu/x` match `cpu`; `/cpu-cooler`, `/` and `/products` don't.

## Components

- **`DropdownMenuLinkItem`:** `MenuPrimitive.LinkItem` with `DropdownMenuItem`'s styles (no destructive variant), `data-slot="dropdown-menu-link-item"`.
- **`CategoryMenu`** (async server component):
  - Returns `null` when there are no categories.
  - Trigger: `DropdownMenuTrigger render={<Button variant="ghost" />}`, the same `render` pattern as `components/nav-user.tsx`. Its content is a `LayoutGrid` icon, "Categories" and a `ChevronDown` that rotates on `data-popup-open`.
  - Content: `DropdownMenuContent` (at least 14rem wide) with one `CategoryMenuLink` per category.
  - The popup is named by the trigger through Base UI's `aria-labelledby`.
- **`CategoryMenuLink`** (`"use client"`, props `{ name, slug }`): `DropdownMenuLinkItem` with `closeOnClick`, rendered as a Next `Link` to `categoryHref(slug)`. When `isCurrentCategory(usePathname(), slug)`, it gets `aria-current="page"`, medium weight and a `Check` icon.
- **`SiteHeader`** stays a synchronous server component; its first grid cell holds `CategoryMenu` and `HeaderSearch`.

## E2E

`e2e/category-menu.spec.ts`. The expected names come from `builderCategories` sorted by `sortOrder`, the seed's source.

1. On `/`, clicking "Categories" in the header opens a menu named "Categories". Its `menuitem`s are the expected names in order, and "CPU" links to `/cpu`.
2. Keyboard: Enter on the trigger opens the menu and focuses the first item; ArrowDown focuses the second; Escape closes the menu and focuses the trigger.

The current-category E2E comes with the category listing page (#21).
