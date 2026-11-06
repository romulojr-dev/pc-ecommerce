import { describe, expect, it } from "vitest"

import { seedParts } from "@/test-support/seed-parts"

import {
  formValuesFromSpecs,
  specFormFields,
  specsFromForm,
  visibleSpecFields,
} from "./form-fields"
import { fieldSchemas } from "./fields"
import { builderCategories, type BuilderCategorySlug } from "./registry"
import { validateSpecs } from "./index"

const categories = Object.keys(builderCategories) as BuilderCategorySlug[]

describe("specFormFields", () => {
  it.each(categories)(
    "%s: one form field per metadata field, in order",
    (c) => {
      const form = specFormFields(c)
      expect(form.fields.map((f) => f.key)).toEqual(
        Object.keys(builderCategories[c].fields)
      )
      // every schema key is a form field (R2)
      for (const key of fieldSchemas(builderCategories[c].schema).keys()) {
        expect(form.fields.some((f) => f.key === key)).toBe(true)
      }
    }
  )

  it.each(categories)(
    "%s: choices have options, labels come from metadata",
    (c) => {
      for (const field of specFormFields(c).fields) {
        if (field.kind === "enum" || field.kind === "enum-list") {
          expect(field.options.length).toBeGreaterThan(0)
        } else {
          expect(field.options).toEqual([])
        }
      }
    }
  )

  it("marks kinds, required flags and units (E7)", () => {
    const psu = specFormFields("psu").fields
    const byKey = Object.fromEntries(psu.map((f) => [f.key, f]))
    expect(byKey.wattageW).toMatchObject({
      kind: "integer",
      required: true,
      unit: "W",
    })
    expect(byKey.formFactor.kind).toBe("enum")
    expect(byKey.formFactor.options.some((o) => o.value === "ATX")).toBe(true)
    expect(
      specFormFields("cpu").fields.find(
        (f) => f.key === "hasIntegratedGraphics"
      )?.kind
    ).toBe("boolean")
    expect(
      specFormFields("motherboard").fields.find(
        (f) => f.key === "nativeCpuGenerations"
      )?.kind
    ).toBe("enum-list")
    expect(
      specFormFields("gpu").fields.find((f) => f.key === "chipset")?.kind
    ).toBe("text")
  })

  it("numeric choices keep numbers: radiator sizes", () => {
    const sizes = specFormFields("case").fields.find(
      (f) => f.key === "radiatorSizesMm"
    )!
    expect(sizes.kind).toBe("enum-list")
    expect(sizes.numeric).toBe(true)
    expect(sizes.options.map((o) => o.value)).toContain("360")
  })

  it("the cooler form shows height for Air and radiator size for AIO (E11)", () => {
    const form = specFormFields("cpu-cooler")
    expect(form.discriminator).toBe("type")
    const keys = (type: string) =>
      visibleSpecFields(form, { type })
        .map((f) => f.key)
        .sort()
    expect(keys("AIR")).toEqual(["heightMm", "supportedSockets", "type"])
    expect(keys("AIO")).toEqual(["radiatorSizeMm", "supportedSockets", "type"])
    expect(keys("")).toEqual(["supportedSockets", "type"])
  })
})

describe("specsFromForm", () => {
  it("reports text that isn't a whole number and unknown keys", () => {
    const { errors } = specsFromForm("psu", {
      wattageW: "12.5",
      sneaky: "1",
    })
    expect(errors).toEqual({
      wattageW: "Enter a whole number.",
      sneaky: "Not a field of this category.",
    })
  })

  it("leaves blank fields out so the schema says required (E8)", () => {
    const { specs } = specsFromForm("psu", {
      formFactor: "ATX",
      wattageW: "",
      efficiencyRating: "GOLD",
      modularity: "FULL",
    })
    expect(specs).toEqual({
      formFactor: "ATX",
      efficiencyRating: "GOLD",
      modularity: "FULL",
    })
    const result = validateSpecs("psu", specs)
    expect(result.success).toBe(false)
  })

  it("sends no height for an AIO and drops the other type's value (E11)", () => {
    const { specs } = specsFromForm("cpu-cooler", {
      type: "AIO",
      radiatorSizeMm: "360",
      heightMm: "155",
      supportedSockets: ["AM5"],
    })
    expect(specs).toEqual({
      type: "AIO",
      radiatorSizeMm: 360,
      supportedSockets: ["AM5"],
    })
    expect(validateSpecs("cpu-cooler", specs).success).toBe(true)
  })
})

describe("every seed part round-trips through the form values", () => {
  for (const category of categories) {
    const parts = seedParts(category)
    it(`${category}: ${parts.length} parts`, () => {
      expect(parts.length).toBeGreaterThan(0)
      for (const part of parts) {
        const values = formValuesFromSpecs(category, part.specs)
        const { specs, errors } = specsFromForm(category, values)
        expect(errors, part.id).toEqual({})
        expect(specs, part.id).toEqual(part.specs)
        expect(validateSpecs(category, specs).success, part.id).toBe(true)
      }
    })
  }
})
