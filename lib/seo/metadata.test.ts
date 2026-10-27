import { describe, expect, test } from "vitest"

import { DEFAULT_OG_IMAGE, isRasterImage, socialMetadata } from "./metadata"

describe("isRasterImage", () => {
  test.each([
    { url: "/images/products/ryzen.png", expected: true },
    { url: "https://cdn.example.com/ryzen.JPG", expected: true },
    { url: "https://cdn.example.com/ryzen.jpeg?w=800", expected: true },
    { url: "/images/ryzen.webp#front", expected: true },
    { url: "/images/placeholders/cpu.svg", expected: false },
    { url: "https://cdn.example.com/ryzen.svg?v=2", expected: false },
    { url: "https://cdn.example.com/image?format=png", expected: false },
  ])("$url → $expected", ({ url, expected }) => {
    expect(isRasterImage(url)).toBe(expected)
  })
})

describe("socialMetadata", () => {
  const base = {
    title: "AMD Ryzen 5 7600",
    description: "6 cores, 12 threads, AM5.",
    path: "/cpu/amd-ryzen-5-7600",
  }

  test("sets Open Graph for the page, with the default image", () => {
    expect(socialMetadata(base)).toEqual({
      openGraph: {
        type: "website",
        siteName: "PC Silicon",
        locale: "en_PH",
        url: "/cpu/amd-ryzen-5-7600",
        title: "AMD Ryzen 5 7600",
        description: "6 cores, 12 threads, AM5.",
        images: [DEFAULT_OG_IMAGE],
      },
      twitter: { card: "summary_large_image" },
    })
  })

  test("uses a raster product image with the small card", () => {
    const image = { url: "/images/products/ryzen.png", alt: "Ryzen box" }
    const data = socialMetadata({ ...base, image })
    expect(data.openGraph?.images).toEqual([image])
    expect(data.twitter).toEqual({ card: "summary" })
  })

  test("falls back to the default image for an SVG", () => {
    const image = { url: "/images/placeholders/cpu.svg", alt: "CPU" }
    const data = socialMetadata({ ...base, image })
    expect(data.openGraph?.images).toEqual([DEFAULT_OG_IMAGE])
    expect(data.twitter).toEqual({ card: "summary_large_image" })
  })

  test("leaves out the URL when there's no path", () => {
    const data = socialMetadata({ title: "Search", description: "Results" })
    expect(data.openGraph).not.toHaveProperty("url")
  })
})
