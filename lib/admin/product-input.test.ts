import { describe, expect, it } from "vitest"

import {
  createProductSchema,
  isCalendarDate,
  lockedFieldErrors,
  shipDateError,
  type ProductFormInput,
  type StoredProduct,
  updateProductSchema,
  validateProductFields,
} from "./product-input"

const valid: ProductFormInput = {
  categorySlug: "psu",
  name: "Corsair RM1000e",
  sku: "RM1000E-TEST",
  slug: "corsair-rm1000e",
  brandId: "brand_1",
  featured: false,
  price: "9,499.5",
  salePrice: "",
  description: "",
  weightGrams: "2100",
  warrantyMonths: "120",
  boxContents: "PSU\r\n\r\n  Cables  \n",
  preorderShipsOn: "",
  specs: {},
}

const TODAY = "2026-11-06"

describe("validateProductFields", () => {
  it("normalizes a valid form (E7)", () => {
    const result = validateProductFields(valid, null, TODAY)
    expect(result).toEqual({
      ok: true,
      value: {
        categorySlug: "psu",
        name: "Corsair RM1000e",
        sku: "RM1000E-TEST",
        slug: "corsair-rm1000e",
        brandId: "brand_1",
        isFeatured: false,
        price: 949950,
        salePrice: null,
        description: null,
        weightGrams: 2100,
        warrantyMonths: 120,
        boxContents: ["PSU", "Cables"],
        preorderShipsOn: null,
      },
    })
  })

  it("reports every problem at once", () => {
    const result = validateProductFields(
      {
        ...valid,
        name: "ab",
        sku: "",
        slug: "Bad Slug",
        brandId: "",
        price: "1299.505",
        weightGrams: "0",
        warrantyMonths: "121",
        categorySlug: "monitors",
      },
      null,
      TODAY
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual([
      "brandId",
      "categorySlug",
      "name",
      "price",
      "sku",
      "slug",
      "warrantyMonths",
      "weightGrams",
    ])
    expect(result.errors.price).toBe("Enter a price in pesos, like 1,299.50.")
  })

  it("requires the sale price to be below the price (E13, E14)", () => {
    const equal = validateProductFields(
      { ...valid, price: "1000", salePrice: "1000" },
      null,
      TODAY
    )
    expect(equal.ok).toBe(false)
    if (!equal.ok) {
      expect(equal.errors.salePrice).toBe(
        "Sale price must be lower than the price."
      )
    }
    const lower = validateProductFields(
      { ...valid, price: "20,000", salePrice: "15,000" },
      null,
      TODAY
    )
    expect(lower.ok && lower.value.salePrice).toBe(1500000)
    const raised = validateProductFields(
      { ...valid, price: "14,000", salePrice: "15,000" },
      null,
      TODAY
    )
    expect(raised.ok).toBe(false)
  })

  it("treats a blank sale price as no sale (E12f)", () => {
    const result = validateProductFields(
      { ...valid, salePrice: "  " },
      null,
      TODAY
    )
    expect(result.ok && result.value.salePrice).toBeNull()
  })

  it("refuses a blank price", () => {
    const result = validateProductFields({ ...valid, price: "" }, null, TODAY)
    expect(result.ok).toBe(false)
  })

  it("caps box contents", () => {
    const many = Array.from({ length: 31 }, (_, i) => `item ${i}`).join("\n")
    const result = validateProductFields(
      { ...valid, boxContents: many },
      null,
      TODAY
    )
    expect(result.ok).toBe(false)
  })
})

describe("shipDateError (E14a–E14c)", () => {
  it("accepts today and later, refuses the past", () => {
    expect(shipDateError("2026-11-06", null, TODAY)).toBeNull()
    expect(shipDateError("2027-01-15", null, TODAY)).toBeNull()
    expect(shipDateError("2026-11-05", null, TODAY)).toBe(
      "The ship date can't be in the past."
    )
  })

  it("is empty-safe and checks the calendar", () => {
    expect(shipDateError("", "2020-01-01", TODAY)).toBeNull()
    expect(shipDateError("2026-02-30", null, TODAY)).toBe("Enter a valid date.")
    expect(shipDateError("tomorrow", null, TODAY)).toBe("Enter a valid date.")
    expect(isCalendarDate("2028-02-29")).toBe(true)
    expect(isCalendarDate("2027-02-29")).toBe(false)
  })

  it("does not re-check an unchanged past date, but checks a changed one", () => {
    expect(shipDateError("2026-10-01", "2026-10-01", TODAY)).toBeNull()
    expect(shipDateError("2026-10-02", "2026-10-01", TODAY)).toBe(
      "The ship date can't be in the past."
    )
    const result = validateProductFields(
      { ...valid, preorderShipsOn: "2026-10-01" },
      {
        status: "DRAFT",
        sku: "RM1000E-TEST",
        slug: "corsair-rm1000e",
        categorySlug: "psu",
        preorderShipsOn: "2026-10-01",
      },
      TODAY
    )
    expect(result.ok).toBe(true)
  })
})

describe("lockedFieldErrors (E23)", () => {
  const active: StoredProduct = {
    status: "ACTIVE",
    sku: "ACFRE00136A",
    slug: "arctic-liquid-freezer-iii-360",
    categorySlug: "cpu-cooler",
    preorderShipsOn: null,
  }
  const same = {
    sku: "ACFRE00136A",
    slug: active.slug,
    categorySlug: "cpu-cooler",
  }

  it("allows nothing to change on an Active product but allows the same values", () => {
    expect(lockedFieldErrors(active, same)).toEqual({})
    expect(
      Object.keys(
        lockedFieldErrors(active, {
          sku: "X",
          slug: "y-z",
          categorySlug: "gpu",
        })
      ).sort()
    ).toEqual(["categorySlug", "sku", "slug"])
  })

  it("allows everything on a draft", () => {
    expect(
      lockedFieldErrors(
        { ...active, status: "DRAFT" },
        {
          sku: "X",
          slug: "y-z",
          categorySlug: "gpu",
        }
      )
    ).toEqual({})
  })
})

describe("transport schemas (D10, R7)", () => {
  it("refuses keys the form can't send", () => {
    for (const extra of ["stock", "effectivePrice", "searchVector", "status"]) {
      expect(
        createProductSchema.safeParse({ ...valid, [extra]: 1 }).success
      ).toBe(false)
    }
    expect(createProductSchema.safeParse(valid).success).toBe(true)
  })

  it("update needs an id and an integer version", () => {
    expect(
      updateProductSchema.safeParse({ ...valid, id: "p1", expectedVersion: 0 })
        .success
    ).toBe(true)
    expect(
      updateProductSchema.safeParse({ ...valid, id: "p1", expectedVersion: -1 })
        .success
    ).toBe(false)
    expect(updateProductSchema.safeParse({ ...valid, id: "p1" }).success).toBe(
      false
    )
  })
})
