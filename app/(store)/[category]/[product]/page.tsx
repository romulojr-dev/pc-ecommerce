import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  type LucideIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import { connection } from "next/server"
import { Fragment, Suspense } from "react"

import { Container } from "@/components/layout/container"
import { AddToBuild } from "@/components/product/add-to-build"
import { FitWithBuild } from "@/components/product/fit-with-build"
import { ProductGallery } from "@/components/product/product-gallery"
import { ProductPrice } from "@/components/product/product-price"
import { QuantitySelector } from "@/components/product/quantity-selector"
import {
  RelatedProducts,
  RelatedProductsSkeleton,
} from "@/components/product/related-products"
import { SpecTable } from "@/components/product/spec-table"
import { JsonLd } from "@/components/seo/json-ld"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { fitPartOf } from "@/lib/build-state/fit"
import { env } from "@/lib/env"
import { formatDate, formatWarranty } from "@/lib/format"
import { getProductPage, type ProductPageData } from "@/lib/products"
import { type Crumb, breadcrumbJsonLd, productJsonLd } from "@/lib/seo/json-ld"
import { socialMetadata } from "@/lib/seo/metadata"
import { categoryHref, productHref, siteConfig } from "@/lib/site"
import { isBuilderCategory, validateSpecs } from "@/lib/specs"
import {
  getStockStatus,
  isBuyable,
  manilaToday,
  type StockStatus,
  stockStatusLabel,
} from "@/lib/stock"
import { cn } from "@/lib/utils"

const META_DESCRIPTION_MAX = 155

export async function generateMetadata({
  params,
}: PageProps<"/[category]/[product]">): Promise<Metadata> {
  const { product: slug } = await params
  // React cache: the page's own lookup reuses this query
  const product = await getProductPage(slug)
  if (!product) notFound()

  const title = product.name
  const description = product.description
    ? truncate(product.description, META_DESCRIPTION_MAX)
    : `${product.name} from ${product.brand}: full specs, warranty and stock at ${siteConfig.name}. Check compatibility in the PC Builder.`
  const path = productHref(product.category.slug, product.slug)

  return {
    title,
    description,
    alternates: { canonical: path },
    ...socialMetadata({ title, description, path, image: product.images[0] }),
  }
}

