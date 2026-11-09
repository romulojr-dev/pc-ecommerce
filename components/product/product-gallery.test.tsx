import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { ProductGallery } from "./product-gallery"

// The product page's gallery as markup (docs/specs/049-product-images-
// upload, B19, R18; spec 010). The dialog's arrows and counter only exist
// once it is open, so these tests cover what is on the page itself: the
// thumbnail strip and the Enlarge image button.

const NAME = "AMD Ryzen 5 7600"
const photo = (n: number) => ({
  url: `https://abc123.public.blob.vercel-storage.com/products/p${n}.webp`,
  alt: `${NAME} photo ${n}`,
})

function render(images: { url: string; alt: string }[], placeholder = false) {
  return renderToStaticMarkup(
    <ProductGallery
      images={images}
      placeholder={placeholder}
      productName={NAME}
    />
  )
}

describe("ProductGallery", () => {
  test("E1: one photo is the main image, with Enlarge image and no thumbnail strip", () => {
    const html = render([photo(1)])
    expect(html).toContain("Enlarge image")
    expect(html).not.toContain("Show image")
    expect(html).not.toContain("<ul")
    expect(html).toContain(`alt="${NAME} photo 1"`)
  })

  test("E2: several photos get a thumbnail strip, in order", () => {
    const html = render([photo(1), photo(2), photo(3)])
    expect(html).toContain("Enlarge image")
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`Show image ${n} of 3`)
    }
    expect(html.indexOf("Show image 1 of 3")).toBeLessThan(
      html.indexOf("Show image 2 of 3")
    )
  })

  test("the main image is the first photo", () => {
    const html = render([photo(2), photo(1)])
    // The first <img> in the page is the main image
    expect(html.indexOf("p2.webp")).toBeLessThan(html.indexOf("p1.webp"))
  })

  test("E30: the placeholder is a plain image with no Enlarge image", () => {
    const html = render(
      [{ url: "/images/placeholders/cpu.svg", alt: NAME }],
      true
    )
    expect(html).not.toContain("Enlarge image")
    expect(html).not.toContain("Show image")
    expect(html).toContain(`alt="${NAME}"`)
    expect(html).toContain("cpu.svg")
  })

  test("a category without placeholder artwork shows the labelled fallback", () => {
    const html = render([], true)
    expect(html).toContain(`No image available for ${NAME}`)
    expect(html).not.toContain("Enlarge image")
  })
})
