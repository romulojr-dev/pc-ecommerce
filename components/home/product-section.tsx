import { HomeSection } from "@/components/home/home-section"
import { ProductCard } from "@/components/product/product-card"
import type { ProductCardData } from "@/lib/products"

type ProductSectionProps = {
  id: string
  title: string
  description: string
  products: ProductCardData[]
  // Today in Manila (manilaToday()), for pre-order labels
  today: string
  action?: { label: string; href: string }
  // Set on Deals, the target of the hero's "Shop deals"
  anchor?: string
}

// Featured products or Deals (docs/specs/016-home-page): a row of product
// cards, or nothing when there are none. The cards are below the fold, so
// their images load lazily and never compete with the hero.
export function ProductSection({
  id,
  title,
  description,
  products,
  today,
  action,
  anchor,
}: ProductSectionProps) {
  if (products.length === 0) return null
  return (
    <div id={anchor} className="scroll-mt-8">
      <HomeSection
        id={id}
        title={title}
        description={description}
        action={action}
      >
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {products.map((product) => (
            <li key={product.slug}>
              <ProductCard
                product={product}
                layout="grid"
                today={today}
                headingLevel={3}
                loading="lazy"
                className="h-full"
                // 4 columns in the 1280 px container, 2 below lg
                sizes="(min-width: 1280px) 296px, (min-width: 1024px) 23vw, 45vw"
              />
            </li>
          ))}
        </ul>
      </HomeSection>
    </div>
  )
}
