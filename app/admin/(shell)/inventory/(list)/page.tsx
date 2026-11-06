import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { InventoryFilters } from "@/components/admin/inventory-filters"
import {
  INVENTORY_RESULTS_ID,
  InventoryListView,
} from "@/components/admin/inventory-list"
import { NoAccess } from "@/components/admin/no-access"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"
import {
  inventoryHref,
  isCanonicalInventoryQuery,
  parseInventoryParams,
} from "@/lib/admin/inventory-params"
import { listInventory } from "@/lib/admin/queries/inventory"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.inventory },
}

// The inventory list (docs/specs/046-admin-inventory-adjustments). Search,
// filters and page live in the URL; a URL that isn't the canonical one
// redirects to it, and a page past the last redirects to the last. Data comes
// only from the query layer.
export default async function AdminInventoryPage({
  searchParams,
}: PageProps<"/admin/inventory">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("inventory.view")
  if (!allowed) return <NoAccess />

  const raw = await searchParams
  const params = parseInventoryParams(raw)
  if (!isCanonicalInventoryQuery(raw, params)) {
    redirect(inventoryHref(params))
  }

  const result = await listInventory(session.user.adminRole, params)
  if (result.total > 0 && result.page !== params.page) {
    redirect(inventoryHref({ ...params, page: result.page }))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{INVENTORY_COPY.heading}</h1>
      <InventoryFilters params={params} resultsId={INVENTORY_RESULTS_ID} />
      <InventoryListView data={result} params={params} />
    </div>
  )
}
