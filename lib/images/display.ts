import { placeholderUrl } from "@/lib/placeholders"
import { isBuilderCategory } from "@/lib/specs"

// Which image a product shows (docs/specs/049-product-images-upload, B18, D1):
// its real photos in order, or, with none, its category's placeholder. The
// placeholder is derived, never stored, so removing the last photo brings it
// back by itself. Pure.

export type StoreImage = { url: string; alt: string }

export type DisplayImages = {
  // In display order; the placeholder alone when the product has no photo
  images: StoreImage[]
  // True when `images` is only the category placeholder
  placeholder: boolean
}

// The placeholder for a category, or null for a category without one (only
// the builder categories have artwork), which renders the labelled fallback
export function placeholderImage(
  categorySlug: string,
  productName: string
): StoreImage | null {
  return isBuilderCategory(categorySlug)
    ? { url: placeholderUrl(categorySlug), alt: productName }
    : null
}

export function displayImages(
  real: StoreImage[],
  categorySlug: string,
  productName: string
): DisplayImages {
  if (real.length > 0) return { images: real, placeholder: false }
  const placeholder = placeholderImage(categorySlug, productName)
  return placeholder
    ? { images: [placeholder], placeholder: true }
    : { images: [], placeholder: true }
}

// The one image a card, cart line or part row shows
export function mainImageOf(
  real: StoreImage[],
  categorySlug: string,
  productName: string
): StoreImage | null {
  return real[0] ?? placeholderImage(categorySlug, productName)
}