// One product: everything a shopper needs to decide (docs/specs/010-product-page)
export default async function ProductPage({
  params,
}: PageProps<"/[category]/[product]">) {
  // Render on every request: price, stock and pre-orders change at runtime
  // (ADR 0003)
  await connection()

  const { category, product: slug } = await params
  const product = await getProductPage(slug)
  if (!product) notFound()

  // One URL per product: a wrong or unknown category goes to the real one
  if (category !== product.category.slug) {
    permanentRedirect(productHref(product.category.slug, product.slug))
  }

  const today = manilaToday()
  const status = getStockStatus(product, today)
  const outOfStock = status === "out-of-stock"
  const buyable = isBuyable(status)
  const builderSlot = isBuilderCategory(product.category.slug)
    ? product.category.slug
    : null
  // One trail for the visible breadcrumbs and their JSON-LD, so they match
  const breadcrumbs: Crumb[] = [
    { name: "Home", path: "/" },
    { name: product.category.name, path: categoryHref(product.category.slug) },
    { name: product.name },
  ]
  const siteUrl = env.NEXT_PUBLIC_SITE_URL
  // What the "Fits your build" block needs (docs/specs/023-fits-your-build-
  // hints); null outside the builder categories
  const fitPart = fitPartOf({
    id: product.id,
    name: product.name,
    category: product.category.slug,
    specs: product.specs,
  })

  return (
    <Container className="py-8">
      {/* Before the Suspense boundary, so they're in the first HTML chunk
          (docs/specs/017-seo) */}
      <JsonLd data={productJsonLd({ product, status, siteUrl })} />
      <JsonLd data={breadcrumbJsonLd(breadcrumbs, siteUrl)} />

      <Breadcrumb aria-label="Breadcrumb">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <Fragment key={crumb.path ?? "current"}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {crumb.path ? (
                  <BreadcrumbLink render={<Link href={crumb.path} />}>
                    {crumb.name}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.name}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{product.brand}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {product.name}
            </h1>
          </div>
          <ProductPrice price={product.price} salePrice={product.salePrice} />
          <StockLine status={status} product={product} />
          <QuantitySelector max={product.stock} disabled={outOfStock} />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="lg"
                disabled
                aria-describedby="cart-coming-soon"
                className="h-10 px-6 text-sm"
              >
                Add to cart
              </Button>
              {/* Only buyable parts can be added to a build
                  (docs/specs/020-builder-page, Behavior 18) */}
              {builderSlot &&
                (buyable ? (
                  <AddToBuild
                    productId={product.id}
                    name={product.name}
                    slot={builderSlot}
                    stock={product.stock}
                  />
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled
                    aria-describedby="build-unavailable"
                    className="h-10 px-6 text-sm"
                  >
                    Add to build
                  </Button>
                ))}
            </div>
            {/* Visible text, not a tooltip: disabled buttons can't be
                focused or hovered */}
            <p id="cart-coming-soon" className="text-sm text-muted-foreground">
              Cart is coming soon.
            </p>
            {builderSlot && !buyable && (
              <p
                id="build-unavailable"
                className="text-sm text-muted-foreground"
              >
                Only parts in stock can be added to a build.
              </p>
            )}
          </div>
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            {formatWarranty(product.warrantyMonths)}
          </p>
          {fitPart && <FitWithBuild part={fitPart} />}
        </div>
      </div>

      <div className="mt-12 flex max-w-3xl flex-col gap-10">
        {product.description && (
          <section aria-labelledby="overview">
            <h2 id="overview" className="text-lg font-semibold">
              Overview
            </h2>
            <p className="mt-3 text-sm leading-relaxed">
              {product.description}
            </p>
          </section>
        )}
        <section aria-labelledby="specifications">
          <h2 id="specifications" className="text-lg font-semibold">
            Specifications
          </h2>
          <Specifications product={product} className="mt-3" />
        </section>
        {product.boxContents.length > 0 && (
          <section aria-labelledby="in-the-box">
            <h2 id="in-the-box" className="text-lg font-semibold">
              What&apos;s in the box
            </h2>
            <ul className="mt-3 list-disc pl-5 text-sm leading-relaxed">
              {product.boxContents.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Streams in after the details; notFound and the redirect above run
          before this boundary, so they keep their HTTP status */}
      <Suspense fallback={<RelatedProductsSkeleton />}>
        <RelatedProducts source={product} today={today} />
      </Suspense>
    </Container>
  )
}

const statusIcon: Record<StockStatus, LucideIcon> = {
  "in-stock": CheckCircle2Icon,
  "low-stock": AlertTriangleIcon,
  "out-of-stock": XCircleIcon,
  "pre-order": CalendarClockIcon,
}

// The status as text with an icon, never color alone
function StockLine({
  status,
  product,
}: {
  status: StockStatus
  product: ProductPageData
}) {
  const Icon = statusIcon[status]
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-sm font-medium",
        status === "out-of-stock" && "text-destructive"
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {status === "pre-order" && product.preorderShipsOn
        ? `Pre-order: ships ${formatDate(product.preorderShipsOn)}`
        : stockStatusLabel[status]}
    </p>
  )
}

// The spec table, or a note when the category has no schema or the stored
// specs don't match it (the seed and admin validate on write, so the latter
// means a bad manual edit). Never fails the page.
function Specifications({
  product,
  className,
}: {
  product: ProductPageData
  className?: string
}) {
  const category = product.category.slug
  if (isBuilderCategory(category)) {
    const result = validateSpecs(category, product.specs)
    if (result.success) {
      return (
        <SpecTable
          category={category}
          specs={result.data}
          className={className}
        />
      )
    }
    console.error(
      `Invalid specs for product ${product.slug}:`,
      result.error.issues
    )
  }
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Specifications are not available for this product.
    </p>
  )
}

// Cut at a word boundary, so a description fits a search snippet
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`
}
