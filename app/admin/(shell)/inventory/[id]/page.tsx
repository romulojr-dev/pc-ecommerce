import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"

import { AdjustStockForm } from "@/components/admin/adjust-stock-form"
import { MovementHistory } from "@/components/admin/movement-history"
import { NoAccess } from "@/components/admin/no-access"
import { ThresholdForm } from "@/components/admin/threshold-form"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import {
  INVENTORY_PATH,
  isCanonicalHistoryQuery,
  parseHistoryPage,
  productInventoryHref,
} from "@/lib/admin/inventory-params"
import { levelLabel, statusLabel, stockLevel } from "@/lib/admin/inventory-view"
import { can } from "@/lib/admin/permissions"
import {
  getInventoryProduct,
  listMovements,
} from "@/lib/admin/queries/inventory"
import { requireAdminAccess } from "@/lib/admin/session"
import { cn, focusRing } from "@/lib/utils"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.inventory },
}

// One product's stock (docs/specs/046-admin-inventory-adjustments, B8–B16).
// No loading.tsx, so an unknown or malformed id keeps its 404 status. The
// forms are client components that call the guarded actions and refresh this
// page; the history is read here.
export default async function AdminInventoryProductPage({
  params,
  searchParams,
}: PageProps<"/admin/inventory/[id]">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("inventory.view")
  if (!allowed) return <NoAccess />

  const { id } = await params
  const role = session.user.adminRole
  const product = await getInventoryProduct(role, id)
  if (!product) notFound()

  const raw = await searchParams
  const requested = parseHistoryPage(raw)
  if (!isCanonicalHistoryQuery(raw, requested)) {
    redirect(productInventoryHref(product.id, requested))
  }
  const history = await listMovements(role, product.id, requested)
  if (history.total > 0 && history.page !== requested) {
    redirect(productInventoryHref(product.id, history.page))
  }

  const readOnly = !can(role, "inventory.adjust")
  const level = levelLabel(stockLevel(product))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={INVENTORY_PATH}
          className={cn("text-sm underline underline-offset-4", focusRing)}
        >
          {INVENTORY_COPY.backToList}
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">
            {INVENTORY_COPY.productHeading(product.name)}
          </h1>
          <span className="rounded border px-1.5 py-0.5 text-xs">
            {statusLabel(product.status)}
          </span>
          {level ? (
            <span className="rounded border px-1.5 py-0.5 text-xs font-medium">
              {level}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {product.sku} · {product.categoryName}
        </p>
        {can(role, "products.view") ? (
          <Link
            href={`/admin/products/${encodeURIComponent(product.id)}`}
            className={cn("text-sm underline underline-offset-4", focusRing)}
          >
            {INVENTORY_COPY.editProduct}
          </Link>
        ) : null}
      </div>

      <dl className="flex flex-wrap gap-8">
        <div>
          <dt className="text-sm text-muted-foreground">
            {INVENTORY_COPY.currentStock}
          </dt>
          <dd className="text-3xl font-semibold" data-testid="current-stock">
            {product.stock}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {INVENTORY_COPY.columns.lowStockAt}
          </dt>
          <dd className="text-3xl font-semibold">{product.lowStockAt}</dd>
        </div>
      </dl>

      <AdjustStockForm
        productId={product.id}
        stock={product.stock}
        readOnly={readOnly}
      />
      <ThresholdForm
        productId={product.id}
        lowStockAt={product.lowStockAt}
        readOnly={readOnly}
      />
      <MovementHistory productId={product.id} data={history} />
    </div>
  )
}
