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
import { Suspense } from "react"

import { Container } from "@/components/layout/container"
import { ProductGallery } from "@/components/product/product-gallery"
import { ProductPrice } from "@/components/product/product-price"
import { QuantitySelector } from "@/components/product/quantity-selector"
import {
  RelatedProducts,
  RelatedProductsSkeleton,
} from "@/components/product/related-products"
import { SpecTable } from "@/components/product/spec-table"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { formatDate, formatWarranty } from "@/lib/format"
import { getProductPage, type ProductPageData } from "@/lib/products"
import { categoryHref, productHref, siteConfig } from "@/lib/site"
import { isBuilderCategory, validateSpecs } from "@/lib/specs"
import {
  getStockStatus,
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

  return {
    title: product.name,
    description: product.description
      ? truncate(product.description, META_DESCRIPTION_MAX)
      : `${product.name} from ${product.brand}: full specs, warranty and stock at ${siteConfig.name}. Check compatibility in the PC Builder.`,
    alternates: {
      canonical: productHref(product.category.slug, product.slug),
    },
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

  return (
    <Container className="py-8">
      <Breadcrumb aria-label="Breadcrumb">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link href={categoryHref(product.category.slug)} />}
            >
              {product.category.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
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
                aria-describedby="coming-soon"
                className="h-10 px-6 text-sm"
              >
                Add to cart
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled
                aria-describedby="coming-soon"
                className="h-10 px-6 text-sm"
              >
                Add to build
              </Button>
            </div>
            {/* Visible text, not a tooltip: disabled buttons can't be
                focused or hovered */}
            <p id="coming-soon" className="text-sm text-muted-foreground">
              Cart and PC Builder are coming soon.
            </p>
          </div>
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheckIcon
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
            {formatWarranty(product.warrantyMonths)}
          </p>
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
