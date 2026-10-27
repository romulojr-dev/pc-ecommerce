import { ProductCard } from "@/components/product/product-card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  getRelatedProducts,
  type ProductCardData,
  RELATED_LIMIT,
  type RelatedSource,
} from "@/lib/products"

// 4 columns in the 1280 px container from lg, 2 below
const CARD_SIZES = "(min-width: 1280px) 296px, (min-width: 1024px) 23vw, 45vw"

// "Similar products" on the product page (docs/specs/015-related-products).
// The page streams it behind Suspense, so the details never wait for it. By
// the time it renders, the response is committed to 200, so a failed query
// leaves the section out instead of failing the page; so does an empty one.
export async function RelatedProducts({
  source,
  today,
}: {
  source: RelatedSource
  today: string
}) {
  let products: ProductCardData[]
  try {
    products = await getRelatedProducts(source)
  } catch (error) {
    console.error(`Related products failed for product ${source.id}:`, error)
    return null
  }
  if (products.length === 0) return null

  return (
    <section aria-labelledby="similar-products" className="mt-12">
      <h2 id="similar-products" className="text-lg font-semibold">
        Similar products
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.slug}>
            <ProductCard
              product={product}
              layout="grid"
              today={today}
              sizes={CARD_SIZES}
              loading="lazy"
              headingLevel={3}
              className="h-full"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

// The section's shape while it loads, so the swap doesn't jump. Hidden from
// assistive tech: the real heading announces the section when it arrives.
export function RelatedProductsSkeleton() {
  return (
    <div aria-hidden="true" className="mt-12">
      <Skeleton className="h-7 w-48" />
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: RELATED_LIMIT }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-3 rounded-lg border p-3"
          >
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
