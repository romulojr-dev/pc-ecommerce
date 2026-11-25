# 050 — Home redesign: hero banner, category grid, trust strip; category drawer; shimmer PC Builder

Status: **Draft** · Brief: the design handoff "Home page: hero banner, category cards, trust strip" · Changes parts of [spec 016](../016-home-page/spec.md)

## Summary

Three home sections change to the finished design, and two header controls change look:

1. **Hero banner** (`components/home/hero-banner.tsx`): a dark, dot-gridded panel with one `h1` mixing Geist 300 and 700: "**Build a PC** that just **works,** with solid tech and&nbsp;**solid value.**" No buttons and no label (spec 016's "Build your PC" and "Shop deals" are gone; the header's PC Builder link and the Deals section remain).
2. **Category grid** (`components/home/category-grid.tsx`): "Shop by category" as eight solid `bg-muted` text tiles (`auto-fill, minmax(140px, 1fr)`), labelled `CPU`, `Graphics Card`, `Mobo`, `Memory`, `Storage`, `Power Supply`, `Case`, `Cooling`, in that order. No icons.
3. **Trust strip** (`components/home/trust-strip.tsx`): three centered items (Fast delivery, Genuine parts, Flexible payment) with custom glyphs in `components/icons/`, no borders or backgrounds, named by `aria-label`.
4. **Category drawer** (`components/layout/category-drawer.tsx`): the header's Categories dropdown becomes a hamburger icon that opens a left drawer with a curved leading edge that flattens as it arrives, numbered categories and a letter ripple on hover and focus.
5. **PC Builder** in the header becomes a text-only shimmer button (`components/ui/shimmer-button.tsx`, `ShimmerLink`).

The page shell is `Container` (already `max-w-7xl` = 1280px, `px-6`) with sections stacked `gap-20`; `HomeSection` loses its `mt-16`.

## Rules

- **R1. Tile labels are display only.** Which categories exist, their slugs and links come from `getMenuCategories()`. `CATEGORY_TILES` only renames and orders them, keyed by `BuilderCategorySlug`, so a renamed slug is a type error. A missing category has no tile; an unknown top-level category is appended under its own name. "Mobo" links to `/motherboard`.
- **R2. The drawer is a modal dialog.** Base UI's `Dialog` gives the focus trap, Escape, scroll lock and focus returning to the trigger; Motion only animates. Its trigger is a hamburger icon button named "Browse categories", the drawer's title (and name) is "Browse categories", its list is `nav[aria-label=Categories]`, the current category has `aria-current="page"` and a check icon, and a link click closes it.
- **R3. Link names are read once.** The number and the per-letter spans are `aria-hidden`; a visually hidden copy gives the name ("CPU", not "C P U").
- **R4. Motion respects the visitor.** `MotionConfig reducedMotion="user"` drops the drawer's movement; the shimmer has `motion-reduce:animate-none`.
- **R5. Theme-safe colors.** The hero is dark in both themes (fixed neutrals, per the brief). Icons use `currentColor` and `fill-background` / `stroke-background`. The shimmer defaults to `--primary` / `--primary-foreground`, so it inverts in dark mode.
- **R6. Narrow screens.** At 375px nothing in `main` overflows; the hero drops to 40px below `md`. The header's own narrow layout is Phase 2 and still overflows, as before.

## Changes to spec 016

Spec 016's hero (h1, text, two calls to action, wafer illustration), its category tiles (icons, database names) and its four-item trust strip with a hidden `h2` are replaced by the above. Its "no hex values" theme rule gives way to the brief's design values (`#EBEBEB` hover, `#2A2A2A` dot grid).

## Tests

- Unit: `components/home/home-sections.test.tsx`: tile mapping and order, missing and unknown categories, hero markup (one `h1`, three bold runs, no-break space, no links), trust strip (three items, `aria-hidden` icons, no headings), rosette shape.
- E2E: `e2e/home.spec.ts` (headline, no hero links, tile labels and slugs, no overflow at 375px, header PC Builder), `e2e/category-menu.spec.ts` (drawer lists the categories by accessible name, a link closes it, keyboard: focus trapped, Escape returns focus), and the drawer in `category-page`, `epic-browse` and `product-page` specs.
