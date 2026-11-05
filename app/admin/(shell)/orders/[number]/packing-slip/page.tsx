import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { PackingSlipView } from "@/components/admin/packing-slip"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { getPackingSlip } from "@/lib/admin/queries/orders"
import { requireAdminAccess } from "@/lib/admin/session"

// The title names the order number from the URL, which is not customer data
// and needs no database read
export async function generateMetadata({
  params,
}: PageProps<"/admin/orders/[number]/packing-slip">): Promise<Metadata> {
  const { number } = await params
  return {
    title: {
      absolute: `${ADMIN_COPY.orders.slip.title(number)} · PC Silicon Admin`,
    },
  }
}

// One order's packing slip (docs/specs/041-admin-orders-list-detail, B15–B20).
// No loading.tsx on this route, so an unknown or malformed number keeps its
// 404 status. Data comes only from the query layer: no prices, and Demo's
// customer fields masked.
export default async function AdminPackingSlipPage({
  params,
}: PageProps<"/admin/orders/[number]/packing-slip">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("orders.packing-slip")
  if (!allowed) return <NoAccess />

  const { number } = await params
  const slip = await getPackingSlip(session.user.adminRole, number)
  if (!slip) notFound()

  return (
    <PackingSlipView
      slip={slip}
      backHref={`/admin/orders/${encodeURIComponent(slip.orderNumber)}`}
    />
  )
}
