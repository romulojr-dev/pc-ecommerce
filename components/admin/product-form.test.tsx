import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { emptyProductForm } from "@/lib/admin/product-form"

import { ProductForm } from "./product-form"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/app/admin/(shell)/products/actions", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}))

const brands = [{ id: "b1", name: "Corsair" }]
const html = (props: Partial<React.ComponentProps<typeof ProductForm>> = {}) =>
  renderToStaticMarkup(
    <ProductForm
      mode="create"
      initial={emptyProductForm("psu")}
      brands={brands}
      readOnly={false}
      {...props}
    />
  )

describe("ProductForm", () => {
  it("generates the category's spec controls with units and required markers (B9)", () => {
    const out = html()
    expect(out).toContain("Wattage (W)")
    expect(out).toContain("Efficiency")
    expect(out).toContain("Form factor")
    expect(out).toContain('<span class="sr-only"> required</span>')
    expect(out).toContain("Save draft")
    expect(out).toContain("Stock: 0. Stock changes through Inventory.")
    expect(out).toContain(
      "Leave sale price empty when the product is not on sale."
    )
  })

  it("a cooler asks for the type and shows only that type's fields (E11)", () => {
    const air = html({
      initial: { ...emptyProductForm("cpu-cooler"), specs: { type: "AIR" } },
    })
    expect(air).toContain("Height (mm)")
    expect(air).not.toContain("Radiator size")
    const aio = html({
      initial: { ...emptyProductForm("cpu-cooler"), specs: { type: "AIO" } },
    })
    expect(aio).toContain("Radiator size (mm)")
    expect(aio).not.toContain("Height (mm)")
  })

  it("Demo's form is disabled and has no save button (B1)", () => {
    const out = html({ readOnly: true })
    expect(out).toContain("This account is read-only.")
    expect(out).toContain("<fieldset disabled")
    expect(out).not.toContain("Save draft")
  })

  it("an Active product's SKU, slug and category are locked text (E23)", () => {
    const out = html({
      mode: "edit",
      status: "ACTIVE",
      productId: "p1",
      initial: {
        ...emptyProductForm("psu"),
        sku: "X-1",
        slug: "x-1",
        name: "X",
      },
    })
    expect(out.match(/Locked while the product is on sale\./g)).toHaveLength(3)
    expect(out).toContain("Save changes")
  })

  it("a draft's category is a select (D3)", () => {
    const out = html({ mode: "edit", status: "DRAFT", productId: "p1" })
    expect(out).toMatch(/<select[^>]*id="[^"]*categorySlug"/)
  })
})
