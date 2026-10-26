import { ImageOffIcon } from "lucide-react"
import Image from "next/image"

import { cn } from "@/lib/utils"

type ProductImageProps = {
  // A product's ProductImage row, or null when it has none
  image: { url: string; alt: string } | null
  // Names the product in the fallback's label
  productName: string
  // The rendered width, e.g. "48px". Required: without it the browser assumes
  // the full viewport width and downloads oversized images.
  sizes: string
  // Lazy by default; pass "eager" when the image is the page's LCP element
  loading?: "lazy" | "eager"
  // Sets the box size; the box is always square
  className?: string
}

// A product image in a square, theme-colored box (docs/specs/006-product-images).
// The box reserves the space, so loading causes no layout shift. A product
// without images gets a labelled fallback icon instead.
export function ProductImage({
  image,
  productName,
  sizes,
  loading = "lazy",
  className,
}: ProductImageProps) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-md bg-muted",
        className
      )}
    >
      {image ? (
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes={sizes}
          loading={loading}
          className="object-contain"
        />
      ) : (
        <div
          role="img"
          aria-label={`No image available for ${productName}`}
          className="flex size-full items-center justify-center text-muted-foreground"
        >
          <ImageOffIcon aria-hidden className="size-1/3" />
        </div>
      )}
    </div>
  )
}
