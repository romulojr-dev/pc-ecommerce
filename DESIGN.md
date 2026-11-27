---
name: PC Silicon
description: A monochrome Philippine PC-parts store built around a PC Builder that explains what fits.
colors:
  ink: "oklch(0.145 0 0)"
  graphite: "oklch(0.205 0 0)"
  paper: "oklch(1 0 0)"
  chalk: "oklch(0.985 0 0)"
  bench-grey: "oklch(0.97 0 0)"
  pencil-grey: "oklch(0.556 0 0)"
  hairline: "oklch(0.922 0 0)"
  ring-grey: "oklch(0.708 0 0)"
  hero-panel: "#0A0A0A"
  hero-dot: "#2A2A2A"
  hero-edge: "#404040"
  error-red: "oklch(0.577 0.245 27.325)"
  fit-green: "#047857"
  warning-amber: "#B45309"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "56px"
    fontWeight: 300
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.625
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "8.4px"
  md: "11.2px"
  lg: "14px"
  xl: "19.6px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "80px"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "28px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "28px"
  button-builder:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "2px 8px"
    height: "28px"
  product-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "12px"
  category-tile:
    backgroundColor: "{colors.bench-grey}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "16px"
  hero-banner:
    backgroundColor: "{colors.hero-panel}"
    textColor: "{colors.chalk}"
    typography: "{typography.display}"
    rounded: "{rounded.lg}"
    padding: "44px 48px"
---

# Design System: PC Silicon

## Overview

**Creative North Star: "The Quiet Workbench"**

PC Silicon is a tidy builder's bench. The surfaces are white and calm, the tools (filters, quantity steppers, Add to build) sit in reach without shouting, and what stands out is the work itself: the parts, their prices, and whether they fit. Everything is black ink on white paper, set in Geist with tight negative tracking, on softly rounded 14px corners. The one dark object on the bench is the home page's dot-gridded hero panel, which works like the dark mat a builder lays a motherboard on.

The density is compact, from the shadcn `base-mira` style: 28px controls, 12–14px text in working areas, generous 80px gaps only between home-page sections. Brand lives in precise details (the light-and-bold weight mix in the hero, the `pc`**silicon** wordmark with its globe-and-chip mark, tabular numerals on prices), not in color. Color appears only when it means something: whether a part fits, is out of stock, or has failed.

Dark mode is fully supported (`next-themes`, system default, the `d` key toggles it), and every neutral has a dark counterpart in `app/globals.css`.

**Key Characteristics:**
- Strictly monochrome neutrals; semantic color only for fit, stock and error states.
- Flat surfaces: hairline borders, 1px rings and muted fills, no drop shadows.
- Geist throughout, with negative tracking on headings and tabular numbers on prices.
- Compact controls (28px) with a solid, clearly visible focus ring.
- One dark panel (the hero) and one animated element (the PC Builder shimmer button).

## Colors

A neutral grey ramp with no hue. Chroma appears only in three status colors.

