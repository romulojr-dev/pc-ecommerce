import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { OrderDetailView } from "@/components/admin/order-detail"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { disabledReason } from "@/lib/admin/denial"
import { backHrefOf } from "@/lib/admin/orders-params"
import { can } from "@/lib/admin/permissions"
import { getOrderDetail } from "@/lib/admin/queries/orders"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.orders },
}

// One order, all of it (docs/specs/041-admin-orders-list-detail, B10–B14).
// No loading.tsx on this route, so an unknown or malformed number keeps its
// 404 status. Data comes only from the query layer, which masks customer
// fields for Demo.
export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/orders/[number]">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("orders.view")
  if (!allowed) return <NoAccess />

  const { number } = await params
  const now = new Date()
  const order = await getOrderDetail(session.user.adminRole, number, now)
  if (!order) notFound()

  const { back } = await searchParams
  const slip = can(session.user.adminRole, "orders.packing-slip")
  return (
    <OrderDetailView
      order={order}
      now={now}
      backHref={backHrefOf(back)}
      moveDisabledReason={disabledReason(
        session.user.adminRole,
        "orders.transition"
      )}
      cancelDisabledReason={disabledReason(
        session.user.adminRole,
        "orders.cancel"
      )}
      slipHref={
        slip
          ? `/admin/orders/${encodeURIComponent(order.orderNumber)}/packing-slip`
          : null
      }
    />
  )
}
