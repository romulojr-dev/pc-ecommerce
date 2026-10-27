import { describe, expect, test } from "vitest"

import type { StockStatus } from "@/lib/stock"

import {
  breadcrumbJsonLd,
  formatPriceAmount,
  type JsonLdProduct,
  productJsonLd,
  serializeJsonLd,
} from "./json-ld"

const SITE = "https://pcsilicon.ph"

const product: JsonLdProduct = {
  name: "AMD Ryzen 5 7600",
  slug: "amd-ryzen-5-7600",
  sku: "100-100001015BOX",
  description: "6 cores, 12 threads, AM5.",
  brand: "AMD",
  category: { slug: "cpu" },
  effectivePrice: 1_299_900,
  preorderShipsOn: null,
  images: [
    { url: "/images/placeholders/cpu.svg" },
    { url: "https://cdn.example.com/ryzen-box.png" },
  ],
}

const build = (status: StockStatus, overrides: Partial<JsonLdProduct> = {}) =>
  productJsonLd({
    product: { ...product, ...overrides },
    status,
    siteUrl: SITE,
  })

describe("formatPriceAmount", () => {
  test.each([
    { centavos: 1_299_900, expected: "12999.00" },
    { centavos: 1_299_950, expected: "12999.50" },
    { centavos: 1_299_905, expected: "12999.05" },
    { centavos: 5, expected: "0.05" },
    { centavos: 0, expected: "0.00" },
  ])("$centavos centavos is $expected", ({ centavos, expected }) => {
    expect(formatPriceAmount(centavos)).toBe(expected)
  })
})

describe("productJsonLd", () => {
  test("describes the product and its offer", () => {
    expect(build("in-stock")).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "AMD Ryzen 5 7600",
      image: [
        "https://pcsilicon.ph/images/placeholders/cpu.svg",
        "https://cdn.example.com/ryzen-box.png",
      ],
      description: "6 cores, 12 threads, AM5.",
      sku: "100-100001015BOX",
      brand: { "@type": "Brand", name: "AMD" },
      offers: {
        "@type": "Offer",
        url: "https://pcsilicon.ph/cpu/amd-ryzen-5-7600",
        priceCurrency: "PHP",
        price: "12999.00",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    })
  })

  test("the price is the effective price, so a sale price when on sale", () => {
    // Listed at ₱15,000, on sale for ₱10,500: effectivePrice is the sale price
    expect(build("in-stock", { effectivePrice: 1_050_000 }).offers.price).toBe(
      "10500.00"
    )
  })

  test.each([
    { status: "in-stock", expected: "https://schema.org/InStock" },
    { status: "low-stock", expected: "https://schema.org/InStock" },
    { status: "pre-order", expected: "https://schema.org/PreOrder" },
    { status: "out-of-stock", expected: "https://schema.org/OutOfStock" },
  ] as const)("$status is $expected", ({ status, expected }) => {
    expect(build(status).offers.availability).toBe(expected)
  })

  test("a pre-order gives its ship date as availabilityStarts", () => {
    const offers = build("pre-order", { preorderShipsOn: "2027-01-15" }).offers
    expect(offers).toMatchObject({
      availability: "https://schema.org/PreOrder",
      availabilityStarts: "2027-01-15",
    })
  })

  test("only a pre-order has availabilityStarts", () => {
    // A passed ship date ends the pre-order, but the column may still be set
    const offers = build("in-stock", { preorderShipsOn: "2026-01-15" }).offers
    expect(offers).not.toHaveProperty("availabilityStarts")
  })

  test("leaves out description and image when there are none", () => {
    const data = build("in-stock", { description: null, images: [] })
    expect(data).not.toHaveProperty("description")
    expect(data).not.toHaveProperty("image")
  })

  test("has no ratings or reviews", () => {
    const data = build("in-stock")
    expect(data).not.toHaveProperty("aggregateRating")
    expect(data).not.toHaveProperty("review")
  })
})

describe("breadcrumbJsonLd", () => {
  test("lists the trail in order, with no URL on the current page", () => {
    const data = breadcrumbJsonLd(
      [
        { name: "Home", path: "/" },
        { name: "CPU", path: "/cpu" },
        { name: "AMD Ryzen 5 7600" },
      ],
      SITE
    )
    expect(data).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://pcsilicon.ph",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "CPU",
          item: "https://pcsilicon.ph/cpu",
        },
        { "@type": "ListItem", position: 3, name: "AMD Ryzen 5 7600" },
      ],
    })
  })
})

describe("serializeJsonLd", () => {
  const hostile = build("in-stock", {
    name: "</script><script>alert(1)</script>",
    description: "Fast & quiet <!-- --> > 9000",
    brand: 'Quote " and backslash \\',
  })

  test("leaves no <, > or & in the output, so the script can't be closed", () => {
    const text = serializeJsonLd(hostile)
    expect(text).not.toMatch(/[<>&]/)
    expect(text).not.toContain("</script")
    expect(text).not.toContain("<!--")
  })

  test("parses back to exactly the same data", () => {
    expect(JSON.parse(serializeJsonLd(hostile))).toEqual(hostile)
  })

  test("leaves ordinary text unchanged", () => {
    const data = { name: "AMD Ryzen 5 7600" }
    expect(serializeJsonLd(data)).toBe(JSON.stringify(data))
  })
})
