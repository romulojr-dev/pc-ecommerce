import { z } from "zod"

import { ProductStatus } from "@/generated/prisma/enums"
import { PLACEHOLDER_VIEWS, placeholderUrl } from "@/lib/placeholders"
import { slugify } from "@/lib/slug"
import { builderCategories, type BuilderCategorySlug } from "@/lib/specs"
import { nonNegativeInt, positiveInt } from "@/lib/specs/helpers"

const text = () => z.string().trim().min(1, "must not be empty")

// ProductImage.url holds a site path (placeholders, public/) or a full https
// URL (an image host later), so switching to real images only changes data
const imageUrl = text().refine(
  (url) =>
    (url.startsWith("/") && !url.startsWith("//")) ||
    url.startsWith("https://"),
  "must be a path starting with / or an https:// URL"
)

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
  // What ships in the retail box, one line per item
  boxContents: z.array(text()).optional(),
  // Expected ship date ("2027-01-15") while on pre-order. Set on create only
  // (write.ts): once the store runs, the admin opens and ends pre-orders.
  preorderShipsOn: z.iso.date().optional(),
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
  // Defaults to the category placeholder (spec 006). Set it to give a part
  // several images; a missing alt is filled in from the name.
  images: z
    .array(z.strictObject({ url: imageUrl, alt: text().optional() }))
    .min(1)
    .max(4)
    .optional(),
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
    .transform((part) => ({
      ...part,
      slug: part.slug ?? slugify(part.name),
      images: resolveImages(part.images, category, part.name),
    }))
}

export type SeedImage = { url: string; alt: string }

// The part's images in display order, every one with alt text
function resolveImages(
  images: { url: string; alt?: string }[] | undefined,
  category: BuilderCategorySlug,
  name: string
): SeedImage[] {
  if (!images) return [{ url: placeholderUrl(category), alt: name }]
  return images.map(({ url, alt }, index) => {
    if (alt) return { url, alt }
    if (index === 0) return { url, alt: name }
    const view = Object.entries(PLACEHOLDER_VIEWS).find(
      ([key]) => url === placeholderUrl(key)
    )
    return { url, alt: `${name} — ${view ? view[1] : `image ${index + 1}`}` }
  })
}

// What a data file writes for one part (defaults may be left out)
export type SeedPart<C extends BuilderCategorySlug> = z.input<
  ReturnType<typeof seedPartSchema<C>>
>

// A part after validation, ready to write. `images` is restated: the
// transform spreads a generic object, so TypeScript would otherwise intersect
// the optional input list with the resolved one.
export type ValidSeedPart<C extends BuilderCategorySlug> = Omit<
  z.output<ReturnType<typeof seedPartSchema<C>>>,
  "images"
> & { images: SeedImage[] }
