import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { ProductForm } from "@/components/admin/product-form"
import { ProductImages } from "@/components/admin/product-images"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { can } from "@/lib/admin/permissions"
import { formFromProduct } from "@/lib/admin/product-form"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import { productStatusLabel } from "@/lib/admin/products-view"
import {
  getProductForEdit,
  listBrandOptions,
  nextProductWithoutPhotos,
} from "@/lib/admin/queries/products"
import { requireAdminAccess } from "@/lib/admin/session"
import { placeholderImage } from "@/lib/images/display"
import { first } from "@/lib/listing-filters/raw"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.products },
}

// One product (docs/specs/045-admin-products-create-edit, B14–B18). No
// loading.tsx, so an unknown or malformed id keeps its 404 status. The form is
// keyed by the edit version, so Reload (a refresh) starts it from the stored
// values.
export default async function AdminProductPage({
  params,
  searchParams,
}: PageProps<"/admin/products/[id]">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("products.view")
  if (!allowed) return <NoAccess />

  const { id } = await params
  const role = session.user.adminRole
  const product = await getProductForEdit(role, id)
  if (!product) notFound()

  const brands = await listBrandOptions(role)
  const next = await nextProductWithoutPhotos(role, product.id)
  const saved = first((await searchParams).saved)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">
          {PRODUCT_COPY.form.editHeading}
        </h1>
        <span className="rounded border px-1.5 py-0.5 text-xs">
          {productStatusLabel(product.status)}
        </span>
        <span className="text-sm text-muted-foreground">
          {PRODUCT_COPY.form.lastSaved(
            dateTimeText(new Date(product.updatedAt))
          )}
        </span>
        {product.status === "ACTIVE" ? (
          <Link
            href={`/${product.categorySlug}/${product.slug}`}
            className={cn("text-sm underline underline-offset-4", focusRing)}
          >
            {PRODUCT_COPY.form.viewOnStore}
          </Link>
        ) : null}
      </div>
      <ProductForm
        key={`${product.id}-${product.editVersion}`}
        mode="edit"
        initial={formFromProduct(product)}
        brands={brands}
        productId={product.id}
        status={product.status}
        editVersion={product.editVersion}
        stock={product.stock}
        readOnly={!can(role, "products.write")}
        notice={
          saved === "draft"
            ? PRODUCT_COPY.form.draftSaved
            : saved === "changes"
              ? PRODUCT_COPY.form.changesSaved
              : null
        }
      />
      <ProductImages
        productId={product.id}
        productName={product.name}
        categoryName={product.categoryName}
        placeholder={placeholderImage(product.categorySlug, product.name)}
        images={product.images}
        next={next}
        readOnly={!can(role, "images.write")}
      />
    </div>
  )
}
