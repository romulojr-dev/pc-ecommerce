import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { ProductFilters } from "@/components/admin/product-filters"
import {
  PRODUCTS_RESULTS_ID,
  ProductListView,
} from "@/components/admin/product-list"
import { buttonVariants } from "@/components/ui/button"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { READ_ONLY_MESSAGE } from "@/lib/admin/denial"
import { can } from "@/lib/admin/permissions"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import {
  isCanonicalProductQuery,
  parseProductParams,
  productParamsHref,
} from "@/lib/admin/products-params"
import { listProducts } from "@/lib/admin/queries/products"
import { requireAdminAccess } from "@/lib/admin/session"
import { cn, focusRing } from "@/lib/utils"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.products },
}

// The product list (docs/specs/045-admin-products-create-edit). Search,
// filters and page live in the URL; a URL that isn't the canonical one
// redirects to it, and a page past the last redirects to the last. Data comes
// only from the query layer.
export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("products.view")
  if (!allowed) return <NoAccess />

  const raw = await searchParams
  const params = parseProductParams(raw)
  if (!isCanonicalProductQuery(raw, params)) redirect(productParamsHref(params))

  const role = session.user.adminRole
  const result = await listProducts(role, params)
  if (result.total > 0 && result.page !== params.page) {
    redirect(productParamsHref({ ...params, page: result.page }))
  }

  const canWrite = can(role, "products.write")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{PRODUCT_COPY.heading}</h1>
        {canWrite ? (
          <Link
            href="/admin/products/new"
            className={cn(buttonVariants(), focusRing)}
          >
            {PRODUCT_COPY.newProduct}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title={READ_ONLY_MESSAGE}
            className={buttonVariants()}
          >
            {PRODUCT_COPY.newProduct}
          </button>
        )}
      </div>
      <ProductFilters params={params} resultsId={PRODUCTS_RESULTS_ID} />
      <ProductListView data={result} params={params} />
    </div>
  )
}
