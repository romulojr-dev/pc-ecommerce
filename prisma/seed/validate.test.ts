import { assert, describe, expect, test } from "vitest"

import { placeholderUrl } from "@/lib/placeholders"
import { builderCategories, type FieldMeta } from "@/lib/specs"

import { seedFiles } from "./data"
import { formatErrors } from "./format-errors"
import { findReservedCategorySlugs, validateSeed } from "./validate"

type RawPart = { sku: string; specs: Record<string, unknown> }

// One case per spec field that a compatibility rule reads (FieldMeta.rules),
// so a field is covered as soon as it is tagged with a rule. The base part is
// the first seed part that has the field: union schemas (air vs AIO coolers)
// don't put every field on every part.
const ruleFieldCases = seedFiles.flatMap(({ file, category, parts }) => {
  const fields: Record<string, FieldMeta> = builderCategories[category].fields
  return Object.entries(fields)
    .filter(([, meta]) => meta.rules?.length)
    .map(([field, meta]) => ({
      category,
      field,
      rules: meta.rules!.join(", "),
      file,
      part: (parts as readonly RawPart[]).find((part) =>
        Object.hasOwn(part.specs, field)
      ),
    }))
})

describe("seed catalog", () => {
  test("every seed data file validates against its category schema", () => {
    const result = validateSeed(seedFiles)
    expect(result.ok, result.ok ? undefined : formatErrors(result.errors)).toBe(
      true
    )
  })

  test("covers every builder category", () => {
    expect(seedFiles.map(({ category }) => category).sort()).toEqual(
      Object.keys(builderCategories).sort()
    )
  })

  test.each(ruleFieldCases)(
    "$category: rejects a part without specs.$field ($rules)",
    ({ category, field, file, part }) => {
      if (!part) {
        assert.fail(`${category}.${field}: no seed part has this field`)
      }
      const withoutField = structuredClone(part)
      delete withoutField.specs[field]

      const result = validateSeed([{ file, category, parts: [withoutField] }])

      expect(result).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([
          expect.objectContaining({
            index: 0,
            sku: part.sku,
            path: ["specs", field],
          }),
        ]),
      })
    }
  )
})

describe("reserved category slugs", () => {
  test("rejects a category slug that is a top-level route", () => {
    expect(findReservedCategorySlugs(["gpu", "cart"])).toEqual([
      'Category slug "cart" is reserved for a top-level route (lib/reserved-slugs.ts)',
    ])
  })

  test("accepts every builder category slug", () => {
    expect(findReservedCategorySlugs(Object.keys(builderCategories))).toEqual(
      []
    )
  })
})

describe("images", () => {
  const { file, parts } = seedFiles.find(({ category }) => category === "cpu")!
  // A CPU part without its own images, to vary
  const base = (parts as readonly RawPart[]).find(
    (part) => !Object.hasOwn(part, "images")
  )!

  function validateImages(images?: unknown) {
    const part: Record<string, unknown> = structuredClone(base)
    if (images !== undefined) part.images = images
    return validateSeed([{ file, category: "cpu", parts: [part] }])
  }

  test("defaults to the category placeholder with the name as alt", () => {
    const result = validateImages()
    assert(result.ok)
    const part = result.files[0].parts[0]
    expect(part.images).toEqual([
      { url: "/images/placeholders/cpu.svg", alt: part.name },
    ])
  })

  test("keeps the given order and fills in missing alt text", () => {
    const result = validateImages([
      { url: placeholderUrl("cpu") },
      { url: placeholderUrl("box") },
      { url: placeholderUrl("detail") },
      { url: "https://images.example.com/x.webp", alt: "Front view" },
    ])
    assert(result.ok)
    const { name, images } = result.files[0].parts[0]
    expect(images).toEqual([
      { url: "/images/placeholders/cpu.svg", alt: name },
      { url: "/images/placeholders/box.svg", alt: `${name} — in the box` },
      { url: "/images/placeholders/detail.svg", alt: `${name} — detail view` },
      { url: "https://images.example.com/x.webp", alt: "Front view" },
    ])
  })

  test("names an unknown extra image by position", () => {
    const result = validateImages([
      { url: placeholderUrl("cpu") },
      { url: "/images/other.png" },
    ])
    assert(result.ok)
    const { name, images } = result.files[0].parts[0]
    expect(images[1].alt).toBe(`${name} — image 2`)
  })

  test.each(["images/x.svg", "//cdn.example.com/x.svg", "http://x.com/y.png"])(
    "rejects the url %s",
    (url) => {
      expect(validateImages([{ url }])).toMatchObject({
        ok: false,
        errors: [
          {
            path: ["images", 0, "url"],
            message: "must be a path starting with / or an https:// URL",
          },
        ],
      })
    }
  )

  test("rejects empty alt text", () => {
    expect(
      validateImages([{ url: placeholderUrl("cpu"), alt: " " }])
    ).toMatchObject({
      ok: false,
      errors: [{ path: ["images", 0, "alt"], message: "must be at least 1" }],
    })
  })

  test("rejects an empty list", () => {
    expect(validateImages([])).toMatchObject({
      ok: false,
      errors: [{ path: ["images"] }],
    })
  })
})
