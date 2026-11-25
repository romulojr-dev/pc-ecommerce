import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { CategoryGrid, categoryTiles } from "@/components/home/category-grid"
import { HeroBanner } from "@/components/home/hero-banner"
import { TrustStrip } from "@/components/home/trust-strip"
import { ROSETTE_PATH } from "@/components/icons/genuine-seal-icon"
import { builderCategories } from "@/lib/specs/registry"

// The seeded categories, in their database order (sortOrder)
const seeded = Object.entries(builderCategories)
  .toSorted(([, a], [, b]) => a.sortOrder - b.sortOrder)
  .map(([slug, { name }]) => ({ slug, name }))

test("the tiles use the design's labels and order and keep the slugs", () => {
  expect(categoryTiles(seeded)).toEqual([
    { label: "CPU", href: "/cpu" },
    { label: "Graphics Card", href: "/gpu" },
    { label: "Mobo", href: "/motherboard" },
    { label: "Memory", href: "/memory" },
    { label: "Storage", href: "/storage" },
    { label: "Power Supply", href: "/psu" },
    { label: "Case", href: "/case" },
    { label: "Cooling", href: "/cpu-cooler" },
  ])
})

test("a missing category has no tile, and an unknown one keeps its name", () => {
  const tiles = categoryTiles([
    { slug: "cpu", name: "CPU" },
    { slug: "monitor", name: "Monitor" },
  ])
  expect(tiles).toEqual([
    { label: "CPU", href: "/cpu" },
    { label: "Monitor", href: "/monitor" },
  ])
})

test("no categories render no section", () => {
  expect(renderToStaticMarkup(<CategoryGrid categories={[]} />)).toBe("")
})

test("the hero is one h1 with light and bold words and no links", () => {
  const html = renderToStaticMarkup(<HeroBanner />)
  expect(html.match(/<h1/g)).toHaveLength(1)
  expect(html).toContain('aria-labelledby="hero-title"')
  expect(html).toContain("font-light")
  expect(html.match(/<strong class="font-bold">/g)).toHaveLength(3)
  // A no-break space keeps "and" with "solid value."
  expect(html).toContain("and <strong")
  expect(html).not.toMatch(/<a |<button/)
})

test("the trust strip has three items with decorative icons", () => {
  const html = renderToStaticMarkup(<TrustStrip />)
  expect(html).toContain('aria-label="Why shop with PC Silicon"')
  expect(html.match(/<li/g)).toHaveLength(3)
  expect(html.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(3)
  expect(html).not.toMatch(/<h[1-6]/)
  for (const title of ["Fast delivery", "Genuine parts", "Flexible payment"]) {
    expect(html).toContain(title)
  }
})

test("the seal's rosette has 180 points and closes", () => {
  expect(ROSETTE_PATH.startsWith("M32.00 3.10 L")).toBe(true)
  expect(ROSETTE_PATH.endsWith("Z")).toBe(true)
  expect(ROSETTE_PATH.split(" L")).toHaveLength(180)
})
