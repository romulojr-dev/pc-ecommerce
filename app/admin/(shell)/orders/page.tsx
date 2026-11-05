import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { OrderFilters } from "@/components/admin/order-filters"
import { OrderListView, RESULTS_ID } from "@/components/admin/order-list"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  isCanonicalOrderQuery,
  orderParamsHref,
  parseOrderParams,
} from "@/lib/admin/orders-params"
import { can } from "@/lib/admin/permissions"
import { listOrders } from "@/lib/admin/queries/orders"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.orders },
}

// The order list (docs/specs/041-admin-orders-list-detail). Filters, search and
// page live in the URL; a URL that isn't the canonical one redirects to it,
// and a page past the last redirects to the last (B8). Data comes only from
// the query layer, which masks customer fields for Demo.
export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("orders.view")
  if (!allowed) return <NoAccess />

  const raw = await searchParams
  const params = parseOrderParams(raw)
  if (!isCanonicalOrderQuery(raw, params)) redirect(orderParamsHref(params))

  const role = session.user.adminRole
  const result = await listOrders(role, params, new Date())
  if (result.ok && result.total > 0 && result.page !== params.page) {
    redirect(orderParamsHref({ ...params, page: result.page }))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.orders.heading}</h1>
      <OrderFilters
        params={params}
        canSearchCustomer={can(role, "orders.search-customer")}
        resultsId={RESULTS_ID}
      />
      {result.ok ? (
        <OrderListView data={result} params={params} />
      ) : (
        <p role="alert" className="rounded-md border p-4">
          {result.message}
        </p>
      )}
    </div>
  )
}
