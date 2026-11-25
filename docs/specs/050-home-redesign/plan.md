# Plan: spec 050 — Home redesign

Spec: [spec.md](spec.md). Checklist: [tasks.md](tasks.md). Branch: `home-redesign`, from `main`.

- **Dependency:** `motion` (the current name of framer-motion), for the drawer's slide, the SVG path animation of the curved edge and the letter ripple. CSS can't animate an SVG `d` in every browser, and Base UI documents rendering its `Dialog.Popup` and `Backdrop` as `motion.div` inside `AnimatePresence` with `Portal keepMounted`.
- **Drawer:** `CategoryMenu` stays a server component (cached categories, static pages) and renders the client `CategoryDrawer`. The edge is a `100 × 100` SVG stretched with `preserveAspectRatio="none"`, so no `window.innerHeight` read and nothing to break on resize.
- **Shimmer:** the component from the brief, plus `ShimmerLink` for navigation (a `<button>` can't be a link). Its keyframes live in a `@theme inline` block in `globals.css` (Tailwind v4 has no config file; inline because the values read `--speed` from the element). Its radius variable is `--shimmer-radius`, since setting `--radius: var(--radius)` would be a cycle.
- **Home:** new files under the brief's names; `hero.tsx`, `wafer-illustration.tsx` and `category-tiles.tsx` removed (no other users). `category-icons.ts` stays for the placeholder script.
