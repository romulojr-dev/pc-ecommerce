import { z } from "zod"

import type { AnyBuildPart, BuildItem } from "@/lib/builder"
import type { StockStatus } from "@/lib/stock"

// The builder page's parts, loaded fresh by id (docs/specs/020-builder-page,
// "Loading parts"). Shared by the browser and the route handler, so it
// imports no server code.

// The most different products a build holds, and the parts request's cap:
// one part in each of the 7 other slots leaves room for 13 drives
export const MAX_BUILD_PRODUCTS = 20

// The shape of Product.id (a cuid): lowercase letters and digits
const productId = z.string().regex(/^[a-z0-9]{1,32}$/)

// The `ids` query parameter: comma-separated, 1 to 20, no duplicates.
// Anything else is a 400 (Rules › Parts request).
export const builderPartsQuerySchema = z
  .string()
  .transform((value) => value.split(","))
  .pipe(
    z
      .array(productId)
      .min(1)
      .max(MAX_BUILD_PRODUCTS)
      .refine((ids) => new Set(ids).size === ids.length, "duplicate id")
  )

// One loaded part: what the engine reads, plus what a slot row and the
// summary show. Prices are centavos; effectivePrice is what the shopper pays.
export type BuilderPartData = {
  part: AnyBuildPart
  slug: string
  brand: string
  price: number
  salePrice: number | null
  effectivePrice: number
  stock: number
  stockStatus: StockStatus
  image: { url: string; alt: string } | null
}

// Keeps a build within MAX_BUILD_PRODUCTS by dropping its last drives. Only
// hand-edited data goes over, since the store refuses a new drive in a full
// build (Rules › Store). Items are in slot order, as parseBuild returns them.
export function capProducts(items: readonly BuildItem[]): BuildItem[] {
  const products = new Set(items.map((item) => item.productId))
  let excess = products.size - MAX_BUILD_PRODUCTS
  if (excess <= 0) return [...items]

  const kept = [...items]
  for (let i = kept.length - 1; i >= 0 && excess > 0; i--) {
    if (kept[i].slot === "storage") {
      kept.splice(i, 1)
      excess--
    }
  }
  return kept
}
