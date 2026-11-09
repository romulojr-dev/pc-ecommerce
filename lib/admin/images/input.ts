import { z } from "zod"

import { MAX_IMAGES_PER_PRODUCT } from "@/lib/images/rules"

// The transport shapes of the photo actions (docs/specs/049-product-images-
// upload, B10–B12, R7–R9). Pure. Strict, so a hand-made extra key is invalid.
// Alt text is checked by validateAlt (trimmed, 1 to 200 characters) so the
// screen can say which rule it broke; the schema only bounds its size.

const id = z.string().regex(/^[a-z0-9]{10,40}$/)
const idList = z.array(id).min(1).max(MAX_IMAGES_PER_PRODUCT)

// The full order the screen wants: every photo of the product, once. Make
// main image is this list with one photo moved first.
export const reorderImagesSchema = z.strictObject({
  productId: id,
  order: idList,
})
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>

export const setImageAltSchema = z.strictObject({
  imageId: id,
  alt: z.string().max(1000),
})
export type SetImageAltInput = z.infer<typeof setImageAltSchema>

// `shown` is the list of photo ids the screen was showing: a removal is
// refused as stale unless it still is the product's list
export const removeImageSchema = z.strictObject({
  productId: id,
  imageId: id,
  shown: idList,
})
export type RemoveImageInput = z.infer<typeof removeImageSchema>

// Same photos, ignoring order. Both lists must be free of repeats: a list
// like [a, a, b] is not the photos [a, b, c], even though every one of its ids
// is among them.
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = new Set(a)
  const right = new Set(b)
  if (left.size !== a.length || right.size !== b.length) return false
  return b.every((value) => left.has(value))
}
