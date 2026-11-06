import { describe, expect, it } from "vitest"

import { formFromProduct, errorItems, emptyProductForm } from "./product-form"
import type { ProductForEdit } from "./queries/products"

const product: ProductForEdit = {
  id: "p1",
  status: "DRAFT",
  name: "Corsair RM1000e",
  sku: "RM1000E-TEST",
  slug: "corsair-rm1000e",
  categorySlug: "psu",
  brandId: "b1",
  isFeatured: true,
  price: 949950,
  salePrice: null,
  description: null,
  stock: 0,
  weightGrams: 2100,
  warrantyMonths: 120,
  boxContents: ["PSU", "Cables"],
  preorderShipsOn: "2027-01-15",
  specs: {
    formFactor: "ATX",
    wattageW: 1000,
    efficiencyRating: "GOLD",
    modularity: "FULL",
  },
  editVersion: 3,
  updatedAt: "2026-11-06T00:00:00.000Z",
}

describe("formFromProduct", () => {
  it("turns stored values into form text", () => {
    expect(formFromProduct(product)).toMatchObject({
      price: "9499.50",
      salePrice: "",
      description: "",
      weightGrams: "2100",
      boxContents: "PSU\nCables",
      preorderShipsOn: "2027-01-15",
      featured: true,
      specs: { wattageW: "1000", formFactor: "ATX" },
    })
  })
})

describe("emptyProductForm", () => {
  it("starts with the category and a 12-month warranty", () => {
    expect(emptyProductForm("gpu")).toMatchObject({
      categorySlug: "gpu",
      warrantyMonths: "12",
      price: "",
    })
  })
})

describe("errorItems", () => {
  it("lists each error once, in form order, spec fields in metadata order", () => {
    const items = errorItems(
      {
        "specs.wattageW": "required",
        price: "bad",
        name: "short",
        "specs.formFactor": "required",
        specs: "whole",
      },
      "psu"
    )
    expect(items.map((i) => i.key)).toEqual([
      "name",
      "price",
      "specs.wattageW",
      "specs.formFactor",
      "specs",
    ])
    expect(items[2].label).toBe("Wattage")
  })
})
