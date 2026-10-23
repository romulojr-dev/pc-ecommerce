import { z } from "zod"

import { ProductStatus } from "@/generated/prisma/enums"
import { slugify } from "@/lib/slug"
import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"
import { nonNegativeInt, positiveInt } from "@/lib/specs/helpers"

const text = () => z.string().trim().min(1, "must not be empty")

// Product-level fields of one seed part (spec.md, "Part record"). Money is
// integer centavos: ₱11,495.00 = 1149500.
const productFields = {
  sku: text(),
  name: text(),
  // Brand name; brands are matched by slugify(brand), so "AMD" = "amd"
  brand: text(),
  price: positiveInt(),
  salePrice: positiveInt().optional(),
  stock: nonNegativeInt(),
  lowStockAt: nonNegativeInt().default(5),
  weightGrams: positiveInt(),
  warrantyMonths: nonNegativeInt().default(12),
  status: z.enum(ProductStatus).default("ACTIVE"),
  description: text().optional(),
  // Defaults to slugify(name). Set it only to override the generated one.
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "must be lowercase words joined by -")
    .optional(),
  // Manufacturer spec page the values were checked against. Review aid only;
  // not stored on Product.
  sourceUrl: z.url(),
}

// Schema for one seed part of a category: product fields plus that
// category's specs. Output has defaults filled and `slug` always set.
export function seedPartSchema<C extends BuilderCategorySlug>(category: C) {
  const specs: (typeof builderCategories)[C]["schema"] =
    builderCategories[category].schema
  return z
    .strictObject({ ...productFields, specs })
    .check((ctx) => {
      const part = ctx.value
      if (part.salePrice !== undefined && part.salePrice >= part.price) {
        ctx.issues.push({
          code: "custom",
          message: `must be less than price (${part.price})`,
          input: part.salePrice,
          path: ["salePrice"],
        })
      }
    })
    .transform((part) => ({ ...part, slug: part.slug ?? slugify(part.name) }))
}

// What a data file writes for one part (defaults may be left out)
export type SeedPart<C extends BuilderCategorySlug> = z.input<
  ReturnType<typeof seedPartSchema<C>>
>

// A part after validation, ready to write
export type ValidSeedPart<C extends BuilderCategorySlug> = z.output<
  ReturnType<typeof seedPartSchema<C>>
>
