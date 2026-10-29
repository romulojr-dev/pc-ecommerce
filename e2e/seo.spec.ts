import type { Page } from "@playwright/test"

import { expect, test } from "./test"

// SEO for catalog pages (docs/specs/017-seo). Needs a seeded database. The
// site URL is the one the app is configured with (.env.local and CI both use
// the dev server's origin), so absolute URLs start with it.

const SITE = "http://localhost:3000"
const PRODUCT = "/cpu/amd-ryzen-5-7600"

const canonical = (page: Page) => page.locator('link[rel="canonical"]')
const meta = (page: Page, attribute: "name" | "property", value: string) =>
  page.locator(`meta[${attribute}="${value}"]`)

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const scripts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  return scripts.map((text) => JSON.parse(text))
}

test.describe("sitemap.xml", () => {
  test("lists the home page, categories and products, and no listing variants", async ({
    request,
  }) => {
    const response = await request.get("/sitemap.xml")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("xml")

    const xml = await response.text()
    const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (match) => match[1]
    )

    expect(locations).toContain(SITE)
    expect(locations).toContain(`${SITE}/cpu`)
    expect(locations).toContain(`${SITE}${PRODUCT}`)
    expect(xml).toContain("<lastmod>")

    // Only canonical, indexable URLs
    for (const location of locations) {
      expect(location, "starts with the site URL").toMatch(
        new RegExp(`^${SITE}(/|$)`)
      )
      expect(location, "no filter, sort or page URLs").not.toContain("?")
    }
    expect(locations.some((url) => url.includes("/search"))).toBe(false)
    expect(locations.some((url) => url.endsWith("/builder"))).toBe(false)
    // Shared builds (docs/specs/022-share-build, E38)
    expect(locations.some((url) => url.includes("/builds"))).toBe(false)
  })
})

// A shopper's own build (docs/specs/020-builder-page, E57). The sitemap
// test above checks it isn't listed (E58).
test("/builder is not indexed", async ({ page }) => {
  await page.goto("/builder")
  await expect(meta(page, "name", "robots")).toHaveAttribute(
    "content",
    "noindex"
  )
})

test.describe("robots.txt", () => {
  test("allows crawling and points at the sitemap", async ({ request }) => {
    const response = await request.get("/robots.txt")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("text/plain")

    const text = await response.text()
    expect(text).toContain(`Sitemap: ${SITE}/sitemap.xml`)
    // Disallowing /search would hide its noindex tag from crawlers
    expect(text).not.toMatch(/^Disallow:\s*\S/m)
  })
})

test.describe("canonical URLs", () => {
  const cases = [
    { path: "/", expected: SITE },
    { path: "/cpu", expected: `${SITE}/cpu` },
    // Each page is canonical to itself, not to page 1
    { path: "/cpu?page=2", expected: `${SITE}/cpu?page=2` },
    { path: PRODUCT, expected: `${SITE}${PRODUCT}` },
    { path: "/builder", expected: `${SITE}/builder` },
  ]
  for (const { path, expected } of cases) {
    test(`${path} is canonical to ${expected}`, async ({ page }) => {
      await page.goto(path)
      await expect(canonical(page)).toHaveAttribute("href", expected)
    })
  }
})

test.describe("link previews", () => {
  const cases = [
    { path: "/", title: "PC Silicon" },
    { path: "/cpu", title: "CPU" },
    { path: PRODUCT, title: "AMD Ryzen 5 7600" },
  ]
  for (const { path, title } of cases) {
    test(`${path} has Open Graph and Twitter tags`, async ({ page }) => {
      await page.goto(path)

      await expect(meta(page, "property", "og:title")).toHaveAttribute(
        "content",
        title
      )
      await expect(meta(page, "property", "og:image")).toHaveAttribute(
        "content",
        /^http:\/\/localhost:3000\/.+\.(png|jpe?g|webp)$/
      )
      await expect(meta(page, "property", "og:url")).toHaveAttribute(
        "content",
        new RegExp(`^${SITE}`)
      )
      await expect(meta(page, "name", "twitter:card")).toHaveAttribute(
        "content",
        /^summary(_large_image)?$/
      )
    })
  }

  test("the default site image is served", async ({ request }) => {
    const response = await request.get("/images/og-default.png")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toBe("image/png")
  })
})

test.describe("product structured data", () => {
  test("has Product and BreadcrumbList JSON-LD", async ({ page }) => {
    await page.goto(PRODUCT)
    const [product, breadcrumbs] = await jsonLd(page)

    expect(product).toMatchObject({
      "@type": "Product",
      name: "AMD Ryzen 5 7600",
      brand: { "@type": "Brand", name: "AMD" },
      offers: {
        "@type": "Offer",
        url: `${SITE}${PRODUCT}`,
        priceCurrency: "PHP",
        price: expect.stringMatching(/^\d+\.\d{2}$/),
        availability: expect.stringMatching(
          /^https:\/\/schema\.org\/(InStock|PreOrder|OutOfStock)$/
        ),
      },
    })
    expect(product.sku).toEqual(expect.any(String))
    expect(product).not.toHaveProperty("aggregateRating")
    expect(product).not.toHaveProperty("review")
    expect(breadcrumbs["@type"]).toBe("BreadcrumbList")

    // The structured price is the one the page shows
    const offers = product.offers as { price: string }
    const [pesos, centavos] = offers.price.split(".")
    const shown = `₱${Number(pesos).toLocaleString("en-US")}.${centavos}`
    await expect(page.getByRole("main")).toContainText(shown)
  })

  test("the breadcrumb list matches the visible breadcrumbs", async ({
    page,
  }) => {
    await page.goto(PRODUCT)
    const breadcrumbs = (await jsonLd(page))[1] as {
      itemListElement: { position: number; name: string; item?: string }[]
    }

    const nav = page.getByRole("navigation", { name: "Breadcrumb" })
    // The current page is a list item too, but not a link
    const visible = await nav.getByRole("listitem").allInnerTexts()
    expect(breadcrumbs.itemListElement.map((item) => item.name)).toEqual(
      visible.map((text) => text.trim())
    )
    expect(breadcrumbs.itemListElement.map((item) => item.position)).toEqual([
      1, 2, 3,
    ])
    expect(breadcrumbs.itemListElement.map((item) => item.item)).toEqual([
      SITE,
      `${SITE}/cpu`,
      undefined,
    ])
  })
})