### Primary
- **Graphite** (`oklch(0.205 0 0)`, #171717): primary buttons, the PC Builder shimmer button, selected states. In dark mode it flips to near-white (`oklch(0.922 0 0)`).

### Neutral
- **Ink** (`oklch(0.145 0 0)`, #0A0A0A): body text and headings on light surfaces; the dark-mode page background.
- **Paper** (`oklch(1 0 0)`): page, card and popover background in light mode.
- **Chalk** (`oklch(0.985 0 0)`, #FAFAFA): text on Graphite and on the hero panel; the admin sidebar surface.
- **Bench Grey** (`oklch(0.97 0 0)`, #F5F5F5): muted fills such as category tiles, secondary buttons, image wells (`ProductImage`'s `bg-muted` box), and hover backgrounds. Category tiles deepen to #EBEBEB on hover.
- **Pencil Grey** (`oklch(0.556 0 0)`, #737373): secondary text (brands, spec summaries, descriptions, footer links).
- **Hairline** (`oklch(0.922 0 0)`, #E5E5E5): borders and input strokes. In dark mode, white at 10% / 15%.
- **Ring Grey** (`oklch(0.708 0 0)`, #A1A1A1): focus rings.
- **Hero Panel / Hero Dot / Hero Edge** (#0A0A0A / #2A2A2A / #404040): the fixed dark hero panel, its 14px dot grid and its 1px edge. These stay dark in both themes.

### Status (meaning only)
- **Error Red** (`oklch(0.577 0.245 27.325)`): "Doesn't fit your build", "Out of stock", destructive actions and invalid fields. Destructive buttons are tinted (red at 10%), not solid.
- **Fit Green** (Tailwind `emerald-700`, `emerald-400` in dark mode): "Fits your build" only.
- **Warning Amber** (Tailwind `amber-700`, `amber-400` in dark mode): "Fits, with warnings" only.

### Named Rules
**The Ink-Only Rule.** The brand is black and white. No accent color exists, so none is introduced, whether for links, highlights, charts or decoration. Charts use the grey `chart-1…5` ramp.

**The Color Means Something Rule.** Red, green and amber appear only on a state the user must understand (fit, stock, error), and always together with text and an icon, never as color alone.

## Typography

**Display Font:** Geist (via `next/font`, variable, as `--font-sans` / `--font-heading`)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono (`--font-mono`), for codes and identifiers

**Character:** One family, worked through weight and tracking instead of pairing. Headings are tight and confident (−0.02 to −0.035em); body text is plain and legible at small sizes.

### Hierarchy
- **Display** (300 with 700 for emphasis, 56px, 40px on narrow screens, line-height 1.05, −0.035em): the home hero's h1 only. Bold words carry the message ("**Build a PC** that just **works,**…").
- **Headline** (600, 30px / `text-3xl`, `tracking-tight`): each page's h1 (Builder, Cart, Checkout, shared build).
- **Title** (600, 20–22px, −0.02em): section h2s ("Shop by category", home sections) and category tile labels.
- **Body** (400, 14px / `text-sm`): descriptions, form text, footer. Product names on cards are 14px at 500.
- **Label** (500, 12px / `text-xs`, relaxed leading): buttons, badges, brand lines, stock lines on cards, fit badges.

### Named Rules
**The Tabular Price Rule.** Every price uses `tabular-nums`, formatted with `formatPeso()`. A struck list price beside a sale price is announced as "Was …".

**The Two-Weight Hero Rule.** Display type is light (300) with bold (700) words. Use the real variable weights; never synthesize light from 400.

## Layout

Desktop-first: designed for 1280px and up, fully usable down to 1024px. Store content sits in `Container`: centred, `max-w-7xl` (1280px) with 24px side padding. The header is a 80px three-column grid (category drawer and search, centred logo, PC Builder and cart) over a bottom hairline.

The spacing rhythm is the 4px Tailwind scale: 4/8/12 inside components, 16 for card and tile padding, 24 for page gutters, 80px between home-page sections. Grids use `repeat(auto-fill, minmax(…, 1fr))` with 12px gaps so they reflow without breakpoints (category tiles at a 140px minimum). Layouts use flex and grid with no fixed widths, so Phase 2 mobile layouts can be added without rewrites.

Admin uses the shadcn sidebar shell. The packing slip prints on its own: the sidebar and header are hidden and the page is black on white.

## Elevation & Depth

Flat. Surfaces sit on the page with no drop shadows; depth comes from three things only: hairline borders (`border`), 1px rings (`ring-1 ring-foreground/10` on cards), and muted fills (Bench Grey). Hover darkens a border (`hover:border-foreground/30`) or a fill, never lifts. The dark hero panel is the strongest contrast on any page and does the work a shadow would elsewhere.

### Named Rules
**The Flat Bench Rule.** No `box-shadow` on cards, tiles, panels or overlays. Separation is a border, a ring or a fill. (Known drift: the stock shadcn primitives still ship `shadow-md` on dropdown and select popups and `shadow-lg` on the sheet; remove them when those files are next touched rather than copying them. 1px `shadow-[0_0_0_1px…]` rings in the sidebar are borders, not elevation.)

**The One Shimmer Rule.** The PC Builder shimmer button (a light travelling around its border, with an inset highlight) is the only animated, glowing element, and it marks the product's differentiator. It stops under `prefers-reduced-motion`. Don't reuse it for other actions.

## Shapes

Softly rounded with one radius family derived from `--radius: 0.875rem` (14px): `rounded-lg` (14px) for cards, tiles, the hero, images and the shimmer button; `rounded-md` (≈11px) for buttons and inputs; `rounded-sm` (≈8px) for inline links' focus areas and extra-small buttons. Borders are always 1px. The logo is the only circular form: a globe grid with a solid square chip in the centre cell, drawn at a 1.25 stroke in `currentColor`.

## Components

### Buttons
Compact and quiet; the button text says what happens.
- **Shape:** gently rounded (`rounded-md`, ≈11px), 28px tall by default (24 / 32 for small / large), 12px medium text, 1px transparent border.
- **Primary:** Graphite fill, Chalk text; hover drops to 80% opacity.
- **Outline:** hairline border on the page background; hover fills with input grey.
- **Secondary / Ghost:** Bench Grey fill, or none, with a muted hover. Header icon buttons are ghost `icon-lg`.
- **Destructive:** red text on a 10% red tint, never a solid red block.
- **Pressed / Focus / Disabled:** presses move down 1px; focus shows a ring; disabled is 50% opacity with no pointer events.
- **PC Builder (signature):** the shimmer link, 36px tall, 16px horizontal padding, 14px semibold, Graphite with a Chalk shimmer (reversed in dark mode).

### Cards / Containers
- **Product card:** Paper background, 1px hairline border, 14px radius, 12px padding; image in a square Bench Grey well, then brand (Pencil Grey, 12px), name (14px, 500, the card's only link, whose `::after` covers the card), a one-line spec summary, price (semibold, tabular) and stock line. Hover darkens the border; focus rings the whole card. A greyed card (picker) goes to 50% opacity and grayscale on the image.
- **shadcn Card:** 14px radius, `ring-1` at 10% foreground instead of a border, 16px spacing (12px small).

### Category Tiles
Solid Bench Grey, 14px radius, 16px padding, at least 88px tall, no icon or border; the label sits top-left at 20px semibold, −0.02em, and wraps rather than overflows. Hover goes to #EBEBEB over 150ms.

### Inputs / Fields
- **Style:** 28px tall, hairline stroke, faint input-grey fill (20%), ≈11px radius, 12–14px text, Pencil Grey placeholder.
- **Focus:** border turns Ring Grey plus a 2px soft ring.
- **Error / Disabled:** red border and a red 20% ring on `aria-invalid`; disabled is 50% opacity.

### Fit Badge (signature)
The compatibility verdict wherever a part appears: a 12px medium line of icon plus text, "In your build" (ink, package-check), "Fits your build" (green, circle-check), "Fits, with warnings" (amber, triangle), "Doesn't fit your build" (red, circle-x). It reserves its one-line box from the server render on, so cards never shift, and the reasons follow as visually hidden text.

### Stock Line
Icon plus label, 14px medium on the product page and 12px on cards; only "Out of stock" turns red.

### Navigation
The header carries the category drawer (hamburger, "Browse categories", a sheet with a curved edge), the search box, the centred `pc`**silicon** logo (30px, globe-and-chip mark), the PC Builder shimmer link and the cart icon with its count. Footer: logo, tagline, newsletter form, three link groups in Pencil Grey that turn Ink on hover, and social icons.

### Hero Banner
A low dark panel (Hero Panel fill, 1px Hero Edge, 14px radius, 14px dot grid) with the display headline left-aligned at up to 820px wide. It has no buttons and no eyebrow label.

## Do's and Don'ts

### Do:
- **Do** use the theme tokens (`bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border`) so both themes work; fixed neutrals belong only on the hero.
- **Do** pair every status color with text and an icon (`FitLabel`, `StockLine`).
- **Do** use `focusRing` from `@/lib/utils` (a solid 2px ring with a 2px offset) on links and custom controls; the shadcn default at 30% is too faint on its own.
- **Do** set prices in `tabular-nums` with `formatPeso()`, and render product images through `ProductImage` in its Bench Grey square.
- **Do** keep headings tight (−0.02em or tighter) and body text at normal tracking.
- **Do** separate surfaces with a 1px border, a 10% ring or a Bench Grey fill.

### Don't:
- **Don't** introduce an accent color, gradient or tinted brand hue anywhere, including links, charts or Admin. (The dark-mode `--sidebar-primary` in `globals.css` is still shadcn's blue, `oklch(0.488 0.243 264.376)`; it is a leftover, not part of the palette.)
- **Don't** add drop shadows to cards, tiles, dialogs or panels.
- **Don't** reuse the shimmer effect beyond the PC Builder entry point, or animate anything that ignores `prefers-reduced-motion`.
- **Don't** use green, amber or red for decoration or emphasis; they are reserved for fit, stock and errors.
- **Don't** add icons, borders or images to category tiles, or buttons and labels to the hero.
- **Don't** show fake trust marks (ratings, review stars, registration badges); the store has none.
