# 002 — Layout shell

Status: **Draft** · Issue: #9 · PRD refs: FR-3 (partial), Non-functional → Responsiveness, Accessibility

## Summary

Every store page shares one header, one footer and one page container. The header and footer copy the approved mockups (light and dark) attached to the issue. The search box, newsletter form and cart are visual only in this story. Colors come from the shadcn CSS variables, so a rebrand is a change to `app/globals.css` and nothing else.

## Where the shell applies

- The shell lives in a `(store)` route group layout, and `app/page.tsx` moves into that group. The root layout keeps `<html>`, `<body>`, fonts, metadata and `ThemeProvider`.
- The shadcn demo pages (`/login`, `/signup`, `/sidebar`) stay outside the group and are not changed. The admin panel will get its own layout later.

## Header

One row, about 80 px tall, full width with 24 px side padding, bottom border in `border`. A three-column grid (`1fr auto 1fr`) keeps the logo centred whatever the side columns hold.

| Position | Content |
| --- | --- |
| Left | Search box: magnifier icon and "Search parts…" placeholder, `muted` fill, no border, rounded. Grows to a max width of about 260 px (`max-w-*`, never a fixed `w-*`). |
| Centre | Logo, linking to `/`: the globe-and-chip mark plus the wordmark "**pc**silicon" ("pc" bold, "silicon" regular). |
| Right | "PC Builder" button (wrench icon, `primary` pill) linking to `/builder`, then a cart icon linking to `/cart` and an account icon linking to `/login`. |

- The search box is a labelled `<input type="search">` inside `role="search"`, with no `<form>`, so Enter does nothing. No suggestions, no navigation.
- No cart count badge and no account menu yet.
- The logo is an inline SVG component that uses `currentColor`, so it follows the theme. The mark is decorative (`aria-hidden`); the link's accessible name is "PC Silicon home".
- The header scrolls with the page (not sticky). FR-3's "persistent" means present on every page.

## Footer

Contained in the page container (below), separated from the bottom bar by a `border` rule.

**Top area**, two columns: brand block on the left, three link columns on the right.

- Brand block: logo, the line "PC parts, custom builds, and a PC Builder that checks compatibility for you." in `muted-foreground`, then "Get deal alerts" with an email input ("you@email.com") and a "Subscribe" button. Visual only, like the search box.
- Link columns (headings in `foreground`, links in `muted-foreground`, `foreground` on hover):

| Shop | Build | Support |
| --- | --- | --- |
| CPUs → `/cpu` | PC Builder → `/builder` | Track Order → `/orders/track` |
| Graphics Cards → `/gpu` | Saved Builds → `/account/builds` | Shipping & Store Pickup → `/help/shipping` |
| Motherboards → `/motherboard` | Compatibility Guide → `/guides/compatibility` | Returns & Warranty → `/help/returns` |
| Memory → `/memory` | Build Guides → `/guides` | Privacy Policy → `/privacy` |
| Storage → `/storage` | | Terms of Service → `/terms` |
| Power Supplies → `/psu` | | |

Links point to their planned routes and 404 until those stories ship. Shop slugs match the category registry. Links are defined once as data, not hard-coded in markup.

**Bottom bar**, one row: "© {year} PC Silicon · A concept project by Romulo Ramos Jr." on the left; on the right a `primary` pill button with a mail icon and `romu.dev@outlook.com` (a `mailto:` link), then GitHub (`https://github.com/romulojr-dev`) and LinkedIn (`https://www.linkedin.com/in/romulo-dev/`) icon links. Brand icons are inline SVGs, since lucide no longer ships brand logos.

## Page container and spacing

- One shared container: `mx-auto w-full max-w-7xl` (1280 px) with 24 px side padding. Used by `<main>` content and the footer.
- Built for 1280 px, usable at 1024 px with no horizontal scroll and no overlapping content. Layout uses flex and grid only; widths are `max-w-*`, `minmax()` or fractions, never fixed `w-[…px]` on layout elements.
- The body is a full-height flex column, so the footer sits at the bottom on short pages.

## Fonts and title

- Fonts load with `next/font` only (no `<link>` to Google Fonts). Keep Geist as `--font-sans` and Geist Mono as `--font-mono`.
- Root `metadata`: `title: { template: "%s | PC Silicon", default: "PC Silicon" }` plus a default description. Pages set only their own title, e.g. `"Graphics Cards"` → "Graphics Cards | PC Silicon".

## Theme colors

- Shell components use only token utilities (`bg-background`, `text-muted-foreground`, `bg-primary`, `border-border`, `ring-ring`, …). No hex, `oklch()`, or palette classes such as `bg-zinc-900` in components.
- The current neutral tokens in `:root` and `.dark` already match both mockups. Change them only where the mockups disagree.
- Light and dark both work and follow the system setting through the existing `ThemeProvider`.

## Accessibility (WCAG 2.1 AA)

- **Skip link:** the first focusable element on the page, "Skip to content", visually hidden until focused, targeting `<main id="main-content" tabIndex={-1}>`.
- **Landmarks:** exactly one `<header>`, `<main>` and `<footer>` per page. Footer link columns are `<nav>` elements labelled by their headings.
- **Visible focus:** every link, button and input shows a `focus-visible` ring in `ring`, in both themes. Never `outline: none` without a replacement.
- **Labels:** icon-only links have an `aria-label` (Cart, Account, GitHub, LinkedIn); their icons are `aria-hidden`. The search and email inputs have labels (visually hidden is fine), not just placeholders.
- **Contrast:** text, including `muted-foreground` links and placeholders, meets 4.5:1 in both themes.
- Keyboard order follows visual order: skip link → search → logo → PC Builder → cart → account → main → footer.

## Acceptance criteria

- [ ] Header and footer match the mockups in light and dark at 1280 px.
- [ ] At 1024 px: no horizontal scroll, logo still centred, footer columns do not overlap.
- [ ] A page with title "Test" renders `<title>Test | PC Silicon</title>`; the home page renders "PC Silicon".
- [ ] Changing `--primary` in `globals.css` recolors the PC Builder and email buttons with no component edits.
- [ ] Tab from page load reaches the skip link first, and activating it moves focus to `<main>`.
- [ ] axe reports no violations on the home page in either theme.
- [ ] `pnpm lint` and `pnpm typecheck` pass.

## Out of scope

- Category mega-menu (FR-1).
- Working search, newsletter signup, and search suggestions.
- Cart count, account menu, and auth state in the header.
- Mobile layout and the mobile bottom-sheet menu (Phase 2).
- A theme toggle in the UI.
- The pages behind the header and footer links.
- Home page content (FR-2).

## Resolved questions

| # | Question | Decision |
| --- | --- | --- |
| R1 | GitHub and LinkedIn profile URLs | `https://github.com/romulojr-dev` and `https://www.linkedin.com/in/romulo-dev/` |
| R2 | Should "Subscribe" be disabled until the feature exists? | No. Enabled, `type="button"`, does nothing |

## Open questions

None.
