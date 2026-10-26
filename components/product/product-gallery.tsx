"use client"

import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon } from "lucide-react"
import { useState } from "react"

import { ProductImage } from "@/components/product/product-image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn, focusRing } from "@/lib/utils"

type ProductGalleryProps = {
  // In display order; may be empty
  images: { url: string; alt: string }[]
  productName: string
}

// The product page's images (docs/specs/010-product-page): a main image,
// thumbnails to switch it, and "zoom" as the image larger in a dialog. Every
// control is a button, so it all works with Tab, Enter and Space; the dialog
// adds Left/Right arrows and returns focus to "Enlarge image" on close.
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [index, setIndex] = useState(0)

  if (images.length === 0) {
    return (
      <ProductImage
        image={null}
        productName={productName}
        sizes="(min-width: 1024px) 560px, 100vw"
      />
    )
  }

  const image = images[index]
  const several = images.length > 1
  const step = (by: number) =>
    setIndex((current) => (current + by + images.length) % images.length)

  return (
    <div className="flex flex-col gap-3">
      <Dialog>
        <DialogTrigger
          render={
            // Named by its visible text alone; the dialog's title gives the
            // image's alt text once open
            <button
              type="button"
              aria-label="Enlarge image"
              className={cn("group relative block rounded-md", focusRing)}
            />
          }
        >
          {/* The page's LCP image */}
          <ProductImage
            image={image}
            productName={productName}
            sizes="(min-width: 1024px) 560px, 100vw"
            loading="eager"
          />
          <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm transition-colors group-hover:bg-background">
            <ZoomInIcon aria-hidden="true" className="size-4" />
            Enlarge image
          </span>
        </DialogTrigger>
        <DialogContent
          className="gap-3 p-3 sm:max-w-[min(90vw,1000px)]"
          onKeyDown={(event) => {
            if (!several) return
            if (event.key === "ArrowLeft") step(-1)
            if (event.key === "ArrowRight") step(1)
          }}
        >
          <DialogTitle className="sr-only">{image.alt}</DialogTitle>
          <ProductImage
            image={image}
            productName={productName}
            sizes="min(90vw, 1000px)"
            loading="eager"
            className="mx-auto max-h-[80vh] w-full max-w-[80vh]"
          />
          {several && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Previous image"
                onClick={() => step(-1)}
              >
                <ChevronLeftIcon aria-hidden="true" />
              </Button>
              <p className="text-sm text-muted-foreground tabular-nums">
                {index + 1} of {images.length}
              </p>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Next image"
                onClick={() => step(1)}
              >
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {several && (
        <ul className="flex gap-2">
          {images.map((thumbnail, i) => (
            <li key={thumbnail.url + i}>
              <button
                type="button"
                aria-label={`Show image ${i + 1} of ${images.length}`}
                aria-pressed={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "block rounded-md ring-offset-background",
                  i === index
                    ? "ring-2 ring-foreground ring-offset-2"
                    : "opacity-70 hover:opacity-100",
                  focusRing
                )}
              >
                <ProductImage
                  image={thumbnail}
                  productName={productName}
                  sizes="64px"
                  className="size-16"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
