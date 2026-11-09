import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { ProductImages, type ProductImagesProps } from "./product-images"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock("@/app/admin/(shell)/products/actions", () => ({
  removeProductImageAction: vi.fn(),
  reorderProductImagesAction: vi.fn(),
  setImageAltAction: vi.fn(),
}))

// docs/specs/049-product-images-upload: the Photos section as markup (B1–B5,
// B9, B10, Demo). The upload, the moves, the dialog and the results are
// driven in a browser by e2e/admin-images.spec.ts.

const BASE = "https://abc123.public.blob.vercel-storage.com/products"
const photo = (n: number) => ({
  id: `img${n}`,
  url: `${BASE}/p${n}.webp`,
  alt: `AMD Ryzen 5 7600 photo ${n}`,
})
const placeholder = {
  url: "/images/placeholders/cpu.svg",
  alt: "AMD Ryzen 5 7600",
}

// The disabled ATTRIBUTE: Tailwind's `disabled:` classes contain the word too
const isDisabled = (tag: string) => /\sdisabled(=|\s|>)/.test(tag)

function html(over: Partial<ProductImagesProps> = {}) {
  return renderToStaticMarkup(
    <ProductImages
      productId="prod1"
      productName="AMD Ryzen 5 7600"
      categoryName="CPU"
      placeholder={placeholder}
      images={[]}
      next={null}
      readOnly={false}
      {...over}
    />
  )
}

describe("ProductImages", () => {
  it("B3: with no photo it shows the placeholder, the sentence and the upload", () => {
    const out = html()
    expect(out).toContain("Photos")
    expect(out).toContain(
      "No photos yet. The store shows the CPU placeholder until you add one."
    )
    expect(out).toContain("cpu.svg")
    expect(out).toContain("Add photos")
    expect(out).toContain(
      "JPEG, PNG or WebP, up to 4 MB each. Up to 8 photos per product."
    )
    expect(out).not.toContain("Main image")
  })

  it("B5: the upload takes several files, as a hint of the allowed types", () => {
    const out = html()
    expect(out).toContain('type="file"')
    expect(out).toContain("multiple")
    expect(out).toContain('accept="image/jpeg,image/png,image/webp"')
  })

  it("B4: a single photo is the main image automatically, with only its alt and Remove", () => {
    const out = html({ images: [photo(1)] })
    expect(out).toContain("Main image")
    expect(out).toContain('value="AMD Ryzen 5 7600 photo 1"')
    expect(out).toContain("Remove photo 1")
    expect(out).not.toContain("Move photo")
    expect(out).not.toContain("Make photo")
    expect(out).not.toContain("placeholder until you add")
  })

  it("B4: several photos: badge on the first only, moves where they make sense", () => {
    const out = html({ images: [photo(1), photo(2), photo(3)] })
    expect(out.match(/Main image/g)).toHaveLength(1)
    // The first has no Move up or Make main; the last has no Move down
    expect(out).not.toContain("Move photo 1 up")
    expect(out).not.toContain("Make photo 1 the main image")
    expect(out).toContain("Move photo 1 down")
    expect(out).toContain("Move photo 2 up")
    expect(out).toContain("Move photo 2 down")
    expect(out).toContain("Make photo 2 the main image")
    expect(out).toContain("Move photo 3 up")
    expect(out).not.toContain("Move photo 3 down")
    expect(out).toContain("Make photo 3 the main image")
    for (const n of [1, 2, 3]) expect(out).toContain(`Remove photo ${n}`)
  })

  it("photos are listed in the order given", () => {
    const out = html({ images: [photo(2), photo(1)] })
    expect(out.indexOf("p2.webp")).toBeLessThan(out.indexOf("p1.webp"))
  })

  it("every row has an alt text field with its help text", () => {
    const out = html({ images: [photo(1), photo(2)] })
    expect(out.match(/Alt text/g)?.length).toBeGreaterThanOrEqual(2)
    expect(out).toContain(
      "Describe the photo for shoppers who use a screen reader."
    )
    // Save only appears once the text changed
    expect(out).not.toContain("Save alt text")
  })

  it("Demo sees the section with every control disabled and the read-only note", () => {
    const out = html({ images: [photo(1), photo(2)], readOnly: true })
    // The markup escapes the apostrophe
    expect(out).toContain("Photos can&#x27;t be changed with this account.")
    // The form above says the other sentence; the page must not repeat it
    expect(out).not.toContain("This account is read-only.")
    // The file input and each button carry the disabled attribute
    const inputs = out.match(/<input[^>]*>/g) ?? []
    expect(inputs.length).toBeGreaterThan(0)
    for (const input of inputs) expect(isDisabled(input)).toBe(true)
    const buttons = out.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(isDisabled(button)).toBe(true)
  })

  it("Owner's controls are enabled", () => {
    const out = html({ images: [photo(1), photo(2)] })
    const buttons = out.match(/<button[^>]*>/g) ?? []
    for (const button of buttons) expect(isDisabled(button)).toBe(false)
  })

  it("the result box and the next-product link are not there before an upload", () => {
    const out = html({
      images: [photo(1)],
      next: { id: "p2", name: "Next one" },
    })
    expect(out).not.toContain("Photos added.")
    expect(out).not.toContain("Next product without photos")
  })

  it("B13: no stale notice or error to start with", () => {
    const out = html({ images: [photo(1)] })
    expect(out).not.toContain("These photos changed")
    expect(out).not.toContain('role="alert"')
  })
})
